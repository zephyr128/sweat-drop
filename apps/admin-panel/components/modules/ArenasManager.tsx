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
} from 'lucide-react';
import {
  getArenas,
  createArena,
  updateArena,
  deleteArena,
  toggleArenaStatus,
  finalizeArena,
  getAllGyms,
  type Arena,
} from '@/lib/actions/arena-actions';
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

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    arena_scope: gymId ? 'local' : 'network' as string,
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
      arena_scope: gymId ? 'local' : 'network',
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
    });
    setEditingArena(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (arena: Arena) => {
    setEditingArena(arena);
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
      gym_ids: (arena.gyms || []).map((g) => g.gym_id),
      prizes: arena.prizes.length > 0
        ? arena.prizes
        : [{ rank: 1, prize: '' }, { rank: 2, prize: '' }, { rank: 3, prize: '' }],
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

    try {
      if (editingArena) {
        const result = await updateArena(editingArena.id, {
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
        });
        if (result.success) {
          toast.success('Arena updated successfully');
          loadArenas();
          setIsModalOpen(false);
          resetForm();
        } else {
          toast.error(result.error || 'Failed to update arena');
        }
      } else {
        const result = await createArena({
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
        });
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
    if (!confirm('Are you sure you want to delete this arena? This cannot be undone.')) return;
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
    if (!confirm('Finalize this arena? This will calculate final rankings and distribute prizes.')) return;
    const result = await finalizeArena(arenaId);
    if (result.success) {
      toast.success(`Arena finalized! ${result.winnersCount || 0} prize(s) distributed.`);
      loadArenas();
    } else {
      toast.error(result.error || 'Failed to finalize');
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
                      {!arena.is_finalized && (
                        <button
                          onClick={() => openEdit(arena)}
                          className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {!arena.is_finalized && (
                        <button
                          onClick={() => handleToggle(arena.id, arena.is_active)}
                          className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                          title={arena.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power className={`w-4 h-4 ${arena.is_active ? 'text-[#00E5FF]' : ''}`} />
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

              <div className="grid grid-cols-2 gap-4">
                {/* Scope */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Scope *</label>
                  <select
                    value={formData.arena_scope}
                    onChange={(e) => setFormData({ ...formData, arena_scope: e.target.value })}
                    disabled={!!gymId} // Gym owners can only create local
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

              <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-4">
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
                    <label className="block text-xs text-[#808080] mb-1">Logo URL</label>
                    <input
                      type="url"
                      value={formData.sponsor_logo}
                      onChange={(e) => setFormData({ ...formData, sponsor_logo: e.target.value })}
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                      placeholder="https://..."
                    />
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

              {/* Participating Gyms */}
              {!gymId && allGyms.length > 0 && (
                <div className="border-t border-[#1A1A1A] pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-4 h-4 text-[#808080]" />
                    <h3 className="text-sm font-medium text-white">Participating Gyms</h3>
                    <span className="text-xs text-[#808080]">({formData.gym_ids.length} selected)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
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
