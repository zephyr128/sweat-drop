'use client';

import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  createAchievement,
  updateAchievement,
  deleteAchievement,
  toggleAchievementStatus,
} from '@/lib/actions/achievement-actions';
import {
  X,
  Trash2,
  Power,
  Droplet,
  Upload,
  Image,
  Trophy,
  Pencil,
  Plus,
  Award,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '@/lib/utils/storage';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
type Category = 'sessions' | 'total_drops' | 'streak' | 'multi_gym' | 'distance' | 'special';

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string | null;
  badge_image_url: string;
  criteria: {
    type: string;
    operator: string;
    value: number;
    scope?: string;
    machine_type?: string;
    date_range?: { start?: string; end?: string };
  };
  reward_drops: number;
  is_active: boolean;
  display_order: number;
  tier: Tier | null;
  category: Category | null;
  created_at: string;
  updated_at: string;
}

interface AchievementsManagerProps {
  initialAchievements: Achievement[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
const CATEGORY_ORDER: (Category | '__none__')[] = [
  'sessions', 'total_drops', 'streak', 'multi_gym', 'distance', 'special', '__none__',
];

const TIER_COLORS: Record<Tier, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
  diamond: '#B9F2FF',
};

const TIER_BG: Record<Tier, string> = {
  bronze: 'rgba(205,127,50,0.15)',
  silver: 'rgba(192,192,192,0.15)',
  gold: 'rgba(255,215,0,0.15)',
  platinum: 'rgba(229,228,226,0.15)',
  diamond: 'rgba(185,242,255,0.15)',
};

const CATEGORY_LABELS: Record<Category | '__none__', string> = {
  sessions: 'Workouts',
  total_drops: 'Total Drops',
  streak: 'Streak',
  multi_gym: 'Explorer',
  distance: 'Distance',
  special: 'Special',
  __none__: 'Uncategorized',
};

const CATEGORY_TO_CRITERIA: Record<Category, string> = {
  sessions: 'session_count',
  total_drops: 'total_drops',
  streak: 'streak_days',
  multi_gym: 'gym_count',
  distance: 'distance_km',
  special: 'total_drops',
};

const criteriaTypeLabels: Record<string, string> = {
  total_drops: 'Total Drops Earned',
  streak_days: 'Consecutive Day Streak',
  session_count: 'Number of Sessions',
  gym_count: 'Gyms Visited',
  distance_km: 'Distance (km)',
};

const operatorLabels: Record<string, string> = {
  '>=': '≥  Greater or equal',
  '<=': '≤  Less or equal',
  '==': '=  Equal to',
  '>': '>  Greater than',
  '<': '<  Less than',
};

const scopeLabels: Record<string, string> = {
  global: 'Global (all gyms)',
  gym: 'Specific Gym',
  machine_type: 'Machine Type',
};

function criteriaHumanLabel(c: Achievement['criteria']): string {
  const typeLabel = criteriaTypeLabels[c.type] || c.type;
  return `${typeLabel} ${c.operator} ${c.value.toLocaleString()}`;
}

// ─── Zod Schema ──────────────────────────────────────────────────────────────

const criteriaSchema = z.object({
  type: z.enum(['total_drops', 'streak_days', 'session_count', 'gym_count', 'distance_km']),
  operator: z.enum(['>=', '<=', '==', '>', '<']),
  value: z.number().min(0, 'Value must be 0 or higher'),
  scope: z.enum(['global', 'gym', 'machine_type']).default('global'),
  machine_type: z.string().optional(),
});

const achievementFormSchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers & underscores only'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  badgeImageUrl: z.string().min(1, 'Badge image is required'),
  criteria: criteriaSchema,
  rewardDrops: z.number().int().min(0),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond']).nullable().optional(),
  category: z
    .enum(['sessions', 'total_drops', 'streak', 'multi_gym', 'distance', 'special'])
    .nullable()
    .optional(),
});

type AchievementFormData = z.infer<typeof achievementFormSchema>;

// ─── Sub-components ──────────────────────────────────────────────────────────

function TierChip({ tier }: { tier: Tier | null }) {
  if (!tier) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ color: TIER_COLORS[tier], backgroundColor: TIER_BG[tier] }}
    >
      {tier}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
        active ? 'bg-[#00E5FF]/10 text-[#00E5FF]' : 'bg-zinc-800 text-zinc-500'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AchievementsManager({ initialAchievements }: AchievementsManagerProps) {
  const [achievements, setAchievements] = useState<Achievement[]>(initialAchievements);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<Achievement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingBadge, setUploadingBadge] = useState(false);
  const [badgePreview, setBadgePreview] = useState<string | null>(null);

  // ── Filter state ──
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);

  // ── Collapsible group state ──
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Filtered + grouped list ──
  const filteredAchievements = achievements.filter((a) => {
    if (!showInactive && !a.is_active) return false;
    if (filterCategory !== 'all') {
      if (filterCategory === '__none__' ? a.category !== null : a.category !== filterCategory)
        return false;
    }
    if (filterTier !== 'all' && a.tier !== filterTier) return false;
    return true;
  });

  const grouped = CATEGORY_ORDER.reduce<Record<string, Achievement[]>>((acc, cat) => {
    const items = filteredAchievements
      .filter((a) => (cat === '__none__' ? a.category === null : a.category === cat))
      .sort((a, b) => a.display_order - b.display_order);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const totalActive = achievements.filter((a) => a.is_active).length;
  const totalAll = achievements.length;

  // ── Form ──
  const defaultValues: AchievementFormData = {
    code: '',
    name: '',
    description: '',
    badgeImageUrl: '',
    criteria: { type: 'total_drops', operator: '>=', value: 1000, scope: 'global' },
    rewardDrops: 0,
    isActive: true,
    displayOrder: 0,
    tier: null,
    category: null,
  };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AchievementFormData>({
    resolver: zodResolver(achievementFormSchema),
    defaultValues,
  });

  const watchedCriteriaType = watch('criteria.type');
  const watchedScope = watch('criteria.scope');
  const watchedOperator = watch('criteria.operator');
  const watchedCategory = watch('category');
  const watchedTier = watch('tier');

  // Auto-suggest criteria.type when category changes
  useEffect(() => {
    if (watchedCategory && watchedCategory in CATEGORY_TO_CRITERIA) {
      setValue('criteria.type', CATEGORY_TO_CRITERIA[watchedCategory as Category] as any);
    }
  }, [watchedCategory, setValue]);

  // ── Badge upload ──
  const onBadgeDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      setUploadingBadge(true);
      try {
        const file = acceptedFiles[0];
        const result = await uploadFile(file, 'global-achievement-badges', 'badges');
        setValue('badgeImageUrl', result.url, { shouldValidate: true });
        setBadgePreview(result.url);
        toast.success('Badge image uploaded');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        if (msg.includes('Bucket') && msg.includes('does not exist')) {
          toast.error(
            'Bucket "global-achievement-badges" not found. Create it in Supabase Dashboard → Storage.'
          );
        } else {
          toast.error(`Upload failed: ${msg}`);
        }
      } finally {
        setUploadingBadge(false);
      }
    },
    [setValue]
  );

  const badgeDropzone = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    onDrop: onBadgeDrop,
  });

  // ── Modal helpers ──
  const openCreateModal = () => {
    setEditingAchievement(null);
    reset(defaultValues);
    setBadgePreview(null);
    setIsModalOpen(true);
  };

  const openEditModal = (a: Achievement) => {
    setEditingAchievement(a);
    reset({
      code: a.code,
      name: a.name,
      description: a.description || '',
      badgeImageUrl: a.badge_image_url,
      criteria: {
        type: a.criteria.type as AchievementFormData['criteria']['type'],
        operator: a.criteria.operator as AchievementFormData['criteria']['operator'],
        value: a.criteria.value,
        scope: (a.criteria.scope as AchievementFormData['criteria']['scope']) || 'global',
        machine_type: a.criteria.machine_type || undefined,
      },
      rewardDrops: a.reward_drops,
      isActive: a.is_active,
      displayOrder: a.display_order,
      tier: a.tier ?? null,
      category: a.category ?? null,
    });
    setBadgePreview(a.badge_image_url);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAchievement(null);
    reset(defaultValues);
    setBadgePreview(null);
  };

  // ── Submit ──
  const onSubmit = async (data: AchievementFormData) => {
    try {
      if (editingAchievement) {
        const result = await updateAchievement({ id: editingAchievement.id, ...data }) as any;
        if (result.success && result.data) {
          setAchievements((prev) =>
            prev.map((a) => (a.id === editingAchievement.id ? (result.data as Achievement) : a))
          );
          toast.success('Achievement updated');
          closeModal();
        } else {
          toast.error(`Failed to update: ${result.error}`);
        }
      } else {
        const result = await createAchievement(data) as any;
        if (result.success && result.data) {
          setAchievements((prev) => [...prev, result.data as Achievement]);
          toast.success('Achievement created');
          closeModal();
        } else {
          toast.error(`Failed to create: ${result.error}`);
        }
      }
    } catch (error: unknown) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // ── Delete ──
  const handleDelete = async (id: string) => {
    if (
      !(await confirmAction({
        title: 'Delete Achievement',
        message: 'Delete this global achievement? This cannot be undone.',
        confirmLabel: 'Delete',
        variant: 'danger',
      }))
    )
      return;
    setDeletingId(id);
    try {
      const result = await deleteAchievement(id);
      if (result.success) {
        setAchievements((prev) => prev.filter((a) => a.id !== id));
        toast.success('Achievement deleted');
      } else {
        toast.error(`Delete failed: ${result.error}`);
      }
    } catch (error: unknown) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Toggle active ──
  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      const result = await toggleAchievementStatus(id, !currentStatus);
      if (result.success) {
        setAchievements((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_active: !currentStatus } : a))
        );
        toast.success(`Achievement ${!currentStatus ? 'activated' : 'deactivated'}`);
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch (error: unknown) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header bar ── */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <Trophy className="w-4 h-4 text-[#00E5FF]" />
          <span>
            <span className="text-white font-medium">{totalActive}</span> active /{' '}
            <span className="text-zinc-400">{totalAll}</span> total
          </span>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Achievement
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-zinc-500 flex-shrink-0" />

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-sm text-white focus:border-[#00E5FF] focus:outline-none"
        >
          <option value="all">All Categories</option>
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>

        {/* Tier filter */}
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value)}
          className="px-3 py-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-sm text-white focus:border-[#00E5FF] focus:outline-none"
        >
          <option value="all">All Tiers</option>
          {TIER_ORDER.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
          <option value="__none__">No Tier</option>
        </select>

        {/* Show inactive toggle */}
        <label className="flex items-center gap-2 cursor-pointer ml-auto select-none">
          <div className="relative">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-800 rounded-full peer peer-checked:bg-[#00E5FF]/70 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </div>
          <span className="text-sm text-zinc-400">Show inactive</span>
        </label>
      </div>

      {/* ── Grouped list ── */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-16 text-center">
          <Award className="w-16 h-16 text-[#333] mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No achievements match</h3>
          <p className="text-zinc-500 mb-6">Adjust the filters or create the first achievement.</p>
          <button
            onClick={openCreateModal}
            className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
          >
            Create Achievement
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {(Object.entries(grouped) as [string, Achievement[]][]).map(([cat, items]) => {
            const isCollapsed = collapsedGroups[cat] ?? false;
            const earnedLabel = CATEGORY_LABELS[cat as Category | '__none__'];
            const activeCnt = items.filter((a) => a.is_active).length;

            return (
              <div key={cat} className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(cat)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-900/40 transition-colors text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex-1">
                    {earnedLabel}
                  </span>
                  <span className="text-[11px] text-zinc-600">
                    {activeCnt}/{items.length} active
                  </span>
                </button>

                {/* Rows */}
                {!isCollapsed && (
                  <div className="divide-y divide-[#141414]">
                    {items.map((a) => (
                      <div
                        key={a.id}
                        className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-zinc-900/20 ${
                          !a.is_active ? 'opacity-50' : ''
                        }`}
                      >
                        {/* Badge image */}
                        <div className="flex-shrink-0">
                          {a.badge_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={a.badge_image_url}
                              alt={a.name}
                              className="w-10 h-10 rounded-lg object-contain bg-[#1A1A1A] p-1"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-[#1A1A1A] flex items-center justify-center">
                              <Trophy className="w-5 h-5 text-zinc-600" />
                            </div>
                          )}
                        </div>

                        {/* Name + code */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-white truncate">
                              {a.name}
                            </span>
                            <TierChip tier={a.tier} />
                            <StatusBadge active={a.is_active} />
                          </div>
                          <p className="text-[11px] text-zinc-600 font-mono">{a.code}</p>
                        </div>

                        {/* Criteria */}
                        <div className="hidden md:block flex-shrink-0 max-w-[180px]">
                          <p className="text-xs text-zinc-500 truncate">{criteriaHumanLabel(a.criteria)}</p>
                        </div>

                        {/* Reward */}
                        <div className="flex-shrink-0 flex items-center gap-1 text-[#00E5FF] text-sm font-bold w-16 justify-end">
                          {a.reward_drops.toLocaleString()}
                          <Droplet className="w-3 h-3" strokeWidth={1.5} />
                        </div>

                        {/* Actions */}
                        <div className="flex-shrink-0 flex items-center gap-0.5">
                          <button
                            onClick={() => openEditModal(a)}
                            className="p-2 text-zinc-600 hover:text-[#00E5FF] transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggle(a.id, a.is_active)}
                            className="p-2 text-zinc-600 hover:text-[#00E5FF] transition-colors"
                            title={a.is_active ? 'Deactivate' : 'Activate'}
                          >
                            <Power
                              className={`w-3.5 h-3.5 ${a.is_active ? 'text-[#00E5FF]' : ''}`}
                            />
                          </button>
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={deletingId === a.id}
                            className="p-2 text-zinc-600 hover:text-[#FF5252] transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-2xl w-full max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {editingAchievement ? 'Edit Achievement' : 'Create Global Achievement'}
              </h2>
              <button onClick={closeModal} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Code + Name */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Code *</label>
                  <input
                    {...register('code')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none font-mono text-sm"
                    placeholder="e.g. sessions_gold"
                  />
                  {errors.code && (
                    <p className="mt-1 text-sm text-[#FF5252]">{errors.code.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Name *</label>
                  <input
                    {...register('name')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none"
                    placeholder="e.g. Iron Regular"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-[#FF5252]">{errors.name.message}</p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Description</label>
                <textarea
                  {...register('description')}
                  rows={2}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none resize-none"
                  placeholder="Describe what the user needs to do to earn this badge"
                />
              </div>

              {/* ── Tiered Catalog Classification ── */}
              <div className="bg-[#0D1117] border border-[#1A2233] rounded-lg p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-[#00E5FF] uppercase tracking-wider">
                    Trophy Room Classification
                  </h3>
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    Recommended — powers category grouping and tier ladder in the mobile Trophy Room.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Category
                    </label>
                    <select
                      {...register('category')}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    >
                      <option value="">— None —</option>
                      {(Object.entries(CATEGORY_LABELS) as [string, string][])
                        .filter(([k]) => k !== '__none__')
                        .map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Tier */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Tier
                    </label>
                    <select
                      {...register('tier')}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    >
                      <option value="">— None —</option>
                      {TIER_ORDER.map((t) => (
                        <option key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </option>
                      ))}
                    </select>
                    {/* Live tier chip preview */}
                    {watchedTier && (
                      <div className="mt-2">
                        <TierChip tier={watchedTier as Tier} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto-suggest hint */}
                {watchedCategory && (
                  <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <span className="text-[#00E5FF]">↳</span>
                    Condition type auto-set to{' '}
                    <code className="text-zinc-300">
                      {CATEGORY_TO_CRITERIA[watchedCategory as Category]}
                    </code>{' '}
                    — override below if needed.
                  </p>
                )}
              </div>

              {/* ── Criteria ── */}
              <div className="bg-[#111] border border-[#1F1F1F] rounded-lg p-5 space-y-4">
                <h3 className="text-sm font-bold text-[#00E5FF] uppercase tracking-wider">
                  Criteria Conditions
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                      Condition Type
                    </label>
                    <select
                      {...register('criteria.type')}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    >
                      {Object.entries(criteriaTypeLabels).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                      Operator
                    </label>
                    <select
                      {...register('criteria.operator')}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    >
                      {Object.entries(operatorLabels).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                      Target Value
                    </label>
                    <input
                      type="number"
                      {...register('criteria.value', { valueAsNumber: true })}
                      min={0}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none"
                      placeholder="1000"
                    />
                    {errors.criteria?.value && (
                      <p className="mt-1 text-xs text-[#FF5252]">
                        {errors.criteria.value.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Non->= operator warning for tiered achievements */}
                {watchedTier && watchedOperator !== '>=' && (
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300">
                      Tiered achievements typically use the{' '}
                      <code className="font-mono">≥</code> operator so users unlock them progressively.
                      Consider switching unless you have a specific reason.
                    </p>
                  </div>
                )}

                {/* Scope */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">Scope</label>
                    <select
                      {...register('criteria.scope')}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    >
                      {Object.entries(scopeLabels).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(watchedScope === 'machine_type' || watchedCriteriaType === 'distance_km') && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                        Machine Type
                      </label>
                      <select
                        {...register('criteria.machine_type')}
                        className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                      >
                        <option value="">Any</option>
                        <option value="treadmill">Treadmill</option>
                        <option value="bike">Bike</option>
                        <option value="elliptical">Elliptical</option>
                        <option value="rower">Rower</option>
                        <option value="cardio">All Cardio</option>
                      </select>
                    </div>
                  )}
                </div>

                <p className="text-xs text-zinc-600">
                  {watchedCriteriaType === 'total_drops' &&
                    'User must earn the target number of drops (lifetime).'}
                  {watchedCriteriaType === 'streak_days' &&
                    'User must train for the target number of consecutive days.'}
                  {watchedCriteriaType === 'session_count' &&
                    'User must complete the target number of workout sessions.'}
                  {watchedCriteriaType === 'gym_count' &&
                    'User must visit the target number of different gyms.'}
                  {watchedCriteriaType === 'distance_km' &&
                    'User must cover the target distance in kilometers.'}
                </p>
              </div>

              {/* Reward & Display Order */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Reward Drops</label>
                  <input
                    type="number"
                    {...register('rewardDrops', { valueAsNumber: true })}
                    min={0}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none"
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-zinc-600">
                    Bonus drops awarded when achievement is unlocked
                  </p>
                  {errors.rewardDrops && (
                    <p className="mt-1 text-sm text-[#FF5252]">{errors.rewardDrops.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Display Order
                  </label>
                  <input
                    type="number"
                    {...register('displayOrder', { valueAsNumber: true })}
                    min={0}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none"
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-zinc-600">
                    Lower numbers appear first. Convention: 101–105 (sessions), 201–205 (drops), …
                  </p>
                </div>
              </div>

              {/* Badge Image */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Badge Image *</label>
                <div
                  {...badgeDropzone.getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    badgeDropzone.isDragActive
                      ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                      : 'border-zinc-800 bg-[#1A1A1A] hover:border-[#00E5FF]/50'
                  } ${uploadingBadge ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input {...badgeDropzone.getInputProps()} />
                  {badgePreview ? (
                    <div className="space-y-3">
                      <div className="relative inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={badgePreview}
                          alt="Badge preview"
                          className="w-32 h-32 object-contain mx-auto rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBadgePreview(null);
                            setValue('badgeImageUrl', '', { shouldValidate: true });
                          }}
                          className="absolute top-0 right-0 p-1 bg-[#FF5252] text-white rounded-full hover:bg-[#FF0000] transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-zinc-500">Click or drag to replace</p>
                    </div>
                  ) : uploadingBadge ? (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 text-[#00E5FF] mx-auto animate-pulse" />
                      <p className="text-sm text-zinc-500">Uploading...</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Image className="w-8 h-8 text-zinc-600 mx-auto" />
                      <p className="text-sm text-white">
                        Drag & drop badge image here, or click to select
                      </p>
                      <p className="text-xs text-zinc-600">PNG, JPG, JPEG, WEBP (max 10MB)</p>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Or enter URL manually:
                  </label>
                  <input
                    type="url"
                    {...register('badgeImageUrl')}
                    className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none text-sm"
                    placeholder="https://cdn.example.com/badges/sessions_gold-badge.png"
                    onChange={(e) => {
                      const val = e.target.value;
                      setValue('badgeImageUrl', val, { shouldValidate: true });
                      setBadgePreview(val || null);
                    }}
                  />
                </div>

                {errors.badgeImageUrl && (
                  <p className="mt-1 text-sm text-[#FF5252]">{errors.badgeImageUrl.message}</p>
                )}
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" {...register('isActive')} className="sr-only peer" />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00E5FF]" />
                </label>
                <span className="text-sm text-white">Active (visible to users)</span>
              </div>

              {/* Submit */}
              <div className="flex gap-4 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? editingAchievement
                      ? 'Saving...'
                      : 'Creating...'
                    : editingAchievement
                    ? 'Save Changes'
                    : 'Create Achievement'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
