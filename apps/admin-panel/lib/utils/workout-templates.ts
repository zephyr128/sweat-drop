// Pre-defined Workout Plan Templates
// These templates can be applied to any gym with one click

export type TemplateGoal = 
  | 'Strength' 
  | 'Hypertrophy' 
  | 'Fat loss' 
  | 'Conditioning' 
  | 'Rehab' 
  | 'Beginner' 
  | 'Advanced' 
  | 'Powerlifting' 
  | 'Functional';

export type TemplateStructure = 
  | 'Full body' 
  | 'Upper/Lower' 
  | 'Push Pull Legs' 
  | '4-day split' 
  | '5-day split';

export type TemplateEquipment = 
  | 'Machines only (Smart machines)' 
  | 'Free weights' 
  | 'Mixed';

export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string;
  goal: TemplateGoal;
  structure: TemplateStructure;
  equipment: TemplateEquipment;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  estimated_duration_minutes: number;
  items: Array<{
    order_index: number;
    exercise_name: string;
    exercise_description?: string;
    target_machine_type: 'treadmill' | 'bike' | 'Smart';
    target_metric: 'time' | 'reps' | 'distance' | 'rpm' | 'custom';
    target_value: number;
    target_unit?: string;
    rest_seconds: number;
    sets: number;
    smart_progression_enabled?: boolean;
    instruction_video_url?: string;
  }>;
}

// Pre-defined Templates
export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  // FAT LOSS TEMPLATES
  {
    id: 'fat-loss-full-body',
    name: 'Fat Loss Full Body',
    description: 'High-intensity full-body workout designed for maximum calorie burn',
    goal: 'Fat loss',
    structure: 'Full body',
    equipment: 'Mixed',
    difficulty_level: 'intermediate',
    estimated_duration_minutes: 45,
    items: [
      {
        order_index: 0,
        exercise_name: 'Bike Warm-up',
        exercise_description: '5-minute warm-up at moderate pace',
        target_machine_type: 'bike',
        target_metric: 'time',
        target_value: 5,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
      {
        order_index: 1,
        exercise_name: 'Treadmill HIIT',
        exercise_description: 'High-intensity interval training',
        target_machine_type: 'treadmill',
        target_metric: 'time',
        target_value: 20,
        target_unit: 'min',
        rest_seconds: 60,
        sets: 1,
      },
      {
        order_index: 2,
        exercise_name: 'Bike Cool-down',
        exercise_description: '5-minute cool-down',
        target_machine_type: 'bike',
        target_metric: 'time',
        target_value: 5,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
    ],
  },
  {
    id: 'fat-loss-upper-lower',
    name: 'Fat Loss Upper/Lower Split',
    description: 'Upper and lower body split for fat loss',
    goal: 'Fat loss',
    structure: 'Upper/Lower',
    equipment: 'Mixed',
    difficulty_level: 'intermediate',
    estimated_duration_minutes: 50,
    items: [
      {
        order_index: 0,
        exercise_name: 'Treadmill Warm-up',
        target_machine_type: 'treadmill',
        target_metric: 'time',
        target_value: 5,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
      {
        order_index: 1,
        exercise_name: 'Bike Cardio',
        target_machine_type: 'bike',
        target_metric: 'time',
        target_value: 30,
        target_unit: 'min',
        rest_seconds: 60,
        sets: 1,
      },
      {
        order_index: 2,
        exercise_name: 'Treadmill Cool-down',
        target_machine_type: 'treadmill',
        target_metric: 'time',
        target_value: 5,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
    ],
  },
  
  // STRENGTH TEMPLATES
  {
    id: 'strength-full-body',
    name: 'Strength Full Body',
    description: 'Full-body strength training program',
    goal: 'Strength',
    structure: 'Full body',
    equipment: 'Free weights',
    difficulty_level: 'intermediate',
    estimated_duration_minutes: 60,
    items: [
      {
        order_index: 0,
        exercise_name: 'Bike Warm-up',
        target_machine_type: 'bike',
        target_metric: 'time',
        target_value: 10,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
      {
        order_index: 1,
        exercise_name: 'Smart Machine Exercise 1',
        exercise_description: 'Strength exercise on Smart Machine',
        target_machine_type: 'Smart',
        target_metric: 'reps',
        target_value: 8,
        target_unit: 'reps',
        rest_seconds: 90,
        sets: 3,
        smart_progression_enabled: true,
      },
      {
        order_index: 2,
        exercise_name: 'Smart Machine Exercise 2',
        target_machine_type: 'Smart',
        target_metric: 'reps',
        target_value: 10,
        target_unit: 'reps',
        rest_seconds: 90,
        sets: 3,
        smart_progression_enabled: true,
      },
    ],
  },
  
  // HYPERTROPHY TEMPLATES
  {
    id: 'hypertrophy-push-pull-legs',
    name: 'Hypertrophy Push Pull Legs',
    description: 'Classic PPL split for muscle growth',
    goal: 'Hypertrophy',
    structure: 'Push Pull Legs',
    equipment: 'Mixed',
    difficulty_level: 'advanced',
    estimated_duration_minutes: 75,
    items: [
      {
        order_index: 0,
        exercise_name: 'Bike Warm-up',
        target_machine_type: 'bike',
        target_metric: 'time',
        target_value: 5,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
      {
        order_index: 1,
        exercise_name: 'Smart Machine Push',
        target_machine_type: 'Smart',
        target_metric: 'reps',
        target_value: 12,
        target_unit: 'reps',
        rest_seconds: 60,
        sets: 4,
        smart_progression_enabled: true,
      },
      {
        order_index: 2,
        exercise_name: 'Treadmill Cool-down',
        target_machine_type: 'treadmill',
        target_metric: 'time',
        target_value: 5,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
    ],
  },
  
  // BEGINNER TEMPLATES
  {
    id: 'beginner-full-body',
    name: 'Beginner Full Body',
    description: 'Perfect for beginners starting their fitness journey',
    goal: 'Beginner',
    structure: 'Full body',
    equipment: 'Machines only (Smart machines)',
    difficulty_level: 'beginner',
    estimated_duration_minutes: 30,
    items: [
      {
        order_index: 0,
        exercise_name: 'Bike Warm-up',
        target_machine_type: 'bike',
        target_metric: 'time',
        target_value: 5,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
      {
        order_index: 1,
        exercise_name: 'Smart Machine Beginner',
        target_machine_type: 'Smart',
        target_metric: 'reps',
        target_value: 10,
        target_unit: 'reps',
        rest_seconds: 60,
        sets: 2,
        smart_progression_enabled: true,
      },
      {
        order_index: 2,
        exercise_name: 'Bike Cool-down',
        target_machine_type: 'bike',
        target_metric: 'time',
        target_value: 5,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
    ],
  },
  
  // CONDITIONING TEMPLATES
  {
    id: 'conditioning-hiit',
    name: 'HIIT Conditioning',
    description: 'High-intensity interval training for conditioning',
    goal: 'Conditioning',
    structure: 'Full body',
    equipment: 'Mixed',
    difficulty_level: 'advanced',
    estimated_duration_minutes: 40,
    items: [
      {
        order_index: 0,
        exercise_name: 'Treadmill Warm-up',
        target_machine_type: 'treadmill',
        target_metric: 'time',
        target_value: 5,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
      {
        order_index: 1,
        exercise_name: 'Bike HIIT',
        target_machine_type: 'bike',
        target_metric: 'time',
        target_value: 20,
        target_unit: 'min',
        rest_seconds: 30,
        sets: 1,
      },
      {
        order_index: 2,
        exercise_name: 'Treadmill HIIT',
        target_machine_type: 'treadmill',
        target_metric: 'time',
        target_value: 10,
        target_unit: 'min',
        rest_seconds: 0,
        sets: 1,
      },
    ],
  },
];

// Helper function to filter templates
export function filterTemplates(
  goal?: TemplateGoal,
  structure?: TemplateStructure,
  equipment?: TemplateEquipment
): WorkoutTemplate[] {
  return WORKOUT_TEMPLATES.filter(template => {
    if (goal && template.goal !== goal) return false;
    if (structure && template.structure !== structure) return false;
    if (equipment && template.equipment !== equipment) return false;
    return true;
  });
}

// Helper function to get template by ID
export function getTemplateById(id: string): WorkoutTemplate | undefined {
  return WORKOUT_TEMPLATES.find(t => t.id === id);
}
