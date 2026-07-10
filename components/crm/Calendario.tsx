"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { CrmAtividadeRow } from "@/lib/crm-atividades-actions"
import {
  concluirAtividadeAction,
  excluirAtividadeAction,
  gerarLinkCalendarioAction,
} from "@/lib/crm-atividades-actions"

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"]
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function chaveDia(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dia}`
}

/** Calendário mensal com follow-ups do usuário (vem já filtrado do
 *  servidor). Navegação de mês é 100% local — sem round-trip — porque o
 *  volume de follow-ups de um CRM pessoal é pequeno o bastante pra buscar
 *  uma janela larga de uma vez (ver listarAtividadesCalendario na page). */
export default function Calendario({
  atividades,
}: {
  atividades: CrmAtividadeRow[]
}) {
  const hoje = useMemo(() => new Date(), [])
  const [mesRef, setMesRef] = useState(
    () => new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  )
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(chaveDia(hoje))
  const [linkStatus, setLinkStatus] = useState<string | null>(null)
  const router = useRouter()

  const porDia = useMemo(() => {
    const map: Record<string, CrmAtividadeRow[]> = {}
    for (const a of atividades) {
      if (!a.agendado_para) continue
      const chave = a.agendado_para.slice(0, 10)
      if (!map[chave]) map[chave] = []
      map[chave].push(a)
    }
    return map
  }, [atividades])

  const celulas = useMemo(() => {
    const ano = mesRef.getFullYear()
    const mes = mesRef.getMonth()
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay()
    const totalDias = new Date(ano, mes + 1, 0).getDate()
    const lista: (Date | null)[] = []
    for (let i = 0; i < primeiroDiaSemana; i++) lista.push(null)
    for (let d = 1; d <= totalDias; d++) lista.push(new Date(ano, mes, d))
    return lista
  }, [mesRef])

  async function copiarLink() {
    const r = await gerarLinkCalendarioAction()
    if (r.ok && r.token) {
      const url = `${window.location.origin}/api/crm/calendario/${r.token}/feed.ics`
      try {
        await navigator.clipboard.writeText(url)
        setLinkStatus("Link copiado ✓")
      } catch {
        setLinkStatus(url)
      }
      setTimeout(() => setLinkStatus(null), 4000)
    } else {
      setLinkStatus(r.erro ?? "Erro ao gerar link")
    }
  }

  const atividadesDoDia = diaSelecionado ? porDia[diaSelecionado] ?? [] : []

  return (
    <div className="flex gap-6" style={{ flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 340px", maxWidth: 380 }}>
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1))}
            style={{ fontSize: 16, padding: "4px 10px", color: "var(--text-3)" }}
          >
            ‹
          </button>
          <p style={{ fontSize: 14, fontWeight: 600 }}>
            {MESES[mesRef.getMonth()]} {mesRef.getFullYear()}
          </p>
          <button
            type="button"
            onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1))}
            style={{ fontSize: 16, padding: "4px 10px", color: "var(--text-3)" }}
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DIAS_SEMANA.map((d, i) => (
            <div key={i} style={{ fontSize: 10, textAlign: "center", color: "var(--text-4)" }}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {celulas.map((data, i) => {
            if (!data) return <div key={i} />
            const chave = chaveDia(data)
            const eventosNoDia = porDia[chave] ?? []
            const ehHoje = chaveDia(hoje) === chave
            const selecionado = diaSelecionado === chave
            return (
              <button
                type="button"
                key={i}
                onClick={() => setDiaSelecionado(chave)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 8,
                  fontSize: 12,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  background: selecionado
                    ? "rgba(201,149,58,0.16)"
                    : ehHoje
                    ? "rgba(255,255,255,0.05)"
                    : "transparent",
                  border: ehHoje
                    ? "1px solid rgba(201,149,58,0.4)"
                    : "1px solid transparent",
                  color: selecionado ? "var(--gold, #C9953A)" : "inherit",
                }}
              >
                {data.getDate()}
                {eventosNoDia.length > 0 && (
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "var(--gold, #C9953A)",
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={copiarLink}
          style={{
            marginTop: 14,
            fontSize: 11,
            color: "var(--text-3)",
            border: "0.5px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: "6px 10px",
            width: "100%",
          }}
        >
          📋 Copiar link do calendário (Apple/Google)
        </button>
        {linkStatus && (
          <p
            style={{
              fontSize: 10,
              color: linkStatus.includes("✓") ? "var(--success)" : "var(--text-3)",
              marginTop: 6,
              wordBreak: "break-all",
            }}
          >
            {linkStatus}
          </p>
        )}
      </div>

      <div style={{ flex: "1 1 260px", minWidth: 260 }}>
        <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>
          {diaSelecionado
            ? new Date(`${diaSelecionado}T00:00:00`).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })
            : "Selecione um dia"}
        </p>
        {atividadesDoDia.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-4)" }}>Nenhum follow-up marcado.</p>
        ) : (
          <div className="space-y-2">
            {atividadesDoDia.map((a) => (
              <ItemAtividade key={a.id} atividade={a} onChange={() => router.refresh()} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ItemAtividade({
  atividade,
  onChange,
}: {
  atividade: CrmAtividadeRow
  onChange: () => void
}) {
  const [pending, startTransition] = useTransition()
  const hora = atividade.agendado_para
    ? new Date(atividade.agendado_para).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""

  async function concluir() {
    const fd = new FormData()
    fd.set("id", atividade.id)
    await concluirAtividadeAction(fd)
    onChange()
  }
  async function excluir() {
    const fd = new FormData()
    fd.set("id", atividade.id)
    await excluirAtividadeAction(fd)
    onChange()
  }

  return (
    <div className="glass" style={{ padding: 10, opacity: atividade.concluido_em ? 0.5 : 1 }}>
      <div className="flex items-center justify-between gap-2">
        <p style={{ fontSize: 12, fontWeight: 500 }}>{atividade.titulo || "Follow-up"}</p>
        <span style={{ fontSize: 10, color: "var(--text-4)" }}>{hora}</span>
      </div>
      {atividade.lead_nome && (
        <Link
          href={`/dashboard/crm?lead=${atividade.lead_id}`}
          style={{ fontSize: 11, color: "var(--gold, #C9953A)" }}
        >
          {atividade.lead_nome}
        </Link>
      )}
      {atividade.corpo && (
        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{atividade.corpo}</p>
      )}
      <div className="flex items-center gap-3 mt-2">
        {!atividade.concluido_em && (
          <button
            type="button"
            onClick={() => startTransition(() => concluir())}
            disabled={pending}
            style={{ fontSize: 10, color: "var(--success)" }}
          >
            ✓ Concluir
          </button>
        )}
        <button
          type="button"
          onClick={() => startTransition(() => excluir())}
          disabled={pending}
          style={{ fontSize: 10, color: "var(--danger)" }}
        >
          Excluir
        </button>
      </div>
    </div>
  )
}
