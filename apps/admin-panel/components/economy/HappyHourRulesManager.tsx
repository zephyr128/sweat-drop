'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Zap, Plus, Trash2, Edit2, Power, Loader2, AlertTriangle, X,
  Eye, EyeOff, Calendar, Bell, Clock, Globe,
} from 'lucide-react';
import {
  getBoostRules,
  upsertBoostRule,
  deleteBoostRule,
  getActiveBoost,
  getSchedulePreview,
  type BoostRule,
  type ActiveBoostStatus,
  type ScheduleWindow,
} from '@/lib/actions/happy-hour-actions';
import { confirmAction } from '@/components/ui/ConfirmDialog';

interface HappyHourRulesManagerProps {
  gymId: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_VALUES = [0, 1, 2, 3, 4, 5, 6];

function formatTime(t: string) {
  return t.slice(0, 5);
}

function DayPills({ days, onChange }: { days: number[]; onChange?: (days: number[]) => void }) {
  return (
    <div className="flex gap-1">
      {DAY_VALUES.map((d) => {
        const active = days.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => {
              if (!onChange) return;
              onChange(active ? days.filter((x) => x !== d) : [...days, d]);
            }}
            disabled={!onChange}
            className={`w-7 h-7 rounded-full text-[10px] font-semibold transition-colors ${
              active
                ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30'
                : 'bg-[#111] text-zinc-600 border border-[#1A1A1A]'
            } ${onChange ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
          >
            {DAY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}

function VisibilityBadge({ visible }: { visible: boolean }) {
  return visible ? (
    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
      <Eye className="w-2.5 h-2.5" /> Visible
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
      <EyeOff className="w-2.5 h-2.5" /> Hidden
    </span>
  );
}

export function HappyHourRulesManager({ gymId }: HappyHourRulesManagerProps) {
  const [rules, setRules] = useState<BoostRule[]>([]);
  const [activeBoost, setActiveBoost] = useState<ActiveBoostStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BoostRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Schedule preview
  const [schedule, setSchedule] = useState<ScheduleWindow[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [name, setName] = useState('Happy Hour');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('19:00');
  const [multiplier, setMultiplier] = useState(1.5);
  const [isActive, setIsActive] = useState(true);
  const [isVisibleToMembers, setIsVisibleToMembers] = useState(true);
  const [displayLabel, setDisplayLabel] = useState('');

  const initialLoadDone = useRef(false);

  const fetchData = useCallback(async () => {
    if (!initialLoadDone.current) setLoading(true);
    const [rulesRes, boostRes] = await Promise.all([
      getBoostRules(gymId),
      getActiveBoost(gymId),
    ]);
    if (rulesRes.success && rulesRes.data) {
      setRules(rulesRes.data);
    } else if (rulesRes.error) {
      console.error('[HappyHour] getBoostRules error:', rulesRes.error);
    }
    if (boostRes.success && boostRes.data) setActiveBoost(boostRes.data);
    setLoading(false);
    initialLoadDone.current = true;
  }, [gymId]);

  const fetchSchedule = useCallback(async () => {
    setScheduleLoading(true);
    const res = await getSchedulePreview(gymId, 7);
    if (res.success && res.data) {
      setSchedule(res.data);
    } else {
      toast.error(res.error || 'Failed to load schedule');
    }
    setScheduleLoading(false);
  }, [gymId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (showPreview) fetchSchedule();
  }, [showPreview, fetchSchedule]);

  const openCreate = () => {
    setEditingRule(null);
    setName('Happy Hour');
    setDaysOfWeek([1, 2, 3, 4, 5]);
    setStartTime('17:00');
    setEndTime('19:00');
    setMultiplier(1.5);
    setIsActive(true);
    setIsVisibleToMembers(true);
    setDisplayLabel('');
    setIsModalOpen(true);
  };

  const openEdit = (rule: BoostRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setDaysOfWeek(rule.days_of_week);
    setStartTime(formatTime(rule.start_time_local));
    setEndTime(formatTime(rule.end_time_local));
    setMultiplier(rule.multiplier);
    setIsActive(rule.is_active);
    setIsVisibleToMembers(rule.is_visible_to_members);
    setDisplayLabel(rule.display_label ?? '');
    setIsModalOpen(true);
  };

  // Detect overlapping rules for inline conflict warning
  const formConflicts = useMemo(() => {
    if (!isActive || daysOfWeek.length === 0) return [];
    return rules.filter((r) => {
      if (editingRule && r.id === editingRule.id) return false;
      if (!r.is_active) return false;
      const overlappingDays = r.days_of_week.some((d) => daysOfWeek.includes(d));
      if (!overlappingDays) return false;
      const rStart = formatTime(r.start_time_local);
      const rEnd = formatTime(r.end_time_local);
      return startTime < rEnd && endTime > rStart;
    });
  }, [rules, editingRule, isActive, daysOfWeek, startTime, endTime]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (daysOfWeek.length === 0) { toast.error('Select at least one day'); return; }
    if (startTime >= endTime) { toast.error('Start time must be before end time'); return; }
    if (multiplier < 1 || multiplier > 3) { toast.error('Multiplier must be 1.0–3.0'); return; }

    if (formConflicts.length > 0) {
      const ok = await confirmAction({
        title: 'Overlapping Rules',
        message: `This rule overlaps with "${formConflicts[0].name}". Higher priority rule takes effect. Continue?`,
        confirmLabel: 'Save Anyway',
        variant: 'warning',
      });
      if (!ok) return;
    }

    setSaving(true);
    const res = await upsertBoostRule({
      gymId,
      ruleId: editingRule?.id ?? null,
      name: name.trim(),
      isActive,
      daysOfWeek,
      startTime,
      endTime,
      multiplier,
      isVisibleToMembers,
      displayLabel: displayLabel.trim() || null,
    });
    if (res.success) {
      toast.success(editingRule ? 'Rule updated' : 'Rule created');
      setIsModalOpen(false);

      if (!editingRule && res.data?.rule_id) {
        const optimisticRule: BoostRule = {
          id: res.data.rule_id,
          gym_id: gymId,
          name: name.trim(),
          is_active: isActive,
          days_of_week: daysOfWeek,
          start_time_local: startTime + ':00',
          end_time_local: endTime + ':00',
          timezone: 'Europe/Belgrade',
          multiplier,
          machine_types: null,
          priority: 0,
          is_visible_to_members: isVisibleToMembers,
          display_label: displayLabel.trim() || null,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setRules((prev) => [optimisticRule, ...prev]);
      }

      fetchData();
      if (showPreview) fetchSchedule();
    } else {
      toast.error(res.error || 'Failed to save');
    }
    setSaving(false);
  };

  const handleDelete = async (rule: BoostRule) => {
    if (!(await confirmAction({
      title: 'Delete Rule',
      message: `Delete "${rule.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    }))) return;

    setDeletingId(rule.id);
    const res = await deleteBoostRule(rule.id, gymId);
    if (res.success) {
      toast.success('Rule deleted');
      fetchData();
      if (showPreview) fetchSchedule();
    } else {
      toast.error(res.error || 'Failed to delete');
    }
    setDeletingId(null);
  };

  const handleToggle = async (rule: BoostRule) => {
    const res = await upsertBoostRule({
      gymId,
      ruleId: rule.id,
      name: rule.name,
      isActive: !rule.is_active,
      daysOfWeek: rule.days_of_week,
      startTime: formatTime(rule.start_time_local),
      endTime: formatTime(rule.end_time_local),
      multiplier: rule.multiplier,
      isVisibleToMembers: rule.is_visible_to_members,
      displayLabel: rule.display_label,
    });
    if (res.success) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
      if (showPreview) fetchSchedule();
    } else {
      toast.error(res.error || 'Failed to toggle');
    }
  };

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      </div>
    );
  }

  // Group schedule windows by date for the preview panel
  const scheduleByDate = schedule.reduce<Record<string, ScheduleWindow[]>>((acc, w) => {
    const key = w.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(w);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Rules Card */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1A1A1A] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Happy Hour Rules</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Time-window drop multipliers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeBoost?.active && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                <Zap className="w-2.5 h-2.5" />
                Active now × {activeBoost.multiplier}
              </span>
            )}
            <button
              onClick={() => setShowPreview((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showPreview
                  ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30'
                  : 'bg-[#1A1A1A] text-zinc-400 border border-[#333] hover:text-white'
              }`}
            >
              <Calendar className="w-3 h-3" />
              Preview
            </button>
            <button
              onClick={openCreate}
              className="px-3 py-1.5 bg-[#00E5FF] text-black rounded-lg text-xs font-medium hover:bg-[#00B8CC] transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" />
              Add Rule
            </button>
          </div>
        </div>

        {/* Rules list */}
        {rules.length === 0 ? (
          <div className="text-center py-10 px-5">
            <Zap className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No Happy Hour rules configured</p>
            <p className="text-[10px] text-zinc-600 mt-1">Create a rule to boost drops during specific time windows</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1A1A1A]">
            {rules.map((rule) => (
              <div key={rule.id} className={`px-5 py-3.5 flex items-center gap-4 ${!rule.is_active ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm text-white font-medium">{rule.name}</p>
                    {rule.display_label && rule.display_label !== rule.name && (
                      <span className="text-[10px] text-zinc-400 italic">&ldquo;{rule.display_label}&rdquo;</span>
                    )}
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      ×{rule.multiplier}
                    </span>
                    <VisibilityBadge visible={rule.is_visible_to_members} />
                  </div>
                  <div className="flex items-center gap-2">
                    <DayPills days={rule.days_of_week} />
                    <span className="text-xs text-zinc-500">
                      {formatTime(rule.start_time_local)} – {formatTime(rule.end_time_local)}
                    </span>
                    <span className="text-[10px] text-zinc-600 flex items-center gap-0.5">
                      <Globe className="w-2.5 h-2.5" /> {rule.timezone}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggle(rule)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      rule.is_active ? 'text-[#00E5FF] hover:bg-[#00E5FF]/10' : 'text-zinc-600 hover:bg-zinc-800'
                    }`}
                    title={rule.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEdit(rule)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule)}
                    disabled={deletingId === rule.id}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Preview Panel */}
      {showPreview && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1A1A1A] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Upcoming Schedule</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">Next 7 days of Happy Hour windows</p>
              </div>
            </div>
            <button
              onClick={fetchSchedule}
              disabled={scheduleLoading}
              className="px-2.5 py-1 text-[10px] font-medium text-zinc-400 hover:text-white bg-[#1A1A1A] rounded-lg transition-colors disabled:opacity-50"
            >
              {scheduleLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refresh'}
            </button>
          </div>

          {scheduleLoading && schedule.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : schedule.length === 0 ? (
            <div className="text-center py-8 px-5">
              <Calendar className="w-7 h-7 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No upcoming windows</p>
              <p className="text-[10px] text-zinc-600 mt-1">Active rules with scheduled days will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-[#1A1A1A]">
              {Object.entries(scheduleByDate).map(([date, windows]) => (
                <div key={date} className="px-5 py-3">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    {windows[0].day_name} &middot; {date}
                  </p>
                  <div className="space-y-1.5">
                    {windows.map((w, i) => (
                      <div
                        key={`${w.rule_id}-${date}-${i}`}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                          w.is_past ? 'bg-zinc-900/50 opacity-50' : 'bg-[#111]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs text-zinc-300 min-w-[100px]">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          {formatTime(w.start_time)} – {formatTime(w.end_time)}
                        </div>
                        <span className="text-xs font-medium text-white truncate">{w.label}</span>
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
                          ×{w.multiplier}
                        </span>
                        <VisibilityBadge visible={w.is_visible} />
                        {w.is_past && (
                          <span className="text-[10px] text-zinc-600 ml-auto">Past</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Test reminder — disabled since no single-user backend endpoint exists yet */}
          <div className="px-5 py-3 border-t border-[#1A1A1A]">
            <div className="relative group inline-block">
              <button
                disabled
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 bg-[#1A1A1A] border border-[#333] rounded-lg cursor-not-allowed flex items-center gap-1.5"
              >
                <Bell className="w-3 h-3" />
                Send test reminder to me
              </button>
              <div className="absolute bottom-full left-0 mb-1.5 px-2.5 py-1.5 bg-zinc-800 text-zinc-300 text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-zinc-700 shadow-lg">
                Backend endpoint for single-user test not available yet
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
              <h2 className="text-sm font-semibold text-white">
                {editingRule ? 'Edit Rule' : 'New Happy Hour Rule'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Rule Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none"
                  placeholder="e.g. Evening Happy Hour"
                />
              </div>

              {/* Display Label */}
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1 block">Display Label</label>
                <p className="text-[10px] text-zinc-600 mb-1.5">
                  Marketing title shown to members (optional — defaults to rule name)
                </p>
                <input
                  type="text"
                  value={displayLabel}
                  onChange={(e) => setDisplayLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none"
                  placeholder="e.g. Morning Boost 🔥"
                />
              </div>

              {/* Days */}
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Days</label>
                <DayPills days={daysOfWeek} onChange={setDaysOfWeek} />
              </div>

              {/* Time window */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Start Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white focus:border-[#00E5FF] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1.5 block">End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white focus:border-[#00E5FF] focus:outline-none"
                  />
                </div>
              </div>

              {/* Timezone notice */}
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <Globe className="w-3 h-3" />
                <span>Timezone: <span className="text-zinc-300 font-medium">Europe/Belgrade</span> (CET/CEST)</span>
              </div>

              {/* Multiplier */}
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                  Multiplier: <span className="text-[#00E5FF] font-bold">×{multiplier.toFixed(1)}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={multiplier}
                  onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                  className="w-full accent-[#00E5FF]"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                  <span>×1.0 (none)</span>
                  <span>×2.0 (double)</span>
                  <span>×3.0 (max)</span>
                </div>
              </div>

              {/* Visible to members toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-xs font-medium text-zinc-300">Visible to members</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    When off, this rule is active but hidden from the mobile app
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVisibleToMembers((v) => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    isVisibleToMembers ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      isVisibleToMembers ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Validation: start < end */}
              {startTime >= endTime && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-400">Start time must be before end time</p>
                </div>
              )}

              {/* Live conflict warning */}
              {formConflicts.length > 0 && startTime < endTime && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-400">
                    Overlaps with &ldquo;{formConflicts[0].name}&rdquo;
                    {formConflicts.length > 1 && ` (+${formConflicts.length - 1} more)`}
                    &nbsp;&mdash; higher priority rule wins
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 px-5 py-4 border-t border-[#1A1A1A]">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-400 bg-[#1A1A1A] border border-[#333] rounded-lg hover:bg-[#222] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || startTime >= endTime || daysOfWeek.length === 0}
                className="flex-1 px-4 py-2 text-sm font-bold bg-[#00E5FF] text-black rounded-lg hover:bg-[#00B8CC] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
