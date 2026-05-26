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
        // ----- Stone tokens canônicos -----
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          hover: "var(--primary-hover)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        border: "var(--border)",
        ring: "var(--ring)",
        destructive: {
          DEFAULT: "var(--destructive)",
          bg: "var(--destructive-bg)",
        },

        // ----- Aliases legados (mantém usos como bg-bg, text-text-1) -----
        bg: "var(--background)",
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        text: {
          1: "var(--text-1)",
          2: "var(--text-2)",
          3: "var(--text-3)",
          4: "var(--text-4)",
        },
        success: {
          DEFAULT: "var(--success)",
          bg: "var(--success-bg)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          bg: "var(--warning-bg)",
        },
        danger: {
          DEFAULT: "var(--destructive)",
          bg: "var(--destructive-bg)",
        },

        // Antigo "gold" remapeado pro primary Stone — classes
        // bg-gold/text-gold viram cinza-chumbo.
        gold: {
          DEFAULT: "var(--primary)",
          soft: "rgba(76, 78, 84, 0.08)",
          muted: "var(--muted-foreground)",
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
        display: [
          "Sharon Display",
          "Inter",
          "ui-sans-serif",
          "system-ui",
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
        none: "0px",
        button: "2px",
        input: "8px",
        card: "16px",
        chip: "9999px",
      },
      letterSpacing: {
        // Stone case=none — tracking sutil em vez do exagerado 1.17px.
        label: "0.04em",
        nav: "0.02em",
        micro: "0",
      },
      spacing: {
        // Escala mantida pra compat com pages existentes.
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
      },
      boxShadow: {
        // Stone: flat. Sombras só pra overlays (modal/drawer).
        modal: "0px 8px 50px 0px rgba(66, 74, 83, 0.30)",
        gold: "0 0 0 1px var(--border)",
        none: "0 0 0 0 transparent",
      },
    },
  },
  plugins: [],
}

export default config
