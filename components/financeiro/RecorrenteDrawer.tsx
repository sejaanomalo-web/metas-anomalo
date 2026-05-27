"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  salvarRecorrenteAction,
  excluirRecorrenteAction,
  materializarMesAction,
} from "@/lib/financeiro-actions"
import { mesValido } from "@/lib/data"
import type {
  CategoriaFinanceira,
  ContaFinanceira,
  PagamentoRecorrente,
  Periodicidade,
  TipoLancamento,
} from "@/lib/financeiro"

interface Props {
  aberto: boolean
  fechar: () => void
  categorias: CategoriaFinanceira[]
  contas: ContaFinanceira[]
  recorrente?: PagamentoRecorrente | null
  /** Mês/ano vigentes — materializa lançamentos do recorrente recém-criado
   *  no mês atual da listagem (igual o LancamentoDrawer faz). */
  mesAtual?: string
  anoAtual?: number
}

export default function RecorrenteDrawer({
  aberto,
  fechar,
  categorias,
  contas,
  recorrente,
  mesAtual,
  anoAtual,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoLancamento>(recorrente?.tipo ?? "despesa")
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>(
    recorrente?.periodicidade ?? "mensal"
  )
  const [statusPadrao, setStatusPadrao] = useState<"previsto" | "realizado">(
    recorrente?.status_padrao ?? "previsto"
  )

  if (!aberto) return null
  const editando = !!recorrente
  const contasAtivas = contas.filter((c) => c.ativa)
  const categoriasDoTipo = categorias.filter((c) => c.tipo === tipo && c.ativa)

  function refreshUI() {
    router.refresh()
    setTimeout(() => window.location.reload(), 250)
  }

  async function onSubmit(fd: FormData) {
    setErro(null)
    setSucesso(null)
    fd.set("tipo", tipo)
    fd.set("periodicidade", periodicidade)
    fd.set("status_padrao", statusPadrao)
    if (editando) fd.set("id", recorrente!.id)
    startTransition(async () => {
      const r = await salvarRecorrenteAction(fd)
      if (!r.ok) { setErro(r.erro ?? "Erro"); return }

      // Materializa lançamento do mês corrente pra aparecer imediatamente
      // na lista. Chamada direta de server action (sem fetch HTTP) —
      // o endpoint exige cookie de sessão e o SW PWA bloqueava em
      // certos casos. Server action herda contexto da sessão server.
      if (!editando && mesAtual && anoAtual) {
        const mesEnum = mesValido(mesAtual)
        const matResult = await materializarMesAction(mesEnum, anoAtual)
        if (matResult.ok && matResult.criados > 0) {
          setSucesso(
            `${matResult.criados} lançamento(s) previsto(s) gerado(s) pra ${mesAtual}/${anoAtual}.`
          )
        }
      }

      refreshUI()
      // Espera um beat pra usuário ler a mensagem antes de fechar.
      setTimeout(() => fechar(), sucesso || erro ? 800 : 0)
    })
  }

  async function onExcluir() {
    if (!recorrente) return
    if (!confirm(`Excluir recorrente "${recorrente.nome}"? Os lançamentos já gerados são preservados.`)) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirRecorrenteAction(recorrente.id)
      if (!r.ok) { setErro(r.erro ?? "Erro"); return }
      refreshUI()
      fechar()
    })
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(32, 37, 42, 0.45)",
        zIndex: 100, display: "flex", justifyContent: "flex-end",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) fechar() }}
    >
      <div
        style={{
          width: "min(520px, 100vw)",
          background: "var(--background)",
          borderLeft: "1px solid var(--border)",
          overflowY: "auto",
          padding: "32px 28px",
          animation: "painel-slide-left 0.22s ease-out",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22 }}>{editando ? "Editar recorrente" : "Novo recorrente"}</h2>
          <button type="button" onClick={fechar} aria-label="Fechar" style={fecharBtn}>✕</button>
        </div>

        <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Label>Tipo</Label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["receita", "despesa"] as const).map((t) => (
                <button
                  key={t} type="button" onClick={() => setTipo(t)}
                  style={{
                    flex: 1, padding: 10, borderRadius: 2,
                    border: tipo === t ? "1px solid var(--foreground)" : "1px solid var(--border)",
                    background: tipo === t ? "var(--surface-2)" : "transparent",
                    color: "var(--foreground)", fontWeight: 500, fontSize: 13,
                    cursor: "pointer", textTransform: "capitalize",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <Campo label="Nome" obrigatorio>
            <input
              type="text" name="nome" required maxLength={120}
              placeholder="Ex: Aluguel escritório · Vercel Pro · Salário Bruno"
              defaultValue={recorrente?.nome ?? ""}
              className="glass-input" style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Valor (R$)" obrigatorio>
            <input
              type="text" name="valor" required inputMode="decimal"
              placeholder="Ex: 1.234,56"
              defaultValue={recorrente ? String(recorrente.valor).replace(".", ",") : ""}
              className="glass-input" style={{ width: "100%" }}
            />
          </Campo>

          <div>
            <Label>Periodicidade</Label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["mensal", "anual", "semanal"] as const).map((p) => (
                <button
                  key={p} type="button" onClick={() => setPeriodicidade(p)}
                  style={{
                    flex: 1, padding: "8px 6px", borderRadius: 2,
                    border: periodicidade === p ? "1px solid var(--foreground)" : "1px solid var(--border)",
                    background: periodicidade === p ? "var(--surface-2)" : "transparent",
                    color: "var(--foreground)", fontWeight: 500, fontSize: 12,
                    cursor: "pointer", textTransform: "capitalize",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            {periodicidade !== "mensal" && (
              <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>
                Periodicidade {periodicidade} não materializa automaticamente no MVP — só mensal.
              </p>
            )}
          </div>

          <div>
            <Label>Status ao materializar</Label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["previsto", "realizado"] as const).map((s) => (
                <button
                  key={s} type="button" onClick={() => setStatusPadrao(s)}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 2,
                    border: statusPadrao === s ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: statusPadrao === s ? "rgba(201,149,58,0.10)" : "transparent",
                    color: statusPadrao === s ? "var(--accent)" : "var(--foreground)",
                    fontWeight: 500, fontSize: 12,
                    cursor: "pointer", textTransform: "capitalize",
                  }}
                >
                  {s === "realizado" ? "Realizado (pago)" : "Previsto (em aberto)"}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.4 }}>
              {statusPadrao === "realizado"
                ? "Lançamentos materializados nascem como pagos — entram nos KPIs de receitas/despesas do mês imediatamente."
                : "Lançamentos materializados aparecem em \"Próximos vencimentos\" até serem marcados como pagos manualmente."}
            </p>
          </div>

          {periodicidade === "mensal" && (
            <Campo label="Dia do vencimento (1-31)" obrigatorio>
              <input
                type="number" name="dia_vencimento" min={1} max={31} required
                defaultValue={recorrente?.dia_vencimento ?? 5}
                className="glass-input" style={{ width: 100 }}
              />
            </Campo>
          )}

          <Campo label="Início" obrigatorio>
            <input
              type="date" name="inicio" required
              defaultValue={recorrente?.inicio ?? new Date().toISOString().slice(0, 10)}
              className="glass-input" style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Fim (opcional — vazio = indeterminado)">
            <input
              type="date" name="fim"
              defaultValue={recorrente?.fim ?? ""}
              className="glass-input" style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Categoria">
            <select
              name="categoria_id"
              defaultValue={recorrente?.categoria_id ?? categoriasDoTipo[0]?.id ?? ""}
              key={tipo /* força re-render quando troca tipo */}
              className="glass-input" style={{ width: "100%" }}
            >
              <option value="">— Sem categoria —</option>
              {categoriasDoTipo.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Conta">
            <select
              name="conta_id"
              defaultValue={recorrente?.conta_id ?? contasAtivas[0]?.id ?? ""}
              className="glass-input" style={{ width: "100%" }}
            >
              <option value="">— Sem conta —</option>
              {contasAtivas.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Observações">
            <textarea
              name="observacoes" rows={2} maxLength={500}
              defaultValue={recorrente?.observacoes ?? ""}
              className="glass-input" style={{ width: "100%", resize: "vertical" }}
            />
          </Campo>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" name="ativo" defaultChecked={recorrente?.ativo ?? true} />
            Recorrência ativa (gera novos lançamentos automaticamente)
          </label>

          {erro && <div style={erroBox}>{erro}</div>}
          {sucesso && (
            <div
              style={{
                padding: 12,
                background: "rgba(22, 163, 74, 0.12)",
                border: "0.5px solid rgba(22, 163, 74, 0.40)",
                borderRadius: 8,
                color: "var(--text-1)",
                fontSize: 13,
              }}
            >
              {sucesso}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="submit" disabled={pending} className="btn-gold-filled" style={{ flex: 1, opacity: pending ? 0.6 : 1 }}>
              {pending ? "Salvando..." : editando ? "Salvar" : "Criar"}
            </button>
            {editando && (
              <button type="button" onClick={onExcluir} disabled={pending} style={excluirBtn}>
                Excluir
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

const fecharBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  color: "var(--foreground)",
}

const excluirBtn: React.CSSProperties = {
  padding: "0 16px", height: 32,
  background: "transparent",
  border: "1px solid var(--destructive)",
  borderRadius: 2,
  color: "var(--destructive)",
  cursor: "pointer", fontWeight: 500, fontSize: 12,
}

const erroBox: React.CSSProperties = {
  padding: 12,
  background: "rgba(217, 103, 88, 0.12)",
  border: "1px solid rgba(217, 103, 88, 0.35)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 13,
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)",
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>
      {children}
    </p>
  )
}

function Campo({
  label, obrigatorio, children,
}: { label: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label>
        {label}
        {obrigatorio && <span style={{ color: "var(--destructive)", marginLeft: 4 }}>*</span>}
      </Label>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}
