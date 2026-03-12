import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/authStore';

export type Gender = 'male' | 'female';
export type FitnessGoal = 'weight_loss' | 'strength' | 'cardio' | 'health';

interface OnboardingWizardData {
  gender: Gender | null;
  weight_kg: number | null;
  height_cm: number | null;
  date_of_birth: string | null; // YYYY-MM-DD
  fitness_goal: FitnessGoal | null;
}

interface OnboardingWizardStore {
  data: OnboardingWizardData;
  isEdit: boolean;
  setField: <K extends keyof OnboardingWizardData>(field: K, value: OnboardingWizardData[K]) => void;
  initializeFromProfile: (profile: Partial<OnboardingWizardData>) => void;
  setEditMode: (isEdit: boolean) => void;
  submit: () => Promise<{ success: boolean; error?: string }>;
  skip: () => Promise<{ success: boolean; error?: string }>;
  reset: () => void;
}

const initialData: OnboardingWizardData = {
  gender: null,
  weight_kg: null,
  height_cm: null,
  date_of_birth: null,
  fitness_goal: null,
};

export const useOnboardingWizard = create<OnboardingWizardStore>((set, get) => ({
  data: { ...initialData },
  isEdit: false,

  setField: (field, value) => {
    set((state) => ({
      data: { ...state.data, [field]: value },
    }));
  },

  initializeFromProfile: (profile) => {
    set((state) => ({
      data: {
        gender: (profile.gender as Gender) ?? state.data.gender,
        weight_kg: profile.weight_kg ?? state.data.weight_kg,
        height_cm: profile.height_cm ?? state.data.height_cm,
        date_of_birth: profile.date_of_birth ?? state.data.date_of_birth,
        fitness_goal: (profile.fitness_goal as FitnessGoal) ?? state.data.fitness_goal,
      },
    }));
  },

  setEditMode: (isEdit) => set({ isEdit }),

  submit: async () => {
    const session = useAuthStore.getState().session;
    if (!session?.user) return { success: false, error: 'Not authenticated' };

    const { data } = get();
    const updateObj: Record<string, unknown> = {
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    if (data.gender) updateObj.gender = data.gender;
    if (data.weight_kg) updateObj.weight_kg = data.weight_kg;
    if (data.height_cm) updateObj.height_cm = data.height_cm;
    if (data.date_of_birth) updateObj.date_of_birth = data.date_of_birth;
    if (data.fitness_goal) updateObj.fitness_goal = data.fitness_goal;

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updateObj)
        .eq('id', session.user.id);

      if (error) return { success: false, error: error.message };

      await useAuthStore.getState().fetchProfile();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: msg };
    }
  },

  skip: async () => {
    const session = useAuthStore.getState().session;
    if (!session?.user) return { success: false, error: 'Not authenticated' };

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id);

      if (error) return { success: false, error: error.message };

      await useAuthStore.getState().fetchProfile();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: msg };
    }
  },

  reset: () => set({ data: { ...initialData }, isEdit: false }),
}));
