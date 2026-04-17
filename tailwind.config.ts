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
        bg: "#080808",
        header: "#0a0a0a",
        card: "#0c0c0c",
        cell: "#090909",
        grid: "#090909",
        line: "#141414",
        divider: "#111111",
        "line-hover": "#202020",
        gold: {
          DEFAULT: "#C9953A",
          soft: "#C9953A33",
        },
        ink: {
          primary: "#e0e0e0",
          secondary: "#686868",
          muted: "#242424",
          ghost: "#1c1c1c",
        },
        status: {
          red: "#e24b4a",
          green: "#4caf50",
          neutral: "#252525",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        serif: ["'Playfair Display'", "ui-serif", "Georgia", "serif"],
        mono: ["'DM Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
}

export default config
