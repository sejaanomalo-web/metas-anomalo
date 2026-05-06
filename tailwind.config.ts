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
        bg: "#000000",
        surface: "#111111",
        ink: {
          DEFAULT: "#000000",
        },
        gold: {
          DEFAULT: "#C9953A",
          soft: "#C9953A33",
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
        button: "32px",
        card: "36px",
        input: "32px",
      },
      letterSpacing: {
        display: "0.96px",
        nav: "1.17px",
        label: "1.17px",
        micro: "1px",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "40px",
      },
      boxShadow: {
        gold: "0 0 0 1px #C9953A33, 0 8px 30px rgba(201,149,58,0.08)",
        none: "0 0 0 0 transparent",
      },
    },
  },
  plugins: [],
}

export default config
