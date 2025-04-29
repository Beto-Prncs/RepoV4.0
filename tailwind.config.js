/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./src/**/*.{html,ts}",
    ],
    theme: {
      extend: {
        colors: {
          'primary': '#3b82f6',
          'primary-dark': '#2563eb',
          'secondary': '#64748b',
          'accent': '#0ea5e9',
          'success': '#10b981',
          'warning': '#f59e0b',
          'danger': '#ef4444',
          'bg-light': '#f8fafc',
          'text-dark': '#1e293b',
          'text-light': '#94a3b8',
          'border-color': '#e2e8f0',
        },
        boxShadow: {
          'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        },
        borderRadius: {
          'standard': '0.5rem',
        },
        transitionProperty: {
          'standard': 'all',
        },
        transitionDuration: {
          'fast': '200ms',
          'normal': '300ms',
        },
        transitionTimingFunction: {
          'standard': 'ease',
        },
      },
    },
    plugins: [],
}