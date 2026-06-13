"use client"

import { useState } from "react"
import {
  apenasDigitos,
  digitosDeValor,
  formatarNumeroBR,
  valorMaquina,
} from "@/lib/mascaras"

/**
 * Input de moeda/decimal pt-BR com formatação ao digitar (abordagem caixa-
 * registradora: os últimos `casas` dígitos viram os centavos). Exibe a versão
 * bonita ("R$ 1.234,56") num input de texto e submete um VALOR-MÁQUINA limpo
 * ("1234.56") num campo oculto com `name` — porque o parser do servidor
 * (parseNumeroForm) rejeita texto com "R$ "/letras. Drop-in para os
 * `<input name="faturamento_real"|"valor"|...>` lidos via FormData.
 */
interface Props {
  name: string
  /** Valor inicial (edição). */
  defaultValue?: number | string | null
  /** Casas decimais (2 = moeda; 0 = inteiro com milhar). */
  casas?: number
  /** Mostra "R$ " na frente (default true). */
  prefixoReais?: boolean
  /** Máximo de dígitos no total (inteira + decimais). Default 13. */
  maxDigitos?: number
  className?: string
  style?: React.CSSProperties
  placeholder?: string
  required?: boolean
  /** Modo controlado: valor-máquina atual (ex.: "1234.56"). */
  value?: string
  /** Notifica o valor-máquina a cada digitação (forms controlados). */
  onValorChange?: (valorMaquina: string) => void
}

export default function CampoMoeda({
  name,
  defaultValue,
  casas = 2,
  prefixoReais = true,
  maxDigitos = 13,
  className,
  style,
  placeholder = "R$ 0,00",
  required,
  value,
  onValorChange,
}: Props) {
  const [dig, setDig] = useState(() => digitosDeValor(defaultValue, casas))
  // Modo controlado: deriva os dígitos do valor-máquina recebido.
  const digitos = value !== undefined ? digitosDeValor(value, casas) : dig

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = apenasDigitos(e.target.value).slice(0, maxDigitos)
    if (value === undefined) setDig(d)
    onValorChange?.(valorMaquina(d, casas))
  }

  const bonito = formatarNumeroBR(digitos, casas)
  const exibido =
    bonito === "" ? "" : prefixoReais ? `R$ ${bonito}` : bonito

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        className={className}
        style={style}
        placeholder={placeholder}
        required={required}
        value={exibido}
        onChange={onChange}
      />
      <input type="hidden" name={name} value={valorMaquina(digitos, casas)} />
    </>
  )
}
