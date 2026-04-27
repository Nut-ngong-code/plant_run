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
        // Bright surface scale — page background + card tints (light → slightly tinted)
        paper: {
          0: "#FFFFFF",
          50: "#FAFEFB",
          100: "#F4FAF5",
          200: "#EAF3EC",
          300: "#D8E8DB",
          400: "#BFD3C3",
          500: "#9FB8A4",
        },
        // Text + soft borders (dark → muted) for use on light surfaces
        forest: {
          50: "#F1F7F2",
          100: "#D7E4D9",
          200: "#B0C7B5",
          300: "#85A48C",
          400: "#5E8267",
          500: "#42624A",
          600: "#2E4A36",
          700: "#1F3527",
          800: "#15291F",
          900: "#0B1F18",
        },
        // Vibrant plant accent (buttons, gauges, brand)
        plant: {
          50: "#E8FFF1",
          100: "#C5F8D8",
          200: "#94E9B5",
          300: "#5FD491",
          400: "#2EBE73",
          500: "#0EA15A",
          600: "#0A8347",
          700: "#076635",
          800: "#054C26",
          900: "#03341B",
        },
        // Sunrise orange (Strava, run stats)
        sun: {
          50: "#FFF7E8",
          100: "#FFE6BC",
          200: "#FFCB7A",
          300: "#FFB347",
          400: "#FB8C00",
          500: "#E76A00",
          600: "#B85100",
        },
        // Sky / water (moisture, water button)
        sky2: {
          100: "#DCF2FB",
          200: "#B5E1F5",
          300: "#7DD3FC",
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
        },
        point: "#C77B12",
        strava: "#FC4C02",
      },
      fontFamily: {
        sans: ['"Noto Sans Thai"', "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ['"Space Grotesk"', '"Noto Sans Thai"', "sans-serif"],
        mono: ['"JetBrains Mono"', '"Roboto Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Soft drop shadows tuned for the light theme
        soft: "0 1px 3px rgba(15, 42, 30, 0.05), 0 8px 24px -10px rgba(15, 42, 30, 0.08)",
        glass:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 32px -8px rgba(15, 42, 30, 0.12), 0 2px 8px -2px rgba(15, 42, 30, 0.06)",
        "glass-lg":
          "0 1px 0 rgba(255,255,255,0.8) inset, 0 24px 60px -16px rgba(15, 42, 30, 0.18), 0 4px 12px -4px rgba(15, 42, 30, 0.08)",
        "glow-plant": "0 8px 24px -6px rgba(14, 161, 90, 0.5)",
        "glow-water": "0 8px 24px -6px rgba(14, 165, 233, 0.5)",
        "glow-fert": "0 8px 24px -6px rgba(251, 140, 0, 0.5)",
        "glow-strava": "0 8px 24px -6px rgba(252, 76, 2, 0.45)",
      },
      backgroundImage: {
        "morning-sky":
          "radial-gradient(ellipse 60% 40% at 0% 0%, rgba(125, 211, 252, 0.40) 0%, transparent 60%), radial-gradient(ellipse 50% 35% at 100% 0%, rgba(255, 179, 71, 0.22) 0%, transparent 60%), radial-gradient(ellipse 70% 50% at 50% 100%, rgba(94, 214, 145, 0.32) 0%, transparent 65%), linear-gradient(180deg, #F4FAF5 0%, #FAFEFB 60%, #EFF8F2 100%)",
        "dot-grid": "radial-gradient(rgba(11, 31, 24, 0.08) 1px, transparent 1px)",
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
