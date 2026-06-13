"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { VendaCliente } from "@/lib/vendas-cliente"
import { excluirVendaClienteAction } from "@/lib/vendas-cliente-actions"

function brl(n: number): string {
  return Number(n).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

/** "2026-06-11" → "11/06". */
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** created_at ISO → "11/06 14:32" em BRT. */
function carimboBRT(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60_000)
  const s = d.toISOString()
  return `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`
}

/**
 * Seção "Vendas informadas pelo cliente" do dashboard do cliente — lista
 * os EVENTOS de vendas_cliente do período (auditoria do formulário público).
 * Os totais já estão somados no funil/ROI acima; aqui é o detalhe de quem
 * informou o quê. Admin pode remover lançamento errado (a remoção também
 * subtrai do dia).
 */
export default function VendasInformadas({
  vendas,
  ehAdmin,
}: {
  vendas: VendaCliente[]
  ehAdmin: boolean
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function remover(v: VendaCliente) {
    const rotulo =
      v.quantidade > 0
        ? `${v.quantidade} venda(s) de ${diaMes(v.data)}`
        : `a confirmação "sem vendas" de ${diaMes(v.data)}`
    if (!window.confirm(`Remover ${rotulo}? O total do dia será ajustado.`)) {
      return
    }
    setErro(null)
    setPendingId(v.id)
    const fd = new FormData()
    fd.set("id", v.id)
    startTransition(async () => {
      const r = await excluirVendaClienteAction(fd)
      setPendingId(null)
      if (!r.ok) {
        setErro(r.erro ?? "Erro ao remover.")
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="glass" style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>
          Vendas informadas pelo cliente
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
          Registros enviados pelo formulário público (🔗 Link de vendas, no
          topo). Cada registro já soma em Vendas e Faturamento do dia.
        </p>
      </div>

      {vendas.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>
          Nenhum registro no período. Copie o link de vendas no topo da página
          e mande pro cliente no WhatsApp.
        </p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "max-content",
            }}
          >
            <thead>
              <tr>
                {["Data", "Vendas", "Valor", "Observações", "Enviado em", ""].map(
                  (h, idx) => (
                    <th
                      key={`${h}-${idx}`}
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                        fontWeight: 600,
                        textAlign: "left",
                        padding: "10px 14px",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {vendas.map((v) => (
                <tr key={v.id}>
                  <td style={celula}>{diaMes(v.data)}</td>
                  <td style={celula}>
                    {v.quantidade > 0 ? (
                      <strong style={{ color: "var(--text-1)" }}>
                        {v.quantidade}
                      </strong>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-3)",
                          background: "rgba(255,255,255,0.05)",
                          padding: "3px 8px",
                          borderRadius: 999,
                          fontWeight: 600,
                        }}
                      >
                        sem vendas
                      </span>
                    )}
                  </td>
                  <td style={celula}>{v.valor > 0 ? brl(v.valor) : "·"}</td>
                  <td
                    style={{
                      ...celula,
                      whiteSpace: "normal",
                      maxWidth: 320,
                      color: "var(--text-3)",
                    }}
                  >
                    {v.observacoes ?? "·"}
                  </td>
                  <td style={{ ...celula, color: "var(--text-4)", fontSize: 12 }}>
                    {carimboBRT(v.created_at)}
                  </td>
                  <td style={celula}>
                    {ehAdmin && (
                      <button
                        type="button"
                        onClick={() => remover(v)}
                        disabled={pendingId === v.id}
                        className="hover:text-[#e24b4a] transition no-ds"
                        style={{
                          fontSize: 11,
                          color: "var(--text-4)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                        }}
                      >
                        {pendingId === v.id ? "Removendo…" : "Remover"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {erro && (
        <p
          style={{
            fontSize: 12,
            color: "#e24b4a",
            fontWeight: 500,
            marginTop: 12,
          }}
        >
          {erro}
        </p>
      )}
    </section>
  )
}

const celula: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-2)",
  fontWeight: 400,
  padding: "12px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
}
