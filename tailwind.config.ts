import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // SafeSpace scenario accent palette
        hazard: "#ef4444", // red-500
        safe: "#22c55e", // green-500
        egress: "#3b82f6", // blue-500
      },
      boxShadow: {
        neon: "0 0 20px rgba(16, 185, 129, 0.45)",
      },
      keyframes: {
        "pulse-ring": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
