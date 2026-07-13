"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { CrmLeadRow, CrmEtiquetaResumo } from "@/lib/crm-leads"
import type { CrmInstanciaRow } from "@/lib/crm-instancias-actions"
import {
  PERIODOS_CONVERSA,
  calcularRangeConversa,
  type PeriodoConversaKey,
} from "@/lib/crm-periodos"
import ListaConversas from "@/components/crm/ListaConversas"
import NovoContato from "@/components/crm/NovoContato"

/**
 * Cabeçalho + lista de Conversas com FILTRO (etiqueta + período). Ao lado do
 * "Novo contato" há um botão "Filtrar" que abre um painel com as etiquetas
 * disponíveis (as mesmas do Kanban/etapas) e a lista de períodos do calendário
 * (Hoje … Últimos 365 dias). A filtragem é local — os leads já vêm carregados
 * do servidor; aqui só escondemos o que não bate.
 */
export default function ConversasFiltravel({
  instancias,
  leads,
  leadSelecionadoId,
  corPorEmpresa,
  etiquetas,
  verArquivados,
  totalArquivados,
}: {
  instancias: CrmInstanciaRow[]
  leads: CrmLeadRow[]
  leadSelecionadoId?: string
  corPorEmpresa: Record<string, string>
  etiquetas: CrmEtiquetaResumo[]
  verArquivados: boolean
  totalArquivados: number
}) {
  const [aberto, setAberto] = useState(false)
  const [etiquetaId, setEtiquetaId] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<PeriodoConversaKey>("todos")

  const hoje = useMemo(() => new Date(), [])
  const range = useMemo(
    () => calcularRangeConversa(periodo, hoje),
    [periodo, hoje]
  )

  const leadsFiltrados = useMemo(() => {
    return leads.filter((lead) => {
      if (etiquetaId && !lead.etiquetas.some((e) => e.id === etiquetaId)) {
        return false
      }
      if (range) {
        if (!lead.ultima_interacao_em) return false
        const t = new Date(lead.ultima_interacao_em).getTime()
        if (t < range.inicio.getTime() || t > range.fim.getTime()) return false
      }
      return true
    })
  }, [leads, etiquetaId, range])

  const temFiltro = etiquetaId !== null || periodo !== "todos"
  const etiquetaAtiva = etiquetaId
    ? etiquetas.find((e) => e.id === etiquetaId)
    : null
  const periodoLabel = PERIODOS_CONVERSA.find((p) => p.chave === periodo)?.label

  function limpar() {
    setEtiquetaId(null)
    setPeriodo("todos")
  }

  return (
    <div>
      <div
        className="flex items-center justify-between gap-2"
        style={{ padding: "2px 4px 8px" }}
      >
        <div className="flex items-center gap-1">
          <NovoContato instancias={instancias} />
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            title="Filtrar conversas por etiqueta ou data"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: temFiltro ? "#0a0a0a" : "var(--gold, #C9953A)",
              background: temFiltro ? "var(--gold, #C9953A)" : "transparent",
              borderRadius: 8,
              padding: "4px 8px",
            }}
          >
            ⚙ Filtrar
          </button>
        </div>
        {(verArquivados || totalArquivados > 0) && (
          <Link
            href={
              verArquivados
                ? "/dashboard/crm?view=conversas"
                : "/dashboard/crm?view=conversas&arquivados=1"
            }
            style={{ fontSize: 11, color: "var(--text-3)" }}
          >
            {verArquivados ? "‹ Voltar" : `Arquivados (${totalArquivados})`}
          </Link>
        )}
      </div>

      {aberto && (
        <div
          className="glass"
          style={{
            padding: 12,
            marginBottom: 8,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Etiquetas */}
          <div>
            <p style={rotuloEstilo}>Etiqueta</p>
            {etiquetas.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--text-4)" }}>
                Nenhuma etiqueta disponível.
              </p>
            ) : (
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {etiquetas.map((e) => {
                  const ativa = e.id === etiquetaId
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setEtiquetaId(ativa ? null : e.id)}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: 999,
                        border: `1px solid ${e.cor}`,
                        background: ativa ? e.cor : "transparent",
                        color: ativa ? "#0a0a0a" : e.cor,
                      }}
                    >
                      {e.nome}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Período */}
          <div>
            <p style={rotuloEstilo}>Período (última interação)</p>
            <select
              value={periodo}
              onChange={(ev) =>
                setPeriodo(ev.target.value as PeriodoConversaKey)
              }
              className="glass-input"
              style={{ fontSize: 12, padding: "6px 8px", width: "100%" }}
            >
              {PERIODOS_CONVERSA.map((p) => (
                <option key={p.chave} value={p.chave} style={{ color: "#111" }}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {temFiltro && (
            <button
              type="button"
              onClick={limpar}
              style={{
                alignSelf: "flex-start",
                fontSize: 11,
                color: "var(--text-3)",
                textDecoration: "underline",
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {temFiltro && (
        <div
          className="flex items-center flex-wrap gap-1"
          style={{ padding: "0 4px 8px", fontSize: 10, color: "var(--text-4)" }}
        >
          <span>
            {leadsFiltrados.length} de {leads.length}
          </span>
          {etiquetaAtiva && <span>· {etiquetaAtiva.nome}</span>}
          {periodo !== "todos" && <span>· {periodoLabel}</span>}
        </div>
      )}

      <ListaConversas
        leads={leadsFiltrados}
        leadSelecionadoId={leadSelecionadoId}
        corPorEmpresa={corPorEmpresa}
      />
    </div>
  )
}

const rotuloEstilo: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: "var(--text-4)",
  fontWeight: 600,
  marginBottom: 6,
}
