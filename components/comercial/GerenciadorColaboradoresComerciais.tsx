"use client"

import { useState, useTransition } from "react"
import {
  alternarAtivoColaboradorComercialAction,
  atualizarColaboradorComercialAction,
  criarColaboradorComercialAction,
  excluirColaboradorComercialAction,
  type ColaboradorComercial,
} from "@/lib/colaboradores-comerciais"

/**
 * Gerência do TIME COMERCIAL (roster desacoplado de login).
 *
 * Cadastra integrantes do comercial que aparecem no seletor "Responsável" do
 * formulário comercial e na aba Time — inclusive vendedores que só preenchem o
 * formulário público, sem conta de acesso ao painel. Usuários de login com
 * acesso comercial também aparecem automaticamente (gerenciados em
 * Configurações › Usuários) e são listados aqui apenas como referência.
 */
export default function GerenciadorColaboradoresComerciais({
  colaboradoresIniciais,
  usuariosComercial,
}: {
  colaboradoresIniciais: ColaboradorComercial[]
  /** Usuários de LOGIN que já entram no time comercial (somente leitura). */
  usuariosComercial: { id: string; nome: string; email: string }[]
}) {
  const [colaboradores, setColaboradores] = useState(colaboradoresIniciais)
  const [formAberto, setFormAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  function fecharForm() {
    setFormAberto(false)
    setEditandoId(null)
  }

  function aplicarLista(parcial: ColaboradorComercial) {
    setColaboradores((atual) => {
      const proximo = atual.some((x) => x.id === parcial.id)
        ? atual.map((x) => (x.id === parcial.id ? parcial : x))
        : [...atual, parcial]
      // Espelha a ordenação do servidor (ativo desc, nome asc) pra o item novo
      // não "pular" pro lugar certo só no próximo reload.
      return [...proximo].sort(
        (a, b) =>
          Number(b.ativo) - Number(a.ativo) ||
          a.nome.localeCompare(b.nome, "pt-BR")
      )
    })
  }

  function removerDaLista(id: string) {
    setColaboradores((atual) => atual.filter((x) => x.id !== id))
  }

  const editando = editandoId
    ? colaboradores.find((c) => c.id === editandoId) ?? null
    : null

  return (
    <div className="glass" style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "1.5px",
              color: "var(--text-3)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Gerenciar time comercial
          </p>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-1)",
              marginTop: 4,
            }}
          >
            {colaboradores.length}{" "}
            {colaboradores.length === 1 ? "integrante" : "integrantes"} no roster
          </h2>
        </div>
        {!formAberto && (
          <button
            type="button"
            onClick={() => {
              setEditandoId(null)
              setFormAberto(true)
            }}
            className="btn-gold-filled uppercase"
          >
            Novo integrante
          </button>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--text-4)", marginBottom: 16, lineHeight: 1.5 }}>
        Quem você cadastrar aqui aparece no seletor <strong>Responsável</strong>{" "}
        do formulário comercial e na aba Time — sem precisar de conta de acesso
        ao painel. Para tirar do seletor preservando o histórico, use Desativar.
      </p>

      {formAberto && (
        <FormColaborador
          editando={editando}
          onCancelar={fecharForm}
          onSucesso={(c) => {
            if (c) aplicarLista(c)
            fecharForm()
          }}
        />
      )}

      {colaboradores.length === 0 && !formAberto ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-4)",
            fontStyle: "italic",
            padding: "8px 0",
          }}
        >
          Nenhum integrante cadastrado no roster. Clique em “Novo integrante”.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {colaboradores.map((c) => (
            <li
              key={c.id}
              style={{
                padding: "14px 0",
                borderBottom: "0.5px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                opacity: c.ativo ? 1 : 0.5,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-1)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {c.nome}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                  {c.email || "Sem e-mail (só formulário)"}
                  {!c.ativo && " · inativo"}
                </p>
              </div>
              <AcoesLinha
                colaborador={c}
                onEditar={() => {
                  setEditandoId(c.id)
                  setFormAberto(true)
                }}
                onAtualizar={aplicarLista}
                onExcluir={() => removerDaLista(c.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {usuariosComercial.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <p
            style={{
              fontSize: 10,
              letterSpacing: "1px",
              color: "var(--text-4)",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Também no time (usuários de login)
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {usuariosComercial.map((u) => (
              <span
                key={u.id}
                title={u.email}
                style={{
                  fontSize: 12,
                  color: "var(--text-3)",
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.04)",
                  border: "0.5px solid rgba(255,255,255,0.10)",
                }}
              >
                {u.nome}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 8 }}>
            Gerenciados em Configurações › Usuários (papel Comercial ou permissão
            “Form · Comercial”).
          </p>
        </div>
      )}
    </div>
  )
}

function AcoesLinha({
  colaborador,
  onEditar,
  onAtualizar,
  onExcluir,
}: {
  colaborador: ColaboradorComercial
  onEditar: () => void
  onAtualizar: (c: ColaboradorComercial) => void
  onExcluir: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [modoExcluir, setModoExcluir] = useState(false)
  const [confirmacao, setConfirmacao] = useState("")
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)

  function alternarAtivo() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", colaborador.id)
      fd.set("ativo", String(!colaborador.ativo))
      const r = await alternarAtivoColaboradorComercialAction(fd)
      if (r.ok) onAtualizar({ ...colaborador, ativo: !colaborador.ativo })
      else alert(r.erro)
    })
  }

  function confirmarExclusao() {
    setErroExcluir(null)
    if (confirmacao !== "Excluir") {
      setErroExcluir('Digite exatamente "Excluir" pra confirmar.')
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", colaborador.id)
      fd.set("confirmacao", confirmacao)
      const r = await excluirColaboradorComercialAction(fd)
      if (r.ok) onExcluir()
      else setErroExcluir(r.erro ?? "Erro ao excluir.")
    })
  }

  function cancelarExclusao() {
    setModoExcluir(false)
    setConfirmacao("")
    setErroExcluir(null)
  }

  if (modoExcluir) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flexShrink: 0,
          minWidth: 280,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            autoFocus
            value={confirmacao}
            onChange={(e) => {
              setConfirmacao(e.target.value)
              setErroExcluir(null)
            }}
            placeholder='Digite "Excluir"'
            disabled={pending}
            className="no-ds"
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 12,
              background: "rgba(226,75,74,0.08)",
              border: "0.5px solid rgba(226,75,74,0.40)",
              borderRadius: 6,
              color: "var(--text-1)",
              fontFamily: "inherit",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarExclusao()
              if (e.key === "Escape") cancelarExclusao()
            }}
          />
          <button
            type="button"
            onClick={confirmarExclusao}
            disabled={pending || confirmacao !== "Excluir"}
            className="no-ds"
            style={{
              ...botaoEstilo("danger"),
              opacity: confirmacao === "Excluir" && !pending ? 1 : 0.5,
              cursor:
                confirmacao === "Excluir" && !pending
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            {pending ? "Excluindo…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={cancelarExclusao}
            disabled={pending}
            className="no-ds"
            style={botaoEstilo("ghost")}
          >
            Cancelar
          </button>
        </div>
        {erroExcluir && (
          <p style={{ fontSize: 11, color: "#e24b4a", margin: 0 }}>
            {erroExcluir}
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
      <button
        type="button"
        onClick={onEditar}
        disabled={pending}
        className="no-ds"
        style={botaoEstilo("ghost")}
      >
        Editar
      </button>
      <button
        type="button"
        onClick={alternarAtivo}
        disabled={pending}
        className="no-ds"
        style={botaoEstilo(colaborador.ativo ? "danger" : "success")}
      >
        {colaborador.ativo ? "Desativar" : "Reativar"}
      </button>
      <button
        type="button"
        onClick={() => setModoExcluir(true)}
        disabled={pending}
        className="no-ds"
        style={botaoEstilo("danger")}
        title="Exclusão definitiva (o histórico de relatórios é preservado)"
      >
        Excluir
      </button>
    </div>
  )
}

function botaoEstilo(
  variante: "ghost" | "danger" | "success"
): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 10,
    letterSpacing: "0.8px",
    textTransform: "uppercase",
    borderRadius: 6,
    background: "transparent",
    border: "0.5px solid rgba(255,255,255,0.15)",
    color: "var(--text-3)",
    cursor: "pointer",
    fontWeight: 500,
  }
  if (variante === "danger") {
    return { ...base, color: "#e24b4a", borderColor: "rgba(226,75,74,0.35)" }
  }
  if (variante === "success") {
    return { ...base, color: "#4caf50", borderColor: "rgba(76,175,80,0.35)" }
  }
  return base
}

function FormColaborador({
  editando,
  onCancelar,
  onSucesso,
}: {
  editando: ColaboradorComercial | null
  onCancelar: () => void
  onSucesso: (c: ColaboradorComercial | null) => void
}) {
  const ehEdicao = editando !== null
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    setErro(null)
    const r = ehEdicao
      ? await atualizarColaboradorComercialAction(formData)
      : await criarColaboradorComercialAction(formData)
    if (!r.ok) {
      setErro(r.erro ?? "Erro desconhecido")
      return
    }
    // Atualização imediata da lista no client (o server já revalidou as
    // superfícies que consomem o roster). Na criação, usamos a linha devolvida
    // pela action (com o id gerado) para inserir sem recarregar.
    if (ehEdicao && editando) {
      onSucesso({
        ...editando,
        nome: String(formData.get("nome") ?? "").trim(),
        email: (String(formData.get("email") ?? "").trim() || null) as
          | string
          | null,
      })
    } else {
      onSucesso(r.colaborador ?? null)
    }
  }

  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd))}
      style={{
        padding: 18,
        marginBottom: 18,
        background: "rgba(255,255,255,0.02)",
        border: "0.5px solid rgba(201,149,58,0.20)",
        borderRadius: 10,
      }}
      className="space-y-3"
    >
      {ehEdicao && <input type="hidden" name="id" value={editando.id} />}
      <p
        style={{
          fontSize: 11,
          letterSpacing: "1.5px",
          color: "var(--accent)",
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {ehEdicao ? `Editar ${editando.nome}` : "Novo integrante do comercial"}
      </p>

      <Campo label="Nome">
        <input
          type="text"
          name="nome"
          defaultValue={editando?.nome}
          required
          maxLength={80}
          autoFocus
          className="glass-input"
          style={inputEstilo}
          placeholder="Nome do vendedor / SDR"
        />
      </Campo>

      <Campo label="E-mail (opcional)">
        <input
          type="email"
          name="email"
          defaultValue={editando?.email ?? ""}
          maxLength={120}
          autoComplete="off"
          className="glass-input"
          style={inputEstilo}
          placeholder="vendedor@exemplo.com (opcional)"
        />
      </Campo>

      {erro && (
        <p style={{ fontSize: 12, color: "#e24b4a", marginTop: 8 }}>{erro}</p>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginTop: 14,
          flexWrap: "wrap",
        }}
      >
        <button
          type="submit"
          disabled={pending}
          className="btn-gold-filled uppercase"
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          {pending
            ? "Salvando…"
            : ehEdicao
            ? "Salvar alterações"
            : "Adicionar ao time"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={pending}
          className="no-ds"
          style={botaoEstilo("ghost")}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

const inputEstilo: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 400,
}

function Campo({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span
        style={{
          fontSize: 10,
          letterSpacing: "1.5px",
          color: "rgba(255,255,255,0.45)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}
