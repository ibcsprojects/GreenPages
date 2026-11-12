/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Brand: the one accent colour.
        leaf: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        // Text: warm near-black.
        bark: {
          700: '#3f3f29',
          900: '#1f2417',
        },
        // Warnings and the issue-count badge (sparingly; never a second accent).
        clay: {
          50: '#fdf4f0',
          100: '#f9e1d7',
          600: '#c2410c',
          700: '#9a3412',
        },
        // Panel surface: a hair off white so cards read as raised.
        paper: '#fafbf8',
      },
      boxShadow: {
        card: '0 1px 2px rgba(31, 36, 23, 0.06)',
        lift: '0 4px 14px rgba(31, 36, 23, 0.14), 0 1px 3px rgba(31, 36, 23, 0.10)',
        panel: '0 18px 48px rgba(31, 36, 23, 0.18), 0 2px 6px rgba(31, 36, 23, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
