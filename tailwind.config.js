/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pizza: {
          gold: '#D4AF37',
          'gold-light': '#F5E6A8',
          'gold-dark': '#8A6F1F',
          red: '#C8102E',
          'red-dark': '#8E0B20',
          black: '#050505',
          card: '#0E0E10',
          border: '#1F1F23',
          muted: '#8A8A93',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      boxShadow: {
        gold: '0 10px 40px -10px rgba(212, 175, 55, 0.35)',
        'gold-sm': '0 4px 18px -4px rgba(212, 175, 55, 0.25)',
        luxury: '0 20px 60px -15px rgba(0, 0, 0, 0.8)',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #F5E6A8 0%, #D4AF37 50%, #8A6F1F 100%)',
        'dark-gradient': 'linear-gradient(180deg, #050505 0%, #0E0E10 100%)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        shimmer: 'shimmer 3s linear infinite',
        float: 'float 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
