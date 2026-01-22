'use client';

import {
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';

interface WorkoutPlanItem {
  id?: string;
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

interface WorkoutConstructorProps {
  items: Omit<WorkoutPlanItem, 'id' | 'plan_id'>[];
  machines: Machine[];
  onItemsChange: (items: Omit<WorkoutPlanItem, 'id' | 'plan_id'>[]) => void;
  onItemUpdate: (index: number, field: keyof WorkoutPlanItem, value: any) => void;
  onItemRemove: (index: number) => void;
}

interface SortableItemProps {
  item: Omit<WorkoutPlanItem, 'id' | 'plan_id'>;
  index: number;
  machines: Machine[];
  onUpdate: (field: keyof WorkoutPlanItem, value: any) => void;
  onRemove: () => void;
}

function SortableItem({ item, index, machines, onUpdate, onRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `item-${index}`,
    data: {
      type: 'item',
      index,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg p-4 mb-3"
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing pt-2"
        >
          <GripVertical className="w-5 h-5 text-[#808080] hover:text-[#00E5FF] transition-colors" />
        </div>

        {/* Item Content */}
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#808080] mb-1">
                Exercise Name *
              </label>
              <input
                type="text"
                value={item.exercise_name}
                onChange={(e) => onUpdate('exercise_name', e.target.value)}
                className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                placeholder="e.g., Lat Pulldown"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#808080] mb-1">
                Machine Type *
              </label>
              <select
                value={item.target_machine_type}
                onChange={(e) => onUpdate('target_machine_type', e.target.value)}
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
                onChange={(e) => onUpdate('target_value', parseFloat(e.target.value) || 0)}
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
                onChange={(e) => onUpdate('target_unit', e.target.value || null)}
                className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                placeholder="min, km, reps"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#808080] mb-1">
                Machine {item.target_machine_type === 'Smart' && '(Required)'}
              </label>
              <select
                value={item.target_machine_id || ''}
                onChange={(e) => onUpdate('target_machine_id', e.target.value || null)}
                className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
                required={item.target_machine_type === 'Smart'}
              >
                <option value="">
                  {item.target_machine_type === 'Smart'
                    ? 'Select Smart Machine'
                    : `Any ${item.target_machine_type}`}
                </option>
                {item.target_machine_type === 'Smart'
                  ? machines
                      .filter((m) => m.type === 'Smart' || m.name.toLowerCase().includes('smart'))
                      .map((machine) => (
                        <option key={machine.id} value={machine.id}>
                          {machine.name}
                        </option>
                      ))
                  : machines
                      .filter((m) => m.type === item.target_machine_type)
                      .map((machine) => (
                        <option key={machine.id} value={machine.id}>
                          {machine.name}
                        </option>
                      ))}
              </select>
            </div>
          </div>

          {item.target_machine_type === 'Smart' && (
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-[#808080]">
                <input
                  type="checkbox"
                  checked={item.smart_progression_enabled || false}
                  onChange={(e) => onUpdate('smart_progression_enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-[#1A1A1A] bg-[#121212] text-[#00E5FF] focus:ring-[#00E5FF]"
                />
                Enable SmartCoach AI Progression
              </label>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#808080] mb-1">
              Exercise Description
            </label>
            <textarea
              value={item.exercise_description || ''}
              onChange={(e) => onUpdate('exercise_description', e.target.value || null)}
              rows={2}
              className="w-full px-3 py-2 bg-[#121212] border border-[#1A1A1A] rounded-lg text-white text-sm placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none resize-none"
              placeholder="Optional description or instructions"
            />
          </div>
        </div>

        {/* Remove Button */}
        <button
          onClick={onRemove}
          className="p-2 text-[#808080] hover:text-[#FF5252] transition-colors"
          title="Remove exercise"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Drop zone component
function DropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'workout-constructor',
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] ${isOver ? 'bg-[#00E5FF]/10 border-[#00E5FF]' : 'border-[#1A1A1A]'} border-2 border-dashed rounded-lg p-4 transition-colors`}
    >
      {children}
    </div>
  );
}

export function WorkoutConstructor({
  items,
  machines,
  onItemsChange,
  onItemUpdate,
  onItemRemove,
}: WorkoutConstructorProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white mb-2">Workout Constructor</h3>
        <p className="text-sm text-[#808080]">
          {items.length === 0
            ? 'Drag machines here to build your workout plan'
            : `${items.length} exercise${items.length !== 1 ? 's' : ''} in plan`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <DropZone>
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[200px] text-center">
              <div>
                <p className="text-[#808080] mb-2">No exercises yet</p>
                <p className="text-sm text-[#808080]">Drag machines from the library to get started</p>
              </div>
            </div>
          ) : (
            <SortableContext items={items.map((_, index) => `item-${index}`)} strategy={verticalListSortingStrategy}>
              {items.map((item, index) => (
                <SortableItem
                  key={index}
                  item={item}
                  index={index}
                  machines={machines}
                  onUpdate={(field, value) => onItemUpdate(index, field, value)}
                  onRemove={() => onItemRemove(index)}
                />
              ))}
            </SortableContext>
          )}
        </DropZone>
      </div>
    </div>
  );
}
