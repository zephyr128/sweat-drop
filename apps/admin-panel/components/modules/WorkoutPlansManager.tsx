'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { 
  deleteWorkoutPlan,
  toggleWorkoutPlanStatus,
  saveWorkoutPlan
} from '@/lib/actions/workout-plan-actions';
import { X, Trash2, Power, Plus, Edit2, ChevronUp, ChevronDown, Save } from 'lucide-react';

interface WorkoutPlan {
  id: string;
  name: string;
  description: string | null;
  access_level: string;
  access_type: string;
  price: number;
  currency: string;
  difficulty_level: string | null;
  estimated_duration_minutes: number | null;
  category: string | null;
  is_active: boolean;
  items?: WorkoutPlanItem[];
}

interface WorkoutPlanItem {
  id: string;
  plan_id: string;
  order_index: number;
  exercise_name: string;
  exercise_description: string | null;
  target_machine_type: string;
  target_metric: string;
  target_value: number;
  target_unit: string | null;
  rest_seconds: number;
  sets: number;
  instruction_video_url: string | null;
  target_machine_id: string | null;
}

interface Machine {
  id: string;
  name: string;
  type: string;
}

interface WorkoutPlansManagerProps {
  gymId: string;
  initialPlans: WorkoutPlan[];
  machines: Machine[];
}

interface PlanFormData {
  id?: string;
  name: string;
  description: string;
  access_type: 'free' | 'membership_required' | 'paid_one_time';
  price: number;
  currency: string;
  items: Omit<WorkoutPlanItem, 'id' | 'plan_id'>[];
}

export function WorkoutPlansManager({ gymId, initialPlans, machines }: WorkoutPlansManagerProps) {
  const [plans, setPlans] = useState<WorkoutPlan[]>(initialPlans);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<PlanFormData>({
    name: '',
    description: '',
    access_type: 'free',
    price: 0,
    currency: 'USD',
    items: [],
  });

  const openCreateDialog = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      description: '',
      access_type: 'free',
      price: 0,
      currency: 'USD',
      items: [],
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (plan: WorkoutPlan) => {
    setEditingPlan(plan);
    setFormData({
      id: plan.id,
      name: plan.name,
      description: plan.description || '',
      access_type: plan.access_type as 'free' | 'membership_required' | 'paid_one_time',
      price: plan.price || 0,
      currency: plan.currency || 'USD',
      items: (plan.items || []).sort((a, b) => a.order_index - b.order_index).map(item => ({
        order_index: item.order_index,
        exercise_name: item.exercise_name,
        exercise_description: item.exercise_description || '',
        target_machine_type: item.target_machine_type,
        target_metric: item.target_metric,
        target_value: item.target_value,
        target_unit: item.target_unit || '',
        rest_seconds: item.rest_seconds || 0,
        sets: item.sets || 1,
        instruction_video_url: item.instruction_video_url || '',
        target_machine_id: item.target_machine_id || null,
      })),
    });
    setIsDialogOpen(true);
  };

  const addItem = () => {
    const newOrderIndex = formData.items.length;
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          order_index: newOrderIndex,
          exercise_name: '',
          exercise_description: '',
          target_machine_type: 'bike',
          target_metric: 'time',
          target_value: 0,
          target_unit: '',
          rest_seconds: 0,
          sets: 1,
          instruction_video_url: '',
          target_machine_id: null,
        },
      ],
    });
  };

  const removeItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    // Recalculate order_index
    const reorderedItems = newItems.map((item, i) => ({
      ...item,
      order_index: i,
    }));
    setFormData({
      ...formData,
      items: reorderedItems,
    });
  };

  const moveItemUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...formData.items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    // Recalculate order_index
    const reorderedItems = newItems.map((item, i) => ({
      ...item,
      order_index: i,
    }));
    setFormData({
      ...formData,
      items: reorderedItems,
    });
  };

  const moveItemDown = (index: number) => {
    if (index === formData.items.length - 1) return;
    const newItems = [...formData.items];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    // Recalculate order_index
    const reorderedItems = newItems.map((item, i) => ({
      ...item,
      order_index: i,
    }));
    setFormData({
      ...formData,
      items: reorderedItems,
    });
  };

  const updateItem = (index: number, field: keyof WorkoutPlanItem, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = {
      ...newItems[index],
      [field]: value,
    };
    setFormData({
      ...formData,
      items: newItems,
    });
  };

  const handleSave = async () => {
    // Validation
    if (!formData.name.trim()) {
      toast.error('Plan name is required');
      return;
    }

    if (formData.access_type === 'paid_one_time' && formData.price <= 0) {
      toast.error('Price must be greater than 0 for paid plans');
      return;
    }

    if (formData.items.length === 0) {
      toast.error('At least one exercise is required');
      return;
    }

    for (let i = 0; i < formData.items.length; i++) {
      const item = formData.items[i];
      if (!item.exercise_name.trim()) {
        toast.error(`Exercise name is required for item ${i + 1}`);
        return;
      }
      if (item.target_value <= 0) {
        toast.error(`Target value must be greater than 0 for item ${i + 1}`);
        return;
      }
    }

    setSaving(true);

    try {
      // Call server action
      const result = await saveWorkoutPlan({
        id: editingPlan?.id,
        gymId,
        name: formData.name,
        description: formData.description,
        access_type: formData.access_type,
        price: formData.price,
        currency: formData.currency,
        items: formData.items.map(item => ({
          order_index: item.order_index,
          exercise_name: item.exercise_name,
          exercise_description: (item.exercise_description ?? undefined) as string | undefined,
          target_machine_type: item.target_machine_type as 'treadmill' | 'bike',
          target_metric: item.target_metric,
          target_value: item.target_value,
          target_unit: (item.target_unit ?? undefined) as string | undefined,
          rest_seconds: item.rest_seconds,
          sets: item.sets,
          instruction_video_url: (item.instruction_video_url ?? undefined) as string | undefined,
          target_machine_id: item.target_machine_id ?? undefined,
        })),
      });

      if (result.success) {
        // Type guard: check if result has 'data' property (success case)
        if (!('data' in result) || !result.data) {
          toast.error('Failed to save workout plan: No data returned');
          return;
        }
        
        // Refresh plans list
        const updatedPlan = result.data as WorkoutPlan;
        
        if (editingPlan) {
          // Update existing plan in list
          setPlans(plans.map(p => p.id === editingPlan.id ? updatedPlan : p));
          toast.success('Workout plan updated successfully');
        } else {
          // Add new plan to list
          setPlans([updatedPlan, ...plans]);
          toast.success('Workout plan created successfully');
        }

        setIsDialogOpen(false);
        setEditingPlan(null);
      } else {
        toast.error(result.error || 'Failed to save workout plan');
      }
    } catch (error: any) {
      console.error('[WorkoutPlansManager] Error saving plan:', error);
      toast.error(error.message || 'Failed to save workout plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this workout plan?')) return;

    setDeletingId(planId);
    try {
      const result = await deleteWorkoutPlan(planId, gymId);
      if (result.success) {
        setPlans(plans.filter(p => p.id !== planId));
        toast.success('Workout plan deleted successfully');
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (planId: string, currentStatus: boolean) => {
    try {
      const result = await toggleWorkoutPlanStatus(planId, gymId, !currentStatus);
      if (result.success) {
        setPlans(plans.map(p => p.id === planId ? { ...p, is_active: !currentStatus } : p));
        toast.success(`Plan ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      } else {
        toast.error(`Failed to update status: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      RSD: 'din',
    };
    const symbol = symbols[currency] || currency;
    return `${symbol}${amount.toFixed(2)}`;
  };

  const getAccessTypeBadge = (accessType: string) => {
    const badges = {
      free: { label: 'Free', className: 'bg-[#00E5FF]/10 text-[#00E5FF]' },
      membership_required: { label: 'Membership', className: 'bg-[#FFA500]/10 text-[#FFA500]' },
      paid_one_time: { label: 'Paid', className: 'bg-[#4CAF50]/10 text-[#4CAF50]' },
    };
    return badges[accessType as keyof typeof badges] || badges.free;
  };

  // Filter machines by type
  const getMachinesByType = (type: string) => {
    return machines.filter(m => m.type === type);
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex justify-end">
        <button
          onClick={openCreateDialog}
          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Plan
        </button>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.length === 0 ? (
          <div className="col-span-full bg-[#121212] border border-[#1A1A1A] rounded-xl p-12 text-center">
            <p className="text-[#808080]">No workout plans yet. Create your first plan!</p>
          </div>
        ) : (
          plans.map((plan) => {
            const badge = getAccessTypeBadge(plan.access_type);
            return (
              <div
                key={plan.id}
                className="bg-[#121212] border border-[#1A1A1A] rounded-xl overflow-hidden hover:border-[#00E5FF]/30 transition-colors"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      {plan.description && (
                        <p className="text-sm text-[#808080] mb-3 line-clamp-2">{plan.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <button
                        onClick={() => openEditDialog(plan)}
                        className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(plan.id, plan.is_active)}
                        className={`p-2 transition-colors ${
                          plan.is_active ? 'text-[#00E5FF]' : 'text-[#808080] hover:text-[#808080]'
                        }`}
                        title={plan.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeletePlan(plan.id)}
                        disabled={deletingId === plan.id}
                        className="p-2 text-[#808080] hover:text-[#FF5252] transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Price */}
                  {plan.access_type === 'paid_one_time' && plan.price > 0 && (
                    <div className="mb-4">
                      <p className="text-2xl font-bold text-white">
                        {formatCurrency(plan.price, plan.currency)}
                      </p>
                    </div>
                  )}

                  {/* Exercises Count */}
                  <div className="flex items-center gap-2 text-sm text-[#808080]">
                    <span>{plan.items?.length || 0} exercises</span>
                    {plan.estimated_duration_minutes && (
                      <>
                        <span>•</span>
                        <span>{plan.estimated_duration_minutes} min</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create/Edit Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#121212] border border-[#1A1A1A] rounded-xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {editingPlan ? 'Edit Workout Plan' : 'Create Workout Plan'}
              </h2>
              <button
                onClick={() => setIsDialogOpen(false)}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Plan Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="e.g., Achilles Fat Burner"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none resize-none"
                    placeholder="Optional description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Access Type *
                  </label>
                  <select
                    value={formData.access_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        access_type: e.target.value as 'free' | 'membership_required' | 'paid_one_time',
                        price: e.target.value === 'paid_one_time' ? formData.price : 0,
                      })
                    }
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="free">Free</option>
                    <option value="membership_required">Membership Required</option>
                    <option value="paid_one_time">Paid One-Time</option>
                  </select>
                </div>

                {/* POS Fields - Only show for paid_one_time */}
                {formData.access_type === 'paid_one_time' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Price *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={formData.price}
                        onChange={(e) =>
                          setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Currency *
                      </label>
                      <select
                        value={formData.currency}
                        onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                        className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="RSD">RSD (din)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Exercises Sequencer */}
              <div className="border-t border-[#1A1A1A] pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Exercises</h3>
                  <button
                    onClick={addItem}
                    className="px-4 py-2 bg-[#1A1A1A] text-[#00E5FF] rounded-lg hover:bg-[#2A2A2A] transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Exercise
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.items.length === 0 ? (
                    <p className="text-sm text-[#808080] text-center py-8">
                      No exercises added. Click &quot;Add Exercise&quot; to get started.
                    </p>
                  ) : (
                    formData.items.map((item, index) => (
                      <div
                        key={index}
                        className="bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg p-4"
                      >
                        <div className="flex items-start gap-4">
                          {/* Sequencer Controls */}
                          <div className="flex flex-col gap-1 pt-2">
                            <button
                              onClick={() => moveItemUp(index)}
                              disabled={index === 0}
                              className="p-1 text-[#808080] hover:text-[#00E5FF] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => moveItemDown(index)}
                              disabled={index === formData.items.length - 1}
                              className="p-1 text-[#808080] hover:text-[#00E5FF] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Item Form */}
                          <div className="flex-1 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-[#808080] mb-1">
                                  Exercise Name *
                                </label>
                                <input
                                  type="text"
                                  value={item.exercise_name}
                                  onChange={(e) => updateItem(index, 'exercise_name', e.target.value)}
                                  className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                                  placeholder="e.g., Bike Warm-up"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-[#808080] mb-1">
                                  Machine Type *
                                </label>
                                <select
                                  value={item.target_machine_type}
                                  onChange={(e) => updateItem(index, 'target_machine_type', e.target.value)}
                                  className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
                                >
                                  <option value="bike">Bike</option>
                                  <option value="treadmill">Treadmill</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-[#808080] mb-1">
                                  Target Value *
                                </label>
                                <input
                                  type="number"
                                  step="0.1"
                                  min={0.1}
                                  value={item.target_value}
                                  onChange={(e) =>
                                    updateItem(index, 'target_value', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                                  placeholder="30"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-[#808080] mb-1">
                                  Unit
                                </label>
                                <input
                                  type="text"
                                  value={item.target_unit ?? ''}
                                  onChange={(e) => updateItem(index, 'target_unit', e.target.value || null)}
                                  className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                                  placeholder="min, km, reps"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-[#808080] mb-1">
                                  Machine
                                </label>
                                <select
                                  value={item.target_machine_id || ''}
                                  onChange={(e) =>
                                    updateItem(index, 'target_machine_id', e.target.value || null)
                                  }
                                  className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
                                >
                                  <option value="">Any {item.target_machine_type}</option>
                                  {getMachinesByType(item.target_machine_type).map((machine) => (
                                    <option key={machine.id} value={machine.id}>
                                      {machine.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-[#808080] mb-1">
                                Instruction Video URL
                              </label>
                              <input
                                type="url"
                                value={item.instruction_video_url ?? ''}
                                onChange={(e) => updateItem(index, 'instruction_video_url', e.target.value || null)}
                                className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                                placeholder="https://youtube.com/watch?v=..."
                              />
                            </div>
                          </div>

                          {/* Remove Button */}
                          <button
                            onClick={() => removeItem(index)}
                            className="p-2 text-[#808080] hover:text-[#FF5252] transition-colors"
                            title="Remove exercise"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Dialog Actions */}
              <div className="flex gap-4 pt-6 border-t border-[#1A1A1A]">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {saving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                </button>
                <button
                  onClick={() => setIsDialogOpen(false)}
                  className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
