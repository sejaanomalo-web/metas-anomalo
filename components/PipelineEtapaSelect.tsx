"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  ETAPAS_FUNIL,
  ROTULO_ETAPA,
  type EtapaFunil,
} from "@/lib/comercial-tipos"
import { moverEtapaPipelineAction } from "@/lib/relatorios-comerciais"

/**
 * Seletor de etapa inline por oportunidade. Ao trocar, chama
 * moverEtapaPipelineAction e dá refresh — o funil (server component)
 * recalcula contagem/valor por etapa. Fecha o loop "mover oportunidade →
 * funil atualiza" sem precisar reabrir o formulário.
 */
export default function PipelineEtapaSelect({
  id,
  etapaAtual,
}: {
  id: string
  etapaAtual: EtapaFunil
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onChange(novaEtapa: string) {
    if (novaEtapa === etapaAtual) return
    const fd = new FormData()
    fd.set("id", id)
    fd.set("etapa", novaEtapa)
    startTransition(async () => {
      const r = await moverEtapaPipelineAction(fd)
      if (r.ok) router.refresh()
    })
  }

  return (
    <select
      value={etapaAtual}
      onChange={(e) => onChange(e.target.value)}
      disabled={pending}
      className="glass-input no-ds"
      aria-label="Etapa da oportunidade"
      style={{
        padding: "6px 10px",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: "var(--accent, #C9953A)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      {ETAPAS_FUNIL.map((e) => (
        <option key={e} value={e} style={{ background: "#121826" }}>
          {ROTULO_ETAPA[e]}
        </option>
      ))}
    </select>
  )
}
