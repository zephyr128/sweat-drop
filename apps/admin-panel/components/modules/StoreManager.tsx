'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { createStoreItem, deleteStoreItem, updateStoreItem, getStorePriceGuidance } from '@/lib/actions/store-actions';
import { getBandEnforcementMode, getGymConversionRate, type BandEnforcementMode } from '@/lib/actions/economy-actions';
import { uploadFile } from '@/lib/utils/storage';
import { X, Trash2, Edit2, Droplet, Smartphone, Building2, Calendar, Lock, RefreshCw, Percent, Calculator, AlertTriangle, ShieldAlert } from 'lucide-react';
import { confirmAction } from '@/components/ui/ConfirmDialog';

const REDEMPTION_LIMITS = ['unlimited', 'once', 'once_per_day', 'once_per_week', 'once_per_month'] as const;
const REWARD_TYPES = ['physical', 'coffee', 'protein_snack', 'day_pass', 'pt_intro', 'merch_small', 'merch_premium', 'membership'] as const;
const PRICE_CALC_MODES = ['manual_drops', 'discount_from_rsd'] as const;
type PriceBandMap = Record<string, { min: number; max: number }>;

function toDateInputValue(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

const storeItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priceDrops: z.number().int().positive('Price must be greater than 0'),
  stock: z.preprocess(
    (val) =>
      val === '' || val === undefined || (typeof val === 'number' && Number.isNaN(val)) ? undefined : val,
    z.number().int().min(0).optional()
  ),
  rewardType: z.enum(REWARD_TYPES).default('physical'),
  redemptionLimit: z.enum(REDEMPTION_LIMITS).default('unlimited'),
  imageUrl: z.string().url().optional().or(z.literal('')),
  sponsorName: z.string().optional(),
  sponsorLogo: z.string().url().optional().or(z.literal('')),
  availableFrom: z.string().default(''),
  availableUntil: z.string().default(''),
  priceCalcMode: z.enum(PRICE_CALC_MODES).default('manual_drops'),
  basePriceRsd: z.number().positive().optional(),
  discountPercent: z.number().min(0).max(95).optional(),
});

type StoreItemFormData = z.infer<typeof storeItemSchema>;

interface StoreItem {
  id: string;
  name: string;
  description: string | null;
  price_drops: number;
  stock: number | null;
  image_url: string | null;
  is_active: boolean;
  reward_type?: string | null;
  redemption_limit?: string | null;
  sponsor_name?: string | null;
  sponsor_logo?: string | null;
  available_from?: string | null;
  available_until?: string | null;
  price_calc_mode?: string | null;
  base_price_rsd?: number | null;
  discount_percent?: number | null;
  final_price_rsd_snapshot?: number | null;
  drops_per_rsd_snapshot?: number | null;
}

interface StoreManagerProps {
  gymId: string;
  initialItems: StoreItem[];
}

export function StoreManager({ gymId, initialItems }: StoreManagerProps) {
  const [items, setItems] = useState<StoreItem[]>(initialItems);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingSponsorLogo, setUploadingSponsorLogo] = useState(false);
  const [sponsorLogoPreview, setSponsorLogoPreview] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [priceBands, setPriceBands] = useState<PriceBandMap>({});
  const [dropsPerRsd, setDropsPerRsd] = useState(2.0);
  const [bandMode, setBandMode] = useState<BandEnforcementMode>('warn');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch: _watch,
    formState: { errors, isSubmitting },
  } = useForm<StoreItemFormData>({
    resolver: zodResolver(storeItemSchema),
    defaultValues: {
      rewardType: 'physical',
      redemptionLimit: 'unlimited',
      availableFrom: '',
      availableUntil: '',
      priceCalcMode: 'manual_drops',
    },
  });

  const watchedRewardType = _watch('rewardType');
  const watchedPriceCalcMode = _watch('priceCalcMode') || 'manual_drops';
  const watchedBasePriceRsd = Number(_watch('basePriceRsd') || 0);
  const watchedDiscountPercent = Number(_watch('discountPercent') || 0);
  const watchedPriceDrops = Number(_watch('priceDrops') || 0);
  const activeBand = priceBands[watchedRewardType] || priceBands.physical || null;

  const discountPreview = useMemo(() => {
    if (watchedPriceCalcMode !== 'discount_from_rsd' || watchedBasePriceRsd <= 0 || dropsPerRsd <= 0) return null;
    const disc = Math.min(95, Math.max(0, watchedDiscountPercent));
    const effectiveRsd = watchedBasePriceRsd * (1 - disc / 100);
    const effectiveDrops = Math.max(1, Math.round(effectiveRsd * dropsPerRsd));
    return { effectiveRsd: Math.round(effectiveRsd * 100) / 100, effectiveDrops };
  }, [watchedPriceCalcMode, watchedBasePriceRsd, watchedDiscountPercent, dropsPerRsd]);

  useEffect(() => {
    if (discountPreview && watchedPriceCalcMode === 'discount_from_rsd') {
      setValue('priceDrops', discountPreview.effectiveDrops);
    }
  }, [discountPreview, watchedPriceCalcMode, setValue]);

  const effectivePriceDrops = watchedPriceCalcMode === 'discount_from_rsd' ? (discountPreview?.effectiveDrops ?? 0) : watchedPriceDrops;
  const normalizedPreviewDrops =
    watchedPriceCalcMode === 'discount_from_rsd' && watchedDiscountPercent > 0 && watchedDiscountPercent < 100
      ? Math.round(effectivePriceDrops / (1 - watchedDiscountPercent / 100))
      : effectivePriceDrops;
  const isPriceOutOfBand =
    !!activeBand &&
    normalizedPreviewDrops > 0 &&
    (normalizedPreviewDrops < activeBand.min || normalizedPreviewDrops > activeBand.max);

  useEffect(() => {
    void (async () => {
      const [bandsResult, convResult, modeResult] = await Promise.all([
        getStorePriceGuidance(gymId),
        getGymConversionRate(gymId),
        getBandEnforcementMode(gymId),
      ]);
      if (bandsResult.success && bandsResult.data) setPriceBands(bandsResult.data as PriceBandMap);
      if (convResult.success && convResult.dropsPerRsd > 0) setDropsPerRsd(convResult.dropsPerRsd);
      if (modeResult.success) setBandMode(modeResult.mode);
    })();
  }, [gymId]);

  const imageDropzone = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;

      setUploading(true);
      try {
        const file = acceptedFiles[0];
        const result = await uploadFile(file, 'images', gymId);
        setValue('imageUrl', result.url);
        setImagePreview(result.url);
        toast.success('Image uploaded successfully');
      } catch (error: any) {
        toast.error(`Failed to upload image: ${error.message}`);
      } finally {
        setUploading(false);
      }
    },
  });

  const sponsorLogoDropzone = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.svg'],
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;

      setUploadingSponsorLogo(true);
      try {
        const file = acceptedFiles[0];
        const result = await uploadFile(file, 'images', gymId);
        setValue('sponsorLogo', result.url);
        setSponsorLogoPreview(result.url);
        toast.success('Sponsor logo uploaded');
      } catch (error: any) {
        toast.error(`Failed to upload logo: ${error.message}`);
      } finally {
        setUploadingSponsorLogo(false);
      }
    },
  });

  const openEditModal = (item: StoreItem) => {
    setEditingItem(item);
    setImagePreview(item.image_url);
    setSponsorLogoPreview(item.sponsor_logo || null);
    const mode = item.price_calc_mode === 'discount_from_rsd' ? 'discount_from_rsd' : 'manual_drops';
    reset({
      name: item.name,
      description: item.description || '',
      priceDrops: item.price_drops,
      stock: item.stock ?? undefined,
      rewardType: ((item.reward_type || 'physical') as typeof REWARD_TYPES[number]),
      redemptionLimit: (item.redemption_limit as typeof REDEMPTION_LIMITS[number]) || 'unlimited',
      imageUrl: item.image_url || '',
      sponsorName: item.sponsor_name || '',
      sponsorLogo: item.sponsor_logo || '',
      availableFrom: toDateInputValue(item.available_from),
      availableUntil: toDateInputValue(item.available_until),
      priceCalcMode: mode as typeof PRICE_CALC_MODES[number],
      basePriceRsd: item.base_price_rsd ?? undefined,
      discountPercent: item.discount_percent ?? undefined,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setImagePreview(null);
    setSponsorLogoPreview(null);
    setShowPreview(false);
    reset();
  };

  const onSubmit = async (data: StoreItemFormData) => {
    if (bandMode === 'enforce' && isPriceOutOfBand) {
      toast.error('Strict band mode is active — fix the price to be within the recommended band before saving.');
      return;
    }

    try {
      const payload = {
        ...data,
        rewardType: data.rewardType || 'physical',
        redemptionLimit: data.redemptionLimit || 'unlimited',
        sponsorName: data.sponsorName,
        sponsorLogo: data.sponsorLogo,
        availableFrom: data.availableFrom?.trim() ?? '',
        availableUntil: data.availableUntil?.trim() ?? '',
        priceCalcMode: data.priceCalcMode || 'manual_drops',
        basePriceRsd: data.priceCalcMode === 'discount_from_rsd' ? data.basePriceRsd : undefined,
        discountPercent: data.priceCalcMode === 'discount_from_rsd' ? data.discountPercent : undefined,
      };

      if (editingItem) {
        const result = await updateStoreItem(editingItem.id, gymId, payload) as {
          success: boolean;
          data?: StoreItem;
          error?: string;
        };
        if (result.success && result.data) {
          setItems(items.map((i) => (i.id === editingItem.id ? result.data as StoreItem : i)));
          toast.success('Item updated successfully');
          closeModal();
        } else {
          toast.error(`Failed to update item: ${result.error}`);
        }
      } else {
        const result = await createStoreItem({
          ...payload,
          gymId,
        }) as {
          success: boolean;
          data?: StoreItem;
          error?: string;
        };
        if (result.success && result.data) {
          setItems([result.data as StoreItem, ...items]);
          toast.success('Item created successfully');
          closeModal();
        } else {
          toast.error(`Failed to create item: ${result.error}`);
        }
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!(await confirmAction({ title: 'Delete Store Item', message: 'Are you sure you want to delete this item?', confirmLabel: 'Delete', variant: 'danger' }))) return;

    setDeletingId(itemId);
    try {
      const result = await deleteStoreItem(itemId, gymId);
      if (result.success) {
        setItems(items.filter((i) => i.id !== itemId));
        toast.success('Item deleted successfully');
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          + Add Item
        </button>
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl">
            <p className="text-[#808080] mb-4">No store items yet</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
            >
              + Add First Item
            </button>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden hover:border-[#00E5FF]/30 transition-all"
            >
              {item.image_url && (
                <div className="aspect-video bg-[#1A1A1A] overflow-hidden">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-1">{item.name}</h3>
                    {item.description && (
                      <p className="text-sm text-[#808080] line-clamp-2">{item.description}</p>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-2xl font-bold text-[#00E5FF] mb-2">
                    <span className="flex items-center gap-1">
                      {item.price_drops} <Droplet className="w-4 h-4" strokeWidth={1.5} />
                      {item.price_calc_mode === 'discount_from_rsd' && Number(item.discount_percent || 0) > 0 && (
                        <span className="text-xs font-medium text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded ml-1">
                          −{item.discount_percent}%
                        </span>
                      )}
                    </span>
                  </p>
                  {item.stock !== null && (
                    <p className="text-sm text-[#808080]">Stock: {item.stock}</p>
                  )}
                  <PriceBandBadge item={item} priceBands={priceBands} />
                  <RedemptionLimitBadge limit={item.redemption_limit} />
                  {item.sponsor_name && (
                    <div className="flex items-center gap-1.5 mt-1">
                      {item.sponsor_logo ? (
                        <img src={item.sponsor_logo} alt="" className="h-4 w-4 object-contain" />
                      ) : (
                        <Building2 className="w-3 h-3 text-[#808080]" />
                      )}
                      <span className="text-xs text-[#808080]">by {item.sponsor_name}</span>
                    </div>
                  )}
                  {(item.available_from || item.available_until) && (
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3 text-[#808080]" />
                      <span className="text-xs text-[#808080]">
                        {item.available_from
                          ? new Date(item.available_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '...'}{' — '}
                        {item.available_until
                          ? new Date(item.available_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '...'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => openEditModal(item)}
                    className="flex-1 px-4 py-2 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg text-center font-medium hover:bg-[#00E5FF]/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="px-4 py-2 bg-[#FF5252]/10 text-[#FF5252] rounded-lg font-medium hover:bg-[#FF5252]/20 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </h2>
              <button
                onClick={closeModal}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Item Image
                </label>
                <div
                  {...imageDropzone.getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    imageDropzone.isDragActive
                      ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                      : 'border-[#1A1A1A] hover:border-[#00E5FF]/50'
                  }`}
                >
                  <input {...imageDropzone.getInputProps()} />
                  {imagePreview ? (
                    <div className="space-y-4">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="max-h-48 mx-auto rounded-lg"
                      />
                      <p className="text-sm text-[#808080]">Click or drag to replace</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[#808080]">Drag & drop image here, or click to select</p>
                      <p className="text-xs text-[#808080]">PNG, JPG, WEBP up to 5MB</p>
                    </div>
                  )}
                </div>
                {uploading && (
                  <p className="mt-2 text-sm text-[#00E5FF]">Uploading...</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Name *
                </label>
                <input
                  {...register('name')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="E.g., Protein Shake"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-[#FF5252]">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Description
                </label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none resize-none"
                  placeholder="Item description"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Reward Category
                  </label>
                  <select
                    {...register('rewardType')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="physical">Physical</option>
                    <option value="coffee">Coffee / Drink</option>
                    <option value="protein_snack">Protein Snack</option>
                    <option value="day_pass">Day Pass</option>
                    <option value="pt_intro">PT Intro</option>
                    <option value="merch_small">Merch Small</option>
                    <option value="merch_premium">Merch Premium</option>
                    <option value="membership">Membership</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    {...register('stock', { valueAsNumber: true })}
                    min={0}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="Leave empty for unlimited"
                  />
                </div>
              </div>

              {/* Pricing Mode */}
              <div className="border-t border-[#1A1A1A] pt-6">
                <label className="block text-sm font-medium text-white mb-3">Pricing Mode</label>
                <div className="flex gap-2 mb-4">
                  <button type="button" onClick={() => setValue('priceCalcMode', 'manual_drops')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${watchedPriceCalcMode === 'manual_drops' ? 'bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30' : 'bg-[#1A1A1A] text-zinc-400 border border-[#2A2A2A] hover:border-zinc-600'}`}>
                    <Droplet className="w-3.5 h-3.5" /> Manual (drops)
                  </button>
                  <button type="button" onClick={() => setValue('priceCalcMode', 'discount_from_rsd')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${watchedPriceCalcMode === 'discount_from_rsd' ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30' : 'bg-[#1A1A1A] text-zinc-400 border border-[#2A2A2A] hover:border-zinc-600'}`}>
                    <Percent className="w-3.5 h-3.5" /> Discount from RSD
                  </button>
                </div>

                {watchedPriceCalcMode === 'manual_drops' ? (
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Price (Drops) *</label>
                    <input type="number" {...register('priceDrops', { valueAsNumber: true })} min={1}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none" placeholder="100" />
                    {errors.priceDrops && <p className="mt-1 text-sm text-[#FF5252]">{errors.priceDrops.message}</p>}
                    {activeBand ? (
                      <p className={`mt-1 text-xs ${isPriceOutOfBand ? 'text-amber-300' : 'text-zinc-500'}`}>
                        Recommended: {activeBand.min} – {activeBand.max} drops for {watchedRewardType}.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">No category band configured. Using open pricing.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Base price (RSD) *</label>
                        <input type="number" {...register('basePriceRsd', { valueAsNumber: true })} min={1} step={1}
                          className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none" placeholder="200" />
                        <p className="mt-1 text-[10px] text-zinc-500">Full regular price in RSD (before discount).</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Discount (%) *</label>
                        <input type="number" {...register('discountPercent', { valueAsNumber: true })} min={0} max={95} step={1}
                          className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none" placeholder="20" />
                        <div className="flex gap-1.5 mt-2">
                          {[10, 20, 30, 50].map((d) => (
                            <button key={d} type="button" onClick={() => setValue('discountPercent', d)}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${watchedDiscountPercent === d ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-[#1A1A1A] text-zinc-500 border border-[#2A2A2A] hover:text-zinc-300'}`}>
                              −{d}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {discountPreview && (
                      <div className="bg-[#111] border border-[#1A1A1A] rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <Calculator className="w-3.5 h-3.5 text-violet-400" />
                          <span>Live preview</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className="text-lg font-bold text-violet-300 tabular-nums">{discountPreview.effectiveDrops}</p>
                            <p className="text-[10px] text-zinc-500">drops</p>
                          </div>
                          <span className="text-zinc-600">=</span>
                          <div className="text-center">
                            <p className="text-lg font-bold text-white tabular-nums">{discountPreview.effectiveRsd}</p>
                            <p className="text-[10px] text-zinc-500">RSD</p>
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-600 font-mono">
                          {watchedBasePriceRsd} × (1 − {watchedDiscountPercent}%) × {dropsPerRsd} = {discountPreview.effectiveDrops} drops
                        </p>
                        {activeBand && (
                          <p className={`text-[10px] ${isPriceOutOfBand ? 'text-amber-300' : 'text-zinc-500'}`}>
                            Recommended: {activeBand.min} – {activeBand.max} normalized drops for {watchedRewardType}.
                          </p>
                        )}
                        {watchedPriceCalcMode === 'discount_from_rsd' && watchedDiscountPercent > 0 && (
                          <p className="text-[10px] text-violet-300">
                            Compliance uses discount-normalized base price: {normalizedPreviewDrops} drops.
                          </p>
                        )}
                        <input type="hidden" {...register('priceDrops', { valueAsNumber: true })} />
                      </div>
                    )}
                  </div>
                )}

                {isPriceOutOfBand && (
                  <BandPolicyNotice mode={bandMode} rewardType={watchedRewardType} />
                )}
              </div>

              {/* Redemption Limit */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Redemption Limit
                </label>
                <select
                  {...register('redemptionLimit')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="unlimited">No limit</option>
                  <option value="once">Once (ever)</option>
                  <option value="once_per_day">Once per day</option>
                  <option value="once_per_week">Once per week</option>
                  <option value="once_per_month">Once per month</option>
                </select>
                <p className="mt-1 text-xs text-[#808080]">
                  How often can each member claim this reward?
                </p>
              </div>

              {/* Availability Dates */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-[#808080]" />
                  <label className="text-sm font-medium text-white">Availability Window</label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Available From</label>
                    <input
                      type="date"
                      {...register('availableFrom')}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Available Until</label>
                    <input
                      type="date"
                      {...register('availableUntil')}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-[#808080]">Leave empty for always available</p>
              </div>

              {/* Sponsor Section */}
              <div className="border-t border-[#1A1A1A] pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-[#808080]" />
                  <label className="text-sm font-medium text-white">Sponsor (Optional)</label>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Sponsor Name</label>
                    <input
                      {...register('sponsorName')}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      placeholder="E.g., GymShark, MyProtein"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Sponsor Logo</label>
                    <div
                      {...sponsorLogoDropzone.getRootProps()}
                      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                        sponsorLogoDropzone.isDragActive
                          ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                          : 'border-[#333] hover:border-[#00E5FF]/50'
                      }`}
                    >
                      <input {...sponsorLogoDropzone.getInputProps()} />
                      {sponsorLogoPreview ? (
                        <div className="flex items-center justify-center gap-3">
                          <img src={sponsorLogoPreview} alt="Sponsor logo" className="h-10 object-contain" />
                          <span className="text-xs text-[#808080]">Click to replace</span>
                        </div>
                      ) : uploadingSponsorLogo ? (
                        <p className="text-sm text-[#00E5FF]">Uploading...</p>
                      ) : (
                        <p className="text-sm text-[#808080]">Drop sponsor logo or click to select</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile Preview Toggle */}
              <div className="border-t border-[#1A1A1A] pt-4">
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-2 text-sm text-[#00E5FF] hover:underline"
                >
                  <Smartphone className="w-4 h-4" />
                  {showPreview ? 'Hide Mobile Preview' : 'Show Mobile Preview'}
                </button>

                {showPreview && (
                  <div className="mt-4 flex justify-center">
                    <MobileRewardPreview
                      name={_watch('name') || 'Reward Name'}
                      description={_watch('description') || ''}
                      priceDrops={_watch('priceDrops') || 0}
                      imageUrl={imagePreview}
                      sponsorName={_watch('sponsorName') || ''}
                      sponsorLogo={sponsorLogoPreview}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isSubmitting || uploading || uploadingSponsorLogo}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? editingItem
                      ? 'Updating...'
                      : 'Creating...'
                    : editingItem
                    ? 'Update Item'
                    : 'Create Item'}
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

function RedemptionLimitBadge({ limit }: { limit: string | null | undefined }) {
  if (!limit || limit === 'unlimited') return null;

  const config: Record<string, { label: string; icon: typeof Lock }> = {
    once: { label: 'One-time', icon: Lock },
    once_per_day: { label: 'Daily', icon: RefreshCw },
    once_per_week: { label: 'Weekly', icon: RefreshCw },
    once_per_month: { label: 'Monthly', icon: RefreshCw },
  };

  const entry = config[limit];
  if (!entry) return null;

  const Icon = entry.icon;
  const isOnce = limit === 'once';

  return (
    <div className={`flex items-center gap-1 mt-1 ${isOnce ? 'text-amber-400' : 'text-blue-400'}`}>
      <Icon className="w-3 h-3" />
      <span className="text-xs">{entry.label}</span>
    </div>
  );
}

function PriceBandBadge({ item, priceBands }: { item: StoreItem; priceBands: PriceBandMap }) {
  const rewardType = item.reward_type || 'physical';
  const band = priceBands[rewardType] || priceBands.physical || null;
  if (!band) return null;

  const disc = Number(item.discount_percent || 0);
  const isDiscount = item.price_calc_mode === 'discount_from_rsd' && disc > 0 && disc < 100;
  const normalized = isDiscount ? Math.round(item.price_drops / (1 - disc / 100)) : item.price_drops;
  const outOfBand = normalized < band.min || normalized > band.max;
  const bandLabel = `${band.min}–${band.max} rec.`;

  return (
    <div className={`flex flex-col gap-0.5 mt-1 ${outOfBand ? 'text-amber-300' : 'text-emerald-300'}`}>
      <div className="flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${outOfBand ? 'bg-amber-400' : 'bg-emerald-400'}`} />
        <span className="text-xs">
          {outOfBand ? `Out of band (${bandLabel})` : `In band (${bandLabel})`}
        </span>
      </div>
      {isDiscount && (
        <span className="text-[10px] text-zinc-500 pl-2.5" title={`Final ${item.price_drops} drops → base-equivalent ${normalized} drops after reversing ${disc}% discount`}>
          base ≈ {normalized} drops (discount-normalized)
        </span>
      )}
    </div>
  );
}

function BandPolicyNotice({ mode, rewardType }: { mode: BandEnforcementMode; rewardType: string }) {
  if (mode === 'enforce') {
    return (
      <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2.5 mt-2" data-testid="band-enforce-notice">
        <ShieldAlert className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs text-rose-300 font-medium">Strict band mode is active</p>
          <p className="text-[11px] text-rose-200/70">This reward is outside the {rewardType} price band and will be blocked from member redemption until corrected.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 mt-2" data-testid="band-warn-notice">
      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-amber-300 font-medium">Out of recommended band</p>
        <p className="text-[11px] text-amber-200/70">Members can still redeem this reward. Consider adjusting the price or band range.</p>
      </div>
    </div>
  );
}

/** Mini preview of how the reward card looks in the mobile app */
function MobileRewardPreview({
  name,
  description,
  priceDrops,
  imageUrl,
  sponsorName,
  sponsorLogo,
}: {
  name: string;
  description: string;
  priceDrops: number;
  imageUrl: string | null;
  sponsorName: string;
  sponsorLogo: string | null;
}) {
  return (
    <div className="w-[240px] bg-[#111] border border-[#333] rounded-2xl overflow-hidden shadow-lg">
      {/* Phone frame header */}
      <div className="h-5 bg-[#1A1A1A] flex items-center justify-center">
        <div className="w-10 h-1.5 bg-[#333] rounded-full" />
      </div>

      {/* Card content */}
      <div className="p-0">
        {imageUrl ? (
          <div className="h-28 bg-[#1A1A1A] overflow-hidden">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="h-28 bg-gradient-to-br from-[#00E5FF]/10 to-[#00B8CC]/5 flex items-center justify-center">
            <Droplet className="w-10 h-10 text-[#00E5FF]/30" />
          </div>
        )}

        <div className="p-4">
          <h4 className="text-sm font-bold text-white truncate">{name}</h4>
          {description && (
            <p className="text-xs text-[#808080] mt-1 line-clamp-2">{description}</p>
          )}

          {sponsorName && (
            <div className="flex items-center gap-1.5 mt-2">
              {sponsorLogo ? (
                <img src={sponsorLogo} alt="" className="h-4 w-4 object-contain" />
              ) : (
                <Building2 className="w-3 h-3 text-[#808080]" />
              )}
              <span className="text-[10px] text-[#808080]">by {sponsorName}</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-[#00E5FF]">{priceDrops}</span>
              <Droplet className="w-3.5 h-3.5 text-[#00E5FF]" />
            </div>
            <button className="px-3 py-1 bg-[#00E5FF] text-black text-xs font-bold rounded-full">
              Claim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
