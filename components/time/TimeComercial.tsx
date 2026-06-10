"use client"

import { useState } from "react"
import { formatBRL, formatNumero } from "@/lib/data"
import FunilAtividadeComercial from "@/components/FunilAtividadeComercial"
import ClientesComercial from "@/components/comercial/ClientesComercial"
import type {
  ObservacaoComercial,
  ResumoComercial,
  ResumoComercialCliente,
} from "@/lib/comercial-tipos"

export interface MembroComercial {
  id: string
  nome: string
  email: string
  resumo: ResumoComercial
  porCliente: ResumoComercialCliente[]
  observacoes: ObservacaoComercial[]
}

function resumoVazio(): ResumoComercial {
  return {
    ligacoes: 0,
    mensagens: 0,
    retorno_mensagens: 0,
    qualificados: 0,
    reunioes_agendadas: 0,
    reunioes_realizadas: 0,
    no_shows: 0,
    propostas_enviadas: 0,
    contratos_fechados: 0,
    faturamento_gerado: 0,
    registros: 0,
  }
}

/** Soma vários ResumoComercial num só (multi-seleção de pessoas). */
function somarResumos(resumos: ResumoComercial[]): ResumoComercial {
  const acc = resumoVazio()
  for (const r of resumos) {
    acc.ligacoes += r.ligacoes
    acc.mensagens += r.mensagens
    acc.retorno_mensagens += r.retorno_mensagens
    acc.qualificados += r.qualificados
    acc.reunioes_agendadas += r.reunioes_agendadas
    acc.reunioes_realizadas += r.reunioes_realizadas
    acc.no_shows += r.no_shows
    acc.propostas_enviadas += r.propostas_enviadas
    acc.contratos_fechados += r.contratos_fechados
    acc.faturamento_gerado += r.faturamento_gerado
    acc.registros += r.registros
  }
  return acc
}

/** Funde as quebras por-cliente de várias pessoas, somando por empresa. */
function mergePorCliente(
  listas: ResumoComercialCliente[][]
): ResumoComercialCliente[] {
  const mapa = new Map<string, ResumoComercial>()
  for (const lista of listas) {
    for (const c of lista) {
      const atual = mapa.get(c.empresa)
      mapa.set(c.empresa, atual ? somarResumos([atual, c.resumo]) : c.resumo)
    }
  }
  return Array.from(mapa, ([empresa, resumo]) => ({ empresa, resumo })).sort(
    (a, b) =>
      b.resumo.faturamento_gerado - a.resumo.faturamento_gerado ||
      b.resumo.contratos_fechados - a.resumo.contratos_fechados ||
      b.resumo.mensagens - a.resumo.mensagens
  )
}

/**
 * Time comercial — lista os usuários com papel comercial. Permite ver UMA
 * pessoa (clique no nome) ou VÁRIAS (checkbox / botão "Todos"): o funil, os
 * KPIs, a quebra por cliente e as observações mostram a SOMA dos selecionados.
 */
export default function TimeComercial({
  membros,
}: {
  membros: MembroComercial[]
}) {
  const [selIds, setSelIds] = useState<string[]>(
    membros[0] ? [membros[0].id] : []
  )

  if (membros.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>
        Nenhum usuário com acesso comercial cadastrado.
      </p>
    )
  }

  function toggle(id: string) {
    setSelIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev // mantém ao menos uma pessoa
        return prev.filter((x) => x !== id)
      }
      return [...prev, id]
    })
  }
  const solo = (id: string) => setSelIds([id])
  const todos = () => setSelIds(membros.map((m) => m.id))

  const ativos = membros.filter((m) => selIds.includes(m.id))
  const resumo = somarResumos(ativos.map((m) => m.resumo))
  const porCliente = mergePorCliente(ativos.map((m) => m.porCliente))
  const observacoes = ativos
    .flatMap((m) => m.observacoes)
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
  const multi = ativos.length > 1

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4" style={{ gap: 16 }}>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span
            style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 500 }}
          >
            {ativos.length} de {membros.length} selecionada
            {ativos.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={todos}
            className="no-ds"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Todos
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {membros.map((m) => {
            const checked = selIds.includes(m.id)
            return (
              <div
                key={m.id}
                className="glass no-ds"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderColor: checked ? "rgba(201,149,58,0.5)" : undefined,
                  background: checked ? "rgba(201,149,58,0.08)" : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.id)}
                  aria-label={`Somar ${m.nome}`}
                  style={{
                    width: 16,
                    height: 16,
                    accentColor: "#C9953A",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
                <button
                  type="button"
                  onClick={() => solo(m.id)}
                  title="Ver só esta pessoa"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "inherit",
                    padding: 0,
                  }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.nome}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--text-4)",
                      marginTop: 2,
                    }}
                  >
                    {formatNumero(m.resumo.contratos_fechados)} contratos ·{" "}
                    {formatBRL(m.resumo.faturamento_gerado)}
                  </p>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="lg:col-span-3">
        <Detalhe
          ativos={ativos}
          multi={multi}
          resumo={resumo}
          porCliente={porCliente}
          observacoes={observacoes}
        />
      </div>
    </div>
  )
}

function Detalhe({
  ativos,
  multi,
  resumo: r,
  porCliente,
  observacoes,
}: {
  ativos: MembroComercial[]
  multi: boolean
  resumo: ResumoComercial
  porCliente: ResumoComercialCliente[]
  observacoes: ObservacaoComercial[]
}) {
  const ticket =
    r.contratos_fechados > 0 ? r.faturamento_gerado / r.contratos_fechados : null
  const convFinal = r.mensagens > 0 ? r.contratos_fechados / r.mensagens : null
  const titulo = multi
    ? `${ativos.length} pessoas selecionadas`
    : ativos[0]?.nome ?? ""
  const diasTxt = `${r.registros} ${
    r.registros === 1 ? "dia reportado" : "dias reportados"
  }`
  const sub = multi
    ? `Soma do time selecionado · ${diasTxt}`
    : `${ativos[0]?.email ?? ""} · ${diasTxt}`

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="glass" style={{ padding: 24 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "1.5px",
            color: "var(--text-3)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          {titulo}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-4)", marginTop: 2 }}>
          {sub}
        </p>

        {r.registros === 0 && (
          <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 10 }}>
            Sem registros no período — o relatório comercial ainda não foi
            preenchido.
          </p>
        )}

        <div style={{ marginTop: 18 }}>
          <FunilAtividadeComercial resumo={r} />
        </div>

        <div
          style={{
            display: "flex",
            gap: 28,
            marginTop: 18,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Mini
            label="Ticket médio"
            valor={ticket != null ? formatBRL(ticket) : "·"}
          />
          <Mini
            label="Conv. msg→contrato"
            valor={convFinal != null ? `${(convFinal * 100).toFixed(0)}%` : "·"}
          />
          <Mini label="No-shows" valor={formatNumero(r.no_shows)} />
        </div>
      </div>

      <div className="glass" style={{ padding: 24 }}>
        <ClientesComercial
          clientes={porCliente}
          titulo={
            multi
              ? "Clientes prospectados pelas pessoas selecionadas"
              : "Clientes prospectados por essa pessoa"
          }
          vazioMsg="Sem prospecções atribuídas no período."
        />
      </div>

      <div className="glass" style={{ padding: 24 }}>
        <Observacoes itens={observacoes} multi={multi} />
      </div>
    </div>
  )
}

/** Anotações do processo: data + empresa + origem + texto (e quem escreveu,
 *  quando há mais de uma pessoa selecionada). Filtra pelo período global. */
function Observacoes({
  itens,
  multi,
}: {
  itens: ObservacaoComercial[]
  multi: boolean
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 11,
          letterSpacing: "1.5px",
          color: "var(--text-3)",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: 14,
        }}
      >
        Observações
      </p>
      {itens.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>
          Sem observações no período.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {itens.map((o, i) => (
            <div
              key={`${o.data}-${o.empresa}-${i}`}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-2)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtData(o.data)}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                  {o.empresa}
                </span>
                <BadgeOrigem origem={o.origem} />
                {multi && (
                  <span style={{ fontSize: 11, color: "var(--text-4)" }}>
                    · {o.colaborador_nome}
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-1)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {o.texto}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BadgeOrigem({ origem }: { origem: "pago" | "organico" }) {
  const pago = origem === "pago"
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 999,
        color: pago ? "#C9953A" : "var(--text-3)",
        background: pago ? "rgba(201,149,58,0.12)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${
          pago ? "rgba(201,149,58,0.4)" : "rgba(255,255,255,0.1)"
        }`,
      }}
    >
      {pago ? "Anúncios" : "Orgânico"}
    </span>
  )
}

/** "YYYY-MM-DD" -> "DD/MM". */
function fmtData(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function Mini({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          color: "var(--accent)",
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 20,
          fontWeight: 700,
          marginTop: 4,
          color: "var(--text-1)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
      </p>
    </div>
  )
}
