import { describe, expect, it } from 'vitest';

import {
  MACHINE_TYPE_VALUES,
  getMachineTypeIcon,
  getMachineTypeLabel,
} from '../machine-types';

describe('machine type config', () => {
  it('exposes all four admin machine types', () => {
    expect(MACHINE_TYPE_VALUES).toEqual(['treadmill', 'bike', 'elliptical', 'stepper']);
  });

  it('returns stable label + icon mappings for each type', () => {
    expect(getMachineTypeIcon('treadmill')).toBe('🏃');
    expect(getMachineTypeLabel('treadmill')).toBe('Treadmill');

    expect(getMachineTypeIcon('bike')).toBe('🚴');
    expect(getMachineTypeLabel('bike')).toBe('Bike');

    expect(getMachineTypeIcon('elliptical')).toBe('⭕');
    expect(getMachineTypeLabel('elliptical')).toBe('Elliptical');

    expect(getMachineTypeIcon('stepper')).toBe('🪜');
    expect(getMachineTypeLabel('stepper')).toBe('Stepper');
  });
});

