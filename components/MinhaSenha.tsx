"use client"

import { useState, useTransition } from "react"
import { definirMinhaSenhaAction } from "@/lib/usuarios-actions"
import CampoSenha from "@/components/inputs/CampoSenha"

/**
 * "Minha senha" — qualquer usuário troca a PRÓPRIA senha em Configurações.
 *
 * Antes isso só existia dentro do Gerenciador de Usuários (botão "Reset
 * senha" na própria linha), que só aparece pra quem tem 'gerenciar_usuarios'.
 * A action (definirMinhaSenhaAction) já não exige permissão — só sessão —,
 * então o card fica visível pra todo mundo.
 */
export default function MinhaSenha() {
  const [aberto, setAberto] = useState(false)
  const [novaSenha, setNovaSenha] = useState("")
  const [confirmacao, setConfirmacao] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, startTransition] = useTransition()

  function salvar() {
    setErro(null)
    setOk(false)
    if (novaSenha.length < 6) {
      setErro("Senha precisa ter pelo menos 6 caracteres.")
      return
    }
    if (novaSenha !== confirmacao) {
      setErro("As duas senhas não coincidem.")
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set("nova_senha", novaSenha)
      const r = await definirMinhaSenhaAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Erro ao salvar.")
        return
      }
      setOk(true)
      setNovaSenha("")
      setConfirmacao("")
    })
  }

  const inputEstilo: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 14,
    background: "rgba(255,255,255,0.04)",
    border: "0.5px solid rgba(255,255,255,0.18)",
    borderRadius: 8,
    color: "var(--text-1)",
    fontFamily: "inherit",
  }

  return (
    <div className="glass" style={{ padding: 24 }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="no-ds"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            fontSize: 12,
            color: "var(--text-3)",
            transform: aberto ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        >
          ▶
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 11,
              letterSpacing: "1.5px",
              color: "var(--text-3)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Minha senha
          </span>
          <span
            style={{
              display: "block",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-1)",
              marginTop: 4,
            }}
          >
            Alterar senha
          </span>
        </span>
      </button>

      {aberto && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            salvar()
          }}
          style={{
            marginTop: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxWidth: 420,
          }}
        >
          <CampoSenha
            name="nova_senha"
            autoComplete="new-password"
            placeholder="Nova senha (mín. 6 caracteres)"
            value={novaSenha}
            onChange={(e) => {
              setNovaSenha(e.target.value)
              setErro(null)
              setOk(false)
            }}
            disabled={pending}
            className="no-ds"
            style={inputEstilo}
          />
          <CampoSenha
            name="confirmacao"
            autoComplete="new-password"
            placeholder="Confirmar nova senha"
            value={confirmacao}
            onChange={(e) => {
              setConfirmacao(e.target.value)
              setErro(null)
              setOk(false)
            }}
            disabled={pending}
            className="no-ds"
            style={inputEstilo}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="submit"
              disabled={pending}
              className="btn-gold-filled uppercase"
            >
              {pending ? "Salvando…" : "Salvar nova senha"}
            </button>
            {ok && (
              <span style={{ fontSize: 13, color: "#4caf50" }}>
                Senha alterada ✓
              </span>
            )}
          </div>
          {erro && (
            <span style={{ fontSize: 12, color: "#e24b4a" }}>{erro}</span>
          )}
        </form>
      )}
    </div>
  )
}
