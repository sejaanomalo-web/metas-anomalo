"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { dispararSentinelaDia } from "@/lib/sentinela-trigger"

/** Data em BRT (UTC-3, sem DST) no formato YYYY-MM-DD, com offset de dias. */
function diaBRT(offset = 0): string {
  const agora = new Date()
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  const brt = new Date(utcMs - 3 * 60 * 60_000 + offset * 24 * 60 * 60_000)
  return brt.toISOString().slice(0, 10)
}

type Estado =
  | { fase: "idle" }
  | { fase: "rodando"; pct: number; dia: string }
  | { fase: "ok"; resumo: string }
  | { fase: "erro"; msg: string }

/**
 * Botão "Atualizar dados" do dashboard de Tráfego (visão geral).
 *
 * Diferente do BotaoAtualizar genérico (que só faz router.refresh), este
 * DISPARA uma nova execução do agente Sentinela — re-puxando o Meta para
 * TODAS as empresas ativas — em hoje e ontem (os dias que mais mudam),
 * com spinner e porcentagem real de progresso. Ao terminar, recarrega o
 * dashboard inteiro (router.refresh) para refletir os dados novos.
 */
export default function BotaoAtualizarTrafego() {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>({ fase: "idle" })

  async function atualizar() {
    if (estado.fase === "rodando") return
    // Hoje + ontem cobrem os dias voláteis; uma chamada por dia processa
    // TODAS as empresas ativas. Sequencial → progresso real por etapa.
    const dias = [diaBRT(0), diaBRT(-1)]
    const total = dias.length
    let falhas = 0
    let ultimoErro = ""
    let contas = 0

    setEstado({ fase: "rodando", pct: 2, dia: dias[0] })
    for (let i = 0; i < total; i++) {
      const dia = dias[i]
      setEstado({
        fase: "rodando",
        pct: Math.max(2, Math.round((i / total) * 100)),
        dia,
      })
      const r = await dispararSentinelaDia(dia)
      if (!r.ok) {
        falhas++
        ultimoErro = r.erro ?? "Falha."
      } else if (typeof r.contasProcessadas === "number") {
        contas = Math.max(contas, r.contasProcessadas)
      }
      setEstado({
        fase: "rodando",
        pct: Math.round(((i + 1) / total) * 100),
        dia,
      })
    }

    if (falhas === total) {
      setEstado({ fase: "erro", msg: ultimoErro })
      setTimeout(() => setEstado({ fase: "idle" }), 5000)
      return
    }

    // Recarrega os Server Components do dashboard com os dados novos.
    router.refresh()
    const resumo = contas > 0 ? `${contas} empresas` : "concluído"
    setEstado({
      fase: "ok",
      resumo: falhas > 0 ? `Parcial · ${resumo}` : resumo,
    })
    setTimeout(() => setEstado({ fase: "idle" }), 2600)
  }

  const rodando = estado.fase === "rodando"
  const ok = estado.fase === "ok"
  const erro = estado.fase === "erro"

  const cor = ok
    ? "#4caf50"
    : erro
    ? "#e24b4a"
    : "rgba(255,255,255,0.55)"
  const borda = ok
    ? "rgba(76,175,80,0.45)"
    : erro
    ? "rgba(226,75,74,0.45)"
    : "rgba(255,255,255,0.15)"

  return (
    <button
      type="button"
      onClick={atualizar}
      disabled={rodando}
      title="Dispara o Sentinela e re-puxa o Meta de todas as empresas (hoje e ontem)"
      className="hover:text-[#C9953A] hover:border-[#C9953A55] transition no-ds"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        fontSize: 11,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        color: cor,
        border: `0.5px solid ${borda}`,
        borderRadius: 6,
        background: "transparent",
        fontWeight: 500,
        opacity: rodando ? 0.85 : 1,
        cursor: rodando ? "wait" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {rodando && <Spinner />}
      {rodando
        ? `Atualizando… ${estado.pct}%`
        : ok
        ? `Atualizado ✓ ${estado.resumo}`
        : erro
        ? estado.msg
        : "Atualizar dados"}
    </button>
  )
}

/** Bolinha girando (gold) — anima via classe utilitária do Tailwind. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="animate-spin"
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: "2px solid rgba(201,149,58,0.25)",
        borderTopColor: "#C9953A",
        flexShrink: 0,
      }}
    />
  )
}
