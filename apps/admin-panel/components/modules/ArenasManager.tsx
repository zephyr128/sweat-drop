'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Swords,
  Plus,
  X,
  Trash2,
  Power,
  Trophy,
  Users,
  Calendar,
  Building2,
  Globe,
  MapPin,
  Eye,
  Flag,
  Flame,
  Droplet,
  Pencil,
  Palette,
  Lock,
  Ban,
  Send,
  Upload,
} from 'lucide-react';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '@/lib/utils/storage';
import {
  getArenas,
  createArena,
  updateArena,
  deleteArena,
  toggleArenaStatus,
  finalizeArena,
  cancelArena,
  getAllGyms,
  type Arena,
} from '@/lib/actions/arena-actions';
import { sendArenaInvitations, getArenaInvitations, type ArenaInvitation } from '@/lib/actions/arena-invitation-actions';
import { ArenaDetail } from './ArenaDetail';

interface ArenasManagerProps {
  gymId?: string; // If provided, filters arenas for this gym + creates local arenas only
  isSuperadmin?: boolean;
}

const SCOPE_LABELS: Record<string, { label: string; icon: typeof Globe; color: string }> = {
  local: { label: 'Local', icon: MapPin, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  regional: { label: 'Regional', icon: Building2, color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  network: { label: 'Network', icon: Globe, color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
};

const SCORING_LABELS: Record<string, string> = {
  total_drops: '💧 Total Drops',
  days_visited: '📅 Days Visited',
  variety_score: '🎯 Machine Variety',
  streak_days: '🔥 Streak Days',
};

const OPT_IN_LABELS: Record<string, { label: string; description: string }> = {
  free: { label: 'Free', description: 'Anyone can join' },
  drops: { label: 'Drops', description: 'Pay drops to join' },
  streak: { label: 'Streak', description: 'Need N-day streak' },
  level: { label: 'Level', description: 'Need N total drops' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ArenasManager({ gymId, isSuperadmin }: ArenasManagerProps) {
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArena, setEditingArena] = useState<Arena | null>(null);
  const [viewingArena, setViewingArena] = useState<Arena | null>(null);
  const [allGyms, setAllGyms] = useState<Array<{ id: string; name: string }>>([]);

  // Invitation modal state
  const [inviteModal, setInviteModal] = useState<{ arenaId: string; arenaName: string } | null>(null);
  const [inviteGymIds, setInviteGymIds] = useState<string[]>([]);
  const [inviteRevenueShare, setInviteRevenueShare] = useState(0);
  const [inviteNote, setInviteNote] = useState('');
  const [sendingInvites, setSendingInvites] = useState(false);
  const [arenaInvitations, setArenaInvitations] = useState<ArenaInvitation[]>([]);

  // Sponsor logo upload state
  const [sponsorLogoPreview, setSponsorLogoPreview] = useState<string | null>(null);
  const [uploadingSponsorLogo, setUploadingSponsorLogo] = useState(false);

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
        const result = await uploadFile(file, 'images', 'sponsor-logos');
        setFormData((prev) => ({ ...prev, sponsor_logo: result.url }));
        setSponsorLogoPreview(result.url);
        toast.success('Sponsor logo uploaded');
      } catch (error: any) {
        toast.error(`Failed to upload logo: ${error.message}`);
      } finally {
        setUploadingSponsorLogo(false);
      }
    },
  });

  // Form state — non-superadmin defaults to 'local' scope
  const defaultScope = gymId || !isSuperadmin ? 'local' : 'network';
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    arena_scope: defaultScope as string,
    scoring_model: 'total_drops',
    sponsor_name: '',
    sponsor_logo: '',
    sponsor_contact_email: '',
    start_date: '',
    end_date: '',
    sponsor_fee_cents: 0,
    gym_ids: gymId ? [gymId] : [] as string[],
    prizes: [
      { rank: 1, prize: '' },
      { rank: 2, prize: '' },
      { rank: 3, prize: '' },
    ],
    // V2 fields
    opt_in_type: 'free' as string,
    opt_in_value: 0,
    card_color: '',
    card_text_color: '',
    card_gradient_end: '',
  });

  const loadArenas = useCallback(async () => {
    setLoading(true);
    const result = await getArenas({ gymId });
    if (result.success && result.data) {
      setArenas(result.data);
    }
    setLoading(false);
  }, [gymId]);

  const loadGyms = useCallback(async () => {
    const result = await getAllGyms();
    if (result.success && result.data) {
      setAllGyms(result.data);
    }
  }, []);

  useEffect(() => {
    loadArenas();
    loadGyms();
  }, [loadArenas, loadGyms]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      arena_scope: defaultScope,
      scoring_model: 'total_drops',
      sponsor_name: '',
      sponsor_logo: '',
      sponsor_contact_email: '',
      start_date: '',
      end_date: '',
      sponsor_fee_cents: 0,
      gym_ids: gymId ? [gymId] : [],
      prizes: [
        { rank: 1, prize: '' },
        { rank: 2, prize: '' },
        { rank: 3, prize: '' },
      ],
      opt_in_type: 'free',
      opt_in_value: 0,
      card_color: '',
      card_text_color: '',
      card_gradient_end: '',
    });
    setEditingArena(null);
    setSponsorLogoPreview(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (arena: Arena) => {
    setEditingArena(arena);
    setSponsorLogoPreview(arena.sponsor_logo || null);
    setFormData({
      name: arena.name,
      description: arena.description || '',
      arena_scope: arena.arena_scope,
      scoring_model: arena.scoring_model,
      sponsor_name: arena.sponsor_name,
      sponsor_logo: arena.sponsor_logo || '',
      sponsor_contact_email: arena.sponsor_contact_email || '',
      start_date: arena.start_date,
      end_date: arena.end_date,
      sponsor_fee_cents: arena.sponsor_fee_cents || 0,
      // Only populate direct gym links for local arenas.
      // Regional/network gyms are managed via the invitation flow — editing them
      // here would bypass invitation acceptance and re-link gyms directly.
      gym_ids: arena.arena_scope === 'local' ? (arena.gyms || []).map((g) => g.gym_id) : [],
      prizes: arena.prizes.length > 0
        ? arena.prizes
        : [{ rank: 1, prize: '' }, { rank: 2, prize: '' }, { rank: 3, prize: '' }],
      opt_in_type: arena.opt_in_type || 'free',
      opt_in_value: arena.opt_in_value || 0,
      card_color: arena.card_color || '',
      card_text_color: arena.card_text_color || '',
      card_gradient_end: arena.card_gradient_end || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Filter out empty prizes
    const validPrizes = formData.prizes.filter((p) => p.prize.trim());
    if (validPrizes.length === 0) {
      toast.error('At least one prize is required');
      return;
    }

    const formPayload = {
      name: formData.name,
      description: formData.description,
      arena_scope: formData.arena_scope as 'local' | 'regional' | 'network',
      scoring_model: formData.scoring_model as 'total_drops' | 'days_visited' | 'variety_score' | 'streak_days',
      sponsor_name: formData.sponsor_name,
      sponsor_logo: formData.sponsor_logo,
      sponsor_contact_email: formData.sponsor_contact_email,
      start_date: formData.start_date,
      end_date: formData.end_date,
      sponsor_fee_cents: formData.sponsor_fee_cents,
      gym_ids: formData.gym_ids,
      prizes: validPrizes,
      opt_in_type: formData.opt_in_type as 'free' | 'drops' | 'streak' | 'level',
      opt_in_value: formData.opt_in_type === 'free' ? 0 : formData.opt_in_value,
      card_color: formData.card_color || undefined,
      card_text_color: formData.card_text_color || undefined,
      card_gradient_end: formData.card_gradient_end || undefined,
    };

    try {
      if (editingArena) {
        const result = await updateArena(editingArena.id, formPayload);
        if (result.success) {
          toast.success('Arena updated successfully');
          loadArenas();
          setIsModalOpen(false);
          resetForm();
        } else {
          toast.error(result.error || 'Failed to update arena');
        }
      } else {
        const result = await createArena(formPayload);
        if (result.success) {
          toast.success('Arena created successfully');
          loadArenas();
          setIsModalOpen(false);
          resetForm();
        } else {
          toast.error(result.error || 'Failed to create arena');
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(errMsg);
    }
  };

  const handleDelete = async (arenaId: string) => {
    if (!(await confirmAction({ title: 'Delete Arena', message: 'Are you sure you want to delete this arena? This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' }))) return;
    const result = await deleteArena(arenaId);
    if (result.success) {
      setArenas(arenas.filter((a) => a.id !== arenaId));
      toast.success('Arena deleted');
    } else {
      toast.error(result.error || 'Failed to delete');
    }
  };

  const handleToggle = async (arenaId: string, currentStatus: boolean) => {
    const result = await toggleArenaStatus(arenaId, !currentStatus);
    if (result.success) {
      setArenas(arenas.map((a) => (a.id === arenaId ? { ...a, is_active: !currentStatus } : a)));
      toast.success(`Arena ${!currentStatus ? 'activated' : 'deactivated'}`);
    } else {
      toast.error(result.error || 'Failed to toggle status');
    }
  };

  const handleFinalize = async (arenaId: string) => {
    if (!(await confirmAction({ title: 'Finalize Arena', message: 'This will calculate final rankings and distribute prizes. This cannot be undone.', confirmLabel: 'Finalize', variant: 'warning' }))) return;
    const result = await finalizeArena(arenaId);
    if (result.success) {
      toast.success(`Arena finalized! ${result.winnersCount || 0} prize(s) distributed.`);
      loadArenas();
    } else {
      toast.error(result.error || 'Failed to finalize');
    }
  };

  const handleCancel = async (arenaId: string) => {
    if (!(await confirmAction({ title: 'Cancel Arena', message: 'All participants will be refunded if drops were paid. This cannot be undone.', confirmLabel: 'Cancel Arena', variant: 'danger' }))) return;
    const result = await cancelArena(arenaId);
    if (result.success) {
      toast.success(`Arena cancelled. ${result.participantsRefunded || 0} participant(s) refunded.`);
      loadArenas();
    } else {
      toast.error(result.error || 'Failed to cancel arena');
    }
  };

  const openInviteModal = async (arena: Arena) => {
    setInviteModal({ arenaId: arena.id, arenaName: arena.name });
    setInviteGymIds([]);
    setInviteRevenueShare(0);
    setInviteNote('');
    // Load existing invitations for this arena
    const result = await getArenaInvitations(arena.id);
    if (result.success && result.data) {
      setArenaInvitations(result.data);
    }
  };

  const handleSendInvitations = async () => {
    if (!inviteModal || inviteGymIds.length === 0) {
      toast.error('Select at least one gym');
      return;
    }
    setSendingInvites(true);
    const result = await sendArenaInvitations(
      inviteModal.arenaId,
      inviteGymIds,
      inviteRevenueShare,
      inviteNote || undefined
    );
    setSendingInvites(false);
    if (result.success) {
      toast.success(`${result.sentCount} invitation(s) sent!`);
      setInviteModal(null);
      loadArenas();
    } else {
      toast.error(result.error || 'Failed to send invitations');
    }
  };

  const updatePrize = (idx: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      prizes: prev.prizes.map((p, i) => (i === idx ? { ...p, prize: value } : p)),
    }));
  };

  const addPrize = () => {
    setFormData((prev) => ({
      ...prev,
      prizes: [...prev.prizes, { rank: prev.prizes.length + 1, prize: '' }],
    }));
  };

  const removePrize = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      prizes: prev.prizes.filter((_, i) => i !== idx).map((p, i) => ({ ...p, rank: i + 1 })),
    }));
  };

  const toggleGym = (gymIdToToggle: string) => {
    setFormData((prev) => ({
      ...prev,
      gym_ids: prev.gym_ids.includes(gymIdToToggle)
        ? prev.gym_ids.filter((id) => id !== gymIdToToggle)
        : [...prev.gym_ids, gymIdToToggle],
    }));
  };

  const getStatusInfo = (arena: Arena) => {
    if (arena.is_finalized) return { label: 'Finalized', color: 'bg-zinc-500/10 text-zinc-400' };
    if (!arena.is_active) return { label: 'Inactive', color: 'bg-[#808080]/10 text-[#808080]' };
    const now = new Date();
    const start = new Date(arena.start_date + 'T00:00:00');
    const end = new Date(arena.end_date + 'T23:59:59');
    if (now < start) return { label: 'Upcoming', color: 'bg-yellow-500/10 text-yellow-400' };
    if (now > end) return { label: 'Ended', color: 'bg-orange-500/10 text-orange-400' };
    return { label: 'Live', color: 'bg-emerald-500/10 text-emerald-400' };
  };

  // If viewing a specific arena, show its detail view
  if (viewingArena) {
    return (
      <ArenaDetail
        arena={viewingArena}
        isSuperadmin={!!isSuperadmin}
        viewingGymId={gymId}
        onBack={() => { setViewingArena(null); loadArenas(); }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Swords className="w-5 h-5 text-[#00E5FF]" />
            Sweat Arenas
          </h2>
          <p className="text-sm text-[#808080] mt-1">
            {gymId ? 'Local arena competitions for your gym' : 'Manage all sponsor-branded competitions'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Arena
        </button>
      </div>

      {/* Arenas List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-[#1A1A1A] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : arenas.length === 0 ? (
        <div className="text-center py-16 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl">
          <Swords className="w-16 h-16 text-[#333] mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Arenas Yet</h3>
          <p className="text-[#808080] text-sm mb-6">
            Create your first sponsor-branded competition to engage members.
          </p>
          <button
            onClick={openCreate}
            className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
          >
            Create First Arena
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {arenas.map((arena) => {
            const status = getStatusInfo(arena);
            const ScopeInfo = SCOPE_LABELS[arena.arena_scope] || SCOPE_LABELS.local;
            const ScopeIcon = ScopeInfo.icon;

            return (
              <div
                key={arena.id}
                className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden hover:border-[#333] transition-colors"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-white truncate">{arena.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${ScopeInfo.color}`}>
                          <ScopeIcon className="w-3 h-3 inline mr-1" />
                          {ScopeInfo.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </div>

                      {arena.description && (
                        <p className="text-sm text-[#808080] mb-3 line-clamp-2">{arena.description}</p>
                      )}

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-[#808080]">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {arena.sponsor_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(arena.start_date)} — {formatDate(arena.end_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {arena.participant_count || 0} participants
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {arena.gym_count || 0} gym{(arena.gym_count || 0) !== 1 ? 's' : ''}
                        </span>
                        <span>{SCORING_LABELS[arena.scoring_model] || arena.scoring_model}</span>
                        {arena.opt_in_type && arena.opt_in_type !== 'free' && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <Lock className="w-3 h-3" />
                            {OPT_IN_LABELS[arena.opt_in_type]?.label || arena.opt_in_type}: {arena.opt_in_value}
                          </span>
                        )}
                      </div>

                      {/* Prizes Preview */}
                      {arena.prizes && arena.prizes.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {arena.prizes.slice(0, 3).map((p, idx) => (
                            <span
                              key={idx}
                              className="text-xs bg-[#1A1A1A] border border-[#333] text-white px-2 py-1 rounded"
                            >
                              <Trophy className="w-3 h-3 inline mr-1 text-amber-400" />
                              #{p.rank}: {p.prize}
                            </span>
                          ))}
                          {arena.prizes.length > 3 && (
                            <span className="text-xs text-[#808080]">
                              +{arena.prizes.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 ml-4 shrink-0">
                      <button
                        onClick={() => setViewingArena(arena)}
                        className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                        title="View Leaderboard"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {/* Edit: superadmin can edit any, gym_owner/gym_admin only local */}
                      {!arena.is_finalized && (isSuperadmin || arena.arena_scope === 'local') && (
                        <button
                          onClick={() => openEdit(arena)}
                          className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {/* Toggle: superadmin can toggle any, gym_owner/gym_admin only local */}
                      {!arena.is_finalized && (isSuperadmin || arena.arena_scope === 'local') && (
                        <button
                          onClick={() => handleToggle(arena.id, arena.is_active)}
                          className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                          title={arena.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power className={`w-4 h-4 ${arena.is_active ? 'text-[#00E5FF]' : ''}`} />
                        </button>
                      )}
                      {isSuperadmin && !arena.is_finalized && arena.arena_scope !== 'local' && (
                        <button
                          onClick={() => openInviteModal(arena)}
                          className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                          title="Invite Gyms"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                      {isSuperadmin && !arena.is_finalized && (
                        <button
                          onClick={() => handleFinalize(arena.id)}
                          className="p-2 text-[#808080] hover:text-amber-400 transition-colors"
                          title="Finalize & Distribute Prizes"
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                      )}
                      {isSuperadmin && !arena.is_finalized && arena.is_active && (
                        <button
                          onClick={() => handleCancel(arena.id)}
                          className="p-2 text-[#808080] hover:text-orange-400 transition-colors"
                          title="Cancel Arena (refund participants)"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                      {isSuperadmin && (
                        <button
                          onClick={() => handleDelete(arena.id)}
                          className="p-2 text-[#808080] hover:text-[#FF5252] transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Invitation Modal */}
      {inviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                Invite Gyms — {inviteModal.arenaName}
              </h2>
              <button
                onClick={() => setInviteModal(null)}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Existing Invitations */}
            {arenaInvitations.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-[#808080] mb-2">Existing Invitations</h3>
                <div className="space-y-2">
                  {arenaInvitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between bg-[#1A1A1A] rounded-lg px-3 py-2"
                    >
                      <span className="text-sm text-white">{inv.gym_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        inv.status === 'accepted'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : inv.status === 'declined'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}>
                        {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Select Gyms */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-white mb-2">
                Select Gyms to Invite ({inviteGymIds.length} selected)
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                {allGyms
                  .filter((g) => !arenaInvitations.some((inv) => inv.invited_gym_id === g.id))
                  .map((gym) => (
                    <label
                      key={gym.id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border transition-colors ${
                        inviteGymIds.includes(gym.id)
                          ? 'bg-[#00E5FF]/10 border-[#00E5FF]/30 text-white'
                          : 'bg-[#1A1A1A] border-[#1A1A1A] text-[#808080] hover:border-[#333]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={inviteGymIds.includes(gym.id)}
                        onChange={() => {
                          setInviteGymIds((prev) =>
                            prev.includes(gym.id) ? prev.filter((id) => id !== gym.id) : [...prev, gym.id]
                          );
                        }}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        inviteGymIds.includes(gym.id) ? 'bg-[#00E5FF] border-[#00E5FF]' : 'border-[#555]'
                      }`}>
                        {inviteGymIds.includes(gym.id) && (
                          <svg className="w-3 h-3 text-black" viewBox="0 0 12 12">
                            <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm truncate">{gym.name}</span>
                    </label>
                  ))}
              </div>
            </div>

            {/* Revenue Share */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-[#808080] mb-1">Revenue Share %</label>
                <input
                  type="number"
                  value={inviteRevenueShare}
                  onChange={(e) => setInviteRevenueShare(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs text-[#808080] mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value)}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="Revenue terms..."
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={handleSendInvitations}
                disabled={sendingInvites || inviteGymIds.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sendingInvites ? 'Sending...' : `Send ${inviteGymIds.length} Invitation${inviteGymIds.length !== 1 ? 's' : ''}`}
              </button>
              <button
                onClick={() => setInviteModal(null)}
                className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {editingArena ? 'Edit Arena' : 'Create New Arena'}
              </h2>
              <button
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Arena Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="Nike Summer Shred Challenge"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none resize-none"
                  placeholder="A network-wide competition..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Scope */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Scope *</label>
                  <select
                    value={formData.arena_scope}
                    onChange={(e) => {
                      const newScope = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        arena_scope: newScope,
                        // Clear direct gym links when switching to non-local scope —
                        // those scopes require the invitation flow, not direct linking.
                        gym_ids: newScope !== 'local' ? [] : prev.gym_ids,
                      }));
                    }}
                    disabled={!!gymId || !isSuperadmin} // Only superadmin can set non-local scope
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none disabled:opacity-50"
                  >
                    <option value="local">Local (1 gym)</option>
                    <option value="regional">Regional (3-5 gyms)</option>
                    <option value="network">Network (all gyms)</option>
                  </select>
                </div>

                {/* Scoring Model */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Scoring *</label>
                  <select
                    value={formData.scoring_model}
                    onChange={(e) => setFormData({ ...formData, scoring_model: e.target.value })}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="total_drops">Total Drops</option>
                    <option value="days_visited">Days Visited</option>
                    <option value="variety_score">Machine Variety</option>
                    <option value="streak_days">Streak Days</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Start Date *</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    required
                  />
                </div>
                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">End Date *</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Sponsor Section */}
              <div className="border-t border-[#1A1A1A] pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-[#808080]" />
                  <h3 className="text-sm font-medium text-white">Sponsor Details</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Sponsor Name *</label>
                    <input
                      type="text"
                      value={formData.sponsor_name}
                      onChange={(e) => setFormData({ ...formData, sponsor_name: e.target.value })}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      placeholder="Nike"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={formData.sponsor_contact_email}
                      onChange={(e) => setFormData({ ...formData, sponsor_contact_email: e.target.value })}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      placeholder="sponsor@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Sponsor Logo</label>
                    <div
                      {...sponsorLogoDropzone.getRootProps()}
                      className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                        sponsorLogoDropzone.isDragActive
                          ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                          : 'border-[#333] hover:border-[#00E5FF]/50'
                      }`}
                    >
                      <input {...sponsorLogoDropzone.getInputProps()} />
                      {sponsorLogoPreview ? (
                        <div className="flex items-center justify-center gap-3">
                          <img src={sponsorLogoPreview} alt="Sponsor logo" className="h-8 object-contain" />
                          <span className="text-xs text-[#808080]">Click to replace</span>
                        </div>
                      ) : uploadingSponsorLogo ? (
                        <p className="text-xs text-[#00E5FF]">Uploading...</p>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <Upload className="w-3 h-3 text-[#808080]" />
                          <p className="text-xs text-[#808080]">Drop logo or click</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Sponsor Fee (cents)</label>
                    <input
                      type="number"
                      value={formData.sponsor_fee_cents}
                      onChange={(e) => setFormData({ ...formData, sponsor_fee_cents: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      min={0}
                    />
                  </div>
                </div>
              </div>

              {/* Prizes */}
              <div className="border-t border-[#1A1A1A] pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-medium text-white">Prizes *</h3>
                  </div>
                  <button
                    type="button"
                    onClick={addPrize}
                    className="text-xs text-[#00E5FF] hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Prize
                  </button>
                </div>
                <div className="space-y-3">
                  {formData.prizes.map((prize, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-sm text-[#808080] w-6 text-center font-mono">#{prize.rank}</span>
                      <input
                        type="text"
                        value={prize.prize}
                        onChange={(e) => updatePrize(idx, e.target.value)}
                        className="flex-1 px-4 py-2.5 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none text-sm"
                        placeholder={`Prize for rank #${prize.rank}`}
                      />
                      {formData.prizes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePrize(idx)}
                          className="p-1.5 text-[#808080] hover:text-[#FF5252] transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Opt-In Requirements */}
              <div className="border-t border-[#1A1A1A] pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <Lock className="w-4 h-4 text-[#808080]" />
                  <h3 className="text-sm font-medium text-white">Opt-In Requirements</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Requirement Type</label>
                    <select
                      value={formData.opt_in_type}
                      onChange={(e) => setFormData({ ...formData, opt_in_type: e.target.value, opt_in_value: e.target.value === 'free' ? 0 : formData.opt_in_value })}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    >
                      <option value="free">Free — Anyone can join</option>
                      <option value="drops">Drops — Pay drops to join</option>
                      <option value="streak">Streak — Need N-day streak</option>
                      <option value="level">Level — Need N total drops</option>
                    </select>
                  </div>
                  {formData.opt_in_type !== 'free' && (
                    <div>
                      <label className="block text-xs text-[#808080] mb-1">
                        {formData.opt_in_type === 'drops' ? 'Drops to Pay' :
                         formData.opt_in_type === 'streak' ? 'Min Streak Days' :
                         'Min Total Drops'}
                      </label>
                      <input
                        type="number"
                        value={formData.opt_in_value}
                        onChange={(e) => setFormData({ ...formData, opt_in_value: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                        min={1}
                        placeholder="e.g. 50"
                      />
                    </div>
                  )}
                </div>
                {formData.opt_in_type !== 'free' && (
                  <p className="text-xs text-[#808080] mt-2">
                    {formData.opt_in_type === 'drops'
                      ? `Users pay ${formData.opt_in_value || 0} drops to join. Refunded if arena is cancelled.`
                      : formData.opt_in_type === 'streak'
                      ? `Users must have at least a ${formData.opt_in_value || 0}-day streak to join.`
                      : `Users must have at least ${formData.opt_in_value || 0} total drops (reputation level).`
                    }
                  </p>
                )}
              </div>

              {/* Arena Card Branding */}
              <div className="border-t border-[#1A1A1A] pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <Palette className="w-4 h-4 text-[#808080]" />
                  <h3 className="text-sm font-medium text-white">Card Branding</h3>
                  <span className="text-xs text-[#808080]">(optional)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Card Color</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={formData.card_color || '#00E5FF'}
                        onChange={(e) => setFormData({ ...formData, card_color: e.target.value })}
                        className="w-10 h-10 rounded border border-[#333] bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.card_color}
                        onChange={(e) => setFormData({ ...formData, card_color: e.target.value })}
                        className="flex-1 px-3 py-2.5 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none text-sm"
                        placeholder="#00E5FF"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Text Color</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={formData.card_text_color || '#FFFFFF'}
                        onChange={(e) => setFormData({ ...formData, card_text_color: e.target.value })}
                        className="w-10 h-10 rounded border border-[#333] bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.card_text_color}
                        onChange={(e) => setFormData({ ...formData, card_text_color: e.target.value })}
                        className="flex-1 px-3 py-2.5 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none text-sm"
                        placeholder="#FFFFFF"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[#808080] mb-1">Gradient End</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={formData.card_gradient_end || '#1A1A1A'}
                        onChange={(e) => setFormData({ ...formData, card_gradient_end: e.target.value })}
                        className="w-10 h-10 rounded border border-[#333] bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.card_gradient_end}
                        onChange={(e) => setFormData({ ...formData, card_gradient_end: e.target.value })}
                        className="flex-1 px-3 py-2.5 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none text-sm"
                        placeholder="optional"
                      />
                    </div>
                  </div>
                </div>
                {/* Live Preview Mini */}
                {(formData.card_color || formData.card_gradient_end) && (
                  <div className="mt-4">
                    <p className="text-xs text-[#808080] mb-2">Preview:</p>
                    <div
                      className="rounded-lg p-4 border border-white/10"
                      style={{
                        background: formData.card_gradient_end
                          ? `linear-gradient(135deg, ${formData.card_color || '#00E5FF'}, ${formData.card_gradient_end})`
                          : formData.card_color || '#00E5FF',
                        color: formData.card_text_color || '#FFFFFF',
                      }}
                    >
                      <p className="text-sm font-bold">{formData.name || 'Arena Name'}</p>
                      <p className="text-xs opacity-80 mt-1">{formData.sponsor_name || 'Sponsor'} • {formData.scoring_model}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Participating Gyms */}
              {!gymId && allGyms.length > 0 && (
                <div className="border-t border-[#1A1A1A] pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-4 h-4 text-[#808080]" />
                    <h3 className="text-sm font-medium text-white">Participating Gyms</h3>
                    {formData.arena_scope === 'local' && (
                      <span className="text-xs text-[#808080]">({formData.gym_ids.length} selected)</span>
                    )}
                  </div>

                  {formData.arena_scope === 'local' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {allGyms.map((gym) => (
                        <label
                          key={gym.id}
                          className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border transition-colors ${
                            formData.gym_ids.includes(gym.id)
                              ? 'bg-[#00E5FF]/10 border-[#00E5FF]/30 text-white'
                              : 'bg-[#1A1A1A] border-[#1A1A1A] text-[#808080] hover:border-[#333]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.gym_ids.includes(gym.id)}
                            onChange={() => toggleGym(gym.id)}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                            formData.gym_ids.includes(gym.id)
                              ? 'bg-[#00E5FF] border-[#00E5FF]'
                              : 'border-[#555]'
                          }`}>
                            {formData.gym_ids.includes(gym.id) && (
                              <svg className="w-3 h-3 text-black" viewBox="0 0 12 12">
                                <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none" />
                              </svg>
                            )}
                          </div>
                          <span className="text-sm truncate">{gym.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                      <Send className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm text-blue-300 font-medium mb-1">Use the invitation flow to add gyms</p>
                        <p className="text-xs text-[#808080]">
                          For {formData.arena_scope === 'regional' ? 'regional' : 'network'} arenas, gyms must be invited and accept before they appear in the arena.
                          After creating this arena, use the <span className="text-white font-medium">Invite Gyms</span> button (
                          <Send className="w-3 h-3 inline text-[#808080]" />) on the arena card to send invitations.
                          Gyms are added to <code className="text-[#00E5FF] text-xs">arena_gyms</code> only after they accept.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
                >
                  {editingArena ? 'Save Changes' : 'Create Arena'}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); resetForm(); }}
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
