"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import type { Mes } from "@/lib/data"
import { formatBRL, formatNumero } from "@/lib/data"
import { getPainelMetasCliente } from "@/lib/metas-cliente"
import DrawerEditarMeta from "@/components/DrawerEditarMeta"

type Painel = Awaited<ReturnType<typeof getPainelMetasCliente>>

/**
 * Botão "Metas por cliente" no card de uma empresa do /dashboard/metas.
 * Abre um drawer com um SELETOR DE CLIENTE; ao escolher um cliente, busca
 * sob demanda as metas (pago+orgânico) e o realizado do período e mostra:
 *   • um readout meta × realizado (definir OU ver), e
 *   • os editores reusando DrawerEditarMeta (Meta pago / Meta orgânica).
 *
 * Substitui a edição de metas por cliente que ficava na página do cliente
 * (fluxo de Tráfego) — agora as metas por cliente vivem no dashboard de Metas.
 */
export default function DrawerMetasPorCliente({
  empresaNome,
  mes,
  ano,
  de,
  ate,
  mesFechado,
  clientes,
}: {
  empresaNome: string
  mes: Mes
  ano: number
  de: string
  ate: string
  /** true quando o período do dashboard é um mês cheio — a meta (mensal) é
   *  comparável ao realizado. Em dia/intervalo mostramos um aviso. */
  mesFechado: boolean
  clientes: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [clienteId, setClienteId] = useState("")
  const [painel, setPainel] = useState<Painel | null>(null)
  const [pending, startTransition] = useTransition()
  // Token da última requisição — descarta respostas fora de ordem (trocar de
  // cliente rápido) e ao revalidar por mudança de período.
  const reqRef = useRef(0)

  function carregar(id: string) {
    if (!id) {
      setPainel(null)
      return
    }
    const meu = ++reqRef.current
    startTransition(async () => {
      const p = await getPainelMetasCliente(id, de, ate, ano)
      // Só aplica se ainda for a requisição mais recente (cliente/período atuais).
      if (meu === reqRef.current) setPainel(p)
    })
  }

  function selecionar(id: string) {
    setClienteId(id)
    setPainel(null)
    carregar(id)
  }

  // O período do dashboard muda por soft-nav (router.push) → o componente é
  // reconciliado, não remontado, então o painel cacheado ficaria de um período
  // antigo. Revalida (ou limpa) ao mudar de/ate/ano.
  useEffect(() => {
    setPainel(null)
    if (clienteId) carregar(clienteId)
    // carregar/clienteId fora das deps de propósito: só refazer ao trocar período.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, ano])

  const clienteNome = clientes.find((c) => c.id === clienteId)?.nome ?? ""
  const metaPagoMes = painel?.pagoPorMes[mes] ?? {}
  const metaOrgMes = painel?.orgPorMes[mes] ?? {}

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="no-ds hover:brightness-110 transition"
        style={{
          alignSelf: "flex-start",
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.03em",
          color: "var(--accent)",
          border: "0.5px solid rgba(201,149,58,0.45)",
          borderRadius: 8,
          background: "rgba(201,149,58,0.08)",
          cursor: "pointer",
        }}
      >
        Metas por cliente →
      </button>

      {aberto && (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
          />

          <aside
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto"
            style={{
              background: "rgba(15,15,15,0.9)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderLeft: "0.5px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="sticky top-0"
              style={{
                background: "rgba(10,10,10,0.7)",
                backdropFilter: "blur(16px)",
                borderBottom: "0.5px solid rgba(255,255,255,0.06)",
                padding: "18px 24px",
                zIndex: 5,
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    style={{
                      fontSize: 9,
                      letterSpacing: "2px",
                      color: "rgba(255,255,255,0.35)",
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    Metas por cliente · {empresaNome}
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      color: "#fff",
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {mes} · {ano}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  style={{ color: "rgba(255,255,255,0.5)", fontSize: 22, lineHeight: 1 }}
                  className="hover:text-white transition"
                >
                  ×
                </button>
              </div>

              <label className="block" style={{ marginTop: 14 }}>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "2px",
                    color: "rgba(255,255,255,0.4)",
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  Cliente
                </span>
                <select
                  value={clienteId}
                  onChange={(e) => selecionar(e.target.value)}
                  className="glass-input"
                  style={{ marginTop: 6, width: "100%", padding: "8px 12px", fontSize: 13 }}
                >
                  <option value="" style={{ background: "#0a0a0a" }}>
                    — Selecione um cliente —
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id} style={{ background: "#0a0a0a" }}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ padding: 24 }}>
              {clientes.length === 0 && (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                  Esta empresa não tem clientes de tráfego cadastrados.
                </p>
              )}

              {clienteId === "" && clientes.length > 0 && (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                  Selecione um cliente acima para definir ou ver as metas dele.
                </p>
              )}

              {pending && (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Carregando…</p>
              )}

              {!pending && clienteId !== "" && painel && (
                <div className="space-y-4">
                  {!mesFechado && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--accent)",
                        lineHeight: 1.5,
                      }}
                    >
                      ⚠ Período ≠ mês cheio · a meta é mensal ({mes}); o realizado
                      mostrado é só do período selecionado no topo do dashboard.
                    </p>
                  )}
                  {/* Readout meta × realizado do mês */}
                  <div
                    className="glass"
                    style={{ padding: 16, lineHeight: 1.6, fontVariantNumeric: "tabular-nums" }}
                  >
                    <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                      <strong>Pago</strong> — meta:{" "}
                      {metaPagoMes.leads != null ? `${metaPagoMes.leads} leads` : "—"}
                      {metaPagoMes.verba != null ? ` · ${formatBRL(metaPagoMes.verba)} verba` : ""}
                      {metaPagoMes.faturamento != null
                        ? ` · ${formatBRL(metaPagoMes.faturamento)} fat.`
                        : ""}
                    </p>
                    <p style={{ fontSize: 12.5, color: "var(--accent)", marginTop: 2 }}>
                      realizado: {formatNumero(painel.realizadoPago.leads)} leads ·{" "}
                      {formatBRL(painel.realizadoPago.investimento)} investido
                    </p>
                    <div
                      style={{
                        borderTop: "0.5px solid rgba(255,255,255,0.08)",
                        margin: "10px 0",
                      }}
                    />
                    <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                      <strong>Orgânico</strong> — meta:{" "}
                      {metaOrgMes.leads != null ? `${metaOrgMes.leads} leads` : "—"}
                      {metaOrgMes.faturamento != null
                        ? ` · ${formatBRL(metaOrgMes.faturamento)} fat.`
                        : ""}
                    </p>
                    <p style={{ fontSize: 12.5, color: "var(--accent)", marginTop: 2 }}>
                      realizado:{" "}
                      {painel.realizadoOrg
                        ? `${formatNumero(painel.realizadoOrg.leads)} leads · ${formatNumero(
                            painel.realizadoOrg.reunioes
                          )} reuniões · ${formatNumero(
                            painel.realizadoOrg.contratos
                          )} contratos · ${formatBRL(painel.realizadoOrg.faturamento)}`
                        : "sem lançamentos do comercial"}
                    </p>
                  </div>

                  {/* Editores (reusa DrawerEditarMeta, clienteId-aware) */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <DrawerEditarMeta
                      clienteId={clienteId}
                      empresaNome={clienteNome}
                      tipoEmpresa="leads-reunioes-contratos"
                      ano={ano}
                      mesInicial={mes}
                      linhasPorMes={painel.pagoPorMes}
                      origem="pago"
                      rotuloBotao="Meta pago"
                      onSaved={() => carregar(clienteId)}
                    />
                    <DrawerEditarMeta
                      clienteId={clienteId}
                      empresaNome={clienteNome}
                      tipoEmpresa="leads-reunioes-contratos"
                      ano={ano}
                      mesInicial={mes}
                      linhasPorMes={painel.orgPorMes}
                      origem="organico"
                      rotuloBotao="Meta orgânica"
                      onSaved={() => carregar(clienteId)}
                    />
                  </div>

                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                    Realizado do período selecionado no topo do dashboard. As metas
                    são mensais — use o seletor de mês dentro de cada editor.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
