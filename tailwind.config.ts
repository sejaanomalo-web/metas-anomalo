import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Page background (navy escuro calibrado).
        bg: "#0a0e1a",

        // Surface scale — elevation por luminância.
        surface: {
          1: "#121826",
          2: "#1a2236",
          3: "#232b40",
        },

        // Escala fechada de texto.
        text: {
          1: "#ffffff",
          2: "#c7cdd9",
          3: "#8a93a3",
          4: "#5b6473",
        },

        // Cor semântica.
        success: {
          DEFAULT: "#16a34a",
          bg: "rgba(22, 163, 74, 0.12)",
        },
        warning: {
          DEFAULT: "#eab308",
          bg: "rgba(234, 179, 8, 0.12)",
        },
        danger: {
          DEFAULT: "#ef4444",
          bg: "rgba(239, 68, 68, 0.12)",
        },

        // Marca.
        gold: {
          DEFAULT: "#C9953A",
          soft: "rgba(201, 149, 58, 0.12)",
          muted: "#8a6628",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Helvetica Neue",
          "Helvetica",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        card: "16px",
        input: "10px",
        button: "10px",
        chip: "999px",
      },
      letterSpacing: {
        label: "1.17px",
        nav: "1.17px",
        micro: "1px",
      },
      spacing: {
        // Múltiplos rígidos de 4/8 — abandona 3, 5, 12, 14, 18, 22.
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
      },
      boxShadow: {
        gold: "0 0 0 1px rgba(201,149,58,0.20)",
        none: "0 0 0 0 transparent",
      },
    },
  },
  plugins: [],
}

export default config
