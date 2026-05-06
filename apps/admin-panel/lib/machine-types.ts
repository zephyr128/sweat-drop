export const MACHINE_TYPE_VALUES = ['treadmill', 'bike', 'elliptical', 'stepper'] as const;

export type MachineType = (typeof MACHINE_TYPE_VALUES)[number];

export const MACHINE_TYPE_LABELS: Record<MachineType, string> = {
  treadmill: 'Treadmill',
  bike: 'Bike',
  elliptical: 'Elliptical',
  stepper: 'Stepper',
};

export const MACHINE_TYPE_ICONS: Record<MachineType, string> = {
  treadmill: '🏃',
  bike: '🚴',
  elliptical: '⭕',
  stepper: '🪜',
};

export function getMachineTypeLabel(type: string): string {
  return MACHINE_TYPE_LABELS[type as MachineType] ?? type;
}

export function getMachineTypeIcon(type: string): string {
  return MACHINE_TYPE_ICONS[type as MachineType] ?? '⚙️';
}
