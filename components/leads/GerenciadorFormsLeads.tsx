"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  criarMapeamentoAction,
  atualizarMapeamentoAction,
  excluirMapeamentoAction,
  rotacionarTokenLeadsAction,
} from "@/lib/leads-actions"
import type { MapeamentoForm } from "@/lib/leads"

/**
 * CRUD dos formulários do Meta vinculados a um cliente.
 *
 * Cada linha diz "este form_id do Meta pertence a este cliente" e guarda o
 * Page Access Token daquela página. Sem o mapeamento, o lead ainda é gravado
 * (com cliente_id null, na fila de órfãos) mas não aparece pro cliente.
 *
 * O token NUNCA é enviado do servidor pro browser — a leitura devolve só
 * `tem_token`. O campo de token na edição fica em branco e, se continuar em
 * branco ao salvar, o token atual é preservado (ver atualizarMapeamentoAction).
 */
export default function GerenciadorFormsLeads({
  clienteId,
  clienteNome,
  mapeamentos,
}: {
  clienteId: string
  clienteNome: string
  mapeamentos: MapeamentoForm[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<MapeamentoForm | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  function novo() {
    setEditando(null)
    setErro(null)
    setAberto(true)
  }

  function editar(m: MapeamentoForm) {
    setEditando(m)
    setErro(null)
    setAberto(true)
  }

  async function salvar(fd: FormData) {
    setErro(null)
    const r = editando
      ? await atualizarMapeamentoAction(fd)
      : await criarMapeamentoAction(fd)
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar.")
      return
    }
    setAberto(false)
    setEditando(null)
    startTransition(() => router.refresh())
  }

  async function excluir(m: MapeamentoForm) {
    if (
      !window.confirm(
        `Remover o formulário "${m.rotulo}"?\n\nOs leads já recebidos continuam ` +
          `no painel do cliente. Só param de entrar leads NOVOS deste formulário.`
      )
    ) {
      return
    }
    const fd = new FormData()
    fd.set("id", m.id)
    const r = await excluirMapeamentoAction(fd)
    if (!r.ok) {
      window.alert(r.erro ?? "Não foi possível excluir.")
      return
    }
    startTransition(() => router.refresh())
  }

  async function rotacionar() {
    if (
      !window.confirm(
        `Gerar um NOVO link para ${clienteNome}?\n\nO link atual para de ` +
          `funcionar imediatamente. Use isto se o link tiver vazado.`
      )
    ) {
      return
    }
    const fd = new FormData()
    fd.set("cliente_id", clienteId)
    const r = await rotacionarTokenLeadsAction(fd)
    if (!r.ok) {
      window.alert(r.erro ?? "Não foi possível gerar um novo link.")
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={novo} className="btn-gold-outline">
          + Formulário
        </button>
        <button
          type="button"
          onClick={rotacionar}
          className="btn-gold-outline"
          title="Invalida o link atual e gera um novo"
          disabled={pendente}
        >
          Novo link
        </button>
      </div>

      {/* Lista */}
      {mapeamentos.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 10,
          }}
        >
          {mapeamentos.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                border: "0.5px solid rgba(255,255,255,0.09)",
                opacity: m.ativo ? 1 : 0.5,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-1)",
                    fontWeight: 500,
                  }}
                >
                  {m.rotulo}
                  {!m.ativo && (
                    <span style={{ fontSize: 11, color: "var(--text-4)" }}>
                      {" "}
                      · inativo
                    </span>
                  )}
                </p>
                <p
                  style={{
                    fontSize: 10.5,
                    color: "var(--text-4)",
                    marginTop: 2,
                    fontFamily: "monospace",
                  }}
                >
                  {m.form_id}
                  {!m.tem_token && (
                    <span style={{ color: "#e5a50a" }}> · sem token</span>
                  )}
                </p>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => editar(m)}
                  style={botaoMini}
                  title="Editar"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => excluir(m)}
                  style={botaoMini}
                  title="Remover"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drawer do formulário */}
      {aberto && (
        <div style={overlay} onClick={() => setAberto(false)}>
          <div
            className="glass"
            style={painel}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-1)",
                marginBottom: 4,
              }}
            >
              {editando ? "Editar formulário" : "Novo formulário"}
            </h3>
            <p
              style={{ fontSize: 11.5, color: "var(--text-4)", marginBottom: 16 }}
            >
              {clienteNome}
            </p>

            <form action={salvar}>
              {editando ? (
                <input type="hidden" name="id" value={editando.id} />
              ) : (
                <input type="hidden" name="cliente_id" value={clienteId} />
              )}

              <label style={rotulo}>Nome do formulário</label>
              <input
                name="rotulo"
                defaultValue={editando?.rotulo ?? ""}
                className="glass-input"
                style={input}
                placeholder="Ex.: Cruz Habilitação"
                required
              />

              {!editando && (
                <>
                  <label style={rotulo}>ID do formulário (Meta)</label>
                  <input
                    name="form_id"
                    className="glass-input"
                    style={input}
                    placeholder="1234567890123456"
                    inputMode="numeric"
                    required
                  />
                  <p style={ajuda}>
                    Gerenciador de Anúncios → Formulários instantâneos. Cole só
                    o número.
                  </p>
                </>
              )}

              <label style={rotulo}>ID da página (opcional)</label>
              <input
                name="page_id"
                defaultValue={editando?.page_id ?? ""}
                className="glass-input"
                style={input}
                placeholder="1234567890"
                inputMode="numeric"
              />

              <label style={rotulo}>
                Page Access Token
                {editando && editando.tem_token && " (deixe em branco p/ manter)"}
              </label>
              <input
                name="page_access_token"
                className="glass-input"
                style={input}
                placeholder={
                  editando?.tem_token ? "•••• token salvo ••••" : "EAAG..."
                }
                autoComplete="off"
                type="password"
              />
              <p style={ajuda}>
                Token da PÁGINA com permissão leads_retrieval — não é o token do
                Sentinela.
              </p>

              {editando && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 14,
                    fontSize: 13,
                    color: "var(--text-2)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    name="ativo"
                    defaultChecked={editando.ativo}
                  />
                  Ativo (recebendo leads)
                </label>
              )}

              {erro && (
                <p
                  style={{
                    fontSize: 12.5,
                    color: "#ff6b6b",
                    marginTop: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {erro}
                </p>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <button type="submit" className="btn-gold-filled">
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="btn-gold-outline"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

const botaoMini: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 12,
  borderRadius: 5,
  border: "0.5px solid rgba(255,255,255,0.12)",
  background: "transparent",
  color: "rgba(255,255,255,0.55)",
  cursor: "pointer",
  lineHeight: 1,
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 60,
}

const painel: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  padding: 24,
  maxHeight: "88vh",
  overflowY: "auto",
}

const rotulo: React.CSSProperties = {
  display: "block",
  fontSize: 10.5,
  letterSpacing: "0.6px",
  textTransform: "uppercase",
  color: "var(--text-4)",
  fontWeight: 500,
  marginTop: 14,
  marginBottom: 5,
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13.5,
  borderRadius: 6,
}

const ajuda: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-4)",
  marginTop: 5,
  lineHeight: 1.5,
}
