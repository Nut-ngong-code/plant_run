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
          200: "#B6E7C9",
          300: "#85D4A6",
          400: "#4DBC83",
          500: "#1D9E75",
          600: "#16855E",
          700: "#157554",
          800: "#0F5C42",
          900: "#0A4131",
        },
        sage: {
          50: "#F4F7F1",
          100: "#E5EDDD",
          200: "#CADBBC",
          300: "#A8C397",
          400: "#85A773",
          500: "#658957",
        },
        cream: {
          50: "#FBF9F2",
          100: "#F5F0E0",
          200: "#ECE3C8",
        },
        bark: {
          400: "#B07A3D",
          500: "#8C5A24",
          600: "#6D4418",
        },
        sun: "#F4B940",
        point: "#BA7517",
        strava: "#FC4C02",
      },
      fontFamily: {
        sans: ['"Noto Sans Thai"', "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ['"Noto Sans Thai"', "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px -8px rgba(21, 117, 84, 0.18), 0 2px 6px -2px rgba(21, 117, 84, 0.08)",
        "glass-lg": "0 24px 60px -16px rgba(21, 117, 84, 0.28), 0 4px 12px -4px rgba(21, 117, 84, 0.10)",
        "soft": "0 1px 3px rgba(15, 92, 66, 0.06), 0 8px 24px -10px rgba(15, 92, 66, 0.10)",
        "glow-plant": "0 0 0 1px rgba(29, 158, 117, 0.15), 0 8px 24px -6px rgba(29, 158, 117, 0.45)",
        "glow-water": "0 8px 22px -6px rgba(14, 165, 233, 0.5)",
        "glow-fert": "0 8px 22px -6px rgba(245, 158, 11, 0.5)",
        "glow-strava": "0 8px 22px -6px rgba(252, 76, 2, 0.45)",
      },
      backgroundImage: {
        "garden": "radial-gradient(ellipse at 0% 0%, #DCF4E6 0%, transparent 55%), radial-gradient(ellipse at 100% 0%, #F5F0E0 0%, transparent 50%), radial-gradient(ellipse at 50% 100%, #E5EDDD 0%, transparent 60%), linear-gradient(180deg, #F4F7F1 0%, #FBF9F2 100%)",
        "leaf-stripes": "repeating-linear-gradient(135deg, rgba(29,158,117,0.04) 0 12px, transparent 12px 24px)",
      },
      animation: {
        breathe: "breathe 4.5s ease-in-out infinite",
        sway: "sway 6s ease-in-out infinite",
        float: "float 8s ease-in-out infinite",
        "float-slow": "float 14s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        "fade-up": "fadeUp 0.4s ease-out both",
      },
      keyframes: {
        breathe: {
          "0%,100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.025)" },
        },
        sway: {
          "0%,100%": { transform: "rotate(-1.5deg)" },
          "50%": { transform: "rotate(1.5deg)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0px) rotate(0deg)" },
          "50%": { transform: "translateY(-12px) rotate(3deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
