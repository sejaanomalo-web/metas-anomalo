"use client"

import { useEffect, useRef, useState } from "react"
import { cancelarReuniaoAction } from "@/lib/reunioes-actions"
import { dataBR, horaBR } from "@/lib/reunioes-nucleo"
import { estiloBotao, estiloCampo, Mensagem, useAcao } from "./ui"

/**
 * "Cancelar reunião" + confirmação. Usado no detalhe da tarefa e em
 * Próximas reuniões.
 *
 * Só mostra sucesso quando a action devolve ok — e a action só devolve ok
 * depois que o Cal.com confirmou (lib/reunioes-cancelar.ts). Erro, pendência
 * ou falha parcial aparecem como erro, com o que fazer a seguir.
 */
export default function CancelarReuniao({
  agendamentoId,
  participante,
  tipo,
  inicio,
}: {
  agendamentoId: string
  participante: string | null
  tipo: string | null
  inicio: string | null
}) {
  const { pendente, resultado, rodar, setResultado } = useAcao()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState("")
  const voltarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!aberto) return
    voltarRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendente) setAberto(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [aberto, pendente])

  // Sucesso fecha o modal; erro mantém aberto, com a mensagem, pra decidir.
  useEffect(() => {
    if (resultado?.ok) setAberto(false)
  }, [resultado])

  function confirmar() {
    const fd = new FormData()
    fd.set("agendamento_id", agendamentoId)
    if (motivo.trim()) fd.set("motivo", motivo.trim())
    rodar(() => cancelarReuniaoAction(fd))
  }

  const data = inicio ? dataBR(inicio).split("-").reverse().join("/") : "—"
  const hora = inicio ? horaBR(inicio) : ""

  return (
    <>
      <button
        type="button"
        className="no-ds"
        style={estiloBotao("perigo", pendente)}
        disabled={pendente}
        onClick={() => {
          setResultado(null)
          setAberto(true)
        }}
      >
        Cancelar reunião
      </button>
      {!aberto && <Mensagem r={resultado} />}

      {aberto && (
        <div
          role="presentation"
          onClick={() => !pendente && setAberto(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`cancelar-${agendamentoId}`}
            onClick={(e) => e.stopPropagation()}
            className="glass"
            style={{
              width: "min(100%, 440px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto",
              borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12,
              background: "var(--surface-1)", border: "1px solid rgba(226,75,74,0.35)",
            }}
          >
            <h3 id={`cancelar-${agendamentoId}`} style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>
              Cancelar esta reunião?
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
              Esta ação cancelará a reserva no Cal.com e removerá a reunião do calendário ativo da ANÔMALO. O histórico
              será preservado.
            </p>

            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 12, margin: 0 }}>
              <dt style={{ color: "var(--text-4)" }}>Participante</dt>
              <dd style={{ margin: 0, color: "var(--text-1)", wordBreak: "break-word" }}>{participante ?? "—"}</dd>
              <dt style={{ color: "var(--text-4)" }}>Tipo</dt>
              <dd style={{ margin: 0, color: "var(--text-1)" }}>{tipo ?? "—"}</dd>
              <dt style={{ color: "var(--text-4)" }}>Data</dt>
              <dd style={{ margin: 0, color: "var(--text-1)" }}>{data}</dd>
              <dt style={{ color: "var(--text-4)" }}>Horário</dt>
              <dd style={{ margin: 0, color: "var(--text-1)" }}>{hora || "—"}</dd>
            </dl>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-3)" }}>
              Motivo do cancelamento (opcional — o participante recebe)
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
                disabled={pendente}
                rows={2}
                className="glass-input"
                style={{ ...estiloCampo, resize: "vertical", fontFamily: "inherit" }}
                placeholder="Ex.: precisamos remarcar."
              />
            </label>

            <Mensagem r={resultado} />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button ref={voltarRef} type="button" className="no-ds" style={estiloBotao("neutro", pendente)} disabled={pendente} onClick={() => setAberto(false)}>
                Voltar
              </button>
              <button type="button" className="no-ds" style={estiloBotao("perigo", pendente)} disabled={pendente} onClick={confirmar} aria-busy={pendente}>
                {pendente ? "Cancelando…" : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
