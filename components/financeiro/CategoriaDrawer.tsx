"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  salvarCategoriaAction,
  excluirCategoriaAction,
} from "@/lib/financeiro-actions"
import type { CategoriaFinanceira, TipoLancamento } from "@/lib/financeiro"

interface Props {
  aberto: boolean
  fechar: () => void
  categoria?: CategoriaFinanceira | null
}

const CORES_PADRAO = [
  "#C9953A", "#16a34a", "#0fcc7d", "#ef4444", "#eab308", "#3974e6", "#9333ea",
]

export default function CategoriaDrawer({ aberto, fechar, categoria }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoLancamento>(categoria?.tipo ?? "despesa")
  const [cor, setCor] = useState(categoria?.cor ?? "#C9953A")

  if (!aberto) return null
  const editando = !!categoria

  function refreshUI() {
    router.refresh()
    setTimeout(() => window.location.reload(), 250)
  }

  async function onSubmit(fd: FormData) {
    setErro(null)
    fd.set("tipo", tipo)
    fd.set("cor", cor)
    if (editando) fd.set("id", categoria!.id)
    startTransition(async () => {
      const r = await salvarCategoriaAction(fd)
      if (!r.ok) { setErro(r.erro ?? "Erro"); return }
      refreshUI()
      fechar()
    })
  }

  async function onExcluir() {
    if (!categoria) return
    if (!confirm(`Excluir categoria "${categoria.nome}"?`)) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirCategoriaAction(categoria.id)
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
          <h2 style={{ fontSize: 22 }}>{editando ? "Editar categoria" : "Nova categoria"}</h2>
          <button type="button" onClick={fechar} aria-label="Fechar" style={fecharBtn}>✕</button>
        </div>

        <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Label>Tipo</Label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["receita", "despesa"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
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
              type="text" name="nome" required maxLength={80}
              defaultValue={categoria?.nome ?? ""}
              className="glass-input" style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Cor">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {CORES_PADRAO.map((c) => (
                <button
                  key={c} type="button" onClick={() => setCor(c)}
                  aria-label={`Cor ${c}`}
                  style={{
                    width: 28, height: 28, borderRadius: 4, background: c,
                    border: cor === c ? "2px solid var(--foreground)" : "1px solid var(--border)",
                    cursor: "pointer", padding: 0,
                  }}
                />
              ))}
              <input
                type="color"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                style={{ width: 28, height: 28, border: "1px solid var(--border)", borderRadius: 4, padding: 0, cursor: "pointer" }}
              />
            </div>
          </Campo>

          <Campo label="Ordem">
            <input
              type="number" name="ordem" min={0} max={9999}
              defaultValue={categoria?.ordem ?? 0}
              className="glass-input" style={{ width: 100 }}
            />
          </Campo>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" name="ativa" defaultChecked={categoria?.ativa ?? true} />
            Categoria ativa
          </label>

          {erro && (
            <div style={erroBox}>{erro}</div>
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
