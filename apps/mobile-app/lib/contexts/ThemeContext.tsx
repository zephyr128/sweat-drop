import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useGymStore, Gym } from '@/lib/stores/useGymStore';
import { theme as baseTheme } from '@/lib/theme';
import { useBranding } from '@/lib/hooks/useBranding';

interface ThemeContextType {
  theme: {
    colors: {
      primary: string;
      primaryDark: string;
      primaryLight: string;
      onPrimary: string;
      [key: string]: any; // Allow other theme properties
    };
    [key: string]: any; // Allow other theme properties
  };
  activeGym: Gym | null;
  isUnlocked: boolean;
  branding: ReturnType<typeof useBranding>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

// Export useBranding hook for direct access
export { useBranding };

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { activeGym, homeGymId, previewGymId, isUnlocked } = useGymStore();
  const branding = useBranding();
  
  // Memoize theme to prevent unnecessary re-renders
  const animatedTheme = useMemo(() => ({
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: branding.primary,
      primaryDark: branding.primaryDark,
      primaryLight: branding.primaryLight,
      onPrimary: branding.onPrimary,
    },
  }), [branding.primary, branding.primaryDark, branding.primaryLight, branding.onPrimary]);

  // Calculate isUnlocked value - if no preview, it's unlocked (using home gym)
  // If preview matches home, it's unlocked
  const unlocked = !previewGymId || previewGymId === homeGymId;

  const value: ThemeContextType = useMemo(() => ({
    theme: animatedTheme,
    activeGym,
    isUnlocked: unlocked,
    branding,
  }), [animatedTheme, activeGym, unlocked, branding]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
