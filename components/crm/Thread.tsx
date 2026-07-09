"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { CrmLeadRow, CrmMensagemRow } from "@/lib/crm-leads"
import {
  enviarMensagemAction,
  marcarLeadComoLidoAction,
} from "@/lib/crm-mensagens-actions"

function formatarHora(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function Thread({
  lead,
  mensagens,
}: {
  lead: CrmLeadRow
  mensagens: CrmMensagemRow[]
}) {
  const [texto, setTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (lead.nao_lidas > 0) {
      marcarLeadComoLidoAction(lead.id)
    }
  }, [lead.id, lead.nao_lidas])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" })
  }, [mensagens.length])

  async function enviar() {
    const corpo = texto.trim()
    if (!corpo) return
    setErro(null)
    const r = await enviarMensagemAction(lead.id, corpo)
    if (r.ok) {
      setTexto("")
      router.refresh()
    } else {
      setErro(r.erro ?? "Erro ao enviar")
    }
  }

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "0.5px solid rgba(255,255,255,0.08)",
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600 }}>
          {lead.nome || lead.telefone_e164 || "Lead sem nome"}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-3)" }}>
          {lead.empresa_nome}
          {lead.telefone_e164 ? ` · ${lead.telefone_e164}` : ""}
        </p>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        {mensagens.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>
            Sem mensagens ainda.
          </p>
        )}
        {mensagens.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.direcao === "out" ? "flex-end" : "flex-start",
              maxWidth: "70%",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                background:
                  m.direcao === "out"
                    ? "rgba(201,149,58,0.16)"
                    : "rgba(255,255,255,0.06)",
                fontSize: 13,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.conteudo || `[${m.tipo}]`}
            </div>
            <p
              style={{
                fontSize: 10,
                color: "var(--text-4)",
                marginTop: 2,
                textAlign: m.direcao === "out" ? "right" : "left",
              }}
            >
              {formatarHora(m.wa_timestamp)}
              {m.status === "falha" && (
                <span style={{ color: "var(--danger)" }}> · falhou{m.erro ? `: ${m.erro}` : ""}</span>
              )}
            </p>
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      <div style={{ padding: "12px 18px", borderTop: "0.5px solid rgba(255,255,255,0.08)" }}>
        {erro && (
          <p style={{ fontSize: 11, color: "var(--danger)", marginBottom: 8 }}>{erro}</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                startTransition(() => enviar())
              }
            }}
            placeholder="Escreva uma mensagem..."
            rows={2}
            className="glass-input"
            style={{ flex: 1, padding: "8px 12px", fontSize: 13, resize: "none" }}
          />
          <button
            type="button"
            onClick={() => startTransition(() => enviar())}
            disabled={pending || !texto.trim()}
            className="btn-gold-filled uppercase"
            style={{ opacity: pending || !texto.trim() ? 0.5 : 1 }}
          >
            {pending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  )
}
