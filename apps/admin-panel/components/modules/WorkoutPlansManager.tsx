'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  deleteWorkoutPlan,
  toggleWorkoutPlanStatus,
  saveWorkoutPlan,
  applyWorkoutTemplate,
  getWorkoutPlansMetrics,
  type WorkoutPlanMetrics
} from '@/lib/actions/workout-plan-actions';
import { WORKOUT_TEMPLATES, filterTemplates, type TemplateGoal, type TemplateStructure, type TemplateEquipment } from '@/lib/utils/workout-templates';
import { X, Trash2, Power, Plus, Edit2, ChevronUp, ChevronDown, Save, Sparkles, TrendingUp, TrendingDown, Minus, Users, Target, DollarSign, Trophy, Dumbbell } from 'lucide-react';

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
  template_goal?: string | null;
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
  smart_progression_enabled?: boolean;
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
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Record<string, WorkoutPlanMetrics>>({});
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  
  // Template filter state
  const [templateFilter, setTemplateFilter] = useState<{
    goal?: TemplateGoal;
    structure?: TemplateStructure;
    equipment?: TemplateEquipment;
  }>({});

  // Load metrics when plans change
  useEffect(() => {
    const loadMetrics = async () => {
      if (plans.length === 0) return;
      
      setLoadingMetrics(true);
      const planIds = plans.map((p) => p.id);
      const result = await getWorkoutPlansMetrics(planIds);
      
      if (result.success) {
        setMetrics(result.data || {});
      } else {
        console.error('[WorkoutPlansManager] Failed to load metrics:', result.error);
      }
      setLoadingMetrics(false);
    };

    loadMetrics();
  }, [plans]);

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
        smart_progression_enabled: item.smart_progression_enabled || false,
      })),
    });
    setIsDialogOpen(true);
  };

  const handleApplyTemplate = async (templateId: string) => {
    const template = WORKOUT_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      toast.error('Template not found');
      return;
    }

    setApplyingTemplate(true);
    try {
      // Map Smart machine type items to actual machines if available
      const itemsWithMachineMapping = template.items.map(item => {
        if (item.target_machine_type === 'Smart') {
          // Find a Smart machine in the gym (you may need to adjust this logic)
          const smartMachine = machines.find(m => m.type === 'Smart' || m.name.toLowerCase().includes('smart'));
          return {
            ...item,
            target_machine_id: smartMachine?.id || null,
          };
        }
        return item;
      });

      const result = await applyWorkoutTemplate(gymId, templateId, {
        name: template.name,
        description: template.description,
        goal: template.goal,
        structure: template.structure,
        equipment: template.equipment,
        difficulty_level: template.difficulty_level,
        estimated_duration_minutes: template.estimated_duration_minutes,
        items: itemsWithMachineMapping,
      });

      if (result.success) {
        if ('data' in result && result.data) {
          setPlans([result.data as WorkoutPlan, ...plans]);
          toast.success(`Template "${template.name}" applied successfully!`);
          setIsTemplateDialogOpen(false);
        }
      } else {
        if ('error' in result) {
          toast.error(result.error || 'Failed to apply template');
        }
      }
    } catch (error: any) {
      console.error('[WorkoutPlansManager] Error applying template:', error);
      toast.error(error.message || 'Failed to apply template');
    } finally {
      setApplyingTemplate(false);
    }
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
          smart_progression_enabled: false,
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
          smart_progression_enabled: item.smart_progression_enabled || false,
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

  const filteredTemplates = filterTemplates(
    templateFilter.goal,
    templateFilter.structure,
    templateFilter.equipment
  );

  const getStatusBadge = (templateGoal: string | null | undefined) => {
    if (!templateGoal) return null;
    const badges: Record<string, { label: string; className: string }> = {
      Strength: { label: 'Strength', className: 'bg-red-500/10 text-red-400' },
      Hypertrophy: { label: 'Hypertrophy', className: 'bg-purple-500/10 text-purple-400' },
      'Fat loss': { label: 'Fat Loss', className: 'bg-orange-500/10 text-orange-400' },
      Conditioning: { label: 'Conditioning', className: 'bg-blue-500/10 text-blue-400' },
      Rehab: { label: 'Rehab', className: 'bg-green-500/10 text-green-400' },
      Beginner: { label: 'Beginner', className: 'bg-cyan-500/10 text-cyan-400' },
      Advanced: { label: 'Advanced', className: 'bg-yellow-500/10 text-yellow-400' },
      Powerlifting: { label: 'Powerlifting', className: 'bg-pink-500/10 text-pink-400' },
      Functional: { label: 'Functional', className: 'bg-indigo-500/10 text-indigo-400' },
    };
    return badges[templateGoal] || { label: templateGoal, className: 'bg-zinc-500/10 text-zinc-400' };
  };

  // Sparkline component for performance trend
  const SparklineChart = ({ data }: { data: number[] }) => {
    if (!data || data.length === 0) {
      return (
        <div className="flex items-center gap-1 text-zinc-500">
          <Minus className="w-3 h-3" />
          <span className="text-xs">No data</span>
        </div>
      );
    }

    const max = Math.max(...data, 1);
    const min = Math.min(...data);
    const range = max - min || 1;
    const width = 60;
    const height = 20;
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    // Determine trend (comparing first half to second half)
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const isTrendingUp = secondAvg > firstAvg;
    const isTrendingDown = secondAvg < firstAvg;

    return (
      <div className="flex items-center gap-1.5">
        <svg width={width} height={height} className="text-[#00E5FF]">
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {isTrendingUp && <TrendingUp className="w-3 h-3 text-green-400" />}
        {isTrendingDown && <TrendingDown className="w-3 h-3 text-red-400" />}
        {!isTrendingUp && !isTrendingDown && <Minus className="w-3 h-3 text-zinc-500" />}
      </div>
    );
  };

  // Tooltip component
  const Tooltip = ({ children, content }: { children: React.ReactNode; content: string }) => {
    const [show, setShow] = useState(false);
    const isLongContent = content.length > 50;
    return (
      <div 
        className="relative inline-block"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
        {show && (
          <div className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-zinc-800 text-white text-xs rounded-lg shadow-xl z-50 ${
            isLongContent ? 'max-w-xs whitespace-normal' : 'whitespace-nowrap'
          }`}>
            {isLongContent ? (
              <div className="space-y-1">
                {content.split(', ').map((item, idx) => (
                  <div key={idx} className="text-zinc-200">• {item}</div>
                ))}
              </div>
            ) : (
              content
            )}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-zinc-800"></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Calculate global stats
  const totalActiveUsers = Object.values(metrics).reduce((sum, m) => sum + (m.active_users || 0), 0);
  const averageCompletion = plans.length > 0
    ? Math.round(
        Object.values(metrics).reduce((sum, m) => sum + (m.completion_rate || 0), 0) / plans.length
      )
    : 0;
  const monthlyRevenue = Object.values(metrics).reduce((sum, m) => sum + (m.revenue || 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 relative overflow-hidden">
          <div className="absolute top-2 right-2 opacity-20">
            <Users className="w-8 h-8 text-white" strokeWidth={1.5} />
          </div>
          <p className="text-xs text-zinc-500 mb-1">Total Active Users</p>
          <p className="text-2xl font-bold text-white">{totalActiveUsers}</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 relative overflow-hidden">
          <div className="absolute top-2 right-2 opacity-20">
            <Target className="w-8 h-8 text-white" strokeWidth={1.5} />
          </div>
          <p className="text-xs text-zinc-500 mb-1">Average Completion</p>
          <p className="text-2xl font-bold text-white">{averageCompletion}%</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 relative overflow-hidden">
          <div className="absolute top-2 right-2 opacity-20">
            <DollarSign className="w-8 h-8 text-white" strokeWidth={1.5} />
          </div>
          <p className="text-xs text-zinc-500 mb-1">Monthly Revenue</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(monthlyRevenue, 'USD')}</p>
        </div>
      </div>

      {/* Plans Table */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden">
        {/* Table Header with Actions */}
        <div className="p-6 border-b border-zinc-900 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">SmartCoach Plans Overview</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsTemplateDialogOpen(true)}
              className="px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Apply Template
            </button>
            <button
              onClick={openCreateDialog}
              className="px-4 py-2 bg-[#00E5FF] text-black rounded-lg font-medium hover:bg-[#00B8CC] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Plan
            </button>
          </div>
        </div>

        {/* Table */}
        {plans.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-zinc-500">No workout plans yet. Create your first plan!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-900">
                  <th className="text-left p-4 text-sm font-medium text-zinc-500">Plan Name</th>
                  <th className="text-left p-4 text-sm font-medium text-zinc-500">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-zinc-500">Access Type</th>
                  <th className="text-center p-4 text-sm font-medium text-zinc-500">Exercises</th>
                  <th className="text-center p-4 text-sm font-medium text-zinc-500">Duration</th>
                  {plans.some((p) => p.access_type === 'paid_one_time') && (
                    <th className="text-right p-4 text-sm font-medium text-zinc-500">Price</th>
                  )}
                  <th className="text-center p-4 text-sm font-medium text-zinc-500">Engagement</th>
                  <th className="text-right p-4 text-sm font-medium text-zinc-500">Revenue</th>
                  <th className="text-right p-4 text-sm font-medium text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const accessBadge = getAccessTypeBadge(plan.access_type);
                  const statusBadge = getStatusBadge(plan.template_goal);
                  return (
                    <tr
                      key={plan.id}
                      className="border-b border-zinc-900 hover:bg-zinc-900/40 transition-colors group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white">{plan.name}</p>
                          {statusBadge && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.className}`}>
                              {statusBadge.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          plan.is_active 
                            ? 'bg-green-500/10 text-green-400' 
                            : 'bg-zinc-500/10 text-zinc-500'
                        }`}>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${accessBadge.className}`}>
                          {accessBadge.label}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <Tooltip
                          content={
                            plan.items && plan.items.length > 0
                              ? plan.items.map((item) => item.exercise_name).join(', ')
                              : 'No exercises'
                          }
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <Dumbbell className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
                            <span className="px-2 py-0.5 bg-zinc-800 rounded text-white text-sm font-medium">
                              {plan.items?.length || 0}
                            </span>
                          </div>
                        </Tooltip>
                      </td>
                      <td className="p-4 text-center">
                        <p className="text-white text-sm">
                          {plan.estimated_duration_minutes ? `${plan.estimated_duration_minutes} min` : '-'}
                        </p>
                      </td>
                      {plans.some((p) => p.access_type === 'paid_one_time') && (
                        <td className="p-4 text-right">
                          {plan.access_type === 'paid_one_time' && plan.price > 0 ? (
                            <p className="text-white text-sm">
                              {formatCurrency(plan.price, plan.currency)}
                            </p>
                          ) : (
                            <p className="text-zinc-500 text-sm">-</p>
                          )}
                        </td>
                      )}
                      <td className="p-4 text-center">
                        {loadingMetrics ? (
                          <div className="flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        ) : (
                          <Tooltip content={`Average workout duration: ${metrics[plan.id]?.avg_duration_minutes || 0}min`}>
                            <p className="text-white text-sm">
                              {metrics[plan.id]?.active_users || 0} users ({metrics[plan.id]?.completion_rate || 0}%)
                            </p>
                          </Tooltip>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {loadingMetrics ? (
                          <div className="flex items-center justify-end">
                            <div className="w-4 h-4 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        ) : (
                          <p className={`text-sm ${
                            plan.access_type === 'paid_one_time' && (metrics[plan.id]?.revenue || 0) > 0
                              ? 'text-green-400'
                              : 'text-zinc-500'
                          }`}>
                            {plan.access_type === 'paid_one_time' && (metrics[plan.id]?.revenue || 0) > 0
                              ? formatCurrency(metrics[plan.id]!.revenue, plan.currency)
                              : plan.access_type === 'paid_one_time' && plan.price > 0
                              ? '0.00'
                              : 'N/A'}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditDialog(plan)}
                            className="p-2 text-zinc-500 hover:text-[#00E5FF] transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(plan.id, plan.is_active)}
                            className={`p-2 transition-colors ${
                              plan.is_active 
                                ? 'text-zinc-500 hover:text-yellow-400' 
                                : 'text-zinc-500 hover:text-green-400'
                            }`}
                            title={plan.is_active ? 'Deactivate' : 'Activate'}
                          >
                            <Power className="w-4 h-4" strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => handleDeletePlan(plan.id)}
                            disabled={deletingId === plan.id}
                            className="p-2 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                                  <option value="Smart">Smart Machine</option>
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
                                  Machine {item.target_machine_type === 'Smart' && '(Required for Smart)'}
                                </label>
                                <select
                                  value={item.target_machine_id || ''}
                                  onChange={(e) =>
                                    updateItem(index, 'target_machine_id', e.target.value || null)
                                  }
                                  className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
                                  required={item.target_machine_type === 'Smart'}
                                >
                                  <option value="">
                                    {item.target_machine_type === 'Smart' 
                                      ? 'Select Smart Machine' 
                                      : `Any ${item.target_machine_type}`}
                                  </option>
                                  {item.target_machine_type === 'Smart' 
                                    ? machines.filter(m => m.type === 'Smart' || m.name.toLowerCase().includes('smart')).map((machine) => (
                                        <option key={machine.id} value={machine.id}>
                                          {machine.name}
                                        </option>
                                      ))
                                    : getMachinesByType(item.target_machine_type).map((machine) => (
                                        <option key={machine.id} value={machine.id}>
                                          {machine.name}
                                        </option>
                                      ))}
                                </select>
                              </div>
                              {item.target_machine_type === 'Smart' && (
                                <div className="col-span-3">
                                  <label className="flex items-center gap-2 text-xs font-medium text-[#808080]">
                                    <input
                                      type="checkbox"
                                      checked={item.smart_progression_enabled || false}
                                      onChange={(e) => updateItem(index, 'smart_progression_enabled', e.target.checked)}
                                      className="w-4 h-4 rounded border-[#1A1A1A] bg-[#121212] text-[#00E5FF] focus:ring-[#00E5FF]"
                                    />
                                    Enable SmartCoach AI Progression
                                  </label>
                                </div>
                              )}
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

      {/* Template Selection Dialog */}
      {isTemplateDialogOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#121212] border border-[#1A1A1A] rounded-xl p-8 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Apply Workout Template</h2>
              <button
                onClick={() => setIsTemplateDialogOpen(false)}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Template Filters */}
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Goal</label>
                  <select
                    value={templateFilter.goal || ''}
                    onChange={(e) => setTemplateFilter({ ...templateFilter, goal: e.target.value as TemplateGoal || undefined })}
                    className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="">All Goals</option>
                    <option value="Strength">Strength</option>
                    <option value="Hypertrophy">Hypertrophy</option>
                    <option value="Fat loss">Fat loss</option>
                    <option value="Conditioning">Conditioning</option>
                    <option value="Rehab">Rehab</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Powerlifting">Powerlifting</option>
                    <option value="Functional">Functional</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Structure</label>
                  <select
                    value={templateFilter.structure || ''}
                    onChange={(e) => setTemplateFilter({ ...templateFilter, structure: e.target.value as TemplateStructure || undefined })}
                    className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="">All Structures</option>
                    <option value="Full body">Full body</option>
                    <option value="Upper/Lower">Upper/Lower</option>
                    <option value="Push Pull Legs">Push Pull Legs</option>
                    <option value="4-day split">4-day split</option>
                    <option value="5-day split">5-day split</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Equipment</label>
                  <select
                    value={templateFilter.equipment || ''}
                    onChange={(e) => setTemplateFilter({ ...templateFilter, equipment: e.target.value as TemplateEquipment || undefined })}
                    className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  >
                    <option value="">All Equipment</option>
                    <option value="Machines only (Smart machines)">Machines only (Smart machines)</option>
                    <option value="Free weights">Free weights</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Templates Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {filteredTemplates.length === 0 ? (
                <div className="col-span-full text-center py-8 bg-[#1A1A1A] rounded-lg">
                  <p className="text-[#808080]">No templates match your filters</p>
                </div>
              ) : (
                filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg p-4 hover:border-[#00E5FF]/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">{template.name}</h3>
                        <p className="text-sm text-[#808080] mb-2">{template.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="px-2 py-1 bg-[#00E5FF]/10 text-[#00E5FF] rounded-full text-xs">
                        {template.goal}
                      </span>
                      <span className="px-2 py-1 bg-[#FFA500]/10 text-[#FFA500] rounded-full text-xs">
                        {template.structure}
                      </span>
                      <span className="px-2 py-1 bg-[#4CAF50]/10 text-[#4CAF50] rounded-full text-xs">
                        {template.equipment}
                      </span>
                      <span className="px-2 py-1 bg-[#808080]/10 text-[#808080] rounded-full text-xs">
                        {template.difficulty_level}
                      </span>
                    </div>
                    <div className="text-sm text-[#808080] mb-4">
                      {template.items.length} exercises • {template.estimated_duration_minutes} min
                    </div>
                    <button
                      onClick={() => handleApplyTemplate(template.id)}
                      disabled={applyingTemplate}
                      className="w-full px-4 py-2 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {applyingTemplate ? 'Applying...' : 'Apply to Gym'}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Dialog Actions */}
            <div className="flex justify-end pt-6 border-t border-[#1A1A1A]">
              <button
                onClick={() => setIsTemplateDialogOpen(false)}
                className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
