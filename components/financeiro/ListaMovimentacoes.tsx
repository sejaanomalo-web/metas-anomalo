"use client"

import { useMemo, useState } from "react"
import type { ContaFinanceira, LancamentoFinanceiro } from "@/lib/financeiro"
import {
  dataDoPeriodo,
  estaAtrasado,
  somarLancamentos,
  statusRotuloComAtraso,
  valorNumerico,
} from "@/lib/financeiro-regras"
import { formatBRL } from "@/lib/data"

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

/**
 * Lista de movimentações com busca — usada no detalhe de conta e de categoria.
 *
 * A busca é local (o conjunto já veio recortado pelo período), porque a
 * pergunta típica aqui é "onde está aquele pagamento do fornecedor X" dentro
 * de uma lista que a pessoa está olhando, não uma consulta nova.
 */
export default function ListaMovimentacoes({
  lancamentos,
  contas,
  titulo,
}: {
  lancamentos: LancamentoFinanceiro[]
  contas: ContaFinanceira[]
  titulo: string
}) {
  const [busca, setBusca] = useState("")
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const contaById = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return lancamentos
    return lancamentos.filter((l) =>
      [l.descricao, l.origem, l.empresa_cliente, contaById.get(l.conta_id ?? "")?.nome]
        .filter(Boolean)
        .some((campo) => (campo as string).toLowerCase().includes(termo))
    )
  }, [lancamentos, busca, contaById])

  // O total acompanha a BUSCA, não só o período: se a pessoa filtrou por
  // "fornecedor X", o número que ela quer é o desse fornecedor.
  const totais = somarLancamentos(filtrados, "total")

  return (
    <section className="glass" style={{ padding: 0, overflow: "hidden" }}>
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
        <div>
          <p style={{ fontWeight: 600, fontSize: 14 }}>{titulo}</p>
          <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
            {filtrados.length}{" "}
            {filtrados.length === 1 ? "movimentação" : "movimentações"} ·{" "}
            saldo {formatBRL(totais.saldo)}
          </p>
        </div>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar descrição, origem, conta…"
          className="glass-input"
          style={{ flex: "1 1 220px", maxWidth: 320 }}
        />
      </div>

      {filtrados.length === 0 ? (
        <p style={{ padding: "32px 24px", color: "var(--muted-foreground)", fontSize: 13, textAlign: "center" }}>
          {busca ? "Nada encontrado com esse termo." : "Nenhuma movimentação no período."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {filtrados.map((l) => {
            const conta = l.conta_id ? contaById.get(l.conta_id) : null
            const rotulo = statusRotuloComAtraso(l, hoje)
            return (
              <li
                key={l.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                  padding: "12px 24px",
                  borderTop: "1px solid var(--border)",
                  opacity: l.status === "cancelado" ? 0.55 : 1,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      fontSize: 14,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textDecoration: l.status === "cancelado" ? "line-through" : "none",
                    }}
                  >
                    {l.descricao}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>
                    {formatDataBR(dataDoPeriodo(l))}
                    {" · "}
                    <span style={{ color: estaAtrasado(l, hoje) ? "var(--destructive)" : undefined }}>
                      {rotulo}
                    </span>
                    {conta && ` · ${conta.nome}`}
                    {l.origem && ` · ${l.origem}`}
                  </p>
                </div>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    color: l.tipo === "receita" ? "var(--success)" : "var(--destructive)",
                  }}
                >
                  {l.tipo === "receita" ? "+" : "−"} {formatBRL(valorNumerico(l.valor))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
