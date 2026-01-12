import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme as baseTheme } from '@/lib/theme';

interface ThemeContextType {
  theme: typeof baseTheme & {
    colors: typeof baseTheme.colors & {
      primary: string;
      primaryDark: string;
      primaryLight: string;
    };
  };
  activeGym: ReturnType<typeof useGymStore>['activeGym'];
  isUnlocked: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

// Helper function to adjust color brightness
function adjustColorBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, Math.round((num >> 16) * (1 + percent))));
  const g = Math.min(255, Math.max(0, Math.round(((num >> 8) & 0x00ff) * (1 + percent))));
  const b = Math.min(255, Math.max(0, Math.round((num & 0x0000ff) * (1 + percent))));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { activeGym, homeGymId, previewGymId, isUnlocked } = useGymStore();
  
  // Default colors from base theme
  const defaultPrimary = baseTheme.colors.primary;
  const defaultPrimaryDark = baseTheme.colors.primaryDark;
  const defaultPrimaryLight = baseTheme.colors.primaryLight;

  // Get gym colors or fallback to defaults
  const gymPrimary = activeGym?.primary_color || defaultPrimary;
  const gymPrimaryDark = activeGym?.primary_color 
    ? adjustColorBrightness(gymPrimary, -0.2) 
    : defaultPrimaryDark;
  const gymPrimaryLight = activeGym?.primary_color 
    ? adjustColorBrightness(gymPrimary, 0.2) 
    : defaultPrimaryLight;

  // Memoize theme to prevent unnecessary re-renders
  const animatedTheme = useMemo(() => ({
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: gymPrimary,
      primaryDark: gymPrimaryDark,
      primaryLight: gymPrimaryLight,
    },
  }), [gymPrimary, gymPrimaryDark, gymPrimaryLight]);

  // Calculate isUnlocked value - if no preview, it's unlocked (using home gym)
  // If preview matches home, it's unlocked
  const unlocked = !previewGymId || previewGymId === homeGymId;

  const value: ThemeContextType = useMemo(() => ({
    theme: animatedTheme,
    activeGym,
    isUnlocked: unlocked,
  }), [animatedTheme, activeGym, unlocked]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
