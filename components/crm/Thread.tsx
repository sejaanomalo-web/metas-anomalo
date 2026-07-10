"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { CrmLeadRow, CrmMensagemRow } from "@/lib/crm-leads"
import {
  enviarMensagemAction,
  marcarLeadComoLidoAction,
} from "@/lib/crm-mensagens-actions"
import { criarFollowUpAction } from "@/lib/crm-atividades-actions"
import Avatar from "@/components/crm/Avatar"
import EtiquetasPicker, { EtiquetaChip } from "@/components/crm/Etiquetas"

interface EtiquetaResumo {
  id: string
  nome: string
  cor: string
}

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
  cor,
  todasEtiquetas,
}: {
  lead: CrmLeadRow
  mensagens: CrmMensagemRow[]
  cor: string
  todasEtiquetas: EtiquetaResumo[]
}) {
  const [texto, setTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [followUpAberto, setFollowUpAberto] = useState(false)
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

  const nomeExibido = lead.nome || lead.telefone_e164 || "Lead sem nome"

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
          borderLeft: `3px solid ${cor}`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar nome={nomeExibido} cor={cor} size={40} />
            <div className="min-w-0">
              <p style={{ fontSize: 14, fontWeight: 600 }} className="truncate">
                {nomeExibido}
              </p>
              <p style={{ fontSize: 11, color: cor, fontWeight: 500 }} className="truncate">
                {lead.empresa_nome}
                {lead.telefone_e164 ? ` · ${lead.telefone_e164}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFollowUpAberto((v) => !v)}
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              border: "0.5px solid rgba(255,255,255,0.15)",
              borderRadius: 8,
              padding: "6px 10px",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            📅 Follow-up
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {lead.etiquetas.map((e) => (
            <EtiquetaChip key={e.id} nome={e.nome} cor={e.cor} />
          ))}
          <EtiquetasPicker
            leadId={lead.id}
            etiquetasDoLead={lead.etiquetas}
            todasEtiquetas={todasEtiquetas}
          />
        </div>

        {followUpAberto && (
          <FormFollowUp
            leadId={lead.id}
            onClose={() => setFollowUpAberto(false)}
          />
        )}
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

function FormFollowUp({
  leadId,
  onClose,
}: {
  leadId: string
  onClose: () => void
}) {
  const [titulo, setTitulo] = useState("")
  const [quando, setQuando] = useState("")
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  async function salvar() {
    if (!quando) {
      setStatus("Escolha data e hora.")
      return
    }
    const fd = new FormData()
    fd.set("lead_id", leadId)
    fd.set("titulo", titulo)
    fd.set("agendado_para", quando)
    const r = await criarFollowUpAction(fd)
    if (r.ok) {
      setStatus("Marcado ✓")
      router.refresh()
      setTimeout(onClose, 700)
    } else {
      setStatus(r.erro ?? "Erro")
    }
  }

  return (
    <div
      className="glass"
      style={{ marginTop: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Ex: Ligar pra fechar proposta"
        maxLength={100}
        className="glass-input"
        style={{ fontSize: 12, padding: "6px 10px" }}
      />
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          className="glass-input"
          style={{ fontSize: 12, padding: "6px 10px", flex: 1 }}
        />
        <button
          type="button"
          onClick={() => startTransition(() => salvar())}
          disabled={pending}
          className="btn-gold-filled"
          style={{ fontSize: 11, padding: "6px 12px", opacity: pending ? 0.5 : 1 }}
        >
          {pending ? "Salvando..." : "Marcar"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ fontSize: 11, color: "var(--text-3)" }}
        >
          Cancelar
        </button>
      </div>
      {status && (
        <span
          style={{
            fontSize: 11,
            color: status.includes("✓") ? "var(--success)" : "var(--danger)",
          }}
        >
          {status}
        </span>
      )}
    </div>
  )
}
