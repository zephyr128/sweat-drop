import { useMemo } from 'react';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme as baseTheme } from '@/lib/theme';

export interface BrandingColors {
  primary: string;
  primaryLight: string; // primaryColor with 15% opacity for card backgrounds
  primaryDark: string; // Darker shade for shadows
  onPrimary: string; // Text color on primary (#FFFFFF or #000000 based on contrast)
}

/**
 * Helper function to parse hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Helper function to convert RGB to hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

/**
 * Helper function to adjust color brightness
 */
function adjustColorBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.min(255, Math.max(0, Math.round(rgb.r * (1 + percent))));
  const g = Math.min(255, Math.max(0, Math.round(rgb.g * (1 + percent))));
  const b = Math.min(255, Math.max(0, Math.round(rgb.b * (1 + percent))));
  
  return rgbToHex(r, g, b);
}

/**
 * Helper function to add alpha to hex color (returns rgba string)
 */
function addAlphaToHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Helper function to calculate luminance (for contrast calculation)
 */
function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  
  // Convert RGB to relative luminance
  const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((val) => {
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Helper function to determine if color is dark (for text contrast)
 */
function isDarkColor(hex: string): boolean {
  const luminance = getLuminance(hex);
  return luminance < 0.5; // If luminance is less than 0.5, color is considered dark
}

/**
 * Dynamic Branding Hook
 * Generates all branding colors from a single primaryColor
 */
export const useBranding = (): BrandingColors => {
  const { activeGym } = useGymStore();
  
  const branding = useMemo(() => {
    // Get primary color from active gym or fallback to default
    const primaryColor = activeGym?.primary_color || baseTheme.colors.primary;
    
    // Validate hex color format - ensure primaryColor is a valid string
    if (!primaryColor || typeof primaryColor !== 'string' || !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(primaryColor)) {
      console.warn('[useBranding] Invalid primary color format, using default:', primaryColor);
      const defaultPrimary = baseTheme.colors.primary;
      return {
        primary: defaultPrimary,
        primaryLight: addAlphaToHex(defaultPrimary, 0.15),
        primaryDark: adjustColorBrightness(defaultPrimary, -0.2),
        onPrimary: isDarkColor(defaultPrimary) ? '#FFFFFF' : '#000000',
      };
    }
    
    // Generate primaryLight: primaryColor with 15% opacity
    const primaryLight = addAlphaToHex(primaryColor, 0.15);
    
    // Generate primaryDark: darker shade for shadows (darken by 20%)
    const primaryDark = adjustColorBrightness(primaryColor, -0.2);
    
    // Generate onPrimary: white or black text based on contrast
    // Use luminance to determine if color is dark (use white text) or light (use black text)
    const onPrimary = isDarkColor(primaryColor) ? '#FFFFFF' : '#000000';
    
    return {
      primary: primaryColor,
      primaryLight,
      primaryDark,
      onPrimary,
    };
  }, [activeGym?.primary_color]);
  
  // Always return a valid branding object
  return branding;
};
