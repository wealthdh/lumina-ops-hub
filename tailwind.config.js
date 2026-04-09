/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        lumina: {
          bg:      '#0a0d14',
          surface: '#0f1320',
          card:    '#141927',
          border:  '#1e2640',
          pulse:   '#00f5d4',
          gold:    '#f5c400',
          violet:  '#7c3aed',
          danger:  '#ff3b6b',
          success: '#00e676',
          warning: '#ff9800',
          muted:   '#4a5568',
          text:    '#e2e8f0',
          dim:     '#8892a4',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'pulse-fast':   'pulse 1s cubic-bezier(0.4,0,0.6,1) infinite',
        'glow':         'glow 2s ease-in-out infinite alternate',
        'scan':         'scan 4s linear infinite',
        'ticker':       'ticker 30s linear infinite',
        'spin-slow':    'spin 8s linear infinite',
        'float':        'float 6s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          from: { boxShadow: '0 0 10px #00f5d4, 0 0 20px #00f5d420' },
          to:   { boxShadow: '0 0 20px #00f5d4, 0 0 40px #00f5d440, 0 0 60px #00f5d420' },
        },
        scan: {
          '0%':   { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '0% 100%' },
        },
        ticker: {
          '0%':   { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
      },
      backgroundImage: {
        'grid-lumina': 'linear-gradient(rgba(0,245,212,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,212,0.03) 1px, transparent 1px)',
        'gradient-pulse': 'radial-gradient(ellipse at top, #00f5d420 0%, transparent 70%)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      boxShadow: {
        'pulse':   '0 0 20px rgba(0,245,212,0.3)',
        'gold':    '0 0 20px rgba(245,196,0,0.3)',
        'danger':  '0 0 20px rgba(255,59,107,0.3)',
        'card':    '0 4px 24px rgba(0,0,0,0.4)',
        'inset-pulse': 'inset 0 0 20px rgba(0,245,212,0.05)',
      },
    },
  },
  plugins: [],
}
