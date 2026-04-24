/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    screens: {
      xs: "420px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
    },
    extend: {
      colors: {
        plant: {
          50: "#F0FAF5",
          100: "#DCF4E6",
          500: "#1D9E75",
          700: "#157554",
        },
        point: "#BA7517",
        strava: "#FC4C02",
      },
      fontFamily: {
        sans: ['"Noto Sans Thai"', "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
