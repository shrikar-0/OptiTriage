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
      },
      boxShadow: {
        ambient:  "0px 4px 20px rgba(44, 62, 53, 0.08)",
        elevated: "0px 8px 30px rgba(44, 62, 53, 0.12)",
        card:     "0 2px 12px rgba(0, 0, 0, 0.06)",
      },
      keyframes: {
        "slide-down": {
          from: { transform: "translateY(-16px)", opacity: "0" },
          to:   { transform: "translateY(0)",     opacity: "1" },
        },
      },
      animation: {
        "slide-down": "slide-down 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
