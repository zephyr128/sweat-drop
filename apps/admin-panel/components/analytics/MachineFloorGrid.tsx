'use client';

// AGENT NOTE: 2026-04-17 — admin-coder
// MachineFloorGrid — unified live floor view + drag-and-drop layout editor.
// Replaces the separate MachineGrid (status-sorted card list) and
// MachineFloorLayout (layout-only editor) with a single component that:
//   - Shows machines positioned by their floor_row/floor_col coordinates.
//   - Displays live status (busy, maintenance, available, inactive) on each cell.
//   - Clicking a cell navigates to the machine detail page (read-only mode).
//   - "Edit Layout" button activates drag mode — cells become draggable/droppable
//     and an unplaced tray appears on the left.
// Depends on the machine_floor_layout DB migration (supabase-dba step 4).
// Related files:
//   - apps/admin-panel/lib/actions/machine-layout-actions.ts (layout CRUD)
//   - apps/admin-panel/components/analytics/MachineFloor.tsx (parent)

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { GripVertical, LayoutGrid, Save, RotateCcw, Settings, X, Wrench } from 'lucide-react';
import { MemberAvatar } from '@/components/MemberAvatar';
import {
  getGymFloorLayout,
  saveMachineFloorLayout,
  updateGymFloorDimensions,
  type FloorMachine,
  type FloorConfig,
} from '@/lib/actions/machine-layout-actions';
import type { LiveMachine } from '@/lib/actions/machine-analytics-actions';
import type { UserRole } from '@/lib/auth';

const TYPE_ICONS: Record<string, string> = {
  treadmill: '🏃',
  bike: '🚴',
  elliptical: '⭕',
  weight: '🏋️',
  rower: '🚣',
  stepper: '🪜',
};

const TRAY_PREFIX = 'tray:';
const CELL_PREFIX = 'cell:';
const trayId = (id: string) => `${TRAY_PREFIX}${id}`;
const cellId = (row: number, col: number) => `${CELL_PREFIX}${row}:${col}`;
const parseCellId = (id: string) => {
  if (!id.startsWith(CELL_PREFIX)) return null;
  const [r, c] = id.slice(CELL_PREFIX.length).split(':').map(Number);
  return isNaN(r) || isNaN(c) ? null : { row: r, col: c };
};

type PlacedMap = Map<string, FloorMachine>;

function buildPlacedMap(machines: FloorMachine[]): PlacedMap {
  const map = new Map<string, FloorMachine>();
  for (const m of machines) {
    if (m.floor_row !== null && m.floor_col !== null) {
      map.set(`${m.floor_row}:${m.floor_col}`, m);
    }
  }
  return map;
}

// Merge live status from the poll into the floor machines list.
// Floor machines only carry id/name/type/floor_row/floor_col — we pull live
// fields (is_busy, is_under_maintenance, is_active, active_session, current_user)
// from the live data map.
function buildLiveMap(liveMachines: LiveMachine[]): Map<string, LiveMachine> {
  return new Map(liveMachines.map((m) => [m.id, m]));
}

interface MachineFloorGridProps {
  gymId: string;
  userRole: UserRole;
  /** Live machines from the parent poll — used for status overlays */
  liveMachines: LiveMachine[];
  fetchedAt: number;
  tick: number;
}

export function MachineFloorGrid({
  gymId,
  userRole,
  liveMachines,
  fetchedAt,
  tick,
}: MachineFloorGridProps) {
  const [floorMachines, setFloorMachines] = useState<FloorMachine[]>([]);
  const [config, setConfig] = useState<FloorConfig>({ rows: 12, cols: 8 });
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showDimensionEditor, setShowDimensionEditor] = useState(false);
  const [pendingRows, setPendingRows] = useState(12);
  const [pendingCols, setPendingCols] = useState(8);

  const canEdit =
    userRole === 'superadmin' || userRole === 'gym_owner' || userRole === 'gym_admin';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const fetchLayout = useCallback(async () => {
    setLoading(true);
    const res = await getGymFloorLayout(gymId);
    if (res.success && res.data) {
      setFloorMachines(res.data.machines);
      setConfig(res.data.config);
      setPendingRows(res.data.config.rows);
      setPendingCols(res.data.config.cols);
    } else {
      toast.error(res.error || 'Failed to load floor layout');
    }
    setLoading(false);
  }, [gymId]);

  useEffect(() => { fetchLayout(); }, [fetchLayout]);

  const placedMap = buildPlacedMap(floorMachines);
  const liveMap = buildLiveMap(liveMachines);
  const unplaced = floorMachines.filter((m) => m.floor_row === null || m.floor_col === null);

  // ── DnD handlers ────────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    let dragged: FloorMachine | undefined;
    if (activeId.startsWith(TRAY_PREFIX)) {
      dragged = floorMachines.find((m) => m.id === activeId.slice(TRAY_PREFIX.length));
    } else {
      dragged = floorMachines.find((m) => m.id === activeId);
    }
    if (!dragged) return;

    // Dropped onto tray → unplace
    if (overId === 'unplaced-tray') {
      setFloorMachines((prev) =>
        prev.map((m) => (m.id === dragged!.id ? { ...m, floor_row: null, floor_col: null } : m)),
      );
      return;
    }

    const target = parseCellId(overId);
    if (!target) return;

    const { row, col } = target;
    const occupant = placedMap.get(`${row}:${col}`);

    if (occupant && occupant.id !== dragged.id) {
      // Swap
      const fromRow = dragged.floor_row;
      const fromCol = dragged.floor_col;
      setFloorMachines((prev) =>
        prev.map((m) => {
          if (m.id === dragged!.id) return { ...m, floor_row: row, floor_col: col };
          if (m.id === occupant.id) return { ...m, floor_row: fromRow, floor_col: fromCol };
          return m;
        }),
      );
      return;
    }

    // Place / move
    setFloorMachines((prev) =>
      prev.map((m) => (m.id === dragged!.id ? { ...m, floor_row: row, floor_col: col } : m)),
    );
  };

  // ── Persist ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    const res = await saveMachineFloorLayout(
      gymId,
      floorMachines.map((m) => ({ machineId: m.id, row: m.floor_row, col: m.floor_col })),
    );
    if (res.success) {
      toast.success('Floor layout saved');
      setEditMode(false);
    } else {
      toast.error(res.error || 'Failed to save layout');
    }
    setSaving(false);
  };

  const handleDiscard = async () => {
    await fetchLayout();
    setEditMode(false);
  };

  const handleApplyDimensions = async () => {
    const res = await updateGymFloorDimensions(gymId, pendingRows, pendingCols);
    if (res.success) {
      if (res.unplacedIds && res.unplacedIds.length > 0) {
        toast.warning(
          `${res.unplacedIds.length} machine(s) outside new bounds were unplaced.`,
        );
      } else {
        toast.success('Grid dimensions updated');
      }
      setShowDimensionEditor(false);
      await fetchLayout();
    } else {
      toast.error(res.error || 'Failed to update dimensions');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-12 flex items-center justify-center">
        <div className="h-5 w-5 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasAnyPlacement = floorMachines.some((m) => m.floor_row !== null);

  // First-time empty state
  if (!hasAnyPlacement && !editMode) {
    return (
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-12 text-center space-y-4">
        <LayoutGrid className="w-12 h-12 text-zinc-600 mx-auto" />
        <div>
          <p className="text-white font-semibold">No floor layout set up yet</p>
          <p className="text-zinc-500 text-sm mt-1">
            Arrange machines to match your gym&apos;s physical floor so staff can instantly
            identify any machine.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditMode(true)}
            className="px-5 py-2.5 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors text-sm"
          >
            Set up floor layout
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-[#00E5FF]" />
          <span className="text-sm font-semibold text-white">Gym Floor</span>
          <span className="text-xs text-zinc-500">{config.rows} × {config.cols}</span>
          {unplaced.length > 0 && !editMode && (
            <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5">
              {unplaced.length} unplaced
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button
                onClick={() => setShowDimensionEditor((v) => !v)}
                className="p-2 rounded-lg border border-[#2A2A2A] hover:border-[#00E5FF]/50 text-zinc-400 hover:text-white transition-colors"
                title="Edit grid size"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleDiscard}
                className="px-4 py-2 rounded-lg border border-[#2A2A2A] text-zinc-400 hover:text-white transition-colors text-sm flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#00E5FF] text-black font-bold text-sm hover:bg-[#00B8CC] transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save Layout'}
              </button>
            </>
          ) : (
            canEdit && (
              <button
                onClick={() => setEditMode(true)}
                className="px-4 py-2 rounded-lg border border-[#2A2A2A] text-zinc-400 hover:text-white hover:border-[#00E5FF]/50 transition-colors text-sm"
              >
                Edit Layout
              </button>
            )
          )}
        </div>
      </div>

      {/* Grid dimension editor */}
      {showDimensionEditor && (
        <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl p-4 flex items-end gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400">Rows</label>
            <input
              type="number"
              min={1}
              max={50}
              value={pendingRows}
              onChange={(e) => setPendingRows(Math.max(1, Math.min(50, Number(e.target.value))))}
              className="w-20 px-3 py-1.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400">Columns</label>
            <input
              type="number"
              min={1}
              max={50}
              value={pendingCols}
              onChange={(e) => setPendingCols(Math.max(1, Math.min(50, Number(e.target.value))))}
              className="w-20 px-3 py-1.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
          <p className="text-xs text-zinc-500 flex-1">
            Machines outside new bounds will be unplaced automatically.
          </p>
          <button
            onClick={handleApplyDimensions}
            className="px-4 py-2 bg-[#00E5FF] text-black rounded-lg font-bold text-sm hover:bg-[#00B8CC] transition-colors"
          >
            Apply
          </button>
          <button onClick={() => setShowDimensionEditor(false)} className="p-2 text-zinc-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4">
          {/* Unplaced tray — only in edit mode */}
          {editMode && (
            <UnplacedTray machines={unplaced} liveMap={liveMap} activeDragId={activeDragId} />
          )}

          {/* Floor grid */}
          <div className="flex-1 overflow-auto">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${config.cols}, minmax(140px, 1fr))`,
                gridTemplateRows: `repeat(${config.rows}, auto)`,
              }}
            >
              {Array.from({ length: config.rows }, (_, row) =>
                Array.from({ length: config.cols }, (_, col) => {
                  const occupant = placedMap.get(`${row}:${col}`);
                  const live = occupant ? liveMap.get(occupant.id) : undefined;
                  return (
                    <LiveGridCell
                      key={`${row}:${col}`}
                      row={row}
                      col={col}
                      machine={occupant}
                      live={live}
                      gymId={gymId}
                      editMode={editMode}
                      fetchedAt={fetchedAt}
                      tick={tick}
                      isBeingDragged={!!occupant && activeDragId === occupant.id}
                    />
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </DndContext>
    </div>
  );
}

// ── Unplaced tray ──────────────────────────────────────────────────────────────

function UnplacedTray({
  machines,
  liveMap,
  activeDragId,
}: {
  machines: FloorMachine[];
  liveMap: Map<string, LiveMachine>;
  activeDragId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unplaced-tray' });

  return (
    <div
      ref={setNodeRef}
      className={`w-44 shrink-0 bg-[#0A0A0A] border rounded-xl p-2 space-y-1.5 min-h-[160px] transition-colors ${
        isOver ? 'border-[#00E5FF]/60 bg-[#00E5FF]/5' : 'border-[#1A1A1A]'
      }`}
    >
      <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider px-1 pb-0.5">
        Unplaced ({machines.length})
      </p>
      {machines.length === 0 ? (
        <p className="text-[10px] text-zinc-600 text-center py-4">All placed ✓</p>
      ) : (
        machines.map((m) => {
          const live = liveMap.get(m.id);
          const statusDot = live?.is_busy
            ? 'bg-emerald-500'
            : live?.is_under_maintenance
            ? 'bg-amber-500'
            : !live?.is_active
            ? 'bg-zinc-600'
            : 'bg-[#00E5FF]/50';

          return (
            <TrayCard
              key={m.id}
              machine={m}
              statusDotClass={statusDot}
              isDragging={activeDragId === trayId(m.id)}
            />
          );
        })
      )}
    </div>
  );
}

function TrayCard({
  machine: m,
  statusDotClass,
  isDragging,
}: {
  machine: FloorMachine;
  statusDotClass: string;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: trayId(m.id),
    data: { machineId: m.id },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing transition-all ${
        isDragging
          ? 'opacity-40 border-[#00E5FF]/50 bg-[#00E5FF]/10'
          : 'border-[#1A1A1A] bg-[#111] hover:border-[#333]'
      }`}
    >
      <GripVertical className="w-3 h-3 text-zinc-600 shrink-0" />
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass}`} />
      <span className="text-sm shrink-0">{TYPE_ICONS[m.type?.toLowerCase()] ?? '⚙️'}</span>
      <span className="text-[10px] text-zinc-300 truncate">{m.name}</span>
    </div>
  );
}

// ── Live grid cell ──────────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function isStaleHeartbeat(lastHeartbeat: string | null): boolean {
  if (!lastHeartbeat) return true;
  return Date.now() - new Date(lastHeartbeat).getTime() > 60_000;
}

function LiveGridCell({
  row,
  col,
  machine,
  live,
  gymId,
  editMode,
  fetchedAt,
  tick,
  isBeingDragged,
}: {
  row: number;
  col: number;
  machine: FloorMachine | undefined;
  live: LiveMachine | undefined;
  gymId: string;
  editMode: boolean;
  fetchedAt: number;
  tick: number;
  isBeingDragged: boolean;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: cellId(row, col),
    disabled: !editMode,
  });

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
  } = useDraggable({
    id: machine?.id ?? `empty-${row}-${col}`,
    disabled: !editMode || !machine,
    data: { machineId: machine?.id },
  });

  const setRef = (el: HTMLElement | null) => {
    setDropRef(el);
    if (machine) setDragRef(el);
  };

  const dragStyle = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  void tick; // triggers re-render for elapsed timer

  // ── Empty cell ──
  if (!machine) {
    return (
      <div
        ref={setDropRef}
        className={`rounded-xl border h-full min-h-[120px] transition-all ${
          isOver && editMode
            ? 'border-[#00E5FF]/70 bg-[#00E5FF]/10'
            : 'border-[#1A1A1A] bg-[#0A0A0A]'
        }`}
      />
    );
  }

  const typeIcon = TYPE_ICONS[live?.type?.toLowerCase() ?? machine.type?.toLowerCase()] ?? '⚙️';
  const href = `/dashboard/gym/${gymId}/machines/${machine.id}`;

  const dragAttrs = editMode ? attributes : {};
  const dragListeners = editMode ? listeners : {};
  const baseDragClass = editMode ? 'cursor-grab active:cursor-grabbing' : '';
  const draggingClass = isBeingDragged ? 'opacity-40' : '';
  const dropOverClass = isOver && editMode ? 'ring-2 ring-amber-400/60' : '';

  // ── Busy cell ──
  if (live?.is_busy && live.active_session) {
    const elapsed =
      live.active_session.elapsed_seconds +
      Math.floor((Date.now() - fetchedAt) / 1000);
    const stale = isStaleHeartbeat(live.last_heartbeat);

    const inner = (
      <div
        ref={setRef}
        style={dragStyle}
        {...dragAttrs}
        {...dragListeners}
        className={`block bg-[#0A0A0A] border-l-4 border-l-emerald-500 border border-emerald-500/20
          rounded-xl p-4 shadow-[0_0_20px_rgba(16,185,129,0.08)]
          hover:shadow-[0_0_24px_rgba(16,185,129,0.15)] transition-all select-none
          ${baseDragClass} ${draggingClass} ${dropOverClass}
          ${!editMode ? 'cursor-pointer' : ''}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-sm font-medium text-white truncate">{machine.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {editMode && <GripVertical className="w-3.5 h-3.5 text-zinc-600" />}
            <span className="text-sm">{typeIcon}</span>
          </div>
        </div>

        {/* User */}
        {live.current_user && (
          <div className="flex items-center gap-2 mb-3">
            <MemberAvatar
              avatarUrl={live.current_user.avatar_url}
              username={live.current_user.username}
              size="sm"
            />
            <span className="text-xs text-zinc-300 truncate">{live.current_user.username}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
          <span className="text-emerald-400 font-mono tabular-nums font-bold">
            ⏱ {formatDuration(elapsed)}
          </span>
          <span className="text-[#808080]">
            🔄 {live.last_rpm && live.last_rpm > 0 ? `${live.last_rpm} RPM` : '-- RPM'}
          </span>
          <span className="text-[#808080]">🔥 {live.active_session.calories} cal</span>
          <span className="text-[#808080]">
            💧 {live.active_session.drops_earned > 0
              ? `${live.active_session.drops_earned} drops`
              : 'earning...'}
          </span>
        </div>

        {stale && <div className="text-[10px] text-amber-400 mb-1">⚠ No signal</div>}

        <div className="flex items-center justify-end mt-1">
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400">In Use</span>
        </div>
      </div>
    );

    return editMode ? inner : <Link href={href} className="block">{inner}</Link>;
  }

  // ── Maintenance cell ──
  if (live?.is_under_maintenance) {
    const inner = (
      <div
        ref={setRef}
        style={dragStyle}
        {...dragAttrs}
        {...dragListeners}
        className={`bg-[#0A0A0A] border-l-4 border-l-amber-500 border border-amber-500/20
          rounded-xl p-4 opacity-80 hover:opacity-100 transition-all select-none
          ${baseDragClass} ${draggingClass} ${dropOverClass}
          ${!editMode ? 'cursor-pointer' : ''}
        `}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white truncate">{machine.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            {editMode && <GripVertical className="w-3.5 h-3.5 text-zinc-600" />}
            <span className="text-sm">{typeIcon}</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-3 gap-1">
          <Wrench className="w-5 h-5 text-amber-500" />
          <span className="text-xs text-amber-400">Maintenance</span>
        </div>
        <div className="flex items-center justify-end mt-1">
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400">Maintenance</span>
        </div>
      </div>
    );
    return editMode ? inner : <Link href={href} className="block">{inner}</Link>;
  }

  // ── Inactive cell ──
  if (live && !live.is_active) {
    const inner = (
      <div
        ref={setRef}
        style={dragStyle}
        {...dragAttrs}
        {...dragListeners}
        className={`bg-[#0A0A0A]/50 border border-[#1A1A1A] rounded-xl p-4 opacity-40
          hover:opacity-70 transition-all select-none
          ${baseDragClass} ${draggingClass} ${dropOverClass}
          ${!editMode ? 'cursor-pointer' : ''}
        `}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white truncate">{machine.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            {editMode && <GripVertical className="w-3.5 h-3.5 text-zinc-600" />}
            <span className="text-sm">{typeIcon}</span>
          </div>
        </div>
        <p className="text-xs text-center text-zinc-600 py-3">Inactive</p>
        <div className="flex items-center justify-end mt-1">
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/10 text-red-400">Inactive</span>
        </div>
      </div>
    );
    return editMode ? inner : <Link href={href} className="block">{inner}</Link>;
  }

  // ── Available / no live data yet ──
  const inner = (
    <div
      ref={setRef}
      style={dragStyle}
      {...dragAttrs}
      {...dragListeners}
      className={`bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl p-4
        hover:border-[#00E5FF]/30 transition-all select-none
        ${baseDragClass} ${draggingClass} ${dropOverClass}
        ${!editMode ? 'cursor-pointer' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#00E5FF]/50 shrink-0" />
          <span className="text-sm font-medium text-white truncate">{machine.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {editMode && <GripVertical className="w-3.5 h-3.5 text-zinc-600" />}
          <span className="text-sm">{typeIcon}</span>
        </div>
      </div>
      <p className="text-xs text-center text-zinc-400 py-3">Available</p>
      <div className="flex items-center justify-end mt-1">
        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#00E5FF]/10 text-[#00E5FF]">Active</span>
      </div>
    </div>
  );

  return editMode ? inner : <Link href={href} className="block">{inner}</Link>;
}
