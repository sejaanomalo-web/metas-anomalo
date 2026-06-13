"use client"

import { useState } from "react"
import { useSentinelaRefresh } from "@/components/SentinelaRefreshProvider"

/** Hoje em BRT (UTC-3, sem DST), YYYY-MM-DD. */
function hojeBRT(): string {
  const a = new Date()
  const utc = a.getTime() + a.getTimezoneOffset() * 60_000
  return new Date(utc - 3 * 60 * 60_000).toISOString().slice(0, 10)
}
/** Primeiro dia do mês atual (BRT), YYYY-MM-01. */
function primeiroDiaMesBRT(): string {
  return `${hojeBRT().slice(0, 8)}01`
}

/**
 * Admin · Tráfego — "Reprocessar período".
 *
 * Reprocessa o Sentinela DIA A DIA num intervalo (re-puxa o Meta de TODAS as
 * empresas). Serve pra recuperar dias cujo gasto não foi capturado — ex.:
 * depois de corrigir o filtro/nome de campanha de um cliente, os dias antigos
 * continuam zerados até serem reprocessados.
 *
 * Reusa o disparo global (SentinelaRefreshProvider): roda em segundo plano,
 * sobrevive à troca de aba e o progresso aparece no indicador flutuante. O
 * botão "Atualizar dados" comum só faz hoje+ontem — este cobre o histórico.
 */
export default function BackfillTrafego() {
  const { rodando, iniciarBackfill } = useSentinelaRefresh()
  const [aberto, setAberto] = useState(false)
  const [de, setDe] = useState(primeiroDiaMesBRT())
  const [ate, setAte] = useState(hojeBRT())
  const [erro, setErro] = useState<string | null>(null)

  function reprocessar() {
    setErro(null)
    const re = /^\d{4}-\d{2}-\d{2}$/
    if (!re.test(de) || !re.test(ate) || de > ate) {
      setErro("Período inválido (De precisa ser ≤ Até).")
      return
    }
    if (ate > hojeBRT()) {
      setErro("A data final não pode estar no futuro.")
      return
    }
    const totalDias =
      Math.round(
        (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) /
          86_400_000
      ) + 1
    if (totalDias > 62) {
      setErro("Período muito longo (máx. 62 dias por vez).")
      return
    }
    iniciarBackfill(de, ate)
    setAberto(false)
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={rodando}
        title="Reprocessa o Sentinela num intervalo de datas (re-puxa o Meta de todas as empresas, dia a dia). Use após corrigir filtro/nome de campanha."
        className="hover:text-[#C9953A] hover:border-[#C9953A55] transition no-ds"
        style={{
          padding: "8px 14px",
          fontSize: 11,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
          border: "0.5px solid rgba(255,255,255,0.15)",
          borderRadius: 6,
          background: "transparent",
          fontWeight: 500,
          cursor: rodando ? "not-allowed" : "pointer",
          opacity: rodando ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        ⟳ Reprocessar período
      </button>

      {aberto && (
        <div
          className="glass"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 50,
            width: "min(380px, 92vw)",
            padding: 18,
          }}
        >
          <p
            style={{
              fontSize: 11,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "var(--accent)",
              fontWeight: 600,
            }}
          >
            Reprocessar Sentinela · admin
          </p>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              lineHeight: 1.5,
              marginTop: 6,
            }}
          >
            Re-puxa o Meta de TODAS as empresas, dia a dia no intervalo. Use
            depois de corrigir filtro/nome de campanha pra recuperar dias sem
            captação. Roda em segundo plano (progresso no canto da tela).
          </p>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "flex-end",
              marginTop: 14,
            }}
          >
            <label className="block">
              <span style={rotuloEstilo}>De</span>
              <input
                type="date"
                value={de}
                max={ate}
                onChange={(e) => setDe(e.target.value)}
                className="glass-input"
                style={inputEstilo}
              />
            </label>
            <label className="block">
              <span style={rotuloEstilo}>Até</span>
              <input
                type="date"
                value={ate}
                max={hojeBRT()}
                onChange={(e) => setAte(e.target.value)}
                className="glass-input"
                style={inputEstilo}
              />
            </label>
            <button
              type="button"
              onClick={reprocessar}
              disabled={rodando}
              className="btn-gold-filled uppercase"
              style={{ opacity: rodando ? 0.6 : 1 }}
            >
              {rodando ? "Rodando…" : "Reprocessar"}
            </button>
          </div>

          {erro && (
            <p style={{ fontSize: 12, color: "#e24b4a", marginTop: 10 }}>{erro}</p>
          )}
        </div>
      )}
    </div>
  )
}

const rotuloEstilo: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "1px",
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
  fontWeight: 500,
}

const inputEstilo: React.CSSProperties = {
  marginTop: 6,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 400,
}
