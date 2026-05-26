"use client"

import { useState } from "react"
import LancamentoDrawer from "./LancamentoDrawer"
import type {
  CategoriaFinanceira,
  ContaFinanceira,
  LancamentoFinanceiro,
} from "@/lib/financeiro"
import { statusRotulo } from "@/lib/financeiro"
import { formatBRL } from "@/lib/data"

interface Empresa {
  nome: string
  slug: string
}

function formatDataBR(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

function corStatus(status: string): string {
  if (status === "realizado") return "var(--success)"
  if (status === "previsto") return "var(--warning)"
  return "var(--muted-foreground)"
}

export default function TabelaLancamentos({
  lancamentos,
  categorias,
  contas,
  empresas,
  mesAtual,
  anoAtual,
}: {
  lancamentos: LancamentoFinanceiro[]
  categorias: CategoriaFinanceira[]
  contas: ContaFinanceira[]
  empresas: Empresa[]
  mesAtual?: string
  anoAtual?: number
}) {
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<LancamentoFinanceiro | null>(null)

  const catById = new Map(categorias.map((c) => [c.id, c]))
  const contaById = new Map(contas.map((c) => [c.id, c]))

  function abrirNovo() {
    setEditando(null)
    setDrawerAberto(true)
  }
  function editar(l: LancamentoFinanceiro) {
    setEditando(l)
    setDrawerAberto(true)
  }

  return (
    <>
      <div
        className="glass"
        style={{
          padding: 0,
          overflow: "hidden",
        }}
      >
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
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  <Th>Data</Th>
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
                  return (
                    <tr
                      key={l.id}
                      style={{
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <Td>{formatDataBR(l.data)}</Td>
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
                          <span>{l.descricao}</span>
                          {l.empresa_cliente && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--muted-foreground)",
                                marginLeft: 4,
                              }}
                            >
                              · {l.empresa_cliente}
                            </span>
                          )}
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
                                background: cat.cor,
                              }}
                            />
                            {cat.nome}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted-foreground)" }}>—</span>
                        )}
                      </Td>
                      <Td>{conta?.nome ?? "—"}</Td>
                      <Td align="right">
                        <span
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 600,
                            color: l.tipo === "receita" ? "var(--success)" : "var(--foreground)",
                          }}
                        >
                          {l.tipo === "receita" ? "+" : "−"} {formatBRL(l.valor)}
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
                            border: `1px solid ${corStatus(l.status)}`,
                            color: corStatus(l.status),
                          }}
                        >
                          {statusRotulo(l.status)}
                        </span>
                      </Td>
                      <Td align="right">
                        <button
                          type="button"
                          onClick={() => editar(l)}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: 2,
                            padding: "4px 10px",
                            cursor: "pointer",
                            fontSize: 12,
                            color: "var(--foreground)",
                          }}
                        >
                          Editar
                        </button>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LancamentoDrawer
        aberto={drawerAberto}
        fechar={() => setDrawerAberto(false)}
        categorias={categorias}
        contas={contas}
        empresas={empresas}
        lancamento={editando}
        mesAtual={mesAtual}
        anoAtual={anoAtual}
      />
    </>
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
    <td
      style={{
        textAlign: align,
        padding: "12px 16px",
        verticalAlign: "middle",
      }}
    >
      {children}
    </td>
  )
}
