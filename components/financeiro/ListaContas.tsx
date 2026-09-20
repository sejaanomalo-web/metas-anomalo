"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import ContaDrawer from "./ContaDrawer"
import {
  desativarContaAction,
  excluirContaAction,
} from "@/lib/financeiro-actions"
import type { ContaFinanceira } from "@/lib/financeiro"
import { tipoContaRotulo, valorNumerico } from "@/lib/financeiro-regras"
import { formatBRL } from "@/lib/data"

export default function ListaContas({
  contas,
  saldos,
  qsPeriodo,
}: {
  contas: ContaFinanceira[]
  saldos: Map<string, number>
  qsPeriodo: string
}) {
  const router = useRouter()
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<ContaFinanceira | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function abrirNova() {
    setEditando(null)
    setDrawerAberto(true)
  }
  function editar(c: ContaFinanceira) {
    setEditando(c)
    setDrawerAberto(true)
  }

  /**
   * Revalidação suave. A Server Action correspondente já chama
   * revalidatePath, o que invalida a rota no servidor E devolve o RSC novo
   * na resposta da própria ação — router.refresh() apenas garante que a
   * árvore atual seja repintada com esse payload.
   *
   * Aqui havia um reload duro do documento 250–400ms depois. Ele abortava o
   * refresh em voo, destruía o documento, rebaixava todo o bundle e
   * reexecutava o layout inteiro. No app instalado (display: standalone) não
   * existe barra de navegação, então isso aparecia como a tela de splash de
   * volta — parecia que o aplicativo tinha fechado sozinho. O motivo alegado
   * era o cache do Service Worker, mas public/sw.js só trata push e
   * notificationclick: ele nunca serve HTML, logo nunca serviu HTML velho.
   */
  function refreshUI() {
    router.refresh()
  }

  function excluir(c: ContaFinanceira) {
    if (!confirm(`Excluir a conta "${c.nome}"?`)) return
    setErro(null)
    setAviso(null)
    setPendingId(c.id)
    startTransition(async () => {
      const r = await excluirContaAction(c.id)
      setPendingId(null)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível excluir a conta.")
        return
      }
      setAviso(`Conta "${c.nome}" excluída.`)
      refreshUI()
    })
  }

  function desativar(c: ContaFinanceira) {
    setErro(null)
    setPendingId(c.id)
    startTransition(async () => {
      const r = await desativarContaAction(c.id)
      setPendingId(null)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível desativar a conta.")
        return
      }
      setAviso(`Conta "${c.nome}" desativada. O saldo histórico continua valendo.`)
      refreshUI()
    })
  }

  const href = (id: string) =>
    `/dashboard/financeiro/contas/${id}${qsPeriodo ? `?${qsPeriodo}` : ""}`

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button type="button" onClick={abrirNova} className="btn-gold-filled">
          + Nova conta
        </button>
      </div>

      {(erro || aviso) && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--text-1)",
            background: erro ? "rgba(239,68,68,0.12)" : "rgba(22,163,74,0.12)",
            border: `0.5px solid ${erro ? "rgba(239,68,68,0.40)" : "rgba(22,163,74,0.40)"}`,
          }}
        >
          {erro ?? aviso}
        </div>
      )}

      {contas.length === 0 ? (
        <div
          className="glass"
          style={{ padding: "40px 24px", textAlign: "center", color: "var(--muted-foreground)" }}
        >
          <p style={{ fontSize: 14 }}>Nenhuma conta cadastrada.</p>
          <button
            type="button"
            onClick={abrirNova}
            className="btn-gold-filled"
            style={{ marginTop: 16 }}
          >
            + Nova conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style={{ gap: 16 }}>
          {contas.map((c) => {
            const saldoAtual = saldos.get(c.id) ?? valorNumerico(c.saldo_inicial)
            const ocupada = pendingId === c.id
            return (
              <div
                key={c.id}
                className="glass"
                style={{
                  padding: "20px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  opacity: c.ativa ? 1 : 0.6,
                  border: "1px solid var(--border)",
                }}
              >
                <Link
                  href={href(c.id)}
                  style={{ textDecoration: "none", color: "inherit", display: "block" }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--muted-foreground)",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {tipoContaRotulo(c.tipo)}
                    {!c.ativa && " · inativa"}
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{c.nome}</p>
                  <p
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: saldoAtual >= 0 ? "var(--foreground)" : "var(--destructive)",
                      marginTop: 8,
                    }}
                  >
                    {formatBRL(saldoAtual)}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                    Saldo inicial: {formatBRL(valorNumerico(c.saldo_inicial))}
                  </p>
                </Link>

                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginTop: 10,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    flexWrap: "wrap",
                  }}
                >
                  <BotaoCard onClick={() => editar(c)} disabled={ocupada}>
                    Editar
                  </BotaoCard>
                  {c.ativa && (
                    <BotaoCard onClick={() => desativar(c)} disabled={ocupada}>
                      Desativar
                    </BotaoCard>
                  )}
                  <BotaoCard onClick={() => excluir(c)} disabled={ocupada} perigo>
                    Excluir
                  </BotaoCard>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Renderizado só quando aberto, de propósito.
          O drawer faz `if (!aberto) return null` DEPOIS dos hooks, então ele
          nunca desmontava: os inicializadores de useState rodavam uma única
          vez, no primeiro render da página — quando não havia registro
          nenhum selecionado. Nas aberturas seguintes, tipo/status/conta/
          categoria/cor continuavam com o valor da vez anterior, enquanto os
          campos não controlados (descrição, valor, datas) se atualizavam
          normalmente: o formulário abria metade certo, metade errado.
          Montar a cada abertura garante estado novo. A animação de entrada
          continua igual — o painel interno já era criado e destruído. */}
      {drawerAberto && (
        <ContaDrawer
          aberto={drawerAberto}
          fechar={() => setDrawerAberto(false)}
          conta={editando}
          saldoAtual={editando ? saldos.get(editando.id) : undefined}
        />
      )}
    </>
  )
}

function BotaoCard({
  onClick,
  disabled,
  perigo,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  perigo?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 12px",
        background: "transparent",
        border: `1px solid ${perigo ? "rgba(239,68,68,0.40)" : "var(--border)"}`,
        borderRadius: 4,
        cursor: disabled ? "wait" : "pointer",
        fontSize: 12,
        fontWeight: 500,
        color: perigo ? "#ef4444" : "var(--foreground)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}
