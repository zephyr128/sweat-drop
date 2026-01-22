'use client';

import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';

interface Machine {
  id: string;
  name: string;
  type: string;
}

interface MachineLibraryProps {
  machines: Machine[];
}

interface DraggableMachineProps {
  machine: Machine;
}

function DraggableMachine({ machine }: DraggableMachineProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `machine-${machine.id}`,
    data: {
      type: 'machine',
      machine,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg p-3 mb-2
        cursor-grab active:cursor-grabbing
        hover:border-[#00E5FF]/50 transition-colors
        ${isDragging ? 'opacity-50' : ''}
      `}
    >
      <div className="flex items-center gap-3">
        <GripVertical className="w-4 h-4 text-[#808080] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{machine.name}</div>
          <div className="text-xs text-[#808080]">{machine.type}</div>
        </div>
        {machine.type === 'Smart' && (
          <span className="px-2 py-1 bg-[#00E5FF]/10 text-[#00E5FF] rounded-full text-xs font-medium">
            Smart
          </span>
        )}
      </div>
    </div>
  );
}

export function MachineLibrary({ machines }: MachineLibraryProps) {
  // Filter machines - show all, but highlight Smart machines
  const smartMachines = machines.filter(m => m.type === 'Smart' || m.name.toLowerCase().includes('smart'));
  const otherMachines = machines.filter(m => !smartMachines.includes(m));

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white mb-2">Machine Library</h3>
        <p className="text-sm text-[#808080]">Drag machines into your workout plan</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Smart Machines Section */}
        {smartMachines.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-[#00E5FF] mb-2">Smart Machines</h4>
            <div className="space-y-2">
              {smartMachines.map((machine) => (
                <DraggableMachine key={machine.id} machine={machine} />
              ))}
            </div>
          </div>
        )}

        {/* Other Machines Section */}
        {otherMachines.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-[#808080] mb-2">Other Machines</h4>
            <div className="space-y-2">
              {otherMachines.map((machine) => (
                <DraggableMachine key={machine.id} machine={machine} />
              ))}
            </div>
          </div>
        )}

        {machines.length === 0 && (
          <div className="text-center py-8 text-[#808080]">
            <p className="text-sm">No machines available</p>
          </div>
        )}
      </div>
    </div>
  );
}
