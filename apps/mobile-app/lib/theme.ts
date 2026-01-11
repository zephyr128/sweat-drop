/**
 * SweatDrop Global Theme
 * Dark mode with Neon Blue/Cyan accents
 * Easy to update colors in one place
 */

export const theme = {
  // Colors
  colors: {
    // Background
    background: '#000000', // True Black for maximum OLED contrast
    surface: '#1E1E1E', // Slightly lighter surface
    surfaceElevated: '#2A2A2A', // Elevated cards
    
    // Primary - Electric Cyan (Drops)
    primary: '#00E5FF', // Electric Cyan
    primaryDark: '#00B8CC', // Darker cyan for hover states
    primaryLight: '#33EBFF', // Lighter cyan for highlights
    
    // Secondary - Neon Orange (Alerts/Hot)
    secondary: '#FF9100', // Neon Orange
    secondaryDark: '#CC7400', // Darker orange
    secondaryLight: '#FFA733', // Lighter orange
    
    // Text
    text: '#FFFFFF', // White text
    textSecondary: '#B0B0B0', // Gray text
    textTertiary: '#808080', // Lighter gray for hints
    
    // Status
    success: '#00E5FF', // Use primary for success
    error: '#FF5252', // Red for errors
    warning: '#FF9100', // Use secondary for warnings
    info: '#00E5FF', // Use primary for info
    
    // Border & Divider
    border: '#333333', // Subtle borders
    divider: '#2A2A2A', // Dividers
    
    // Overlay
    overlay: 'rgba(0, 0, 0, 0.8)', // Dark overlay for modals
    overlayLight: 'rgba(0, 0, 0, 0.5)', // Lighter overlay
  },
  
  // Typography
  typography: {
    // Font Families
    fontFamily: {
      regular: 'System', // Will use Inter or Roboto if available
      medium: 'System',
      bold: 'System',
      monospace: 'Courier', // Monospace for numbers
    },
    
    // Font Sizes
    fontSize: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      '2xl': 24,
      '3xl': 28,
      '4xl': 32,
      '5xl': 48,
      '6xl': 64,
    },
    
    // Font Weights
    fontWeight: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
    
    // Line Heights
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  
  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,
    '3xl': 64,
  },
  
  // Border Radius
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
  
  // Glass Effect
  glass: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(255, 255, 255, 0.1)',
  },
  
  // Shadows
  shadows: {
        sm: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.2,
          shadowRadius: 2,
          elevation: 2,
        },
        md: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 4,
        },
        lg: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 8,
        },
        glow: {
          shadowColor: '#00E5FF', // Cyan glow - more intense
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1.0,
          shadowRadius: 30,
          elevation: 15,
        },
        orangeGlow: {
          shadowColor: '#FF9100', // Orange glow for streaks
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: 20,
          elevation: 12,
        },
      },
  
  // Animations
  animations: {
    duration: {
      fast: 150,
      normal: 300,
      slow: 500,
    },
    easing: {
      default: 'ease-in-out',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    },
  },
} as const;

// Helper function to get number style (monospace, bold)
export const getNumberStyle = (fontSize: number) => ({
  fontFamily: theme.typography.fontFamily.monospace,
  fontSize,
  fontWeight: theme.typography.fontWeight.bold,
  color: theme.colors.text,
});

// Export individual color values for convenience
export const colors = theme.colors;
export const spacing = theme.spacing;
export const borderRadius = theme.borderRadius;
export const shadows = theme.shadows;
export const typography = theme.typography;
export const glass = theme.glass;
