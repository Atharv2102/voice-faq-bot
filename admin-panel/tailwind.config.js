/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAF9F6',
        ink: '#1F1F1F',
        muted: '#6B6B6B',
        border: '#E0DED9',
        teal: { DEFAULT: '#0F6E56', light: '#E6F4F0', dark: '#0A5240' },
        amber: { DEFAULT: '#D97706', light: '#FEF3C7' },
        red: { DEFAULT: '#DC2626', light: '#FEE2E2' },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '6px', none: '0' },
    },
  },
  plugins: [],
};
