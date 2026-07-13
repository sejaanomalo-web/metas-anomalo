"use client"

import { useState, useTransition } from "react"
import {
  atualizarPreferenciasNotificacaoAction,
  type PreferenciasNotificacao,
} from "@/lib/preferencias-notificacao"

type Tipo = keyof PreferenciasNotificacao

const ITENS: { chave: Tipo; rotulo: string; descricao: string }[] = [
  {
    chave: "dados_comercial",
    rotulo: "Formulário comercial enviado",
    descricao: "Quando alguém envia o relatório comercial de uma empresa",
  },
  {
    chave: "dados_trafego",
    rotulo: "Formulário de tráfego enviado",
    descricao: "Quando enviam reuniões/contratos/faturamento de tráfego",
  },
  {
    chave: "meta_batida",
    rotulo: "Meta batida",
    descricao: "Quando uma empresa atinge a meta de faturamento",
  },
  {
    chave: "dados_sentinela",
    rotulo: "Sentinela atualizou campanhas",
    descricao: "Quando o agente grava dados novos de campanha",
  },
  {
    chave: "nova_venda",
    rotulo: "Nova venda",
    descricao: "Quando um contrato é fechado (evento positivo)",
  },
  {
    chave: "lembrete",
    rotulo: "Lembretes",
    descricao: "Lembretes diários para preencher os dados",
  },
  {
    chave: "crm_lembrete",
    rotulo: "Lembretes de compromissos (CRM)",
    descricao:
      "Na manhã do dia de cada compromisso do calendário do CRM (ex: “Reunião com o David às 9:00”)",
  },
]

/**
 * Preferências de notificação por usuário (Configurações). Liga/desliga
 * cada tipo. Salva via atualizarPreferenciasNotificacaoAction; o fan-out
 * em criarNotificacao respeita esses toggles (ausência = ligado).
 */
export default function PreferenciasNotificacoes({
  inicial,
  chavesPermitidas,
}: {
  inicial: PreferenciasNotificacao
  chavesPermitidas?: Tipo[]
}) {
  const [estado, setEstado] = useState<PreferenciasNotificacao>(inicial)
  const [pending, startTransition] = useTransition()
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)

  function toggle(chave: Tipo) {
    setEstado((s) => ({ ...s, [chave]: !s[chave] }))
    setSalvo(false)
  }

  async function onSubmit(formData: FormData) {
    setErro(null)
    const r = await atualizarPreferenciasNotificacaoAction(formData)
    if (r.ok) {
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2200)
    } else {
      setErro(r.erro ?? "Erro ao salvar.")
    }
  }

  // Escopo por papel: só renderiza os toggles permitidos. Os ocultos têm
  // o valor atual preservado via hidden input (senão o submit zeraria).
  const itensVisiveis = chavesPermitidas
    ? ITENS.filter((i) => chavesPermitidas.includes(i.chave))
    : ITENS
  const chavesOcultas = ITENS.filter((i) => !itensVisiveis.includes(i)).map(
    (i) => i.chave
  )

  const ligados = itensVisiveis.filter((i) => estado[i.chave]).length

  return (
    <section className="glass" style={{ padding: "20px 26px" }}>
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
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 11,
              letterSpacing: "1.5px",
              color: "var(--text-3)",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Preferências de notificação
          </span>
          <span style={{ fontSize: 12, color: "var(--text-4)" }}>
            {aberto
              ? "Escolha o que você quer ser avisado (sino + push)."
              : `${ligados} de ${itensVisiveis.length} tipos ativos · toque pra ajustar`}
          </span>
        </span>
      </button>

      {!aberto ? null : (
      <form
        action={(fd) => startTransition(() => onSubmit(fd))}
        style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}
      >
        {chavesOcultas.map((c) =>
          estado[c] ? (
            <input key={c} type="hidden" name={`pref_${c}`} value="on" />
          ) : null
        )}
        {itensVisiveis.map(({ chave, rotulo, descricao }) => (
          <label
            key={chave}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "8px 10px",
              background: estado[chave]
                ? "rgba(201,149,58,0.06)"
                : "transparent",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              name={`pref_${chave}`}
              checked={estado[chave]}
              onChange={() => toggle(chave)}
              style={{ marginTop: 2 }}
            />
            <span>
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-1)",
                }}
              >
                {rotulo}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--text-4)",
                }}
              >
                {descricao}
              </span>
            </span>
          </label>
        ))}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          <button
            type="submit"
            disabled={pending}
            className="btn-gold-filled uppercase"
            style={{ opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Salvando…" : "Salvar preferências"}
          </button>
          {salvo && (
            <span style={{ fontSize: 12, color: "#4caf50", fontWeight: 500 }}>
              Salvo ✓
            </span>
          )}
          {erro && (
            <span style={{ fontSize: 12, color: "#e24b4a", fontWeight: 500 }}>
              {erro}
            </span>
          )}
        </div>
      </form>
      )}
    </section>
  )
}
