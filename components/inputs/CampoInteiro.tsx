"use client"

import { useState } from "react"
import { apenasDigitos } from "@/lib/mascaras"

/**
 * Input de número inteiro (contagem): só dígitos, limite de quantidade de
 * dígitos e clamp opcional por valor máximo. Substitui `<input type="number">`
 * — submete dígitos crus em `name` (o servidor usa parseInt). Funciona como
 * drop-in em forms que leem via FormData (a maioria) e também controlado
 * (passe `value` + `onValorChange`).
 *
 * type="text" + inputMode="numeric" (em vez de type="number") garante teclado
 * numérico no mobile E impede 'e', '+', '-', '.', colar texto, etc.
 */
interface Props
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "min" | "max"
  > {
  name: string
  /** Máximo de dígitos digitáveis (default 7 = até 9.999.999). */
  maxDigitos?: number
  /** Valor inicial (edição). number | string numérico. */
  defaultValue?: number | string | null
  /** Clamp numérico opcional (ex.: dia de vencimento 1–31). */
  valorMax?: number
  /** Modo controlado: se passado, o componente reflete este valor. */
  value?: string
  onValorChange?: (digitos: string) => void
}

export default function CampoInteiro({
  name,
  maxDigitos = 7,
  defaultValue,
  valorMax,
  value,
  onValorChange,
  ...rest
}: Props) {
  const inicial =
    defaultValue === null || defaultValue === undefined || defaultValue === ""
      ? ""
      : apenasDigitos(String(defaultValue)).slice(0, maxDigitos)
  const [interno, setInterno] = useState(inicial)
  const controlado = value !== undefined
  const atual = controlado ? value : interno

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    let d = apenasDigitos(e.target.value).slice(0, maxDigitos)
    if (valorMax !== undefined && d !== "" && Number(d) > valorMax) {
      d = String(valorMax)
    }
    if (!controlado) setInterno(d)
    onValorChange?.(d)
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      name={name}
      value={atual}
      onChange={onChange}
    />
  )
}
