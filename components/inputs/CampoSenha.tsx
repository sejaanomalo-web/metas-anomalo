"use client"

import { useState } from "react"

/**
 * Input de senha com botão "olho" para mostrar/ocultar o que está sendo
 * digitado. Por padrão o valor fica oculto (type="password"); o usuário opta
 * por revelar. Drop-in para qualquer `<input type="password">` — submete o
 * valor em `name` via FormData normalmente.
 *
 * Aceita os atributos comuns de input (name, required, minLength, maxLength,
 * autoComplete, placeholder, defaultValue, className). `style` é aplicado ao
 * <input>; `wrapperStyle` cuida do layout externo (margin/width) já que o
 * componente envolve o input num <span> relativo para posicionar o olho.
 */
interface Props
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type"
  > {
  name: string
  /** Estilo do contêiner (margin/width). O olho é posicionado em relação a ele. */
  wrapperStyle?: React.CSSProperties
}

export default function CampoSenha({
  className,
  style,
  wrapperStyle,
  ...rest
}: Props) {
  const [visivel, setVisivel] = useState(false)

  return (
    <span style={{ position: "relative", display: "block", ...wrapperStyle }}>
      <input
        {...rest}
        type={visivel ? "text" : "password"}
        className={className}
        style={{ width: "100%", paddingRight: 42, ...style }}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 8,
          top: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--text-4, rgba(255,255,255,0.4))",
        }}
      >
        {visivel ? <IconeOlhoFechado /> : <IconeOlho />}
      </button>
    </span>
  )
}

function IconeOlho() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconeOlhoFechado() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}
