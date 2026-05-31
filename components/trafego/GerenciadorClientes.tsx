"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  criarClienteAction,
  atualizarClienteAction,
  excluirClienteAction,
  reordenarClientesAction,
} from "@/lib/clientes-actions"
import type { ClienteTrafego } from "@/lib/clientes"

interface TokenOption {
  id: string
  ad_account_id: string
}

/**
 * Botão "Gerenciar clientes" + drawer de CRUD. Renderiza na lista de
 * clientes (admin/gestor). Cada cliente isola campanhas do ad_account
 * da empresa-mãe via campaign_filter (regex).
 */
export default function GerenciadorClientes({
  empresaNome,
  clientes,
  tokens,
}: {
  empresaNome: string
  clientes: ClienteTrafego[]
  tokens: TokenOption[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<ClienteTrafego | null>(null)
  const [ordem, setOrdem] = useState<ClienteTrafego[]>(clientes)
  const [salvandoOrdem, setSalvandoOrdem] = useState(false)

  // Resync com props (revalidate trazendo nova lista do server).
  useEffect(() => {
    setOrdem(clientes)
  }, [clientes])

  function novo() {
    setEditando(null)
    setAberto(true)
  }
  function editar(c: ClienteTrafego) {
    setEditando(c)
    setAberto(true)
  }

  async function mover(idx: number, delta: -1 | 1) {
    const destino = idx + delta
    if (destino < 0 || destino >= ordem.length) return
    const nova = [...ordem]
    ;[nova[idx], nova[destino]] = [nova[destino], nova[idx]]
    setOrdem(nova)
    setSalvandoOrdem(true)
    const fd = new FormData()
    fd.set("empresa_nome", empresaNome)
    fd.set("ids", nova.map((c) => c.id).join(","))
    const r = await reordenarClientesAction(fd)
    setSalvandoOrdem(false)
    if (!r.ok) {
      alert(r.erro ?? "Erro ao reordenar.")
      setOrdem(clientes)
      return
    }
    router.refresh()
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={novo} className="btn-gold-filled">
          + Novo cliente
        </button>
        {clientes.length > 0 && (
          <details style={{ position: "relative" }}>
            <summary
              className="btn-gold-outline"
              style={{ listStyle: "none", cursor: "pointer" }}
            >
              Gerenciar ({clientes.length})
            </summary>
            <div
              className="glass"
              style={{
                position: "absolute",
                right: 0,
                marginTop: 8,
                width: 320,
                maxHeight: 360,
                overflowY: "auto",
                padding: 8,
                zIndex: 20,
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  color: "var(--text-4)",
                  padding: "4px 8px 8px",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                use ▲▼ para reordenar
              </p>
              {ordem.map((c, idx) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    padding: "2px 4px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => mover(idx, -1)}
                    disabled={idx === 0 || salvandoOrdem}
                    className="no-ds"
                    aria-label="Mover para cima"
                    style={{
                      width: 24,
                      height: 24,
                      padding: 0,
                      background: "transparent",
                      border: "none",
                      borderRadius: 4,
                      color: idx === 0 ? "var(--text-4)" : "var(--text-2)",
                      cursor: idx === 0 || salvandoOrdem ? "default" : "pointer",
                      fontSize: 10,
                      opacity: idx === 0 || salvandoOrdem ? 0.4 : 1,
                    }}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(idx, 1)}
                    disabled={idx === ordem.length - 1 || salvandoOrdem}
                    className="no-ds"
                    aria-label="Mover para baixo"
                    style={{
                      width: 24,
                      height: 24,
                      padding: 0,
                      background: "transparent",
                      border: "none",
                      borderRadius: 4,
                      color:
                        idx === ordem.length - 1
                          ? "var(--text-4)"
                          : "var(--text-2)",
                      cursor:
                        idx === ordem.length - 1 || salvandoOrdem
                          ? "default"
                          : "pointer",
                      fontSize: 10,
                      opacity:
                        idx === ordem.length - 1 || salvandoOrdem ? 0.4 : 1,
                    }}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => editar(c)}
                    className="no-ds"
                    style={{
                      flex: 1,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      background: "transparent",
                      border: "none",
                      borderRadius: 8,
                      color: "var(--text-2)",
                      cursor: "pointer",
                      fontSize: 13,
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.nome}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-4)" }}>
                      {c.ativo ? "editar" : "inativo"}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {aberto && (
        <DrawerCliente
          empresaNome={empresaNome}
          tokens={tokens}
          cliente={editando}
          fechar={() => setAberto(false)}
        />
      )}
    </>
  )
}

function DrawerCliente({
  empresaNome,
  tokens,
  cliente,
  fechar,
}: {
  empresaNome: string
  tokens: TokenOption[]
  cliente: ClienteTrafego | null
  fechar: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const editando = !!cliente

  function refreshUI() {
    router.refresh()
    setTimeout(() => window.location.reload(), 250)
  }

  async function onSubmit(fd: FormData) {
    setErro(null)
    fd.set("empresa_nome", empresaNome)
    if (editando) fd.set("id", cliente!.id)
    startTransition(async () => {
      const action = editando ? atualizarClienteAction : criarClienteAction
      const r = await action(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Erro desconhecido.")
        return
      }
      refreshUI()
      fechar()
    })
  }

  async function onExcluir() {
    if (!cliente) return
    if (!confirm(`Excluir cliente "${cliente.nome}"? As métricas históricas dele serão removidas.`)) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirClienteAction(cliente.id)
      if (!r.ok) {
        setErro(r.erro ?? "Erro ao excluir.")
        return
      }
      refreshUI()
      fechar()
    })
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
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
          background: "var(--surface-1)",
          borderLeft: "0.5px solid rgba(255,255,255,0.10)",
          overflowY: "auto",
          padding: "32px 28px",
          animation: "painel-slide-left 0.22s ease-out",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22 }}>{editando ? "Editar cliente" : "Novo cliente"}</h2>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            style={{
              background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              color: "var(--text-2)",
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 20, lineHeight: 1.5 }}>
          O cliente isola campanhas de <strong>{empresaNome}</strong> usando um
          filtro regex sobre o nome da campanha no Meta Ads. O Sentinela
          aplica esse filtro a cada execução (3x/dia).
        </p>

        <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Campo label="Nome do cliente" obrigatorio>
            <input
              type="text"
              name="nome"
              required
              maxLength={120}
              placeholder="Ex: Loja XYZ"
              defaultValue={cliente?.nome ?? ""}
              className="glass-input"
              style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Filtro de campanha (regex)" obrigatorio>
            <input
              type="text"
              name="campaign_filter"
              required
              placeholder="Ex: \\[F2\\]\\[Loja XYZ\\]"
              defaultValue={cliente?.campaign_filter ?? ""}
              className="glass-input"
              style={{ width: "100%", fontFamily: "ui-monospace, monospace" }}
            />
            <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 6, lineHeight: 1.4 }}>
              Regex aplicado ao nome da campanha (case-insensitive). Ex:
              <code style={{ color: "var(--accent)" }}> \[F2\]\[Loja XYZ\]</code> casa campanhas
              que começam com [F2][Loja XYZ].
            </p>
          </Campo>

          <Campo label="Conta Meta (herda ad_account + token)">
            <select
              name="token_meta_id"
              defaultValue={cliente?.token_meta_id ?? (tokens[0]?.id ?? "")}
              className="glass-input"
              style={{ width: "100%" }}
            >
              <option value="">· Nenhuma ·</option>
              {tokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.ad_account_id}
                </option>
              ))}
            </select>
            {tokens.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 6 }}>
                Esta empresa não tem token Meta ativo. Cadastre em tokens_meta primeiro.
              </p>
            )}
          </Campo>

          <Campo label="Ordem">
            <input
              type="number"
              name="ordem"
              min={0}
              max={9999}
              defaultValue={cliente?.ordem ?? 0}
              className="glass-input"
              style={{ width: 100 }}
            />
          </Campo>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)" }}>
            <input type="checkbox" name="ativo" defaultChecked={cliente?.ativo ?? true} />
            Cliente ativo (Sentinela coleta as campanhas dele)
          </label>

          {erro && (
            <div
              style={{
                padding: 12,
                background: "var(--danger-bg)",
                border: "1px solid rgba(239,68,68,0.40)",
                borderRadius: 8,
                color: "var(--text-1)",
                fontSize: 13,
              }}
            >
              {erro}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="submit" disabled={pending} className="btn-gold-filled" style={{ flex: 1, opacity: pending ? 0.6 : 1 }}>
              {pending ? "Salvando..." : editando ? "Salvar alterações" : "Criar cliente"}
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
                  border: "1px solid var(--danger)",
                  borderRadius: 8,
                  color: "var(--danger)",
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
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-3)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
        {obrigatorio && <span style={{ color: "var(--danger)", marginLeft: 4 }}>*</span>}
      </p>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}
