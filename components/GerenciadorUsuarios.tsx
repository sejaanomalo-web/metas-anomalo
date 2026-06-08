"use client"

import { useState, useTransition } from "react"
import {
  alternarAtivoUsuarioAction,
  atualizarUsuarioAction,
  criarUsuarioAction,
  excluirUsuarioAction,
  redefinirSenhaAction,
  type UsuarioRow,
} from "@/lib/usuarios-actions"
import type { ChavePermissao, PapelUsuario, Permissoes } from "@/lib/auth"

const CHAVES: { chave: ChavePermissao; rotulo: string; descricao: string }[] = [
  {
    chave: "dashboard_principal",
    rotulo: "Dashboard",
    descricao: "/dashboard (visão consolidada do Hub)",
  },
  {
    chave: "dashboard_empresas",
    rotulo: "Empresas",
    descricao: "/dashboard/empresas (listagem completa)",
  },
  {
    chave: "dashboard_empresa_detalhe",
    rotulo: "Empresa (detalhe)",
    descricao: "/dashboard/[empresa] (página individual)",
  },
  {
    chave: "dashboard_trafego",
    rotulo: "Tráfego pago",
    descricao: "/dashboard/trafego + /dashboard/[empresa]/trafego",
  },
  {
    chave: "dashboard_comercial",
    rotulo: "Comercial",
    descricao: "/dashboard/comercial (funil + relatórios do comercial)",
  },
  {
    chave: "dashboard_financeiro",
    rotulo: "Financeiro",
    descricao: "/dashboard/financeiro (caixa, lançamentos, recorrentes)",
  },
  {
    chave: "formularios",
    rotulo: "Formulários",
    descricao: "/dashboard/formularios (acesso à aba)",
  },
  {
    chave: "formulario_comercial",
    rotulo: "Form · Comercial",
    descricao: "Seção Comercial do formulário (relatório diário)",
  },
  {
    chave: "formulario_trafego",
    rotulo: "Form · Tráfego",
    descricao: "Seção Tráfego Pago do formulário (dados reais)",
  },
  {
    chave: "configuracoes",
    rotulo: "Configurações",
    descricao: "/dashboard/configuracoes",
  },
  {
    chave: "gerenciar_usuarios",
    rotulo: "Gerenciar usuários",
    descricao: "Criar / editar / desativar usuários",
  },
  {
    chave: "ver_notificacoes",
    rotulo: "Notificações",
    descricao: "Sino flutuante (push + in-app)",
  },
]

export default function GerenciadorUsuarios({
  usuariosIniciais,
  meuUsuarioId,
}: {
  usuariosIniciais: UsuarioRow[]
  meuUsuarioId: string
}) {
  const [usuarios, setUsuarios] = useState(usuariosIniciais)
  const [formAberto, setFormAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  function fecharForm() {
    setFormAberto(false)
    setEditandoId(null)
  }

  function atualizarLista(u: UsuarioRow) {
    setUsuarios((atual) =>
      atual.some((x) => x.id === u.id)
        ? atual.map((x) => (x.id === u.id ? u : x))
        : [...atual, u]
    )
  }

  function removerDaLista(id: string) {
    setUsuarios((atual) => atual.filter((x) => x.id !== id))
  }

  const usuarioEditando = editandoId
    ? usuarios.find((u) => u.id === editandoId) ?? null
    : null

  return (
    <div className="glass" style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 18,
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
            Usuários do sistema
          </p>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-1)",
              marginTop: 4,
            }}
          >
            {usuarios.length}{" "}
            {usuarios.length === 1 ? "usuário cadastrado" : "usuários cadastrados"}
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
            Novo usuário
          </button>
        )}
      </div>

      {formAberto && (
        <FormUsuario
          usuarioEditando={usuarioEditando}
          onCancelar={fecharForm}
          onSucesso={(u) => {
            if (u) atualizarLista(u)
            fecharForm()
          }}
        />
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {usuarios.map((u) => (
          <li
            key={u.id}
            style={{
              padding: "14px 0",
              borderBottom: "0.5px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              opacity: u.ativo ? 1 : 0.5,
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
                {u.nome}
                {u.id === meuUsuarioId && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      letterSpacing: "1px",
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    Você
                  </span>
                )}
              </p>
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>{u.email}</p>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--text-4)",
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  marginTop: 4,
                }}
              >
                {rotuloPapel(u.papel)}
                {!u.ativo && " · inativo"}
              </p>
            </div>
            <AcoesLinha
              usuario={u}
              ehMeuPerfil={u.id === meuUsuarioId}
              onEditar={() => {
                setEditandoId(u.id)
                setFormAberto(true)
              }}
              onAtualizar={atualizarLista}
              onExcluir={() => removerDaLista(u.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function rotuloPapel(papel: PapelUsuario): string {
  if (papel === "admin") return "Admin"
  if (papel === "gestor_trafego") return "Gestor de tráfego"
  if (papel === "comercial") return "Comercial"
  return "Personalizado"
}

function AcoesLinha({
  usuario,
  ehMeuPerfil,
  onEditar,
  onAtualizar,
  onExcluir,
}: {
  usuario: UsuarioRow
  ehMeuPerfil: boolean
  onEditar: () => void
  onAtualizar: (u: UsuarioRow) => void
  onExcluir: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [novaSenha, setNovaSenha] = useState<string | null>(null)
  const [modoExcluir, setModoExcluir] = useState(false)
  const [confirmacao, setConfirmacao] = useState("")
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)

  function alternarAtivo() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", usuario.id)
      fd.set("ativo", String(!usuario.ativo))
      const r = await alternarAtivoUsuarioAction(fd)
      if (r.ok) onAtualizar({ ...usuario, ativo: !usuario.ativo })
      else alert(r.erro)
    })
  }

  function resetSenha() {
    if (!confirm(`Redefinir senha de ${usuario.email}?`)) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", usuario.id)
      const r = await redefinirSenhaAction(fd)
      if (r.ok && r.senha_temporaria) setNovaSenha(r.senha_temporaria)
      else alert(r.erro ?? "Erro ao redefinir senha")
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
      fd.set("id", usuario.id)
      fd.set("confirmacao", confirmacao)
      const r = await excluirUsuarioAction(fd)
      if (r.ok) {
        onExcluir()
      } else {
        setErroExcluir(r.erro ?? "Erro ao excluir.")
      }
    })
  }

  function cancelarExclusao() {
    setModoExcluir(false)
    setConfirmacao("")
    setErroExcluir(null)
  }

  // Modo confirmação: ocupa a linha de ações inteira até o usuário
  // confirmar ou cancelar. Defende contra clique acidental.
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
              cursor: confirmacao === "Excluir" && !pending ? "pointer" : "not-allowed",
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
          <p
            style={{
              fontSize: 11,
              color: "#e24b4a",
              margin: 0,
            }}
          >
            {erroExcluir}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}
    >
      {novaSenha && (
        <span
          style={{
            fontSize: 11,
            color: "#4caf50",
            fontFamily: "ui-monospace, Menlo, monospace",
            background: "rgba(76,175,80,0.10)",
            padding: "4px 8px",
            borderRadius: 6,
          }}
        >
          {novaSenha}
        </span>
      )}
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
        onClick={resetSenha}
        disabled={pending}
        className="no-ds"
        style={botaoEstilo("ghost")}
      >
        Reset senha
      </button>
      {!ehMeuPerfil && (
        <button
          type="button"
          onClick={alternarAtivo}
          disabled={pending}
          className="no-ds"
          style={botaoEstilo(usuario.ativo ? "danger" : "success")}
        >
          {usuario.ativo ? "Desativar" : "Reativar"}
        </button>
      )}
      {!ehMeuPerfil && (
        <button
          type="button"
          onClick={() => setModoExcluir(true)}
          disabled={pending}
          className="no-ds"
          style={botaoEstilo("danger")}
          title="Exclusão definitiva (apaga a linha; notificações e push subs vão junto)"
        >
          Excluir
        </button>
      )}
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
    return {
      ...base,
      color: "#e24b4a",
      borderColor: "rgba(226,75,74,0.35)",
    }
  }
  if (variante === "success") {
    return {
      ...base,
      color: "#4caf50",
      borderColor: "rgba(76,175,80,0.35)",
    }
  }
  return base
}

function FormUsuario({
  usuarioEditando,
  onCancelar,
  onSucesso,
}: {
  usuarioEditando: UsuarioRow | null
  onCancelar: () => void
  onSucesso: (u: UsuarioRow | null) => void
}) {
  const editando = usuarioEditando !== null
  const [papel, setPapel] = useState<PapelUsuario>(
    usuarioEditando?.papel ?? "gestor_trafego"
  )
  const [permissoes, setPermissoes] = useState<Permissoes>(
    usuarioEditando?.permissoes ?? PRESET_GESTOR
  )
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [senhaTemp, setSenhaTemp] = useState<string | null>(null)

  function trocarPapel(novo: PapelUsuario) {
    setPapel(novo)
    // Aplica preset se trocar pra um papel não-custom
    if (novo === "admin") setPermissoes(PRESET_ADMIN)
    else if (novo === "gestor_trafego") setPermissoes(PRESET_GESTOR)
    else if (novo === "comercial") setPermissoes(PRESET_COMERCIAL)
    // custom: mantém o estado atual (admin pode customizar a partir do
    // último preset visto)
  }

  function toggle(chave: ChavePermissao) {
    setPermissoes((p) => ({ ...p, [chave]: !p[chave] }))
    setPapel("custom") // Marcar/desmarcar checkbox vira custom
  }

  async function onSubmit(formData: FormData) {
    setErro(null)
    setSenhaTemp(null)
    // Inject permissões atuais no FormData como perm_<chave>=on/off
    for (const c of CHAVES) {
      if (permissoes[c.chave]) formData.set(`perm_${c.chave}`, "on")
      else formData.delete(`perm_${c.chave}`)
    }
    formData.set("papel", papel)
    const r = editando
      ? await atualizarUsuarioAction(formData)
      : await criarUsuarioAction(formData)
    if (!r.ok) {
      setErro(r.erro ?? "Erro desconhecido")
      return
    }
    if (r.senha_temporaria) {
      setSenhaTemp(r.senha_temporaria)
      // Espera 8s mostrando a senha temp antes de fechar
      setTimeout(() => onSucesso(null), 8000)
    } else {
      onSucesso(null)
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
      {editando && <input type="hidden" name="id" value={usuarioEditando.id} />}
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
        {editando ? `Editar ${usuarioEditando.nome}` : "Novo usuário"}
      </p>

      <Campo label="E-mail">
        <input
          type="email"
          name="email"
          defaultValue={usuarioEditando?.email}
          disabled={editando}
          required
          autoComplete="off"
          className="glass-input"
          style={inputEstilo}
          placeholder="usuario@exemplo.com"
        />
      </Campo>

      <Campo label="Nome">
        <input
          type="text"
          name="nome"
          defaultValue={usuarioEditando?.nome}
          required
          className="glass-input"
          style={inputEstilo}
        />
      </Campo>

      {!editando && (
        <Campo label="Senha (deixe vazio pra gerar temporária)">
          <input
            type="text"
            name="senha"
            minLength={8}
            autoComplete="new-password"
            className="glass-input"
            style={inputEstilo}
            placeholder="mín. 8 caracteres"
          />
        </Campo>
      )}

      <Campo label="Papel">
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {(
            ["admin", "gestor_trafego", "comercial", "custom"] as PapelUsuario[]
          ).map(
            (p) => (
              <button
                key={p}
                type="button"
                onClick={() => trocarPapel(p)}
                className="no-ds"
                style={{
                  padding: "8px 14px",
                  fontSize: 11,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  borderRadius: 8,
                  background:
                    papel === p
                      ? "rgba(201,149,58,0.20)"
                      : "transparent",
                  border:
                    papel === p
                      ? "1px solid rgba(201,149,58,0.5)"
                      : "0.5px solid rgba(255,255,255,0.15)",
                  color: papel === p ? "var(--accent)" : "var(--text-3)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {p === "admin"
                  ? "Admin"
                  : p === "gestor_trafego"
                  ? "Gestor de tráfego"
                  : p === "comercial"
                  ? "Comercial"
                  : "Personalizado"}
              </button>
            )
          )}
        </div>
      </Campo>

      <Campo label="Permissões (interfaces acessíveis)">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 8,
          }}
        >
          {CHAVES.map(({ chave, rotulo, descricao }) => (
            <label
              key={chave}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 10px",
                background:
                  permissoes[chave]
                    ? "rgba(201,149,58,0.06)"
                    : "transparent",
                borderRadius: 8,
                cursor: papel === "admin" ? "not-allowed" : "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={permissoes[chave]}
                onChange={() => toggle(chave)}
                disabled={papel === "admin"}
                style={{ marginTop: 3 }}
              />
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-1)",
                  }}
                >
                  {rotulo}
                </p>
                <p
                  style={{
                    fontSize: 10,
                    color: "var(--text-4)",
                    marginTop: 2,
                  }}
                >
                  {descricao}
                </p>
              </div>
            </label>
          ))}
          {papel === "admin" && (
            <p
              style={{
                fontSize: 10,
                color: "var(--text-4)",
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              Admin tem acesso total (bypass de permissões).
            </p>
          )}
        </div>
      </Campo>

      {erro && (
        <p style={{ fontSize: 12, color: "#e24b4a", marginTop: 8 }}>{erro}</p>
      )}
      {senhaTemp && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(76,175,80,0.10)",
            border: "0.5px solid rgba(76,175,80,0.35)",
            borderRadius: 8,
            marginTop: 8,
          }}
        >
          <p style={{ fontSize: 11, color: "#4caf50", fontWeight: 600 }}>
            Usuário criado. Senha temporária:
          </p>
          <p
            style={{
              fontSize: 14,
              fontFamily: "ui-monospace, Menlo, monospace",
              color: "var(--text-1)",
              marginTop: 4,
            }}
          >
            {senhaTemp}
          </p>
          <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: 6 }}>
            Anote agora · não vai aparecer de novo.
          </p>
        </div>
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
            : editando
            ? "Salvar alterações"
            : "Criar usuário"}
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

// Presets locais (cópia do server pra renderização imediata no client).
// Mantidos sincronizados com PRESETS_PERMISSOES em lib/auth.ts.
const PRESET_ADMIN: Permissoes = {
  dashboard_principal: true,
  dashboard_empresas: true,
  dashboard_empresa_detalhe: true,
  dashboard_trafego: true,
  dashboard_comercial: true,
  dashboard_financeiro: true,
  formularios: true,
  formulario_comercial: true,
  formulario_trafego: true,
  configuracoes: true,
  gerenciar_usuarios: true,
  ver_notificacoes: true,
}

const PRESET_GESTOR: Permissoes = {
  dashboard_principal: false,
  dashboard_empresas: false,
  dashboard_empresa_detalhe: false,
  dashboard_trafego: true,
  dashboard_comercial: false,
  dashboard_financeiro: false,
  formularios: true,
  formulario_comercial: false,
  formulario_trafego: true,
  configuracoes: false,
  gerenciar_usuarios: false,
  ver_notificacoes: true,
}

const PRESET_COMERCIAL: Permissoes = {
  dashboard_principal: false,
  dashboard_empresas: false,
  dashboard_empresa_detalhe: false,
  dashboard_trafego: false,
  dashboard_comercial: true,
  dashboard_financeiro: false,
  formularios: true,
  formulario_comercial: true,
  formulario_trafego: false,
  configuracoes: false,
  gerenciar_usuarios: false,
  ver_notificacoes: true,
}
