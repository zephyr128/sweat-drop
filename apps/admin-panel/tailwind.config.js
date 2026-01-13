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
        primary: {
          DEFAULT: '#00E5FF',
          dark: '#00B8CC',
          light: '#33EBFF',
        },
        secondary: {
          DEFAULT: '#FF9100',
          dark: '#CC7400',
          light: '#FFA733',
        },
        error: '#FF5252',
        background: '#000000',
        surface: '#0A0A0A',
        surfaceElevated: '#1A1A1A',
        text: '#FFFFFF',
        textSecondary: '#B0B0B0',
        textTertiary: '#808080',
      },
    },
  },
  plugins: [],
}
