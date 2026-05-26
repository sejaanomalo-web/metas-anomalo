"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  salvarContaAction,
  excluirContaAction,
} from "@/lib/financeiro-actions"
import type { ContaFinanceira, TipoConta } from "@/lib/financeiro"
import { tipoContaRotulo } from "@/lib/financeiro"
import { formatBRL } from "@/lib/data"

interface Props {
  aberto: boolean
  fechar: () => void
  conta?: ContaFinanceira | null
  /** Saldo atual calculado (inicial + receitas realizadas − despesas
   *  realizadas). Só relevante em modo edição — usuário precisa ver
   *  o impacto do saldo_inicial em relação ao que já entrou/saiu. */
  saldoAtual?: number
}

const TIPOS_CONTA: TipoConta[] = ["banco", "caixa", "cartao_credito", "investimento"]

export default function ContaDrawer({ aberto, fechar, conta, saldoAtual }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoConta>(conta?.tipo ?? "banco")

  if (!aberto) return null
  const editando = !!conta

  function refreshUI() {
    router.refresh()
    setTimeout(() => window.location.reload(), 250)
  }

  async function onSubmit(fd: FormData) {
    setErro(null)
    fd.set("tipo", tipo)
    if (editando) fd.set("id", conta!.id)
    startTransition(async () => {
      const r = await salvarContaAction(fd)
      if (!r.ok) { setErro(r.erro ?? "Erro"); return }
      refreshUI()
      fechar()
    })
  }

  async function onExcluir() {
    if (!conta) return
    if (!confirm(`Excluir conta "${conta.nome}"?`)) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirContaAction(conta.id)
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
          width: "min(440px, 100vw)",
          background: "var(--background)",
          borderLeft: "1px solid var(--border)",
          overflowY: "auto",
          padding: "32px 28px",
          animation: "painel-slide-left 0.22s ease-out",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22 }}>{editando ? "Editar conta" : "Nova conta"}</h2>
          <button type="button" onClick={fechar} aria-label="Fechar" style={fecharBtn}>✕</button>
        </div>

        {editando && saldoAtual !== undefined && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 20,
              padding: "16px 18px",
              background: "rgba(201,149,58,0.06)",
              border: "0.5px solid rgba(201,149,58,0.25)",
              borderRadius: 10,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  fontWeight: 600,
                }}
              >
                Saldo inicial
              </p>
              <p
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--text-2)",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 4,
                }}
              >
                {formatBRL(Number(conta!.saldo_inicial))}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  fontWeight: 600,
                }}
              >
                Saldo atual
              </p>
              <p
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: saldoAtual >= 0 ? "var(--text-1)" : "#ef4444",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 4,
                }}
              >
                {formatBRL(saldoAtual)}
              </p>
            </div>
          </div>
        )}

        <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Campo label="Nome" obrigatorio>
            <input
              type="text" name="nome" required maxLength={80}
              defaultValue={conta?.nome ?? ""}
              className="glass-input" style={{ width: "100%" }}
            />
          </Campo>

          <div>
            <Label>Tipo</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {TIPOS_CONTA.map((t) => (
                <button
                  key={t} type="button" onClick={() => setTipo(t)}
                  style={{
                    padding: "8px 14px", borderRadius: 2,
                    border: tipo === t ? "1px solid var(--foreground)" : "1px solid var(--border)",
                    background: tipo === t ? "var(--surface-2)" : "transparent",
                    color: "var(--foreground)", fontWeight: 500, fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {tipoContaRotulo(t)}
                </button>
              ))}
            </div>
          </div>

          <Campo label="Saldo inicial (R$)">
            <input
              type="text" name="saldo_inicial" inputMode="decimal"
              placeholder="Ex: 5.000,00"
              defaultValue={conta ? String(conta.saldo_inicial).replace(".", ",") : ""}
              className="glass-input" style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Data do saldo inicial">
            <input
              type="date" name="data_saldo_inicial"
              defaultValue={conta?.data_saldo_inicial ?? new Date().toISOString().slice(0, 10)}
              className="glass-input" style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Ordem">
            <input
              type="number" name="ordem" min={0} max={9999}
              defaultValue={conta?.ordem ?? 0}
              className="glass-input" style={{ width: 100 }}
            />
          </Campo>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" name="ativa" defaultChecked={conta?.ativa ?? true} />
            Conta ativa
          </label>

          {erro && <div style={erroBox}>{erro}</div>}

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
