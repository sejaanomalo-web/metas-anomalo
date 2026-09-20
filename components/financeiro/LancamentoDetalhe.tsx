"use client"

import type { CategoriaFinanceira, ContaFinanceira } from "@/lib/financeiro"
import type { LancamentoFinanceiro } from "@/lib/financeiro"
import {
  corDaCategoria,
  estaAtrasado,
  statusRotuloComAtraso,
  valorNumerico,
} from "@/lib/financeiro-regras"
import { formatBRL } from "@/lib/data"

/**
 * Detalhe do lançamento — só leitura.
 *
 * Existe porque a linha da tabela mostra sete colunas e o lançamento tem
 * dezesseis campos. Quando alguém precisa conferir uma quantia, a pergunta
 * costuma ser "de onde veio isso?", e a resposta está em origem, vínculo com
 * recorrente, forma de pagamento e observações — nada disso cabe na linha.
 *
 * Abrir para conferir não pode exigir entrar no modo de edição: é assim que
 * se altera um valor sem querer.
 */
export default function LancamentoDetalhe({
  lancamento,
  categorias,
  contas,
  hoje,
  fechar,
  editar,
}: {
  lancamento: LancamentoFinanceiro
  categorias: CategoriaFinanceira[]
  contas: ContaFinanceira[]
  hoje: string
  fechar: () => void
  editar: () => void
}) {
  const l = lancamento
  const cat = categorias.find((c) => c.id === l.categoria_id) ?? null
  const conta = contas.find((c) => c.id === l.conta_id) ?? null
  const ehReceita = l.tipo === "receita"
  const atrasado = estaAtrasado(l, hoje)

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
    >
      <div
        style={{
          width: "min(480px, 100vw)",
          background: "var(--surface-1)",
          borderLeft: "0.5px solid rgba(255,255,255,0.10)",
          overflowY: "auto",
          padding: "32px 28px",
          animation: "painel-slide-left 0.22s ease-out",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              border: `1px solid ${ehReceita ? "var(--success)" : "var(--destructive)"}`,
              color: ehReceita ? "var(--success)" : "var(--destructive)",
            }}
          >
            {ehReceita ? "Receita" : "Despesa"}
          </span>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            style={{
              background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              color: "var(--text-2)",
            }}
          >
            ✕
          </button>
        </div>

        <h2 style={{ fontSize: 20, lineHeight: 1.3 }}>{l.descricao}</h2>
        <p
          style={{
            fontSize: 34,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            marginTop: 10,
            color: ehReceita ? "var(--success)" : "var(--destructive)",
          }}
        >
          {ehReceita ? "+" : "−"} {formatBRL(valorNumerico(l.valor))}
        </p>

        <dl style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 0 }}>
          <Linha rotulo="Status">
            <span style={{ color: atrasado ? "var(--destructive)" : undefined, fontWeight: atrasado ? 600 : 400 }}>
              {statusRotuloComAtraso(l, hoje)}
            </span>
          </Linha>
          <Linha rotulo="Forma de pagamento">{l.forma_pagamento ?? "—"}</Linha>
          <Linha rotulo="Categoria">
            {cat ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: corDaCategoria(cat),
                  }}
                />
                {cat.nome}
              </span>
            ) : (
              "Sem categoria"
            )}
          </Linha>
          <Linha rotulo="Conta">{conta?.nome ?? "Sem conta"}</Linha>
          <Linha rotulo="Competência" dica="Quando o fato aconteceu">
            {formatDataBR(l.data)}
          </Linha>
          <Linha rotulo="Vencimento" dica="Quando o dinheiro deve andar">
            {l.data_vencimento ? formatDataBR(l.data_vencimento) : "—"}
          </Linha>
          <Linha rotulo="Pagamento" dica="Quando o dinheiro andou de fato">
            {l.data_pagamento ? formatDataBR(l.data_pagamento) : "—"}
          </Linha>
          <Linha rotulo="Origem">{l.origem ?? "—"}</Linha>
          {l.empresa_cliente && (
            <Linha rotulo="Empresa cliente">{l.empresa_cliente}</Linha>
          )}
          {l.recorrente_id && (
            <Linha rotulo="Vínculo">Gerado de um pagamento recorrente</Linha>
          )}
          {l.observacoes && <Linha rotulo="Observações">{l.observacoes}</Linha>}
        </dl>

        <div style={{ display: "flex", gap: 8, marginTop: 28 }}>
          <button
            type="button"
            onClick={fechar}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.18)",
              borderRadius: 6,
              color: "var(--text-2)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={editar}
            className="btn-gold-filled"
            style={{ flex: 1 }}
          >
            Editar
          </button>
        </div>
      </div>
    </div>
  )
}

function Linha({
  rotulo,
  dica,
  children,
}: {
  rotulo: string
  dica?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 16,
        padding: "11px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <dt
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
        title={dica}
      >
        {rotulo}
      </dt>
      <dd style={{ fontSize: 13, textAlign: "right", margin: 0, minWidth: 0 }}>
        {children}
      </dd>
    </div>
  )
}

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}
