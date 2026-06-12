"use client"

import { useState } from "react"
import {
  apenasDigitos,
  formatarTelefone,
  formatarCEP,
  formatarCPF,
  formatarCNPJ,
  telefoneParaE164,
} from "@/lib/mascaras"

/**
 * Input com máscara pt-BR para documentos/contatos (telefone, CEP, CPF, CNPJ).
 * Formata ao digitar e limita ao número de dígitos do tipo. Exibe a versão
 * formatada e submete um campo oculto `name` com o valor canônico (só dígitos,
 * ou E.164 no caso do telefone). Pronto para uso quando esses campos
 * existirem na UI (hoje o sistema não tem nenhum).
 *
 *   <CampoMascara tipo="telefone" name="telefone" />
 *   <CampoMascara tipo="cep" name="cep" />
 */
type Tipo = "telefone" | "cep" | "cpf" | "cnpj"

const CONFIG: Record<
  Tipo,
  { fmt: (v: string) => string; maxDig: number; canonico: (v: string) => string; ph: string }
> = {
  telefone: { fmt: formatarTelefone, maxDig: 11, canonico: telefoneParaE164, ph: "(00) 00000-0000" },
  cep: { fmt: formatarCEP, maxDig: 8, canonico: apenasDigitos, ph: "00000-000" },
  cpf: { fmt: formatarCPF, maxDig: 11, canonico: apenasDigitos, ph: "000.000.000-00" },
  cnpj: { fmt: formatarCNPJ, maxDig: 14, canonico: apenasDigitos, ph: "00.000.000/0000-00" },
}

interface Props {
  tipo: Tipo
  name: string
  defaultValue?: string | null
  className?: string
  style?: React.CSSProperties
  placeholder?: string
  required?: boolean
  /** Submete a versão formatada em vez do canônico (ex.: telefone "(11)..."). */
  submeterFormatado?: boolean
}

export default function CampoMascara({
  tipo,
  name,
  defaultValue,
  className,
  style,
  placeholder,
  required,
  submeterFormatado,
}: Props) {
  const cfg = CONFIG[tipo]
  const [dig, setDig] = useState(() =>
    apenasDigitos(String(defaultValue ?? "")).slice(0, cfg.maxDig)
  )

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDig(apenasDigitos(e.target.value).slice(0, cfg.maxDig))
  }

  const valorSubmetido = submeterFormatado ? cfg.fmt(dig) : cfg.canonico(dig)

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        className={className}
        style={style}
        placeholder={placeholder ?? cfg.ph}
        required={required}
        value={cfg.fmt(dig)}
        onChange={onChange}
      />
      <input type="hidden" name={name} value={valorSubmetido} />
    </>
  )
}
