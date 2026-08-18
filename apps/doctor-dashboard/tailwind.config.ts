import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Serene Nature palette
        "ot-cream":    "#FDF1DB",
        "ot-surface":  "#DFD5C6",
        "ot-blue":     "#4F8FA8",
        "ot-sage":     "#96AB88",
        "ot-text":     "#2C3E35",
        "ot-muted":    "#7A8C85",
        "ot-grid":     "#A6CBD3",
        "ot-critical": "#D64045",
        "ot-warning":  "#E8A838",
        "ot-stable":   "#96AB88",
        // Role-selection accents
        "ot-canvas":   "#F9F4EE",
        "ot-terracotta": "#C77D5E",
      },
      boxShadow: {
        ambient:  "0px 4px 20px rgba(44, 62, 53, 0.08)",
        elevated: "0px 8px 30px rgba(44, 62, 53, 0.12)",
        card:     "0 2px 12px rgba(0, 0, 0, 0.06)",
        "card-deep": "0 10px 25px rgba(44, 62, 53, 0.15)",
        "card-float": "0 20px 40px rgba(199, 125, 94, 0.15)",
      },
      keyframes: {
        "slide-down": {
          from: { transform: "translateY(-16px)", opacity: "0" },
          to:   { transform: "translateY(0)",     opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "scale-up": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to:   { transform: "scale(1)",    opacity: "1" },
        },
      },
      animation: {
        "slide-down": "slide-down 0.3s ease-out",
        "fade-in":    "fade-in 0.4s ease-out",
        "scale-up":   "scale-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
