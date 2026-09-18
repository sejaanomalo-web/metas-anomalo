"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { definirMeuNivelAcessoAction } from "@/lib/usuarios-actions"
import type { Permissoes, VisaoSimplificada } from "@/lib/auth"
import {
  CHAVES_UI,
  PRESET_ADMIN,
  PRESET_COMERCIAL,
  PRESET_CUSTOM,
  PRESET_GESTOR,
} from "@/lib/permissoes-ui"

type Nivel = "completo" | VisaoSimplificada

const NIVEIS: { nivel: Nivel; rotulo: string; descricao: string }[] = [
  {
    nivel: "completo",
    rotulo: "Acesso completo",
    descricao: "Tudo do sistema — é o padrão do admin.",
  },
  {
    nivel: "gestor_trafego",
    rotulo: "Gestor de tráfego",
    descricao: "Tráfego, leads e o formulário de tráfego.",
  },
  {
    nivel: "comercial",
    rotulo: "Comercial",
    descricao: "Funil comercial, CRM e o formulário comercial.",
  },
  {
    nivel: "custom",
    rotulo: "Escolher as interfaces",
    descricao: "Marque uma a uma o que quer continuar vendo.",
  },
]

function presetDoNivel(nivel: Nivel): Permissoes {
  if (nivel === "completo") return PRESET_ADMIN
  if (nivel === "gestor_trafego") return PRESET_GESTOR
  if (nivel === "comercial") return PRESET_COMERCIAL
  return PRESET_CUSTOM
}

/**
 * "Meu nível de acesso" — o admin enxuga a PRÓPRIA visão do sistema.
 *
 * Só aparece pra quem é admin de verdade (papelReal), e é o único caminho de
 * volta: por isso o card fica sempre visível em Configurações, mesmo quando a
 * visão escolhida esconde todo o resto da página. O servidor garante o par:
 * o gate da action olha papelReal e as permissões efetivas mantêm
 * 'configuracoes' ligada à força (lib/auth.ts › permissoesDaVisao).
 *
 * Não é rebaixamento de cargo: o papel no banco continua 'admin'. Some
 * interface, não a pessoa — o time comercial e as notificações por papel
 * seguem enxergando o admin como admin.
 */
export default function MeuNivelAcesso({
  visaoAtual,
  permissoesAtuais,
}: {
  visaoAtual: VisaoSimplificada | null
  permissoesAtuais: Permissoes
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [nivel, setNivel] = useState<Nivel>(visaoAtual ?? "completo")
  const [permissoes, setPermissoes] = useState<Permissoes>(
    visaoAtual === "custom" ? permissoesAtuais : PRESET_CUSTOM
  )
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const ehCustom = nivel === "custom"
  const previa = ehCustom ? permissoes : presetDoNivel(nivel)
  const simplificado = visaoAtual !== null
  const rotuloAtual =
    NIVEIS.find((n) => n.nivel === (visaoAtual ?? "completo"))?.rotulo ??
    "Acesso completo"

  function trocarNivel(novo: Nivel) {
    setNivel(novo)
    setErro(null)
    // Vindo de um preset, o "Escolher as interfaces" começa do que estava
    // marcado — dá pra partir de Comercial e só acrescentar Financeiro.
    if (novo === "custom" && !ehCustom) setPermissoes(presetDoNivel(nivel))
  }

  function toggle(chave: keyof Permissoes) {
    setPermissoes((p) => ({ ...p, [chave]: !p[chave] }))
    setNivel("custom")
  }

  function salvar(alvo: Nivel) {
    setErro(null)
    const fd = new FormData()
    fd.set("nivel", alvo)
    if (alvo === "custom") {
      for (const { chave } of CHAVES_UI) {
        if (permissoes[chave]) fd.set(`perm_${chave}`, "on")
      }
    }
    startTransition(async () => {
      const r = await definirMeuNivelAcessoAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Erro desconhecido")
        return
      }
      // O rail e as páginas são Server Components — precisa refazer a árvore
      // pro menu encolher (ou voltar) na hora.
      router.refresh()
    })
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
            Meu nível de acesso
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
            {rotuloAtual}
            {simplificado && (
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
                visão simplificada
              </span>
            )}
          </span>
        </span>
      </button>

      {simplificado && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "rgba(201,149,58,0.08)",
            border: "0.5px solid rgba(201,149,58,0.30)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <p style={{ fontSize: 12, color: "var(--text-2)" }}>
            Você é admin, mas está vendo o sistema como{" "}
            <strong>{rotuloAtual}</strong>. Nada foi perdido — é só o que
            aparece na tela.
          </p>
          <button
            type="button"
            onClick={() => {
              setNivel("completo")
              salvar("completo")
            }}
            disabled={pending}
            className="btn-gold-filled uppercase"
            style={{ opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Voltando…" : "Voltar ao acesso completo"}
          </button>
        </div>
      )}

      {aberto && (
        <div style={{ marginTop: 18 }} className="space-y-3">
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
            Escolha quanto do sistema você quer enxergar. Isso vale só pra
            você: seu papel continua <strong>Admin</strong>, ninguém mais é
            afetado e este card fica sempre aqui pra você voltar ao acesso
            completo quando quiser.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 12,
            }}
          >
            {NIVEIS.map(({ nivel: n, rotulo, descricao }) => (
              <button
                key={n}
                type="button"
                onClick={() => trocarNivel(n)}
                className="no-ds"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 10,
                  background:
                    nivel === n ? "rgba(201,149,58,0.12)" : "transparent",
                  border:
                    nivel === n
                      ? "1px solid rgba(201,149,58,0.5)"
                      : "0.5px solid rgba(255,255,255,0.12)",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: nivel === n ? "var(--accent)" : "var(--text-1)",
                  }}
                >
                  {rotulo}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--text-4)",
                    marginTop: 3,
                  }}
                >
                  {descricao}
                </span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <p
              style={{
                fontSize: 10,
                letterSpacing: "1.5px",
                color: "rgba(255,255,255,0.45)",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              {ehCustom ? "Interfaces que você quer ver" : "O que você vai ver"}
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginTop: 8,
              }}
            >
              {CHAVES_UI.map(({ chave, rotulo, descricao }) => {
                // Configurações nunca some: é por onde se volta ao acesso
                // completo (o servidor liga essa chave de qualquer jeito).
                const travada = chave === "configuracoes"
                const marcada = travada || previa[chave]
                return (
                  <label
                    key={chave}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "8px 10px",
                      background: marcada
                        ? "rgba(201,149,58,0.06)"
                        : "transparent",
                      borderRadius: 8,
                      cursor: ehCustom && !travada ? "pointer" : "default",
                      opacity: marcada ? 1 : 0.55,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => toggle(chave)}
                      disabled={!ehCustom || travada}
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
                        {travada && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 9,
                              letterSpacing: "1px",
                              color: "var(--text-4)",
                              textTransform: "uppercase",
                            }}
                          >
                            sempre visível
                          </span>
                        )}
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
                )
              })}
            </div>
          </div>

          {erro && (
            <p style={{ fontSize: 12, color: "#e24b4a", marginTop: 8 }}>
              {erro}
            </p>
          )}

          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={() => salvar(nivel)}
              disabled={pending}
              className="btn-gold-filled uppercase"
              style={{ opacity: pending ? 0.6 : 1 }}
            >
              {pending ? "Aplicando…" : "Aplicar nível de acesso"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
