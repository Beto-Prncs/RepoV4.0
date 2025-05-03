module.exports = {
  content: [
    "./src/**/*.{html,ts,tsx,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#3b82f6',
        'primary-dark': '#2563eb',
        'primary-light': '#eff6ff',
        'secondary': '#64748b',
        'accent': '#0ea5e9',
        'success': '#10b981',
        'warning': '#f59e0b',
        'danger': '#ef4444',
      },
      // Añadir animaciones personalizadas
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-right': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        'error-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
        'form-slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-scale': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-out-right': 'slide-out-right 0.3s ease-out',
        'error-shake': 'error-shake 0.4s ease-in-out',
        'form-slide-up': 'form-slide-up 0.5s ease-out',
        'pulse-scale': 'pulse-scale 2s ease-in-out infinite',
        'float': 'float 5s ease-in-out infinite',
      },
      // Extender las sombras
      boxShadow: {
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'input-focus': '0 0 0 3px rgba(59, 130, 246, 0.25)',
        'button': '0 2px 4px rgba(0, 0, 0, 0.1)',
        'button-hover': '0 4px 8px rgba(0, 0, 0, 0.15)',
      },
      // Extender transiciones
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
        'width': 'width',
        'border': 'border-width, border-color',
      },
      // Personalizar espaciado para formularios
      spacing: {
        '4.5': '1.125rem',
        '5.5': '1.375rem',
      },
      // Bordereado personalizado
      borderRadius: {
        'input': '0.5rem',
        'card': '0.75rem',
        'button': '0.5rem',
      },
    },
  },
  // Plugins adicionales
  plugins: [

  ],
}