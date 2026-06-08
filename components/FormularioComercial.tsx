"use client"

import { useState, useTransition } from "react"
import type { EmpresaMeta } from "@/lib/data"
import { salvarRelatorioComercialAction } from "@/lib/relatorios-comerciais"

/** Data atual em BRT (UTC-3 sem DST) no formato YYYY-MM-DD. */
function hojeBRT(): string {
  const agora = new Date()
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  const brt = new Date(utcMs - 3 * 60 * 60_000)
  return brt.toISOString().slice(0, 10)
}

type Feedback =
  | { tipo: "sucesso"; mensagem: string }
  | { tipo: "erro"; mensagem: string }
  | null

/**
 * Formulário COMERCIAL — relatório diário do time. Escolhe EMPRESA +
 * data + métricas do dia (prospecção, reuniões, propostas/fechamentos).
 * Upsert por (empresa, data) — funciona com ou sem login. Reusado em:
 *   • Configurações (admin)  → copiarLinkPublico (mostra "Copiar link")
 *   • /formulario-comercial  → versão pública (sem o botão de copiar)
 */
export default function FormularioComercial({
  empresas,
  copiarLinkPublico,
}: {
  empresas: EmpresaMeta[]
  copiarLinkPublico?: boolean
}) {
  const [empresa, setEmpresa] = useState(empresas[0]?.nome ?? "")
  const [data, setData] = useState(hojeBRT())
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [pending, startTransition] = useTransition()

  async function onSubmit(formData: FormData) {
    setFeedback(null)
    const r = await salvarRelatorioComercialAction(formData)
    setFeedback(
      r.ok
        ? { tipo: "sucesso", mensagem: `${empresa} · relatório do dia salvo.` }
        : { tipo: "erro", mensagem: r.erro ?? "Erro." }
    )
  }

  async function copiar() {
    if (typeof window === "undefined") return
    const url = `${window.location.origin}/formulario-comercial`
    try {
      await navigator.clipboard.writeText(url)
      setFeedback({ tipo: "sucesso", mensagem: "Link público copiado." })
      setTimeout(() => setFeedback(null), 2400)
    } catch {
      setFeedback({
        tipo: "erro",
        mensagem: "Não consegui copiar · copie manualmente: " + url,
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Bloco 1 — Relatório diário */}
      <div className="glass" style={{ padding: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 22,
          }}
        >
          <p
            style={{
              fontSize: 11,
              letterSpacing: "1.5px",
              color: "var(--text-3)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Relatório diário · comercial
          </p>
          {copiarLinkPublico && (
            <button
              type="button"
              onClick={copiar}
              className="hover:text-[#C9953A] hover:border-[#C9953A55] transition no-ds"
              style={{
                padding: "8px 14px",
                fontSize: 11,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.55)",
                border: "0.5px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                background: "transparent",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Copiar link público
            </button>
          )}
        </div>

        <form
          action={(fd) => startTransition(() => onSubmit(fd))}
          className="space-y-4"
        >
          <Campo label="Empresa">
            <select
              name="empresa"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              required
              className="glass-input"
              style={inputEstilo}
            >
              {empresas.map((e) => (
                <option key={e.slug} value={e.nome}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Data">
            <input
              type="date"
              name="data"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
              className="glass-input"
              style={inputEstilo}
            />
          </Campo>

          <Grupo titulo="Prospecção">
            <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12 }}>
              <NumCampo label="Mensagens enviadas" name="mensagens" />
              <NumCampo label="Retorno de mensagens" name="retorno_mensagens" />
              <NumCampo label="Qualificados" name="qualificados" />
            </div>
          </Grupo>

          <Grupo titulo="Reuniões">
            <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12 }}>
              <NumCampo label="Agendadas" name="reunioes_agendadas" />
              <NumCampo label="Realizadas" name="reunioes_realizadas" />
              <NumCampo label="No-shows" name="no_shows" />
            </div>
          </Grupo>

          <Grupo titulo="Propostas e fechamentos">
            <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12 }}>
              <NumCampo label="Propostas enviadas" name="propostas_enviadas" />
              <NumCampo label="Contratos fechados" name="contratos_fechados" />
              <Campo label="Faturamento gerado (R$)">
                <input
                  type="text"
                  name="faturamento_gerado"
                  inputMode="decimal"
                  className="glass-input"
                  style={inputEstilo}
                  placeholder="0,00"
                />
              </Campo>
            </div>
          </Grupo>

          <Campo label="Observações (opcional)">
            <textarea
              name="observacoes"
              rows={3}
              className="glass-input"
              style={{ ...inputEstilo, resize: "vertical", minHeight: 72 }}
              placeholder="Contexto do dia, bloqueios, destaques…"
            />
          </Campo>

          <BotaoLinha
            pending={pending}
            feedback={feedback}
            disabled={!empresa}
            rotulo="Salvar relatório do dia"
          />
        </form>
      </div>
    </div>
  )
}

const inputEstilo: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  padding: "11px 14px",
  fontSize: 14,
  fontWeight: 400,
}

function Grupo({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          letterSpacing: "1px",
          color: "var(--accent, #C9953A)",
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {titulo}
      </p>
      {children}
    </div>
  )
}

function NumCampo({ label, name }: { label: string; name: string }) {
  return (
    <Campo label={label}>
      <input
        type="number"
        name={name}
        min="0"
        inputMode="numeric"
        className="glass-input"
        style={inputEstilo}
        placeholder="0"
      />
    </Campo>
  )
}

function BotaoLinha({
  pending,
  feedback,
  rotulo,
  disabled,
}: {
  pending: boolean
  feedback: Feedback
  rotulo: string
  disabled?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginTop: 18,
        flexWrap: "wrap",
      }}
    >
      <button
        type="submit"
        disabled={pending || disabled}
        className="btn-gold-filled uppercase"
        style={{ opacity: pending || disabled ? 0.6 : 1 }}
      >
        {pending ? "Salvando…" : rotulo}
      </button>
      {feedback && (
        <span
          style={{
            fontSize: 12,
            color: feedback.tipo === "sucesso" ? "#4caf50" : "#e24b4a",
            fontWeight: 500,
          }}
        >
          {feedback.mensagem}
        </span>
      )}
    </div>
  )
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
