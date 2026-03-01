'use client';

import { useState, useCallback } from 'react';
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
  GripVertical,
  Award,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '@/lib/utils/storage';

// ---------- Zod Schema ----------
const criteriaSchema = z.object({
  type: z.enum(['drops', 'streak', 'sessions', 'distance', 'duration', 'custom']),
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
});

type AchievementFormData = z.infer<typeof achievementFormSchema>;

// ---------- Types ----------
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
  created_at: string;
  updated_at: string;
}

interface AchievementsManagerProps {
  initialAchievements: Achievement[];
}

// ---------- Helpers ----------
const criteriaTypeLabels: Record<string, string> = {
  drops: 'Total Drops Earned',
  streak: 'Consecutive Day Streak',
  sessions: 'Number of Sessions',
  distance: 'Distance (meters)',
  duration: 'Duration (seconds)',
  custom: 'Custom Metric',
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
  return `${typeLabel} ${c.operator} ${c.value}`;
}

// ---------- Component ----------
export function AchievementsManager({
  initialAchievements,
}: AchievementsManagerProps) {
  const [achievements, setAchievements] = useState<Achievement[]>(initialAchievements);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<Achievement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingBadge, setUploadingBadge] = useState(false);
  const [badgePreview, setBadgePreview] = useState<string | null>(null);

  const defaultValues: AchievementFormData = {
    code: '',
    name: '',
    description: '',
    badgeImageUrl: '',
    criteria: {
      type: 'drops',
      operator: '>=',
      value: 1000,
      scope: 'global',
      machine_type: undefined,
    },
    rewardDrops: 0,
    isActive: true,
    displayOrder: 0,
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

  // ---------- Badge upload ----------
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
      } catch (error: any) {
        console.error('Badge upload error:', error);
        const msg = error.message || 'Unknown error';
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

  // ---------- Helpers ----------
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
        type: a.criteria.type as any,
        operator: a.criteria.operator as any,
        value: a.criteria.value,
        scope: (a.criteria.scope as any) || 'global',
        machine_type: a.criteria.machine_type || undefined,
      },
      rewardDrops: a.reward_drops,
      isActive: a.is_active,
      displayOrder: a.display_order,
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

  // ---------- Submit ----------
  const onSubmit = async (data: AchievementFormData) => {
    try {
      if (editingAchievement) {
        // Update
        const result: any = await updateAchievement({
          id: editingAchievement.id,
          ...data,
        });
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
        // Create
        const result: any = await createAchievement(data);
        if (result.success && result.data) {
          setAchievements((prev) => [...prev, result.data as Achievement]);
          toast.success('Achievement created');
          closeModal();
        } else {
          toast.error(`Failed to create: ${result.error}`);
        }
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  // ---------- Delete ----------
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this global achievement? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const result = await deleteAchievement(id);
      if (result.success) {
        setAchievements((prev) => prev.filter((a) => a.id !== id));
        toast.success('Achievement deleted');
      } else {
        toast.error(`Delete failed: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- Toggle active ----------
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
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  // ---------- Render ----------
  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex justify-end">
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Achievement
        </button>
      </div>

      {/* Cards Grid */}
      {achievements.length === 0 ? (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-16 text-center">
          <Award className="w-16 h-16 text-[#333] mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No Global Achievements Yet</h3>
          <p className="text-[#808080] mb-6">
            Create your first global achievement that all SweatDrop users can earn.
          </p>
          <button
            onClick={openCreateModal}
            className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
          >
            Create First Achievement
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={`bg-[#0A0A0A] border rounded-xl p-5 flex flex-col gap-4 transition-colors ${
                a.is_active ? 'border-[#1A1A1A]' : 'border-[#1A1A1A] opacity-60'
              }`}
            >
              {/* Top row: badge + title */}
              <div className="flex items-start gap-4">
                {a.badge_image_url ? (
                  <img
                    src={a.badge_image_url}
                    alt={a.name}
                    className="w-16 h-16 rounded-lg object-contain bg-[#1A1A1A] p-1 flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                    <Trophy className="w-8 h-8 text-[#333]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-bold text-lg truncate">{a.name}</h3>
                  <p className="text-[#00E5FF] text-xs font-mono">{a.code}</p>
                  {a.description && (
                    <p className="text-[#808080] text-sm mt-1 line-clamp-2">
                      {a.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Criteria badge */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#FF9100]/10 text-[#FF9100] capitalize">
                  {a.criteria.type}
                </span>
                <span className="text-xs text-[#808080]">
                  {criteriaHumanLabel(a.criteria)}
                </span>
              </div>

              {/* Meta row */}
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#1A1A1A]">
                <div className="flex items-center gap-4">
                  {/* Reward */}
                  <span className="flex items-center gap-1 text-[#00E5FF] font-bold text-sm">
                    {a.reward_drops} <Droplet className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </span>
                  {/* Status */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      a.is_active
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                        : 'bg-[#808080]/10 text-[#808080]'
                    }`}
                  >
                    {a.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {/* Display order */}
                  <span className="flex items-center gap-1 text-[#808080] text-xs">
                    <GripVertical className="w-3 h-3" /> #{a.display_order}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(a)}
                    className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggle(a.id, a.is_active)}
                    className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                    title={a.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <Power
                      className={`w-4 h-4 ${a.is_active ? 'text-[#00E5FF]' : ''}`}
                    />
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="p-2 text-[#808080] hover:text-[#FF5252] transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Create / Edit Modal ---------- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {editingAchievement ? 'Edit Achievement' : 'Create Global Achievement'}
              </h2>
              <button
                onClick={closeModal}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Code + Name row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Code *
                  </label>
                  <input
                    {...register('code')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none font-mono text-sm"
                    placeholder="e.g. first_workout"
                  />
                  {errors.code && (
                    <p className="mt-1 text-sm text-[#FF5252]">{errors.code.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Name *
                  </label>
                  <input
                    {...register('name')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="e.g. First Workout"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-[#FF5252]">{errors.name.message}</p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Description
                </label>
                <textarea
                  {...register('description')}
                  rows={2}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none resize-none"
                  placeholder="Describe what the user needs to do to earn this badge"
                />
              </div>

              {/* ---------- Criteria Section ---------- */}
              <div className="bg-[#111] border border-[#1F1F1F] rounded-lg p-5 space-y-4">
                <h3 className="text-sm font-bold text-[#00E5FF] uppercase tracking-wider">
                  Criteria Conditions
                </h3>

                {/* Type + Operator + Value */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Type */}
                  <div>
                    <label className="block text-xs font-medium text-[#808080] mb-1.5">
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

                  {/* Operator */}
                  <div>
                    <label className="block text-xs font-medium text-[#808080] mb-1.5">
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

                  {/* Value */}
                  <div>
                    <label className="block text-xs font-medium text-[#808080] mb-1.5">
                      Target Value
                    </label>
                    <input
                      type="number"
                      {...register('criteria.value', { valueAsNumber: true })}
                      min={0}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      placeholder="1000"
                    />
                    {errors.criteria?.value && (
                      <p className="mt-1 text-xs text-[#FF5252]">
                        {errors.criteria.value.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Scope */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#808080] mb-1.5">
                      Scope
                    </label>
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

                  {/* Machine type (conditional) */}
                  {(watchedScope === 'machine_type' ||
                    watchedCriteriaType === 'distance') && (
                    <div>
                      <label className="block text-xs font-medium text-[#808080] mb-1.5">
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

                {/* Helper text */}
                <p className="text-xs text-[#555]">
                  {watchedCriteriaType === 'drops' &&
                    'User must earn the target number of drops.'}
                  {watchedCriteriaType === 'streak' &&
                    'User must train for the target number of consecutive days.'}
                  {watchedCriteriaType === 'sessions' &&
                    'User must complete the target number of workout sessions.'}
                  {watchedCriteriaType === 'distance' &&
                    'User must cover the target distance in meters.'}
                  {watchedCriteriaType === 'duration' &&
                    'User must accumulate the target duration in seconds.'}
                  {watchedCriteriaType === 'custom' &&
                    'Custom metric evaluated by the criteria engine.'}
                </p>
              </div>

              {/* Reward & Display Order */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Reward Drops
                  </label>
                  <input
                    type="number"
                    {...register('rewardDrops', { valueAsNumber: true })}
                    min={0}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-[#808080]">
                    Bonus drops awarded when achievement is unlocked
                  </p>
                  {errors.rewardDrops && (
                    <p className="mt-1 text-sm text-[#FF5252]">
                      {errors.rewardDrops.message}
                    </p>
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
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-[#808080]">
                    Lower numbers appear first in the Trophy Room
                  </p>
                </div>
              </div>

              {/* Badge Image */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Badge Image *
                </label>

                {/* Dropzone */}
                <div
                  {...badgeDropzone.getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    badgeDropzone.isDragActive
                      ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                      : 'border-[#333] bg-[#1A1A1A] hover:border-[#00E5FF]/50'
                  } ${uploadingBadge ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input {...badgeDropzone.getInputProps()} />
                  {badgePreview ? (
                    <div className="space-y-3">
                      <div className="relative inline-block">
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
                      <p className="text-sm text-[#808080]">Click or drag to replace</p>
                    </div>
                  ) : uploadingBadge ? (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 text-[#00E5FF] mx-auto animate-pulse" />
                      <p className="text-sm text-[#808080]">Uploading...</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Image className="w-8 h-8 text-[#808080] mx-auto" />
                      <p className="text-sm text-white">
                        Drag & drop badge image here, or click to select
                      </p>
                      <p className="text-xs text-[#808080]">
                        PNG, JPG, JPEG, WEBP (max 10MB)
                      </p>
                    </div>
                  )}
                </div>

                {/* Manual URL input */}
                <div className="mt-3">
                  <label className="block text-xs font-medium text-[#808080] mb-1">
                    Or enter URL manually:
                  </label>
                  <input
                    type="url"
                    {...register('badgeImageUrl')}
                    className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none text-sm"
                    placeholder="https://cdn.example.com/badges/first_workout.png"
                    onChange={(e) => {
                      const val = e.target.value;
                      setValue('badgeImageUrl', val, { shouldValidate: true });
                      setBadgePreview(val || null);
                    }}
                  />
                </div>

                {errors.badgeImageUrl && (
                  <p className="mt-1 text-sm text-[#FF5252]">
                    {errors.badgeImageUrl.message}
                  </p>
                )}
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('isActive')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00E5FF]"></div>
                </label>
                <span className="text-sm text-white">Active (visible to users)</span>
              </div>

              {/* Actions */}
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
                  className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
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
