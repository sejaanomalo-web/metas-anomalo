"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  criarLancamentoAction,
  atualizarLancamentoAction,
  excluirLancamentoAction,
} from "@/lib/financeiro-actions"
import type {
  CategoriaFinanceira,
  ContaFinanceira,
  LancamentoFinanceiro,
  StatusLancamento,
  TipoLancamento,
} from "@/lib/financeiro"

interface Empresa {
  nome: string
  slug: string
}

interface Props {
  aberto: boolean
  fechar: () => void
  categorias: CategoriaFinanceira[]
  contas: ContaFinanceira[]
  empresas: Empresa[]
  lancamento?: LancamentoFinanceiro | null
}

export default function LancamentoDrawer({
  aberto,
  fechar,
  categorias,
  contas,
  empresas,
  lancamento,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoLancamento>(lancamento?.tipo ?? "despesa")
  const [status, setStatus] = useState<StatusLancamento>(
    lancamento?.status ?? "realizado"
  )

  if (!aberto) return null

  const categoriasFiltradas = categorias.filter((c) => c.tipo === tipo)
  const editando = !!lancamento

  async function onSubmit(fd: FormData) {
    setErro(null)
    fd.set("tipo", tipo)
    fd.set("status", status)
    if (editando) fd.set("id", lancamento!.id)

    startTransition(async () => {
      const action = editando ? atualizarLancamentoAction : criarLancamentoAction
      const r = await action(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Erro desconhecido.")
        return
      }
      router.refresh()
      fechar()
    })
  }

  async function onExcluir() {
    if (!lancamento) return
    if (!confirm(`Excluir lançamento "${lancamento.descricao}"?`)) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirLancamentoAction(lancamento.id)
      if (!r.ok) {
        setErro(r.erro ?? "Erro ao excluir.")
        return
      }
      router.refresh()
      fechar()
    })
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(32, 37, 42, 0.45)",
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
          width: "min(520px, 100vw)",
          background: "var(--background)",
          borderLeft: "1px solid var(--border)",
          overflowY: "auto",
          padding: "32px 28px",
          animation: "painel-slide-left 0.22s ease-out",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22 }}>{editando ? "Editar lançamento" : "Novo lançamento"}</h2>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              color: "var(--foreground)",
            }}
          >
            ✕
          </button>
        </div>

        <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Tipo toggle */}
          <div>
            <Label>Tipo</Label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["receita", "despesa"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 2,
                    border: tipo === t ? "1px solid var(--foreground)" : "1px solid var(--border)",
                    background: tipo === t ? "var(--surface-2)" : "transparent",
                    color: "var(--foreground)",
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Status toggle */}
          <div>
            <Label>Status</Label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["previsto", "realizado", "cancelado"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  style={{
                    flex: 1,
                    padding: "8px 6px",
                    borderRadius: 2,
                    border: status === s ? "1px solid var(--foreground)" : "1px solid var(--border)",
                    background: status === s ? "var(--surface-2)" : "transparent",
                    color: "var(--foreground)",
                    fontWeight: 500,
                    fontSize: 12,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <Campo label="Data de competência" obrigatorio>
            <input
              type="date"
              name="data"
              required
              defaultValue={lancamento?.data ?? new Date().toISOString().slice(0, 10)}
              className="glass-input"
              style={{ width: "100%" }}
            />
          </Campo>

          <Campo
            label={status === "realizado" ? "Data de pagamento (obrigatória)" : "Data de pagamento"}
          >
            <input
              type="date"
              name="data_pagamento"
              defaultValue={lancamento?.data_pagamento ?? ""}
              className="glass-input"
              style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Valor (R$)" obrigatorio>
            <input
              type="text"
              name="valor"
              required
              inputMode="decimal"
              placeholder="Ex: 1.234,56"
              defaultValue={lancamento ? String(lancamento.valor).replace(".", ",") : ""}
              className="glass-input"
              style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Descrição" obrigatorio>
            <input
              type="text"
              name="descricao"
              required
              maxLength={200}
              placeholder={tipo === "receita" ? "Ex: Mensalidade Aton Estofados" : "Ex: Aluguel escritório"}
              defaultValue={lancamento?.descricao ?? ""}
              className="glass-input"
              style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Categoria">
            <select
              name="categoria_id"
              defaultValue={lancamento?.categoria_id ?? ""}
              className="glass-input"
              style={{ width: "100%" }}
            >
              <option value="">— Sem categoria —</option>
              {categoriasFiltradas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Conta">
            <select
              name="conta_id"
              defaultValue={lancamento?.conta_id ?? ""}
              className="glass-input"
              style={{ width: "100%" }}
            >
              <option value="">— Sem conta —</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>

          {tipo === "receita" && empresas.length > 0 && (
            <Campo label="Empresa cliente (opcional)">
              <select
                name="empresa_cliente"
                defaultValue={lancamento?.empresa_cliente ?? ""}
                className="glass-input"
                style={{ width: "100%" }}
              >
                <option value="">— Não vinculada —</option>
                {empresas.map((e) => (
                  <option key={e.slug} value={e.nome}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <Campo label="Observações">
            <textarea
              name="observacoes"
              rows={3}
              maxLength={500}
              defaultValue={lancamento?.observacoes ?? ""}
              className="glass-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </Campo>

          {erro && (
            <div
              style={{
                padding: 12,
                background: "rgba(217, 103, 88, 0.12)",
                border: "1px solid rgba(217, 103, 88, 0.35)",
                borderRadius: 8,
                color: "var(--foreground)",
                fontSize: 13,
              }}
            >
              {erro}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="submit"
              disabled={pending}
              className="btn-gold-filled"
              style={{ flex: 1, opacity: pending ? 0.6 : 1 }}
            >
              {pending ? "Salvando..." : editando ? "Salvar alterações" : "Criar lançamento"}
            </button>
            {editando && (
              <button
                type="button"
                onClick={onExcluir}
                disabled={pending}
                style={{
                  padding: "0 16px",
                  height: 32,
                  background: "transparent",
                  border: "1px solid var(--destructive)",
                  borderRadius: 2,
                  color: "var(--destructive)",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                Excluir
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: "var(--muted-foreground)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </p>
  )
}

function Campo({
  label,
  obrigatorio,
  children,
}: {
  label: string
  obrigatorio?: boolean
  children: React.ReactNode
}) {
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
