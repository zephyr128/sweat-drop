/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Apple-style Dark Design System
        bg: {
          DEFAULT: '#000000', // Pure black (Apple style)
          elevated: '#0a0a0a',
          card: 'rgba(255, 255, 255, 0.04)',
          'card-hover': 'rgba(255, 255, 255, 0.07)',
          'card-active': 'rgba(0, 229, 204, 0.06)',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.06)',
          medium: 'rgba(255, 255, 255, 0.10)',
          accent: 'rgba(0, 229, 204, 0.20)',
          strong: 'rgba(255, 255, 255, 0.15)',
          DEFAULT: 'rgba(255, 255, 255, 0.06)',
          2: 'rgba(255, 255, 255, 0.10)',
        },
        accent: {
          DEFAULT: '#00E5FF',
          dim: 'rgba(0,229,204,0.08)',
          glow: 'rgba(0,229,204,0.15)',
        },
        lime: {
          DEFAULT: '#C8FF00',
          dim: 'rgba(200,255,0,0.08)',
        },
        orange: {
          DEFAULT: '#FF5500',
        },
        text: {
          DEFAULT: '#F5F5F7', // Apple's primary text white
          2: '#86868B', // Apple's secondary grey
          3: '#515154', // Apple's tertiary grey
        },
        // Legacy aliases for compatibility
        primary: {
          DEFAULT: '#00E5FF',
          dark: '#00E5FF',
          light: '#00E5FF',
        },
        drops: {
          DEFAULT: '#00E5FF',
          dark: '#A0CC00',
          light: '#D9FF33',
        },
        urgency: {
          DEFAULT: '#FF5500',
          dark: '#CC4400',
          light: '#FF7733',
        },
        background: {
          DEFAULT: '#070709',
          dark: '#000000',
        },
        textSecondary: '#8889A0',
        // Legacy colors for compatibility (will phase out)
        voltGreen: {
          DEFAULT: '#CEFF00',
          dark: '#A8CC00',
          light: '#E5FF33',
        },
        deepBlue: {
          DEFAULT: '#0066FF',
          dark: '#004DB8',
          light: '#3385FF',
        },
        secondary: {
          DEFAULT: '#FF9100',
          dark: '#CC7400',
          light: '#FFA733',
        },
        error: '#FF5252',
        surface: '#0A0A0A',
        surfaceElevated: '#1A1A1A',
        textSecondary: '#B0B0B0',
        textTertiary: '#808080',
        purple: {
          400: '#A78BFA',
          500: '#8B5CF6',
        },
        // Legacy aliases for compatibility
        gold: {
          DEFAULT: '#FF9100', // Maps to secondary
          light: '#FFA733',
          dark: '#CC7400',
        },
        neon: {
          green: '#00E5FF', // Maps to primary
          cyan: '#00E5FF', // Maps to primary
        },
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-bebas-neue)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-space-mono)', 'monospace'],
      },
      animation: {
        'drop-glow': 'dropGlow 2s ease-in-out infinite',
        'counter-increment': 'counterIncrement 0.5s ease-out',
      },
      keyframes: {
        dropGlow: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
        counterIncrement: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
