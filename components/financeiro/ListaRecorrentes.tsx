"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import RecorrenteDrawer from "./RecorrenteDrawer"
import { materializarPeriodoAction } from "@/lib/financeiro-actions"
import type {
  CategoriaFinanceira,
  ContaFinanceira,
  PagamentoRecorrente,
} from "@/lib/financeiro"
import { formatBRL, type Mes } from "@/lib/data"
import { rotuloMes } from "@/lib/financeiro"

interface Props {
  recorrentes: PagamentoRecorrente[]
  categorias: CategoriaFinanceira[]
  contas: ContaFinanceira[]
  /** Rótulo do mês (só UI). */
  mesAtual: Mes
  anoAtual: number
  /** Mês do CALENDÁRIO (1–12) — é ele que vai pro banco. Ver §3.2: o tipo
   *  `Mes` cobre só Abril–Dezembro e faria janeiro virar abril. */
  mesNum: number
}

export default function ListaRecorrentes({
  recorrentes,
  categorias,
  contas,
  mesAtual,
  anoAtual,
  mesNum,
}: Props) {
  const rotuloPeriodo = `${rotuloMes(mesNum)}/${anoAtual}`
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<PagamentoRecorrente | null>(null)

  const catById = new Map(categorias.map((c) => [c.id, c]))
  const contaById = new Map(contas.map((c) => [c.id, c]))

  function abrirNovo() { setEditando(null); setDrawerAberto(true) }
  function editar(r: PagamentoRecorrente) { setEditando(r); setDrawerAberto(true) }

  async function materializar() {
    setErro(null)
    setSucesso(null)
    startTransition(async () => {
      // Chamada direta de server action (sem fetch HTTP) — mais
      // confiável em PWA porque elimina dependência de cookie/SW.
      const matResult = await materializarPeriodoAction(anoAtual, mesNum)
      if (!matResult.ok) {
        setErro(`Erro: ${matResult.erro ?? "falha desconhecida"}`)
        return
      }
      setSucesso(
        matResult.criados === 0
          ? `Nenhum lançamento novo (todos já existem para ${rotuloPeriodo}).`
          : `${matResult.criados} lançamento(s) criado(s) para ${rotuloPeriodo}.`
      )
      router.refresh()
      setTimeout(() => window.location.reload(), 400)
    })
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={materializar}
          disabled={pending}
          className="btn-gold-outline"
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Gerando..." : `Gerar lançamentos de ${rotuloPeriodo}`}
        </button>
        <button type="button" onClick={abrirNovo} className="btn-gold-filled">
          + Novo recorrente
        </button>
      </div>

      {erro && (
        <div
          style={{
            padding: 12,
            background: "rgba(217, 103, 88, 0.12)",
            border: "1px solid rgba(217, 103, 88, 0.35)",
            borderRadius: 8,
            color: "var(--foreground)",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {erro}
        </div>
      )}
      {sucesso && (
        <div
          style={{
            padding: 12,
            background: "rgba(0, 168, 104, 0.10)",
            border: "1px solid rgba(0, 168, 104, 0.35)",
            borderRadius: 8,
            color: "var(--foreground)",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {sucesso}
        </div>
      )}

      {recorrentes.length === 0 ? (
        <div
          className="glass"
          style={{ padding: "32px 24px", textAlign: "center", color: "var(--muted-foreground)" }}
        >
          Nenhum pagamento recorrente cadastrado. Clique em <strong>+ Novo recorrente</strong>{" "}
          pra cadastrar aluguel, plataformas, salários etc.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
          {recorrentes.map((r) => {
            const cat = r.categoria_id ? catById.get(r.categoria_id) : null
            const conta = r.conta_id ? contaById.get(r.conta_id) : null
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => editar(r)}
                className="glass"
                style={{
                  padding: "20px 24px",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  cursor: "pointer",
                  opacity: r.ativo ? 1 : 0.55,
                  border: "1px solid var(--border)",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {r.tipo}
                  {" · "}
                  {r.periodicidade}
                  {r.dia_vencimento && r.periodicidade === "mensal" && ` · dia ${r.dia_vencimento}`}
                  {!r.ativo && " · inativo"}
                </p>
                <p style={{ fontSize: 18, fontWeight: 600 }}>{r.nome}</p>
                <p
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: r.tipo === "receita" ? "var(--success)" : "var(--foreground)",
                    marginTop: 4,
                  }}
                >
                  {formatBRL(r.valor)}
                </p>
                <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  {cat ? cat.nome : "Sem categoria"}
                  {conta && ` · ${conta.nome}`}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <RecorrenteDrawer
        aberto={drawerAberto}
        fechar={() => setDrawerAberto(false)}
        categorias={categorias}
        contas={contas}
        recorrente={editando}
        mesAtual={mesAtual}
        anoAtual={anoAtual}
      />
    </>
  )
}
