'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { 
  createWorkoutPlan, 
  createWorkoutPlanItem,
  updateWorkoutPlanItem,
  deleteWorkoutPlan,
  deleteWorkoutPlanItem,
  toggleWorkoutPlanStatus 
} from '@/lib/actions/workout-plan-actions';
import { X, Trash2, Power, Plus, Edit2 } from 'lucide-react';

const planSchema = z.object({
  name: z.string().min(1, 'Plan name is required'),
  description: z.string().optional(),
  access_level: z.enum(['public', 'private', 'gym_members_only']).default('gym_members_only'),
  price: z.number().min(0).optional(),
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  estimated_duration_minutes: z.number().int().positive().optional(),
  category: z.string().optional(),
});

const itemSchema = z.object({
  exercise_name: z.string().min(1, 'Exercise name is required'),
  exercise_description: z.string().optional(),
  target_machine_type: z.enum(['treadmill', 'bike']),
  target_metric: z.enum(['time', 'reps', 'distance', 'rpm', 'custom']),
  target_value: z.number().positive(),
  target_unit: z.string().optional(),
  rest_seconds: z.number().int().min(0).optional(),
  sets: z.number().int().positive().optional(),
  target_machine_id: z.string().optional(),
});

type PlanFormData = z.infer<typeof planSchema>;
type ItemFormData = z.infer<typeof itemSchema>;

interface WorkoutPlan {
  id: string;
  name: string;
  description: string | null;
  access_level: string;
  price: number;
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

export function WorkoutPlansManager({ gymId, initialPlans, machines }: WorkoutPlansManagerProps) {
  const [plans, setPlans] = useState<WorkoutPlan[]>(initialPlans);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WorkoutPlanItem | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const planForm = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      access_level: 'gym_members_only',
      price: 0,
      difficulty_level: 'beginner',
    },
  });

  const itemForm = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      target_machine_type: 'bike',
      target_metric: 'time',
      rest_seconds: 0,
      sets: 1,
    },
  });

  const onSubmitPlan = async (data: PlanFormData) => {
    try {
      const result = await createWorkoutPlan({
        ...data,
        gymId,
      });

      if (result.success && result.data) {
        setPlans([result.data as WorkoutPlan, ...plans]);
        toast.success('Workout plan created successfully');
        planForm.reset();
        setIsPlanModalOpen(false);
      } else {
        toast.error(`Failed to create plan: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const onSubmitItem = async (data: ItemFormData) => {
    if (!selectedPlanId) return;

    try {
      if (editingItem) {
        // Update existing item
        const result = await updateWorkoutPlanItem({
          id: editingItem.id,
          ...data,
          target_machine_id: data.target_machine_id || undefined,
        });

        if (result.success && result.data) {
          // Update item in plans
          setPlans(plans.map(p => 
            p.id === selectedPlanId 
              ? { 
                  ...p, 
                  items: (p.items || []).map(item => 
                    item.id === editingItem.id ? (result as { success: boolean; data?: WorkoutPlanItem; error?: string }).data as WorkoutPlanItem : item
                  )
                }
              : p
          ));
          toast.success('Exercise updated successfully');
          itemForm.reset();
          setIsItemModalOpen(false);
          setEditingItem(null);
        } else {
          toast.error(`Failed to update exercise: ${result.error}`);
        }
      } else {
        // Create new item
        const selectedPlan = plans.find(p => p.id === selectedPlanId);
        const nextOrderIndex = selectedPlan?.items?.length || 0;

        const result = await createWorkoutPlanItem({
          ...data,
          plan_id: selectedPlanId,
          order_index: nextOrderIndex,
          target_machine_id: data.target_machine_id || undefined,
        });

        if (result.success && result.data) {
          // Refresh plans to get updated items
          setPlans(plans.map(p => 
            p.id === selectedPlanId 
              ? { ...p, items: [...(p.items || []), result.data as WorkoutPlanItem] }
              : p
          ));
          toast.success('Exercise added to plan successfully');
          itemForm.reset();
          setIsItemModalOpen(false);
        } else {
          toast.error(`Failed to add exercise: ${result.error}`);
        }
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
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

  const openItemModal = (planId: string, item?: WorkoutPlanItem) => {
    setSelectedPlanId(planId);
    setEditingItem(item || null);
    setIsItemModalOpen(true);
    
    if (item) {
      // Populate form with item data for editing
      itemForm.reset({
        exercise_name: item.exercise_name,
        exercise_description: item.exercise_description || '',
        target_machine_type: item.target_machine_type as 'treadmill' | 'bike',
        target_metric: item.target_metric as 'time' | 'reps' | 'distance' | 'rpm' | 'custom',
        target_value: item.target_value,
        target_unit: item.target_unit || '',
        rest_seconds: item.rest_seconds || 0,
        sets: item.sets || 1,
        target_machine_id: '',
      });
    } else {
      // Reset form for new item
      itemForm.reset({
        target_machine_type: 'bike',
        target_metric: 'time',
        rest_seconds: 0,
        sets: 1,
      });
    }
  };

  const handleDeleteItem = async (itemId: string, planId: string) => {
    if (!confirm('Are you sure you want to delete this exercise?')) return;

    setDeletingItemId(itemId);
    try {
      const result = await deleteWorkoutPlanItem(itemId, gymId);
      if (result.success) {
        setPlans(plans.map(p => 
          p.id === planId 
            ? { ...p, items: (p.items || []).filter(item => item.id !== itemId) }
            : p
        ));
        toast.success('Exercise deleted successfully');
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeletingItemId(null);
    }
  };

  const formatExercise = (item: WorkoutPlanItem) => {
    const machineType = item.target_machine_type === 'bike' ? 'Bike' : 'Treadmill';
    const value = item.target_value;
    const unit = item.target_unit || 
      (item.target_metric === 'time' ? 'min' : 
       item.target_metric === 'distance' ? 'km' : 
       item.target_metric === 'reps' ? 'reps' : '');
    
    return `${machineType} ${item.order_index + 1}: ${value}${unit ? ' ' + unit : ''} ${item.target_metric}`;
  };

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => setIsPlanModalOpen(true)}
          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          + Create Workout Plan
        </button>
      </div>

      {/* Plans List */}
      <div className="space-y-4">
        {plans.length === 0 ? (
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-12 text-center">
            <p className="text-[#808080]">No workout plans yet. Create your first plan!</p>
          </div>
        ) : (
          plans.map((plan) => (
            <div
              key={plan.id}
              className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          plan.is_active
                            ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                            : 'bg-[#808080]/10 text-[#808080]'
                        }`}
                      >
                        {plan.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {plan.description && (
                      <p className="text-[#808080] mb-3">{plan.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-sm text-[#808080]">
                      {plan.difficulty_level && (
                        <span>Difficulty: {plan.difficulty_level}</span>
                      )}
                      {plan.estimated_duration_minutes && (
                        <span>Duration: {plan.estimated_duration_minutes} min</span>
                      )}
                      {plan.category && <span>Category: {plan.category}</span>}
                      <span>Access: {plan.access_level}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleToggleStatus(plan.id, plan.is_active)}
                      className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                      title={plan.is_active ? 'Deactivate' : 'Activate'}
                    >
                      <Power className={`w-4 h-4 ${plan.is_active ? 'text-[#00E5FF]' : ''}`} />
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

                {/* Plan Items */}
                <div className="mt-4 pt-4 border-t border-[#1A1A1A]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-white">
                      Exercises ({plan.items?.length || 0})
                    </h4>
                    <button
                      onClick={() => openItemModal(plan.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[#1A1A1A] text-[#00E5FF] rounded-lg hover:bg-[#2A2A2A] transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add Exercise
                    </button>
                  </div>
                  {plan.items && plan.items.length > 0 ? (
                    <div className="space-y-2">
                      {plan.items
                        .sort((a, b) => a.order_index - b.order_index)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between px-4 py-2 bg-[#1A1A1A] rounded-lg text-sm text-[#B0B0B0] group hover:bg-[#2A2A2A] transition-colors"
                          >
                            <span>{formatExercise(item)}</span>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => openItemModal(plan.id, item)}
                                className="p-1.5 text-[#808080] hover:text-[#00E5FF] transition-colors"
                                title="Edit exercise"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id, plan.id)}
                                disabled={deletingItemId === item.id}
                                className="p-1.5 text-[#808080] hover:text-[#FF5252] transition-colors disabled:opacity-50"
                                title="Delete exercise"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#808080]">No exercises added yet</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Plan Modal */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Create Workout Plan</h2>
              <button
                onClick={() => {
                  setIsPlanModalOpen(false);
                  planForm.reset();
                }}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={planForm.handleSubmit(onSubmitPlan)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Plan Name *
                </label>
                <input
                  {...planForm.register('name')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="e.g., Achilles Fat Burner"
                />
                {planForm.formState.errors.name && (
                  <p className="mt-1 text-sm text-[#FF5252]">
                    {planForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Description
                </label>
                <textarea
                  {...planForm.register('description')}
                  rows={3}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none resize-none"
                  placeholder="Optional description of the workout plan"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Access Level *
                  </label>
                  <select
                    {...planForm.register('access_level')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="gym_members_only">Gym Members Only</option>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Difficulty Level
                  </label>
                  <select
                    {...planForm.register('difficulty_level')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Estimated Duration (minutes)
                  </label>
                  <input
                    type="number"
                    {...planForm.register('estimated_duration_minutes', { valueAsNumber: true })}
                    min={1}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="60"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Category
                  </label>
                  <input
                    {...planForm.register('category')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="e.g., Fat Burn, Strength"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={planForm.formState.isSubmitting}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50"
                >
                  {planForm.formState.isSubmitting ? 'Creating...' : 'Create Plan'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlanModalOpen(false);
                    planForm.reset();
                  }}
                  className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {isItemModalOpen && selectedPlanId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {editingItem ? 'Edit Exercise' : 'Add Exercise to Plan'}
              </h2>
              <button
                onClick={() => {
                  setIsItemModalOpen(false);
                  itemForm.reset();
                  setEditingItem(null);
                }}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={itemForm.handleSubmit(onSubmitItem)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Exercise Name *
                </label>
                <input
                  {...itemForm.register('exercise_name')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="e.g., Bike Warm-up, Treadmill Sprint"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Machine Type *
                  </label>
                  <select
                    {...itemForm.register('target_machine_type')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="bike">Bike</option>
                    <option value="treadmill">Treadmill</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Target Metric *
                  </label>
                  <select
                    {...itemForm.register('target_metric')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="time">Time</option>
                    <option value="distance">Distance</option>
                    <option value="reps">Reps</option>
                    <option value="rpm">RPM</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Target Value *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    {...itemForm.register('target_value', { valueAsNumber: true })}
                    min={0.1}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Unit
                  </label>
                  <input
                    {...itemForm.register('target_unit')}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="min, km, reps, rpm"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={itemForm.formState.isSubmitting}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50"
                >
                  {itemForm.formState.isSubmitting 
                    ? (editingItem ? 'Updating...' : 'Adding...') 
                    : (editingItem ? 'Update Exercise' : 'Add Exercise')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsItemModalOpen(false);
                    itemForm.reset();
                    setEditingItem(null);
                  }}
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
