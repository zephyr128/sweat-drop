'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Target, CheckCircle2, XCircle, Droplet, Calendar, Plus,
  Power, Trash2, Pencil, BarChart3, Users, X, Upload, Image,
  Building2, Minus, Info, CalendarDays, Infinity, Flame,
  Trophy, ArrowRight, Clock, Repeat, Milestone, Palette,
} from 'lucide-react';
import { BadgeStudioModal } from '@/components/badge-studio/BadgeStudioModal';
import { DataTable, type ColumnDef, type DataTableQuery, type FilterDef } from '@/components/ui/DataTable';
import { listChallenges } from '@/lib/actions/list-actions';
import type { ChallengeRow } from '@/lib/actions/list-helpers';
import {
  createChallenge, updateChallenge, deleteChallenge,
  toggleChallengeStatus, getChallengeCompletionStats,
  getChallengeDetailedProgress, closeChallenge,
} from '@/lib/actions/challenge-actions';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { MemberAvatar } from '@/components/MemberAvatar';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '@/lib/utils/storage';
import type { PaginatedResult } from '@/lib/actions/list-helpers';

// ─── Types ────────────────────────────────────────────────────────

interface ChallengesListProps {
  gymId: string;
}

interface Challenge {
  id: string;
  name: string;
  description: string | null;
  reward_drops: number;
  challenge_type: string;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  target_drops: number | null;
  milestone_threshold: number | null;
  streak_days: number | null;
  badge_image_url: string | null;
  scoring_model?: string | null;
  tiers?: TierInput[] | null;
  sponsor_name?: string | null;
  sponsor_logo?: string | null;
  prize_description?: string | null;
}

interface TierInput {
  label: string;
  target: number;
  drops: number;
}

// ─── Schema ───────────────────────────────────────────────────────

const challengeSchema = z.object({
  name: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  challengeType: z.enum(['daily', 'weekly', 'monthly', 'streak', 'milestone', 'checkin_streak', 'checkin_count']),
  targetDrops: z.number().int().positive().optional(),
  milestoneThreshold: z.number().int().positive().optional(),
  streakDays: z.number().int().positive().optional(),
  rewardDrops: z.number().int().min(0),
  badgeImageUrl: z.string().url().optional().or(z.literal('')),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  scoringModel: z.enum(['total_drops', 'distance_km', 'days_visited', 'streak_days']).optional(),
  sponsorName: z.string().optional(),
  sponsorLogo: z.string().url().optional().or(z.literal('')),
  prizeDescription: z.string().optional(),
}).superRefine((data, ctx) => {
  if (['daily', 'weekly', 'monthly', 'checkin_count'].includes(data.challengeType)) {
    if (!data.targetDrops || data.targetDrops <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: data.challengeType === 'checkin_count' ? 'Number of check-ins is required' : 'Target drops is required',
        path: ['targetDrops'],
      });
    }
  }
  if (['streak', 'checkin_streak'].includes(data.challengeType)) {
    if (!data.streakDays || data.streakDays <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Streak days is required', path: ['streakDays'] });
    }
  }
  if (data.challengeType === 'milestone') {
    if (!data.milestoneThreshold || data.milestoneThreshold <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Milestone threshold is required', path: ['milestoneThreshold'] });
    }
  }
});

type ChallengeFormData = z.infer<typeof challengeSchema>;

// ─── Constants ────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  daily: { label: 'Daily', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <Repeat className="w-3 h-3" /> },
  weekly: { label: 'Weekly', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: <Repeat className="w-3 h-3" /> },
  monthly: { label: 'Monthly', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: <Calendar className="w-3 h-3" /> },
  streak: { label: 'Streak', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: <Flame className="w-3 h-3" /> },
  milestone: { label: 'Milestone', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Trophy className="w-3 h-3" /> },
  checkin_streak: { label: 'Check-in Streak', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: <Flame className="w-3 h-3" /> },
  checkin_count: { label: 'Check-in Count', color: 'bg-teal-500/10 text-teal-400 border-teal-500/20', icon: <Users className="w-3 h-3" /> },
};

const LIFECYCLE_LABEL: Record<string, string> = {
  daily: 'Recurring · Resets daily',
  weekly: 'Recurring · Resets weekly',
  monthly: 'One-time · Monthly',
  streak: 'Streak · Consecutive days',
  milestone: 'Permanent · No deadline',
  checkin_streak: 'Streak · Consecutive visits',
  checkin_count: 'One-time · Count visits',
};

const LIFECYCLE_INFO: Record<string, { text: string; icon: string }> = {
  daily: { text: 'Progress resets every day at midnight. Users can earn rewards repeatedly.', icon: '🔄' },
  weekly: { text: 'Progress resets every Sunday. Users can earn rewards each week.', icon: '📅' },
  monthly: { text: 'One chance to complete within the month. Does not reset.', icon: '📆' },
  streak: { text: 'User must train on consecutive days. Streak resets if a day is missed.', icon: '🔥' },
  checkin_streak: { text: 'User must check in on consecutive days. Streak resets if a day is missed.', icon: '📍' },
  checkin_count: { text: 'Count check-ins within the date range. Does not reset.', icon: '🗓️' },
  milestone: { text: 'Permanent challenge with no deadline. Users work toward it indefinitely.', icon: '🏆' },
};

const DEFAULT_DATE_HINT: Record<string, string> = {
  daily: 'Default: 1 year from start',
  weekly: 'Default: 1 year from start',
  monthly: 'Default: end of current month',
  streak: 'Default: streak days × 2',
  checkin_streak: 'Default: streak days × 2',
  checkin_count: 'Default: end of current month',
  milestone: 'No end date (permanent)',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTargetLabel(row: ChallengeRow) {
  if (row.challenge_type === 'checkin_streak' && row.streak_days) return `${row.streak_days}d streak`;
  if (row.challenge_type === 'checkin_count' && row.target_drops) return `${row.target_drops} visits`;
  if (row.challenge_type === 'streak' && row.streak_days) return `${row.streak_days}d streak`;
  if (row.challenge_type === 'milestone' && (row as any).milestone_threshold) return `${(row as any).milestone_threshold} total`;
  if (row.target_drops) return `${row.target_drops} drops`;
  return '—';
}

// ─── Columns ──────────────────────────────────────────────────────

function buildColumns(
  onToggleStatus: (id: string, active: boolean) => void,
  togglingIds: Set<string>,
): ColumnDef<ChallengeRow>[] {
  return [
    {
      key: 'name',
      label: 'Challenge',
      sortable: true,
      render: (row) => {
        const badge = TYPE_BADGE[row.challenge_type] || TYPE_BADGE.daily;
        return (
          <div className="flex items-center gap-4 py-0.5">
            {row.badge_image_url ? (
              <img
                src={row.badge_image_url}
                alt=""
                className="w-14 h-14 rounded-xl object-cover border border-zinc-700/50 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center shrink-0">
                <Target className="w-6 h-6 text-zinc-500" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{row.name}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${badge.color}`}>
                  {badge.icon}
                  {badge.label}
                </span>
                <span className="text-[10px] text-zinc-500">{LIFECYCLE_LABEL[row.challenge_type] || ''}</span>
              </div>
              {row.sponsor_name && (
                <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                  <Building2 className="w-2.5 h-2.5" />
                  {row.sponsor_name}
                </p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'target',
      label: 'Target',
      render: (row) => (
        <span className="text-xs text-zinc-300 font-medium">{getTargetLabel(row)}</span>
      ),
    },
    {
      key: 'reward_drops',
      label: 'Reward',
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#00E5FF]">
          <Droplet className="w-3.5 h-3.5" />
          {row.reward_drops?.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'dates',
      label: 'Period',
      render: (row) => (
        <div className="text-xs text-zinc-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-600" />
            {formatDate(row.start_date)} – {row.end_date ? formatDate(row.end_date) : '∞'}
          </span>
        </div>
      ),
    },
    {
      key: 'is_active',
      label: 'Active',
      render: (row) => {
        const isToggling = togglingIds.has(row.id);
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStatus(row.id, row.is_active);
            }}
            disabled={isToggling}
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
              row.is_active
                ? 'text-[#00E5FF] hover:bg-[#00E5FF]/10'
                : 'text-zinc-600 hover:bg-zinc-800'
            }`}
            title={row.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
          >
            <Power className="w-4 h-4" />
          </button>
        );
      },
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (row) => (
        <span className="text-zinc-500 text-xs">
          {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      ),
    },
  ];
}

const FILTERS: FilterDef[] = [
  {
    key: 'active',
    label: 'Status',
    options: [
      { value: 'all', label: 'All' },
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Ended' },
    ],
  },
];

// ─── Main Component ───────────────────────────────────────────────

export function ChallengesList({ gymId }: ChallengesListProps) {
  const router = useRouter();

  // List state
  const [data, setData] = useState<PaginatedResult<ChallengeRow>>({
    items: [], total: 0, page: 1, limit: 25, totalPages: 1,
  });
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState<DataTableQuery>({
    page: 1, limit: 25, sortBy: 'created_at', sortDir: 'desc',
  });

  // Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [monitorData, setMonitorData] = useState<any>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);

  // Action state
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  // Form state
  const [uploadingBadge, setUploadingBadge] = useState(false);
  const [badgePreview, setBadgePreview] = useState<string | null>(null);
  const [showBadgeStudio, setShowBadgeStudio] = useState(false);
  const [showDateRange, setShowDateRange] = useState(false);
  const [tiers, setTiers] = useState<TierInput[]>([
    { label: 'Bronze', target: 100, drops: 25 },
    { label: 'Silver', target: 250, drops: 75 },
    { label: 'Gold', target: 500, drops: 200 },
  ]);
  const [enableTiers, setEnableTiers] = useState(false);
  const [sponsorLogoPreview, setSponsorLogoPreview] = useState<string | null>(null);
  const [uploadingSponsorLogo, setUploadingSponsorLogo] = useState(false);

  const {
    register, handleSubmit, reset, watch,
    formState: { errors, isSubmitting },
  } = useForm<ChallengeFormData>({
    resolver: zodResolver(challengeSchema),
    defaultValues: {
      challengeType: 'daily', rewardDrops: 0, targetDrops: 100,
      streakDays: 3, milestoneThreshold: 1000, badgeImageUrl: '',
      scoringModel: 'total_drops', sponsorName: '', sponsorLogo: '', prizeDescription: '',
    },
  });

  const watchedType = watch('challengeType');
  const isStreak = watchedType === 'streak' || watchedType === 'checkin_streak';
  const isMilestone = watchedType === 'milestone';
  const isDropsBased = watchedType === 'daily' || watchedType === 'weekly' || watchedType === 'monthly';
  const isCheckinCount = watchedType === 'checkin_count';

  // ─── Fetching ─────────────────────────────────────────────────

  const fetchData = useCallback((q: DataTableQuery) => {
    startTransition(async () => {
      const activeVal = q.filters?.active;
      const result = await listChallenges(gymId, {
        q: q.q, page: q.page, limit: q.limit,
        sortBy: q.sortBy, sortDir: q.sortDir,
        filters: {
          active: activeVal === 'true' ? true : activeVal === 'false' ? false : 'all',
        },
      });
      if (result.success) setData(result.data);
    });
  }, [gymId]);

  useEffect(() => { fetchData(query); }, [query, fetchData]);

  const handleQueryChange = useCallback((update: DataTableQuery) => {
    setQuery((prev) => {
      const next = { ...prev, ...update };
      if (update.filters) next.filters = { ...prev.filters, ...update.filters };
      return next;
    });
  }, []);

  const refetchList = useCallback(() => fetchData(query), [query, fetchData]);

  // ─── Toggle status ────────────────────────────────────────────

  const handleToggleStatus = useCallback(async (challengeId: string, currentActive: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(challengeId));
    setData((prev) => ({
      ...prev,
      items: prev.items.map((c) =>
        c.id === challengeId ? { ...c, is_active: !currentActive } : c
      ),
    }));

    try {
      const result = await toggleChallengeStatus(challengeId, gymId, !currentActive);
      if (result.success) {
        toast.success(`Challenge ${!currentActive ? 'activated' : 'deactivated'}`);
      } else {
        setData((prev) => ({
          ...prev,
          items: prev.items.map((c) =>
            c.id === challengeId ? { ...c, is_active: currentActive } : c
          ),
        }));
        toast.error(result.error || 'Failed to update status');
      }
    } catch {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((c) =>
          c.id === challengeId ? { ...c, is_active: currentActive } : c
        ),
      }));
      toast.error('Failed to update status');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(challengeId);
        return next;
      });
    }
  }, [gymId]);

  // ─── Delete ───────────────────────────────────────────────────

  const handleDelete = useCallback(async (challengeId: string) => {
    if (!(await confirmAction({ title: 'Delete Challenge', message: 'This cannot be undone. Delete this challenge?', confirmLabel: 'Delete', variant: 'danger' }))) return;
    setDeletingId(challengeId);
    try {
      const result = await deleteChallenge(challengeId, gymId);
      if (result.success) {
        toast.success('Challenge deleted');
        refetchList();
      } else {
        toast.error(result.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete challenge');
    } finally {
      setDeletingId(null);
    }
  }, [gymId, refetchList]);

  // ─── Open edit ────────────────────────────────────────────────

  const openEdit = useCallback((row: ChallengeRow) => {
    const ch: Challenge = {
      id: row.id, name: row.name, description: row.description,
      reward_drops: row.reward_drops, challenge_type: row.challenge_type,
      is_active: row.is_active, start_date: row.start_date,
      end_date: row.end_date, target_drops: row.target_drops,
      milestone_threshold: null, streak_days: row.streak_days,
      badge_image_url: row.badge_image_url,
      scoring_model: row.scoring_model, sponsor_name: row.sponsor_name,
    };
    setEditingChallenge(ch);
    const challengeType = ch.challenge_type as ChallengeFormData['challengeType'];
    setShowDateRange(!!ch.start_date || !!ch.end_date);
    reset({
      name: ch.name, description: ch.description || undefined,
      challengeType,
      targetDrops: ch.target_drops || undefined,
      milestoneThreshold: ch.milestone_threshold || undefined,
      streakDays: ch.streak_days || undefined,
      rewardDrops: ch.reward_drops,
      badgeImageUrl: ch.badge_image_url || '',
      startDate: ch.start_date || undefined,
      endDate: ch.end_date || undefined,
      scoringModel: (ch.scoring_model as ChallengeFormData['scoringModel']) || 'total_drops',
      sponsorName: ch.sponsor_name || '',
      sponsorLogo: '',
      prizeDescription: '',
    });
    setBadgePreview(ch.badge_image_url || null);
    setSponsorLogoPreview(null);
    setEnableTiers(false);
    setTiers([
      { label: 'Bronze', target: 100, drops: 25 },
      { label: 'Silver', target: 250, drops: 75 },
      { label: 'Gold', target: 500, drops: 200 },
    ]);
    setIsFormOpen(true);
  }, [reset]);

  // ─── Open create ──────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditingChallenge(null);
    setShowDateRange(false);
    setBadgePreview(null);
    setSponsorLogoPreview(null);
    setEnableTiers(false);
    setTiers([
      { label: 'Bronze', target: 100, drops: 25 },
      { label: 'Silver', target: 250, drops: 75 },
      { label: 'Gold', target: 500, drops: 200 },
    ]);
    reset({
      challengeType: 'daily', rewardDrops: 0, targetDrops: 100,
      streakDays: 3, milestoneThreshold: 1000, badgeImageUrl: '',
      scoringModel: 'total_drops', sponsorName: '', sponsorLogo: '', prizeDescription: '',
    });
    setIsFormOpen(true);
  }, [reset]);

  // ─── Submit form ──────────────────────────────────────────────

  const onSubmit = async (formData: ChallengeFormData) => {
    try {
      const autoScoringModel: Record<string, string> = {
        streak: 'streak_days', checkin_streak: 'streak_days', checkin_count: 'days_visited',
      };
      const submitData: any = {
        ...formData, gymId,
        scoringModel: autoScoringModel[formData.challengeType] || formData.scoringModel || 'total_drops',
        tiers: enableTiers ? tiers : undefined,
      };

      const result = editingChallenge
        ? await updateChallenge(editingChallenge.id, submitData) as { success: boolean; data?: Challenge; error?: string }
        : await createChallenge(submitData) as { success: boolean; data?: Challenge; error?: string };

      if (result.success) {
        toast.success(editingChallenge ? 'Challenge updated' : 'Challenge created');
        setIsFormOpen(false);
        setEditingChallenge(null);
        refetchList();
      } else {
        toast.error(result.error || 'Operation failed');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // ─── Monitor / Progress ───────────────────────────────────────

  const openMonitor = useCallback(async (challengeId: string) => {
    setMonitorId(challengeId);
    setMonitorLoading(true);
    setMonitorData(null);
    try {
      const result = await getChallengeDetailedProgress(challengeId, gymId);
      if (result.success && result.data) {
        setMonitorData(result.data);
      } else {
        toast.error(result.error || 'Failed to load progress');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setMonitorLoading(false);
    }
  }, [gymId]);

  const handleCloseChallenge = useCallback(async (challengeId: string) => {
    if (!(await confirmAction({ title: 'End Challenge', message: 'End this challenge early? It will be deactivated immediately.', confirmLabel: 'End Now', variant: 'warning' }))) return;
    setClosingId(challengeId);
    try {
      const result = await closeChallenge(challengeId, gymId);
      if (result.success) {
        toast.success('Challenge ended');
        setMonitorId(null);
        refetchList();
      } else {
        toast.error(result.error || 'Failed to close challenge');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setClosingId(null);
    }
  }, [gymId, refetchList]);

  // ─── Dropzones ────────────────────────────────────────────────

  const badgeDropzone = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      setUploadingBadge(true);
      try {
        const result = await uploadFile(acceptedFiles[0], 'gym-challenge-badges', gymId);
        reset({ ...watch(), badgeImageUrl: result.url });
        setBadgePreview(result.url);
        toast.success('Badge uploaded');
      } catch (error: any) {
        toast.error(`Upload failed: ${error.message}`);
      } finally {
        setUploadingBadge(false);
      }
    },
  });

  const sponsorDropzone = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.svg'] },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      setUploadingSponsorLogo(true);
      try {
        const result = await uploadFile(acceptedFiles[0], 'images', gymId);
        reset({ ...watch(), sponsorLogo: result.url });
        setSponsorLogoPreview(result.url);
        toast.success('Sponsor logo uploaded');
      } catch (error: any) {
        toast.error(`Upload failed: ${error.message}`);
      } finally {
        setUploadingSponsorLogo(false);
      }
    },
  });

  // ─── Build columns ────────────────────────────────────────────

  const columns = buildColumns(handleToggleStatus, togglingIds);

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div>
      {/* Header + Create */}
      <div className="flex items-center justify-between mb-5">
        <div />
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#00E5FF] text-black rounded-xl text-sm font-semibold hover:bg-[#00E5FF]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Challenge
        </button>
      </div>

      {/* Data Table */}
      <DataTable<ChallengeRow>
        data={data.items}
        columns={columns}
        total={data.total}
        page={data.page}
        limit={data.limit}
        totalPages={data.totalPages}
        loading={loading}
        searchPlaceholder="Search challenges…"
        filters={FILTERS}
        filterValues={query.filters}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        emptyIcon={<Target className="w-10 h-10" />}
        emptyTitle="No challenges yet"
        emptyDescription="Create a challenge to motivate your members."
        emptyCTA={
          <button onClick={openCreate} className="mt-2 px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-sm font-medium">
            + Create Challenge
          </button>
        }
        onQueryChange={handleQueryChange}
        onRowClick={(row) => openEdit(row)}
        rowKey={(r) => r.id}
        cardRows
        renderExpandedRow={(row) => (
          <ChallengeExpandedRow
            row={row}
            gymId={gymId}
            onEdit={() => openEdit(row)}
            onDelete={() => handleDelete(row.id)}
            onMonitor={() => openMonitor(row.id)}
            deletingId={deletingId}
          />
        )}
      />

      {/* ─── Create/Edit Modal ─────────────────────────────────── */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-[#0A0A0A] border-b border-[#1A1A1A] px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingChallenge ? 'Edit Challenge' : 'Create Challenge'}
              </h2>
              <button
                onClick={() => { setIsFormOpen(false); setEditingChallenge(null); }}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Title *</label>
                <input
                  {...register('name')}
                  className="w-full px-4 py-2.5 bg-[#111] border border-zinc-800 rounded-xl text-white text-sm placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none transition-colors"
                  placeholder="E.g., Daily 100 Drops Challenge"
                />
                {errors.name && <p className="mt-1 text-xs text-rose-400">{errors.name.message}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  {...register('description')}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-[#111] border border-zinc-800 rounded-xl text-white text-sm placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none resize-none transition-colors"
                  placeholder="Optional description"
                />
              </div>

              {/* Challenge Type */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Type *</label>
                <select
                  {...register('challengeType')}
                  className="w-full px-4 py-2.5 bg-[#111] border border-zinc-800 rounded-xl text-white text-sm focus:border-[#00E5FF] focus:outline-none transition-colors"
                >
                  <option value="daily">Daily (Resets every 24h)</option>
                  <option value="weekly">Weekly (Resets every Monday)</option>
                  <option value="monthly">Monthly (Resets every month)</option>
                  <option value="streak">Streak (Consecutive days)</option>
                  <option value="milestone">Milestone (All-time)</option>
                  <option value="checkin_streak">Check-in Streak</option>
                  <option value="checkin_count">Check-in Count</option>
                </select>
                {LIFECYCLE_INFO[watchedType] && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
                    <Info className="w-3.5 h-3.5 text-[#00E5FF] mt-0.5 shrink-0" />
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      <span className="mr-1">{LIFECYCLE_INFO[watchedType].icon}</span>
                      {LIFECYCLE_INFO[watchedType].text}
                    </p>
                  </div>
                )}
              </div>

              {/* Conditional target fields */}
              {(isDropsBased || isCheckinCount) && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
                    {isCheckinCount ? 'Number of Check-ins *' : 'Target Drops *'}
                  </label>
                  <input
                    type="number"
                    {...register('targetDrops', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-2.5 bg-[#111] border border-zinc-800 rounded-xl text-white text-sm focus:border-[#00E5FF] focus:outline-none transition-colors"
                    placeholder={isCheckinCount ? '10' : '100'}
                  />
                  {errors.targetDrops && <p className="mt-1 text-xs text-rose-400">{errors.targetDrops.message}</p>}
                </div>
              )}

              {isStreak && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
                    {watchedType === 'checkin_streak' ? 'Consecutive Visit Days *' : 'Streak Days *'}
                  </label>
                  <input
                    type="number"
                    {...register('streakDays', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-2.5 bg-[#111] border border-zinc-800 rounded-xl text-white text-sm focus:border-[#00E5FF] focus:outline-none transition-colors"
                    placeholder="3"
                  />
                  {errors.streakDays && <p className="mt-1 text-xs text-rose-400">{errors.streakDays.message}</p>}
                </div>
              )}

              {isMilestone && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Milestone Threshold *</label>
                  <input
                    type="number"
                    {...register('milestoneThreshold', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-2.5 bg-[#111] border border-zinc-800 rounded-xl text-white text-sm focus:border-[#00E5FF] focus:outline-none transition-colors"
                    placeholder="1000"
                  />
                  {errors.milestoneThreshold && <p className="mt-1 text-xs text-rose-400">{errors.milestoneThreshold.message}</p>}
                </div>
              )}

              {/* Custom Date Range */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDateRange(!showDateRange)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Custom date range
                  </span>
                  <span className="text-[10px]">{showDateRange ? '▲' : '▼'}</span>
                </button>
                {showDateRange && (
                  <div className="px-4 pb-3 pt-1 space-y-3 border-t border-zinc-800">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-zinc-500 mb-1">Start Date</label>
                        <input type="date" {...register('startDate')} style={{ colorScheme: 'dark' }}
                          className="w-full px-3 py-2 bg-[#111] border border-zinc-800 rounded-lg text-white text-xs focus:border-[#00E5FF] focus:outline-none" />
                        <p className="mt-0.5 text-[10px] text-zinc-600">Default: today</p>
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-500 mb-1">
                          {isMilestone ? <span className="flex items-center gap-1">End Date <Infinity className="w-2.5 h-2.5 text-zinc-600" /></span> : 'End Date'}
                        </label>
                        <input type="date" {...register('endDate')} disabled={isMilestone} style={{ colorScheme: 'dark' }}
                          className="w-full px-3 py-2 bg-[#111] border border-zinc-800 rounded-lg text-white text-xs focus:border-[#00E5FF] focus:outline-none disabled:opacity-40" />
                        <p className="mt-0.5 text-[10px] text-zinc-600">{DEFAULT_DATE_HINT[watchedType] || 'Auto-calculated'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Reward */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Reward Drops *</label>
                <input
                  type="number"
                  {...register('rewardDrops', { valueAsNumber: true })}
                  min={0}
                  className="w-full px-4 py-2.5 bg-[#111] border border-zinc-800 rounded-xl text-white text-sm focus:border-[#00E5FF] focus:outline-none transition-colors"
                  placeholder="100"
                />
                {errors.rewardDrops && <p className="mt-1 text-xs text-rose-400">{errors.rewardDrops.message}</p>}
              </div>

              {/* Scoring */}
              {(isDropsBased || isMilestone) && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Progress Metric</label>
                  <select
                    {...register('scoringModel')}
                    className="w-full px-4 py-2.5 bg-[#111] border border-zinc-800 rounded-xl text-white text-sm focus:border-[#00E5FF] focus:outline-none transition-colors"
                  >
                    <option value="total_drops">Total Drops</option>
                    <option value="distance_km">Distance (km)</option>
                    <option value="days_visited">Days Visited</option>
                  </select>
                </div>
              )}

              {/* Tiers */}
              <div className="border-t border-zinc-800 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Tiers (Optional)</label>
                  <button type="button" onClick={() => setEnableTiers(!enableTiers)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${enableTiers ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}
                  >
                    {enableTiers ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                {enableTiers && (
                  <div className="space-y-2">
                    {tiers.map((tier, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-[#111] rounded-lg p-2.5">
                        <input type="text" value={tier.label}
                          onChange={(e) => { const n = [...tiers]; n[idx].label = e.target.value; setTiers(n); }}
                          className="flex-1 px-2.5 py-1.5 bg-[#0A0A0A] border border-zinc-800 rounded-lg text-white text-xs focus:border-[#00E5FF] focus:outline-none"
                          placeholder="Tier name" />
                        <input type="number" value={tier.target} min={1}
                          onChange={(e) => { const n = [...tiers]; n[idx].target = parseInt(e.target.value) || 0; setTiers(n); }}
                          className="w-16 px-2 py-1.5 bg-[#0A0A0A] border border-zinc-800 rounded-lg text-white text-xs text-center focus:border-[#00E5FF] focus:outline-none" />
                        <span className="text-[10px] text-zinc-600">target</span>
                        <input type="number" value={tier.drops} min={0}
                          onChange={(e) => { const n = [...tiers]; n[idx].drops = parseInt(e.target.value) || 0; setTiers(n); }}
                          className="w-16 px-2 py-1.5 bg-[#0A0A0A] border border-zinc-800 rounded-lg text-white text-xs text-center focus:border-[#00E5FF] focus:outline-none" />
                        <Droplet className="w-3 h-3 text-[#00E5FF]" />
                        {tiers.length > 1 && (
                          <button type="button" onClick={() => setTiers(tiers.filter((_, i) => i !== idx))}
                            className="p-1 text-zinc-600 hover:text-rose-400 transition-colors">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button"
                      onClick={() => setTiers([...tiers, { label: `Tier ${tiers.length + 1}`, target: 0, drops: 0 }])}
                      className="flex items-center gap-1 text-[11px] text-[#00E5FF] hover:underline">
                      <Plus className="w-3 h-3" /> Add Tier
                    </button>
                  </div>
                )}
              </div>

              {/* Prize */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Prize Description</label>
                <textarea {...register('prizeDescription')} rows={2}
                  className="w-full px-4 py-2.5 bg-[#111] border border-zinc-800 rounded-xl text-white text-sm placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none resize-none transition-colors"
                  placeholder="E.g., Gold tier winners get a free 3-month membership" />
              </div>

              {/* Sponsor */}
              <div className="border-t border-zinc-800 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Sponsor (Optional)</label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-1">Name</label>
                    <input {...register('sponsorName')}
                      className="w-full px-3 py-2 bg-[#111] border border-zinc-800 rounded-lg text-white text-xs focus:border-[#00E5FF] focus:outline-none"
                      placeholder="Nike" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-1">Logo</label>
                    <div {...sponsorDropzone.getRootProps()}
                      className={`border-2 border-dashed rounded-lg p-2.5 text-center cursor-pointer transition-colors ${sponsorDropzone.isDragActive ? 'border-[#00E5FF] bg-[#00E5FF]/5' : 'border-zinc-800 hover:border-zinc-700'}`}>
                      <input {...sponsorDropzone.getInputProps()} />
                      {sponsorLogoPreview ? <img src={sponsorLogoPreview} alt="" className="h-6 mx-auto object-contain" />
                        : uploadingSponsorLogo ? <p className="text-[10px] text-[#00E5FF]">Uploading...</p>
                          : <p className="text-[10px] text-zinc-600">Drop logo</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Badge Image */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Badge Image</label>
                  <button
                    type="button"
                    onClick={() => setShowBadgeStudio(true)}
                    className="flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-medium rounded-lg hover:bg-zinc-700 hover:text-white transition-colors"
                  >
                    <Palette className="w-3 h-3 text-[#00E5FF]" />
                    Generate Badge
                  </button>
                </div>
                <div {...badgeDropzone.getRootProps()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${badgeDropzone.isDragActive ? 'border-[#00E5FF] bg-[#00E5FF]/5' : 'border-zinc-800 bg-[#111] hover:border-zinc-700'} ${uploadingBadge ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input {...badgeDropzone.getInputProps()} />
                  {badgePreview ? (
                    <div className="space-y-2">
                      <div className="relative inline-block">
                        <img src={badgePreview} alt="Badge" className="w-24 h-24 object-contain mx-auto rounded-lg" />
                        <button type="button" onClick={(e) => { e.stopPropagation(); setBadgePreview(null); reset({ ...watch(), badgeImageUrl: '' }); }}
                          className="absolute -top-1 -right-1 p-0.5 bg-rose-500 text-white rounded-full">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[10px] text-zinc-600">Click to replace</p>
                    </div>
                  ) : uploadingBadge ? (
                    <div><Upload className="w-6 h-6 text-[#00E5FF] mx-auto animate-pulse" /><p className="text-xs text-zinc-500 mt-1">Uploading...</p></div>
                  ) : (
                    <div><Image className="w-6 h-6 text-zinc-600 mx-auto" /><p className="text-xs text-zinc-400 mt-1">Drag & drop or click</p><p className="text-[10px] text-zinc-600">PNG, JPG, WEBP</p></div>
                  )}
                </div>
                <div className="mt-2">
                  <input type="url" {...register('badgeImageUrl')}
                    className="w-full px-3 py-1.5 bg-[#111] border border-zinc-800 rounded-lg text-white text-xs placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none"
                    placeholder="Or enter URL manually"
                    onChange={(e) => setBadgePreview(e.target.value || null)} />
                </div>
              </div>

              {/* Badge Studio quick-generate modal */}
              {showBadgeStudio && (
                <BadgeStudioModal
                  gymId={gymId}
                  onComplete={(url) => {
                    reset({ ...watch(), badgeImageUrl: url });
                    setBadgePreview(url);
                    setShowBadgeStudio(false);
                  }}
                  onClose={() => setShowBadgeStudio(false)}
                />
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-[#00E5FF] text-black rounded-xl text-sm font-semibold hover:bg-[#00E5FF]/90 transition-colors disabled:opacity-50">
                  {isSubmitting ? (editingChallenge ? 'Saving…' : 'Creating…') : (editingChallenge ? 'Save Changes' : 'Create Challenge')}
                </button>
                <button type="button" onClick={() => { setIsFormOpen(false); setEditingChallenge(null); }}
                  className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-xl text-sm font-medium hover:bg-zinc-800 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Progress Monitor Modal ────────────────────────────── */}
      {monitorId && (
        <ProgressMonitorModal
          monitorId={monitorId}
          monitorData={monitorData}
          monitorLoading={monitorLoading}
          closingId={closingId}
          gymId={gymId}
          challengeActive={data.items.find((c) => c.id === monitorId)?.is_active ?? false}
          onClose={() => { setMonitorId(null); setMonitorData(null); }}
          onCloseChallenge={handleCloseChallenge}
        />
      )}
    </div>
  );
}

// ─── Expanded Row Component ─────────────────────────────────────

function ChallengeExpandedRow({
  row, gymId, onEdit, onDelete, onMonitor, deletingId,
}: {
  row: ChallengeRow; gymId: string;
  onEdit: () => void; onDelete: () => void; onMonitor: () => void;
  deletingId: string | null;
}) {
  const [stats, setStats] = useState<{ total_users: number; completed_users: number; completion_percentage: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    getChallengeCompletionStats(row.id, gymId).then((res) => {
      if (!cancelled && res.success && res.data) {
        setStats(res.data as any);
      }
    }).finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [row.id, gymId]);

  return (
    <div className="px-4 py-4 bg-zinc-950/50 border-t border-zinc-800/50">
      <div className="flex flex-wrap items-start gap-6">
        {/* Description */}
        {row.description && (
          <div className="flex-1 min-w-[200px]">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1">Description</p>
            <p className="text-xs text-zinc-400 leading-relaxed">{row.description}</p>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4">
          {statsLoading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <div className="w-3 h-3 border border-zinc-600 border-t-transparent rounded-full animate-spin" />
              Loading stats…
            </div>
          ) : stats ? (
            <>
              <div className="text-center">
                <p className="text-lg font-bold text-white">{stats.total_users}</p>
                <p className="text-[10px] text-zinc-600 uppercase">Joined</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-400">{stats.completed_users}</p>
                <p className="text-[10px] text-zinc-600 uppercase">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-[#00E5FF]">{stats.completion_percentage}%</p>
                <p className="text-[10px] text-zinc-600 uppercase">Rate</p>
              </div>
            </>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={(e) => { e.stopPropagation(); onMonitor(); }}
            className="p-2 rounded-lg text-zinc-500 hover:text-[#00E5FF] hover:bg-zinc-800 transition-colors"
            title="View Progress">
            <BarChart3 className="w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-2 rounded-lg text-zinc-500 hover:text-[#00E5FF] hover:bg-zinc-800 transition-colors"
            title="Edit">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={deletingId === row.id}
            className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Progress Monitor Modal ─────────────────────────────────────

function ProgressMonitorModal({
  monitorId, monitorData, monitorLoading, closingId, gymId, challengeActive,
  onClose, onCloseChallenge,
}: {
  monitorId: string;
  monitorData: any;
  monitorLoading: boolean;
  closingId: string | null;
  gymId: string;
  challengeActive: boolean;
  onClose: () => void;
  onCloseChallenge: (id: string) => void;
}) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#0A0A0A] border-b border-[#1A1A1A] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#00E5FF]" />
            Challenge Progress
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {monitorLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-zinc-900 rounded-xl animate-pulse" />)}
              </div>
              <div className="h-40 bg-zinc-900 rounded-xl animate-pulse" />
            </div>
          ) : monitorData ? (
            <div className="space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#111] border border-zinc-800 rounded-xl p-4 text-center">
                  <Users className="w-4 h-4 text-zinc-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-white">{monitorData.totalParticipants}</p>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Participants</p>
                </div>
                <div className="bg-[#111] border border-zinc-800 rounded-xl p-4 text-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-emerald-400">{monitorData.completedCount}</p>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Completed</p>
                </div>
                <div className="bg-[#111] border border-zinc-800 rounded-xl p-4 text-center">
                  <BarChart3 className="w-4 h-4 text-[#00E5FF] mx-auto mb-1" />
                  <p className="text-2xl font-bold text-[#00E5FF]">{monitorData.avgProgress}%</p>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Avg Progress</p>
                </div>
              </div>

              {/* Completion bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-zinc-500">Overall Completion</p>
                  <p className="text-xs text-white font-medium">{monitorData.completionPercentage}%</p>
                </div>
                <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#00E5FF] to-[#00B8CC] rounded-full transition-all duration-500"
                    style={{ width: `${monitorData.completionPercentage}%` }} />
                </div>
              </div>

              {/* Participants */}
              <div>
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Participants</h3>
                {monitorData.participants.length === 0 ? (
                  <div className="bg-[#111] border border-zinc-800 rounded-xl p-6 text-center">
                    <Users className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
                    <p className="text-xs text-zinc-600">No participants yet</p>
                  </div>
                ) : (
                  <div className="bg-[#111] border border-zinc-800 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left px-4 py-2.5 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Member</th>
                          <th className="text-left px-4 py-2.5 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Progress</th>
                          <th className="text-left px-4 py-2.5 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {monitorData.participants.map((p: any) => {
                          const pct = monitorData.target > 0
                            ? Math.min(Math.round((p.current_value / monitorData.target) * 100), 100) : 0;
                          return (
                            <tr key={p.user_id}
                              onClick={() => router.push(`/dashboard/gym/${gymId}/members/${p.user_id}`)}
                              className="hover:bg-zinc-900/50 transition-colors cursor-pointer">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <MemberAvatar avatarUrl={p.avatar_url as string | null | undefined} username={p.username} size="sm" />
                                  <span className="text-xs text-white">{p.username}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden min-w-[60px]">
                                    <div className={`h-full rounded-full transition-all ${p.is_completed ? 'bg-emerald-400' : 'bg-[#00E5FF]'}`}
                                      style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[10px] text-zinc-500 w-12 text-right tabular-nums">
                                    {p.current_value}/{monitorData.target}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                {p.is_completed ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Done
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-zinc-500 tabular-nums">{pct}%</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Close challenge */}
              {challengeActive && (
                <div className="pt-3 border-t border-zinc-800">
                  <button
                    onClick={() => onCloseChallenge(monitorId)}
                    disabled={closingId === monitorId}
                    className="flex items-center gap-2 px-3.5 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-medium hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {closingId === monitorId ? 'Ending…' : 'End Challenge Early'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-xs text-zinc-600">Failed to load progress data</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
