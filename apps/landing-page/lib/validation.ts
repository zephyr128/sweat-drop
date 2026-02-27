// Input validation and sanitization utilities

export function sanitizeString(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateRequired(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateNumber(value: string): boolean {
  const num = parseInt(value, 10);
  return !isNaN(num) && num > 0;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateRequestDemo(data: {
  fullName?: string;
  gymName?: string;
  email?: string;
  phone?: string;
  locations?: string;
  message?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!validateRequired(data.fullName)) {
    errors.fullName = 'Full name is required';
  }

  if (!validateRequired(data.gymName)) {
    errors.gymName = 'Gym name is required';
  }

  if (!validateRequired(data.email)) {
    errors.email = 'Email is required';
  } else if (data.email && !validateEmail(data.email)) {
    errors.email = 'Invalid email format';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateApplyPilot(data: {
  fullName?: string;
  gymName?: string;
  cityCountry?: string;
  activeMembers?: string;
  cardioMachines?: string;
  multipleLocations?: string;
  whyJoin?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!validateRequired(data.fullName)) {
    errors.fullName = 'Full name is required';
  }

  if (!validateRequired(data.gymName)) {
    errors.gymName = 'Gym name is required';
  }

  if (!validateRequired(data.cityCountry)) {
    errors.cityCountry = 'City / Country is required';
  }

  if (!validateRequired(data.activeMembers)) {
    errors.activeMembers = 'Number of active members is required';
  } else if (data.activeMembers && !validateNumber(data.activeMembers)) {
    errors.activeMembers = 'Please enter a valid number';
  }

  if (!validateRequired(data.cardioMachines)) {
    errors.cardioMachines = 'Cardio machines count is required';
  } else if (data.cardioMachines && !validateNumber(data.cardioMachines)) {
    errors.cardioMachines = 'Please enter a valid number';
  }

  if (!validateRequired(data.multipleLocations)) {
    errors.multipleLocations = 'Please select an option';
  }

  if (!validateRequired(data.whyJoin)) {
    errors.whyJoin = 'Please explain why you want to join the pilot';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
