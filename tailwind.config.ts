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
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
}

export default config
