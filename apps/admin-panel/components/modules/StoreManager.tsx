'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { createStoreItem, deleteStoreItem, updateStoreItem } from '@/lib/actions/store-actions';
import { uploadFile } from '@/lib/utils/storage';
import { X, Trash2, Edit2, Droplet, Smartphone, Building2, Calendar } from 'lucide-react';
import { confirmAction } from '@/components/ui/ConfirmDialog';

const storeItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priceDrops: z.number().int().positive('Price must be greater than 0'),
  stock: z.number().int().min(0).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  sponsorName: z.string().optional(),
  sponsorLogo: z.string().url().optional().or(z.literal('')),
  availableFrom: z.string().optional(),
  availableUntil: z.string().optional(),
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
  sponsor_name?: string | null;
  sponsor_logo?: string | null;
  available_from?: string | null;
  available_until?: string | null;
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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch: _watch,
    formState: { errors, isSubmitting },
  } = useForm<StoreItemFormData>({
    resolver: zodResolver(storeItemSchema),
  });

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
    reset({
      name: item.name,
      description: item.description || '',
      priceDrops: item.price_drops,
      stock: item.stock ?? undefined,
      imageUrl: item.image_url || '',
      sponsorName: item.sponsor_name || '',
      sponsorLogo: item.sponsor_logo || '',
      availableFrom: item.available_from || '',
      availableUntil: item.available_until || '',
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
    try {
      if (editingItem) {
        const result = await updateStoreItem(editingItem.id, gymId, data) as {
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
          ...data,
          gymId,
          rewardType: 'physical',
          sponsorName: data.sponsorName,
          sponsorLogo: data.sponsorLogo,
          availableFrom: data.availableFrom,
          availableUntil: data.availableUntil,
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
                    </span>
                  </p>
                  {item.stock !== null && (
                    <p className="text-sm text-[#808080]">Stock: {item.stock}</p>
                  )}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Price (Drops) *
                  </label>
                  <input
                    type="number"
                    {...register('priceDrops', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="100"
                  />
                  {errors.priceDrops && (
                    <p className="mt-1 text-sm text-[#FF5252]">
                      {errors.priceDrops.message}
                    </p>
                  )}
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

              {/* Availability Dates */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-[#808080]" />
                  <label className="text-sm font-medium text-white">Availability Window</label>
                </div>
                <div className="grid grid-cols-2 gap-4">
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
