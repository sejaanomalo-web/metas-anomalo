"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import LancamentoDrawer from "./LancamentoDrawer"
import LancamentoDetalhe from "./LancamentoDetalhe"
import {
  excluirLancamentoAction,
  marcarRealizadoAction,
} from "@/lib/financeiro-actions"
import type {
  CategoriaFinanceira,
  ContaFinanceira,
  LancamentoFinanceiro,
} from "@/lib/financeiro"
import {
  corDaCategoria,
  dataDoEixo,
  estaAtrasado,
  rotulosDaSituacao,
  rotuloSituacaoCurto,
  somarLancamentos,
  statusRotuloComAtraso,
  valorNumerico,
  SITUACOES,
  type EixoPeriodo,
  type SituacaoFinanceira,
} from "@/lib/financeiro-regras"
import { formatBRL } from "@/lib/data"

interface Empresa {
  nome: string
  slug: string
}

function formatDataBR(iso: string | null): string {
  if (!iso) return "·"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

function corStatus(rotulo: string): string {
  if (rotulo === "Realizado") return "var(--success)"
  if (rotulo === "Atrasado") return "var(--destructive)"
  if (rotulo === "Previsto") return "var(--warning)"
  return "var(--muted-foreground)"
}

export default function TabelaLancamentos({
  lancamentos,
  truncado,
  limite,
  categorias,
  contas,
  empresas,
  situacao,
  eixo,
  hrefsSituacao,
  lancDeepLink,
  mesNum,
  anoAtual,
}: {
  lancamentos: LancamentoFinanceiro[]
  truncado: boolean
  limite: number
  categorias: CategoriaFinanceira[]
  contas: ContaFinanceira[]
  empresas: Empresa[]
  situacao: SituacaoFinanceira
  eixo: EixoPeriodo
  hrefsSituacao: Record<SituacaoFinanceira, string>
  /** ?lanc=<id> abre o detalhe daquele lançamento UMA vez. */
  lancDeepLink: string | null
  mesNum?: number
  anoAtual?: number
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<LancamentoFinanceiro | null>(null)
  const [detalhe, setDetalhe] = useState<LancamentoFinanceiro | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Data de hoje calculada uma vez por render, e não dentro do map: com uma
  // tabela grande, `new Date()` por linha faria duas linhas vizinhas usarem
  // dias diferentes na virada da meia-noite.
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const catById = useMemo(
    () => new Map(categorias.map((c) => [c.id, c])),
    [categorias]
  )
  const contaById = useMemo(
    () => new Map(contas.map((c) => [c.id, c])),
    [contas]
  )

  // O totalizador soma EXATAMENTE as linhas que estão na tela, com a mesma
  // função pura dos testes. É isso que impede o total de divergir da lista.
  const totais = useMemo(
    () => somarLancamentos(lancamentos, situacao),
    [lancamentos, situacao]
  )
  const rotulos = rotulosDaSituacao(situacao)

  // Deep link: abre o detalhe uma única vez. Sem o ref, fechar o painel faria
  // o efeito reabrir na renderização seguinte, e o painel ficaria "grudado".
  const deepLinkUsado = useRef(false)
  useEffect(() => {
    if (deepLinkUsado.current) return
    if (!lancDeepLink) return
    const alvo = lancamentos.find((l) => l.id === lancDeepLink)
    if (!alvo) return
    deepLinkUsado.current = true
    setDetalhe(alvo)
  }, [lancDeepLink, lancamentos])

  /**
   * Refresh defensivo: router.refresh() + reload duro. O reload garante
   * invalidação do Router Cache do Next + Service Worker do PWA — sem ele,
   * o lançamento alterado só aparecia após refresh manual.
   */
  function refreshUI() {
    router.refresh()
    setTimeout(() => window.location.reload(), 250)
  }

  /** Marca um previsto como realizado em 1 clique, com a data de hoje.
   *  Pra escolher outra data, abrir Editar. */
  function marcarPago(id: string) {
    setPendingId(id)
    setErro(null)
    startTransition(async () => {
      const r = await marcarRealizadoAction(id, hoje)
      setPendingId(null)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível marcar como realizado.")
        return
      }
      setAviso("Marcado como realizado.")
      refreshUI()
    })
  }

  function excluir(l: LancamentoFinanceiro) {
    if (
      !confirm(
        `Excluir "${l.descricao}" (${formatBRL(valorNumerico(l.valor))})?\n\n` +
          "O lançamento sai das listas e dos totais, mas continua guardado no histórico."
      )
    ) {
      return
    }
    setPendingId(l.id)
    setErro(null)
    startTransition(async () => {
      const r = await excluirLancamentoAction(l.id)
      setPendingId(null)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível excluir.")
        return
      }
      setAviso("Lançamento excluído.")
      refreshUI()
    })
  }

  function abrirNovo() {
    setEditando(null)
    setDrawerAberto(true)
  }
  function editar(l: LancamentoFinanceiro) {
    setDetalhe(null)
    setEditando(l)
    setDrawerAberto(true)
  }

  const colunaData = eixo === "vencimento" ? "Vencimento" : "Data"

  return (
    <>
      {/* Situação: o que os totais somam (R1/R2) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <p style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Situação dos totais
        </p>
        <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--surface-1)", borderRadius: 10 }}>
          {SITUACOES.map((s) => {
            const ativo = s === situacao
            return (
              <Link
                key={s}
                href={hrefsSituacao[s]}
                title={rotulosDaSituacao(s).dica}
                style={{
                  padding: "6px 14px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  borderRadius: 7,
                  background: ativo ? "var(--accent)" : "transparent",
                  color: ativo ? "#000" : "var(--text-2)",
                  textDecoration: "none",
                }}
              >
                {rotuloSituacaoCurto(s)}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Totalizadores */}
      <section
        className="grid grid-cols-1 md:grid-cols-3"
        style={{ gap: 12, marginTop: 12 }}
      >
        <Totalizador rotulo={rotulos.entrada} valor={totais.entradas} cor="var(--success)" />
        <Totalizador rotulo={rotulos.saida} valor={totais.saidas} cor="var(--destructive)" />
        <Totalizador
          rotulo={rotulos.saldo}
          valor={totais.saldo}
          cor={totais.saldo >= 0 ? "var(--foreground)" : "var(--destructive)"}
          destaque
        />
      </section>

      {eixo === "vencimento" && (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-3)",
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          Recorte por <strong>vencimento</strong>: a lista mostra o que vence no
          período, pago ou não — inclusive o que já foi pago adiantado.
        </p>
      )}

      {truncado && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "rgba(234, 179, 8, 0.10)",
            border: "0.5px solid rgba(234, 179, 8, 0.40)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-1)",
            lineHeight: 1.5,
          }}
        >
          A consulta parou em <strong>{limite} lançamentos</strong>. Os totais
          acima somam só o que está carregado — há mais linhas no período.
          Estreite o período ou use os filtros pra ver o total correto.
        </div>
      )}

      {(aviso || erro) && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            fontSize: 13,
            color: "var(--text-1)",
            background: erro ? "rgba(239, 68, 68, 0.12)" : "rgba(22, 163, 74, 0.12)",
            border: `0.5px solid ${erro ? "rgba(239, 68, 68, 0.40)" : "rgba(22, 163, 74, 0.40)"}`,
          }}
        >
          {erro ?? aviso}
        </div>
      )}

      <div className="glass" style={{ padding: 0, overflow: "hidden", marginTop: 16 }}>
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <p style={{ fontWeight: 600, fontSize: 14 }}>
            {lancamentos.length} {lancamentos.length === 1 ? "lançamento" : "lançamentos"}
          </p>
          <button type="button" onClick={abrirNovo} className="btn-gold-filled">
            + Novo lançamento
          </button>
        </div>

        {lancamentos.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--muted-foreground)",
              fontSize: 14,
            }}
          >
            Nenhum lançamento no período. Clique em <strong>+ Novo lançamento</strong>{" "}
            pra começar.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  <Th>{colunaData}</Th>
                  <Th>Descrição</Th>
                  <Th>Categoria</Th>
                  <Th>Conta</Th>
                  <Th align="right">Valor</Th>
                  <Th>Status</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((l) => {
                  const cat = l.categoria_id ? catById.get(l.categoria_id) : null
                  const conta = l.conta_id ? contaById.get(l.conta_id) : null
                  const rotuloStatus = statusRotuloComAtraso(l, hoje)
                  const ocupada = pendingId === l.id
                  const cancelado = l.status === "cancelado"
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setDetalhe(l)}
                      style={{
                        borderTop: "1px solid var(--border)",
                        cursor: "pointer",
                        opacity: cancelado ? 0.55 : 1,
                      }}
                    >
                      <Td>{formatDataBR(dataDoEixo(l, eixo))}</Td>
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: l.tipo === "receita" ? "var(--success)" : "var(--destructive)",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <span
                              style={{
                                textDecoration: cancelado ? "line-through" : "none",
                              }}
                            >
                              {l.descricao}
                            </span>
                            {(l.origem || l.empresa_cliente) && (
                              <p
                                style={{
                                  fontSize: 11,
                                  color: "var(--muted-foreground)",
                                  marginTop: 2,
                                }}
                              >
                                {[l.origem, l.empresa_cliente].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        {cat ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 2,
                                background: corDaCategoria(cat),
                              }}
                            />
                            {cat.nome}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted-foreground)" }}>Sem categoria</span>
                        )}
                      </Td>
                      <Td>
                        {conta?.nome ?? (
                          <span style={{ color: "var(--muted-foreground)" }}>Sem conta</span>
                        )}
                      </Td>
                      <Td align="right">
                        <span
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 600,
                            color: l.tipo === "receita" ? "var(--success)" : "var(--destructive)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {l.tipo === "receita" ? "+" : "−"} {formatBRL(valorNumerico(l.valor))}
                        </span>
                      </Td>
                      <Td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            border: `1px solid ${corStatus(rotuloStatus)}`,
                            color: corStatus(rotuloStatus),
                          }}
                          title={
                            estaAtrasado(l, hoje)
                              ? "Previsto com vencimento já passado — continua contando no previsto."
                              : undefined
                          }
                        >
                          {rotuloStatus}
                        </span>
                      </Td>
                      <Td align="right">
                        <div
                          style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {l.status === "previsto" && (
                            <BotaoLinha
                              onClick={() => marcarPago(l.id)}
                              disabled={ocupada}
                              cor="var(--success)"
                              title="Marcar como realizado com a data de hoje"
                            >
                              {ocupada ? "..." : "Marcar pago"}
                            </BotaoLinha>
                          )}
                          <BotaoLinha onClick={() => editar(l)} disabled={ocupada}>
                            Editar
                          </BotaoLinha>
                          <BotaoLinha
                            onClick={() => excluir(l)}
                            disabled={ocupada}
                            cor="var(--destructive)"
                            title="Excluir (o histórico é preservado)"
                          >
                            Excluir
                          </BotaoLinha>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detalhe && (
        <LancamentoDetalhe
          lancamento={detalhe}
          categorias={categorias}
          contas={contas}
          hoje={hoje}
          fechar={() => setDetalhe(null)}
          editar={() => editar(detalhe)}
        />
      )}

      <LancamentoDrawer
        aberto={drawerAberto}
        fechar={() => setDrawerAberto(false)}
        categorias={categorias}
        contas={contas}
        empresas={empresas}
        lancamento={editando}
        mesNum={mesNum}
        anoAtual={anoAtual}
      />
    </>
  )
}

function Totalizador({
  rotulo,
  valor,
  cor,
  destaque,
}: {
  rotulo: string
  valor: number
  cor: string
  destaque?: boolean
}) {
  return (
    <div
      className="glass"
      style={{
        padding: "14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        borderColor: destaque ? "rgba(201,149,58,0.35)" : undefined,
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {rotulo}
      </p>
      <p
        style={{
          fontSize: 20,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: cor,
        }}
      >
        {formatBRL(valor)}
      </p>
    </div>
  )
}

function BotaoLinha({
  onClick,
  disabled,
  cor,
  title,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  cor?: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: "transparent",
        border: `1px solid ${cor ?? "var(--border)"}`,
        borderRadius: 4,
        padding: "4px 10px",
        cursor: disabled ? "wait" : "pointer",
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
        color: cor ?? "var(--foreground)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode
  align?: "left" | "right" | "center"
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 16px",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--muted-foreground)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = "left",
}: {
  children?: React.ReactNode
  align?: "left" | "right" | "center"
}) {
  return (
    <td style={{ textAlign: align, padding: "12px 16px", verticalAlign: "middle" }}>
      {children}
    </td>
  )
}
