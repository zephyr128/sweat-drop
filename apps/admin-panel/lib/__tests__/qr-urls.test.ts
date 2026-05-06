import { describe, expect, it } from 'vitest';

import { machineQrUrl } from '../qr-urls';

describe('machineQrUrl', () => {
  it('appends csc sensor hint only for bike', () => {
    expect(machineQrUrl('abc-uuid', 'bike')).toContain('/m/abc-uuid?s=csc');
    expect(machineQrUrl('abc-uuid', 'treadmill')).toContain('/m/abc-uuid');
    expect(machineQrUrl('abc-uuid', 'treadmill')).not.toContain('?s=csc');
    expect(machineQrUrl('abc-uuid', 'elliptical')).not.toContain('?s=csc');
    expect(machineQrUrl('abc-uuid', 'stepper')).not.toContain('?s=csc');
  });
});

