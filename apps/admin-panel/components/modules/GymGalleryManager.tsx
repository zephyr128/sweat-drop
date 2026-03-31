'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ImagePlus, X, GripVertical, Pencil, Check, Camera } from 'lucide-react';
import {
  getGymGallery,
  uploadAndAddGalleryImage,
  deleteGalleryImage,
  updateGalleryCaption,
  reorderGalleryImages,
  type GalleryImage,
} from '@/lib/actions/gallery-actions';

const MAX_IMAGES = 10;

interface GymGalleryManagerProps {
  gymId: string;
}

export function GymGalleryManager({ gymId }: GymGalleryManagerProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    const res = await getGymGallery(gymId);
    if (res.success && res.data) setImages(res.data);
    setLoading(false);
  }, [gymId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > MAX_IMAGES) {
      toast.error(`Max ${MAX_IMAGES} images. You can add ${MAX_IMAGES - images.length} more.`);
      return;
    }

    setUploading(true);
    let added = 0;

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: exceeds 10 MB limit`);
        continue;
      }
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
        toast.error(`${file.name}: unsupported format`);
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await uploadAndAddGalleryImage(gymId, formData, images.length + added);
      if (res.success) {
        added++;
      } else {
        toast.error(res.error || 'Failed to upload image');
      }
    }

    if (added > 0) {
      toast.success(`${added} image${added > 1 ? 's' : ''} uploaded`);
      await fetchImages();
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (img: GalleryImage) => {
    const res = await deleteGalleryImage(gymId, img.id);
    if (res.success) {
      setImages((prev) => prev.filter((i) => i.id !== img.id));
      toast.success('Image removed');
    } else {
      toast.error(res.error || 'Failed to delete');
    }
  };

  const handleCaptionSave = async (imgId: string) => {
    const res = await updateGalleryCaption(gymId, imgId, captionDraft);
    if (res.success) {
      setImages((prev) =>
        prev.map((i) => (i.id === imgId ? { ...i, caption: captionDraft || null } : i)),
      );
      setEditingCaption(null);
      toast.success('Caption saved');
    } else {
      toast.error(res.error || 'Failed to save caption');
    }
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = async (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }

    const reordered = [...images];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setImages(reordered);
    setDragIdx(null);
    setDragOverIdx(null);

    const res = await reorderGalleryImages(gymId, reordered.map((i) => i.id));
    if (!res.success) {
      toast.error('Failed to save order');
      await fetchImages();
    }
  };

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 flex items-center justify-center">
        <div className="h-5 w-5 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#00E5FF]" />
            Gym Gallery
          </h3>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            Promotional photos visible in the mobile app. Max {MAX_IMAGES} images.
          </p>
        </div>
        <span className="text-[10px] text-zinc-500 font-medium">
          {images.length}/{MAX_IMAGES}
        </span>
      </div>

      <div className="px-5 pb-5">
        {images.length === 0 && !uploading ? (
          <div className="border-2 border-dashed border-[#1A1A1A] rounded-xl p-8 text-center">
            <Camera className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500 mb-3">No photos yet</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#00E5FF] text-black text-sm font-bold rounded-lg hover:bg-[#00B8CC] transition-colors"
            >
              <ImagePlus className="w-4 h-4" />
              Add Photos
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDragOverIdx(null);
                  }}
                  className={`relative group rounded-lg overflow-hidden border transition-all cursor-grab active:cursor-grabbing ${
                    dragOverIdx === idx
                      ? 'border-[#00E5FF] scale-[1.02]'
                      : 'border-[#1A1A1A] hover:border-[#333]'
                  } ${dragIdx === idx ? 'opacity-40' : ''}`}
                >
                  <div className="aspect-square bg-[#111]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.image_url}
                      alt={img.caption || `Gallery image ${idx + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* Overlay controls */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-between p-2">
                    <div className="text-zinc-400">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingCaption(img.id);
                          setCaptionDraft(img.caption || '');
                        }}
                        className="p-1 bg-zinc-800/80 rounded hover:bg-zinc-700 transition-colors"
                        title="Edit caption"
                      >
                        <Pencil className="w-3 h-3 text-zinc-300" />
                      </button>
                      <button
                        onClick={() => handleDelete(img)}
                        className="p-1 bg-red-900/80 rounded hover:bg-red-800 transition-colors"
                        title="Delete"
                      >
                        <X className="w-3 h-3 text-red-300" />
                      </button>
                    </div>
                  </div>

                  {/* Caption display / edit */}
                  {editingCaption === img.id ? (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-2 flex gap-1">
                      <input
                        type="text"
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value)}
                        placeholder="Caption…"
                        className="flex-1 bg-[#111] border border-[#333] rounded px-2 py-1 text-[10px] text-white"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCaptionSave(img.id);
                          if (e.key === 'Escape') setEditingCaption(null);
                        }}
                      />
                      <button
                        onClick={() => handleCaptionSave(img.id)}
                        className="p-1 bg-[#00E5FF] rounded"
                      >
                        <Check className="w-3 h-3 text-black" />
                      </button>
                    </div>
                  ) : img.caption ? (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                      <p className="text-[10px] text-zinc-300 truncate">{img.caption}</p>
                    </div>
                  ) : null}
                </div>
              ))}

              {/* Add more button */}
              {images.length < MAX_IMAGES && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square rounded-lg border-2 border-dashed border-[#1A1A1A] hover:border-[#00E5FF]/50 flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <div className="h-5 w-5 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="w-5 h-5 text-zinc-500" />
                      <span className="text-[10px] text-zinc-500">Add</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <p className="text-[10px] text-zinc-600 mt-2">Drag to reorder. First image is the cover photo.</p>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
      </div>
    </div>
  );
}
