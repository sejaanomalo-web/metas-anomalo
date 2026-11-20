"use client"

import { usePathname, useSearchParams } from "next/navigation"
import estilos from "./funis.module.css"

export type VistaFunil = "geral" | "analise"

export function lerVista(valor: string | null): VistaFunil {
  return valor === "analise" ? "analise" : "geral"
}

/**
 * Troca entre a visão geral do funil e a análise detalhada (comparação entre
 * fontes, evolução e lançamentos). Os dados já estão na tela, então a troca é
 * instantânea: só muda o ?vista= via replaceState, sem ir ao servidor.
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
      {(
        [
          ["geral", "Visão geral"],
          ["analise", "Análise"],
        ] as const
      ).map(([id, rotulo]) => (
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
