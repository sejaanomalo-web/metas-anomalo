"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import RecorrenteDrawer from "./RecorrenteDrawer"
import {
  excluirRecorrenteAction,
  materializarPeriodoAction,
} from "@/lib/financeiro-actions"
import type {
  CategoriaFinanceira,
  ContaFinanceira,
  PagamentoRecorrente,
} from "@/lib/financeiro"
import { formatBRL, type Mes } from "@/lib/data"
import { rotuloMes, valorNumerico } from "@/lib/financeiro-regras"

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
  const [pendingId, setPendingId] = useState<string | null>(null)

  const catById = new Map(categorias.map((c) => [c.id, c]))
  const contaById = new Map(contas.map((c) => [c.id, c]))

  function abrirNovo() { setEditando(null); setDrawerAberto(true) }
  function editar(r: PagamentoRecorrente) { setEditando(r); setDrawerAberto(true) }

  function excluir(r: PagamentoRecorrente) {
    if (
      !confirm(
        `Excluir o recorrente "${r.nome}"?\n\n` +
          "Os lançamentos já gerados CONTINUAM existindo — eles só deixam de " +
          "apontar para este modelo. O que para é a geração dos próximos meses."
      )
    ) {
      return
    }
    setErro(null)
    setSucesso(null)
    setPendingId(r.id)
    startTransition(async () => {
      const res = await excluirRecorrenteAction(r.id)
      setPendingId(null)
      if (!res.ok) {
        setErro(res.erro ?? "Não foi possível excluir.")
        return
      }
      setSucesso(`"${r.nome}" foi excluído. Os lançamentos já gerados continuam lá.`)
      // Só refresh: o reload duro que havia aqui apagava a mensagem de
      // sucesso acima antes de dar tempo de ler.
      router.refresh()
    })
  }

  /** "Sem fim" · "Até 31/12/2026" — a diferença entre uma despesa que some
   *  sozinha em dezembro e uma que vai cobrar pra sempre. */
  function janela(r: PagamentoRecorrente): string {
    if (!r.ativo) return "Inativo"
    if (!r.fim) return "Sem fim"
    const [y, m, d] = r.fim.split("-")
    return `Até ${d}/${m}/${y}`
  }

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
      // Só refresh: o reload duro que havia aqui apagava a mensagem de
      // sucesso acima antes de dar tempo de ler.
      router.refresh()
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
            const ocupado = pendingId === r.id
            return (
              <div
                key={r.id}
                className="glass"
                style={{
                  padding: "20px 24px",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  opacity: r.ativo ? 1 : 0.55,
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  onClick={() => editar(r)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") editar(r)
                  }}
                  style={{ cursor: "pointer" }}
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
                  {formatBRL(valorNumerico(r.valor))}
                </p>
                <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  {cat ? cat.nome : "Sem categoria"}
                  {conta && ` · ${conta.nome}`}
                  {" · "}
                  {janela(r)}
                </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginTop: 10,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <BotaoCard onClick={() => editar(r)} disabled={ocupado}>
                    Editar
                  </BotaoCard>
                  <BotaoCard onClick={() => excluir(r)} disabled={ocupado} perigo>
                    {ocupado ? "..." : "Excluir"}
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
        <RecorrenteDrawer
          aberto={drawerAberto}
          fechar={() => setDrawerAberto(false)}
          categorias={categorias}
          contas={contas}
          recorrente={editando}
          mesAtual={mesAtual}
          anoAtual={anoAtual}
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
