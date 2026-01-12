import { useEffect } from 'react';
import { useGymData } from '@/hooks/useGymData';

/**
 * Component that initializes gym data when the app loads
 * This should be placed inside ThemeProvider in the root layout
 */
export const GymDataInitializer: React.FC = () => {
  useGymData(); // This hook handles loading user's home gym and active gym
  return null;
};
