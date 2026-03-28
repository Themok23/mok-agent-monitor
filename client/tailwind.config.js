/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cyberpunk background and surface layers
        cyberpunk: {
          bg: "#03030a",
          surface: {
            0: "#03030a",
            1: "#060610",
            2: "#0a0a1a",
            3: "#0e0e24",
            4: "#141430",
            5: "#1a1a3d",
          },
          border: "#1a1a3d",
        },
        // Neon accent colors
        "neon-cyan": "#00ffff",
        "neon-pink": "#ff00aa",
        "neon-amber": "#ffaa00",
        "neon-success": "#00ff88",
        "neon-error": "#ff2244",
        // Text colors
        "text-primary": "#e0e8ff",
        "text-secondary": "#7080aa",
        // Legacy surface colors for compatibility
        surface: {
          0: "#03030a",
          1: "#060610",
          2: "#0a0a1a",
          3: "#0e0e24",
          4: "#141430",
          5: "#1a1a3d",
        },
        border: {
          DEFAULT: "#1a1a3d",
          light: "#282850",
        },
        accent: {
          DEFAULT: "#00ffff",
          hover: "#00ffaa",
          muted: "rgba(0, 255, 255, 0.15)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
        orbitron: ["Orbitron", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "scanline": "scanline-shift 8s linear infinite",
        "glitch": "glitch-text-anim 3s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": {
            boxShadow: "0 0 5px rgba(0, 255, 255, 0.5)",
          },
          "50%": {
            boxShadow: "0 0 20px rgba(0, 255, 255, 0.8)",
          },
        },
        "scanline-shift": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(10px)" },
        },
        "glitch-text-anim": {
          "0%, 100%": {
            textShadow: "0 0 10px rgba(0, 255, 255, 0.8)",
          },
          "50%": {
            textShadow: "0 0 20px rgba(0, 255, 255, 0.6), 0 0 10px rgba(255, 0, 170, 0.4)",
          },
        },
      },
    },
  },
  plugins: [],
};
