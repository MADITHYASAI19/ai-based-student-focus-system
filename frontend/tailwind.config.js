/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Reference design color system
        'ref-bg': '#f4f6f8',
        'ref-surface': '#ffffff',
        'ref-line': '#e6eaf0',
        'ref-ink': '#16253b',
        'ref-text-muted': '#566478',
        'ref-text-light': '#8b96a8',
        'ref-accent': '#24425f',
        'ref-accent-light': '#e8f1fc',
        'ref-amber': '#e0641c',
        'ref-amber-light': '#fff1e4',
        'ref-success': '#138a5e',
        'ref-success-light': '#e5f8ed',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}
