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
        // High-end Dark Mode Color Palette
        primary: {
          DEFAULT: '#00E5FF', // Cyan (legacy)
          dark: '#00B8CC',
          light: '#33EBFF',
        },
        // Volt Green for Cardio (High-energy, vibrant)
        voltGreen: {
          DEFAULT: '#CEFF00', // Pure Volt Green
          dark: '#A8CC00',
          light: '#E5FF33',
          glow: '#CEFF00',
        },
        // Deep Blue for AI (Intelligent, futuristic)
        deepBlue: {
          DEFAULT: '#0066FF', // Deep Blue
          dark: '#004DB8',
          light: '#3385FF',
          glow: '#0066FF',
        },
        secondary: {
          DEFAULT: '#FF9100',
          dark: '#CC7400',
          light: '#FFA733',
        },
        error: '#FF5252',
        background: {
          DEFAULT: '#000000',
          dark: '#000000',
        },
        anthracite: {
          DEFAULT: '#1A1A1A', // Anthracite gray
          dark: '#0F0F0F',
          light: '#2A2A2A',
        },
        surface: '#0A0A0A',
        surfaceElevated: '#1A1A1A',
        text: '#FFFFFF',
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
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
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
