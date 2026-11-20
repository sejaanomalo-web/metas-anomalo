"use client"

import { usePathname, useSearchParams } from "next/navigation"
import estilos from "./funis.module.css"

export type VistaFunil = "geral" | "analise" | "demanda" | "investimento"

const VISTAS: readonly [VistaFunil, string][] = [
  ["geral", "Visão geral"],
  ["analise", "Análise"],
  ["demanda", "Demanda"],
  ["investimento", "Investimento"],
]

export function lerVista(valor: string | null): VistaFunil {
  return VISTAS.find(([id]) => id === valor)?.[0] ?? "geral"
}

/**
 * Abas da tela: Visão geral (só o funil), Análise (comparação, evolução e
 * lançamentos), Demanda (de onde vieram) e Investimento (custos e retorno).
 * Os dados já estão na tela, então a troca é instantânea: só muda o ?vista=
 * via replaceState, sem ir ao servidor.
 */
export default function AbasVista() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const vista = lerVista(searchParams.get("vista"))

  function trocar(nova: VistaFunil) {
    const params = new URLSearchParams(searchParams.toString())
    if (nova === "geral") params.delete("vista")
    else params.set("vista", nova)
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`)
  }

  return (
    <div role="tablist" aria-label="Visão do funil" className={estilos.abasVista}>
      {VISTAS.map(([id, rotulo]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={vista === id}
          className={estilos.abaVista}
          onClick={() => trocar(id)}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
}
