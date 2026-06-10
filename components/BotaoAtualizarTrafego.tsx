"use client"

import { useSentinelaRefresh } from "@/components/SentinelaRefreshProvider"

/**
 * Botão "Atualizar dados" do dashboard de Tráfego (visão geral).
 *
 * Dispara uma nova execução do agente Sentinela — re-puxando o Meta para
 * TODAS as empresas ativas (hoje + ontem). O processo vive no
 * SentinelaRefreshProvider (layout do dashboard), então CONTINUA rodando
 * em segundo plano mesmo que o usuário mude de aba; um indicador flutuante
 * mostra o progresso em qualquer tela. Este botão só reflete e dispara o
 * estado global compartilhado.
 */
export default function BotaoAtualizarTrafego() {
  const { estado, rodando, iniciar } = useSentinelaRefresh()

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

  const rotulo =
    estado.fase === "rodando"
      ? `Atualizando… ${estado.pct}%`
      : estado.fase === "ok"
      ? `Atualizado ✓ ${estado.resumo}`
      : estado.fase === "erro"
      ? estado.msg
      : "Atualizar dados"

  return (
    <button
      type="button"
      onClick={iniciar}
      disabled={rodando}
      title="Dispara o Sentinela e re-puxa o Meta de todas as empresas (hoje e ontem). Continua rodando em segundo plano se você trocar de aba."
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
      {rotulo}
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
