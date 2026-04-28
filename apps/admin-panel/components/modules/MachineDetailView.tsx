'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrandedQRCode } from '@/components/ui/BrandedQRCode';
import { toast } from 'sonner';
import {
  ArrowLeft, Printer, Copy, Check, Save, Wrench, Power, Radio,
} from 'lucide-react';
import { UserRole } from '@/lib/auth';
import { machineQrUrl } from '@/lib/qr-urls';
import {
  updateMachine,
  toggleMachineStatus,
  toggleMaintenance,
} from '@/lib/actions/machine-actions';

export interface MachineForDetail {
  id: string;
  gym_id: string;
  name: string;
  type: string;
  unique_qr_code: string;
  qr_uuid?: string;
  is_active: boolean;
  is_under_maintenance?: boolean;
  maintenance_notes?: string;
  sensor_id?: string | null;
  sensor_paired_at?: string | null;
  created_at: string;
  updated_at: string;
  gyms?: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
  };
}

interface MachineDetailViewProps {
  machine: MachineForDetail;
  userRole: UserRole;
  gymName?: string;
}

const TYPE_ICONS: Record<string, string> = {
  treadmill: '🏃', bike: '🚴', elliptical: '⭕', weight: '🏋️', rower: '🚣', stepper: '🪜',
};
const TYPE_LABELS: Record<string, string> = {
  treadmill: 'Treadmill', bike: 'Bike', elliptical: 'Elliptical', weight: 'Weight', rower: 'Rower', stepper: 'Stepper',
};

export function MachineDetailView({ machine, userRole, gymName }: MachineDetailViewProps) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(machine.name);
  const [editType, setEditType] = useState<'treadmill' | 'bike'>(
    machine.type === 'treadmill' || machine.type === 'bike' ? machine.type : 'treadmill',
  );
  const [saving, setSaving] = useState(false);

  // Maintenance state
  const [maintenanceNotes, setMaintenanceNotes] = useState(machine.maintenance_notes || '');
  const [togglingMaintenance, setTogglingMaintenance] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const canEdit = userRole === 'gym_owner' || userRole === 'gym_admin' || userRole === 'superadmin';
  const isSuperAdmin = userRole === 'superadmin';

  const qrUuid = machine.qr_uuid || machine.unique_qr_code;
  const qrUrl = machineQrUrl(qrUuid, machine.type);
  const resolvedGymName = gymName || machine.gyms?.name || '';
  const typeIcon = TYPE_ICONS[machine.type?.toLowerCase()] || '⚙️';
  const typeLabel = TYPE_LABELS[machine.type?.toLowerCase()] || machine.type;

  const handlePrint = useCallback(() => {
    const params = new URLSearchParams({
      type: 'machine',
      machineId: qrUuid,
      machineName: machine.name,
      machineType: machine.type,
      ...(resolvedGymName ? { gymName: resolvedGymName } : {}),
    });
    window.open(`/print-qr?${params.toString()}`, '_blank', 'noopener');
  }, [qrUuid, machine.name, machine.type, resolvedGymName]);

  const copyText = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateMachine(machine.id, machine.gym_id, { name: editName, type: editType });
      if (result.success) {
        toast.success('Machine updated');
        setEditing(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Update failed');
      }
    } catch {
      toast.error('Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMaintenance = async () => {
    setTogglingMaintenance(true);
    try {
      const newState = !machine.is_under_maintenance;
      const result = await toggleMaintenance(machine.id, machine.gym_id, newState, maintenanceNotes || undefined);
      if (result.success) {
        toast.success(newState ? 'Marked as under maintenance' : 'Removed from maintenance');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed');
      }
    } catch {
      toast.error('Unexpected error');
    } finally {
      setTogglingMaintenance(false);
    }
  };

  const handleToggleActive = async () => {
    setTogglingStatus(true);
    try {
      const result = await toggleMachineStatus(machine.id, machine.gym_id, !machine.is_active);
      if (result.success) {
        toast.success(machine.is_active ? 'Machine deactivated' : 'Machine activated');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed');
      }
    } catch {
      toast.error('Unexpected error');
    } finally {
      setTogglingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href={`/dashboard/gym/${machine.gym_id}/machines`}
        className="no-print inline-flex items-center gap-2 text-zinc-500 hover:text-[#00E5FF] transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Machines
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ─── Left: Machine Info + Actions ─── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Info card */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Machine Info</h2>
              {canEdit && !editing && (
                <button onClick={() => setEditing(true)} className="text-xs text-zinc-500 hover:text-[#00E5FF] transition-colors">
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-zinc-900/50 border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF]/40 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Type</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as 'treadmill' | 'bike')}
                    className="w-full px-3 py-2 text-sm bg-zinc-900/50 border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF]/40 focus:outline-none"
                  >
                    <option value="treadmill">🏃 Treadmill</option>
                    <option value="bike">🚴 Bike</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-sm font-semibold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setEditing(false); setEditName(machine.name); setEditType(machine.type === 'bike' ? 'bike' : 'treadmill'); }} className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm hover:bg-zinc-800 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Name</p>
                  <p className="text-sm text-white font-medium">{machine.name}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Type</p>
                  <p className="text-sm text-white">{typeIcon} {typeLabel}</p>
                </div>
                {resolvedGymName && (
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Gym</p>
                    <p className="text-sm text-white">{resolvedGymName}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${machine.is_active ? 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700/50'}`}>
                      {machine.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {machine.is_under_maintenance && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30">
                        Maintenance
                      </span>
                    )}
                  </div>
                </div>
                {machine.sensor_id && (
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider">
                      BLE Sensor
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30">
                        Paired
                      </span>
                      <code
                        className="text-[10px] text-zinc-500 font-mono truncate"
                        title={machine.sensor_id}
                      >
                        {machine.sensor_id}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions card */}
          {canEdit && (
            <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5 space-y-3">
              <h2 className="text-base font-semibold text-white mb-1">Actions</h2>

              {/* Maintenance toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className={`w-4 h-4 ${machine.is_under_maintenance ? 'text-amber-400' : 'text-zinc-600'}`} />
                    <span className="text-sm text-white">Maintenance</span>
                  </div>
                  <button
                    onClick={handleToggleMaintenance}
                    disabled={togglingMaintenance}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                      machine.is_under_maintenance
                        ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                        : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    {machine.is_under_maintenance ? 'End Maintenance' : 'Start Maintenance'}
                  </button>
                </div>
                {(machine.is_under_maintenance || maintenanceNotes) && (
                  <textarea
                    value={maintenanceNotes}
                    onChange={(e) => setMaintenanceNotes(e.target.value)}
                    placeholder="Maintenance notes..."
                    rows={2}
                    className="w-full px-3 py-2 text-xs bg-zinc-900/50 border border-[#1A1A1A] rounded-lg text-white placeholder:text-zinc-600 focus:border-[#00E5FF]/40 focus:outline-none resize-none"
                  />
                )}
              </div>

              {/* Active/Inactive toggle */}
              {isSuperAdmin && (
                <div className="flex items-center justify-between pt-2 border-t border-[#1A1A1A]">
                  <div className="flex items-center gap-2">
                    <Power className={`w-4 h-4 ${machine.is_active ? 'text-[#00E5FF]' : 'text-zinc-600'}`} />
                    <span className="text-sm text-white">{machine.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <button
                    onClick={handleToggleActive}
                    disabled={togglingStatus}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                      machine.is_active
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF] hover:bg-[#00E5FF]/20'
                        : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    {machine.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Right: QR + Print (consolidated) ─── */}
        <div className="lg:col-span-3">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 space-y-6">
            {/* Header with primary action */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">QR Code</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Scanning with the SweatDrop app starts a workout on this machine
                </p>
              </div>
              <button
                onClick={handlePrint}
                className="no-print inline-flex items-center gap-2 px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-xs font-semibold hover:bg-[#00c8e0] transition-colors shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                Open Print Studio
              </button>
            </div>

            {/* QR preview */}
            <div className="flex justify-center py-2">
              <div className="relative">
                <div
                  aria-hidden
                  className="absolute -inset-3 rounded-3xl bg-[#00E5FF]/10 blur-2xl"
                />
                <div className="relative bg-white p-5 rounded-2xl shadow-[0_20px_60px_-20px_rgba(0,229,255,0.3)]">
                  <BrandedQRCode value={qrUrl} size={220} />
                </div>
              </div>
            </div>

            {/* Payload block */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider">
                  Deep link
                </p>
                <button
                  onClick={() => copyText(qrUuid, 'UUID')}
                  className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-[#00E5FF] uppercase tracking-wider transition-colors"
                  title="Copy the raw machine UUID (for DB / debug use)"
                >
                  {copied === 'UUID' ? (
                    <Check className="w-3 h-3 text-[#00E5FF]" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Copy UUID
                </button>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#00E5FF] font-mono bg-[#050505] border border-[#1A1A1A] px-3 py-2 rounded-lg flex-1 break-all">
                  {qrUrl}
                </code>
                <button
                  onClick={() => copyText(qrUrl, 'Deep link')}
                  className="p-2 rounded-lg border border-[#1A1A1A] text-zinc-500 hover:text-[#00E5FF] hover:border-[#00E5FF]/40 transition-colors shrink-0"
                  title="Copy deep link"
                >
                  {copied === 'Deep link' ? (
                    <Check className="w-3.5 h-3.5 text-[#00E5FF]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
