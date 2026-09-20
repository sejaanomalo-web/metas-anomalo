"use client"

import Link from "next/link"
import type { VencimentoDoDia } from "@/lib/financeiro"
import { formatBRL } from "@/lib/data"

/**
 * Vencimentos do financeiro dentro de um dia do calendário.
 *
 * Deliberadamente FORA do drag-and-drop: arrastar uma tarefa muda o prazo
 * dela, mas arrastar uma conta não muda o vencimento de nada — o vencimento
 * é do fornecedor, não do calendário. Manter esses itens fora do
 * SortableContext também garante que a agenda de tarefas continue se
 * comportando exatamente como antes.
 *
 * Sem horário, porque conta não tem hora. Receita e despesa têm estilos
 * distintos porque, num dia com as duas, o que importa saber de relance é se
 * o dia entra ou sai dinheiro.
 */
export default function VencimentosDoDia({
  itens,
  compacto,
}: {
  itens: VencimentoDoDia[]
  compacto?: boolean
}) {
  if (itens.length === 0) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
      {itens.map((v) => {
        const ehReceita = v.tipo === "receita"
        const cor = v.atrasado
          ? "#ef4444"
          : ehReceita
            ? "#16a34a"
            : "#d97706"
        return (
          <Link
            key={v.id}
            href={v.href}
            title={`${ehReceita ? "A receber" : "A pagar"}: ${v.descricao} · ${formatBRL(v.valor)}${
              v.atrasado ? " · atrasada" : ""
            }`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: compacto ? "3px 6px" : "5px 8px",
              borderRadius: 6,
              // Faixa lateral em vez de fundo cheio: o cartão de tarefa já usa
              // fundo colorido, e dois blocos cheios lado a lado competiriam.
              borderLeft: `3px solid ${cor}`,
              background: "rgba(255,255,255,0.04)",
              textDecoration: "none",
              fontSize: compacto ? 10 : 11,
              color: "var(--text-2)",
              lineHeight: 1.3,
            }}
          >
            <span style={{ color: cor, fontWeight: 700, flexShrink: 0 }}>
              {ehReceita ? "+" : "−"}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {v.descricao}
            </span>
            {!compacto && (
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                  color: cor,
                  flexShrink: 0,
                }}
              >
                {formatBRL(v.valor)}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
