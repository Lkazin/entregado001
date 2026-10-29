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
          red: '#E50914',
          'red-dark': '#B8070F',
          'red-light': '#FF2A36',
          gold: '#F59E0B',
          dark: '#0A0A0C',
          card: '#121216',
          border: '#23232A',
          muted: '#8A8A93'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
