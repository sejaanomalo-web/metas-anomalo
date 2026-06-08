"use client"

import { useState, useTransition } from "react"
import type { EmpresaMeta } from "@/lib/data"
import { ETAPAS_FUNIL, ROTULO_ETAPA } from "@/lib/comercial-tipos"
import {
  salvarPipelineAction,
  salvarRelatorioComercialAction,
} from "@/lib/relatorios-comerciais"

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
 * Seção COMERCIAL do formulário. Dois blocos:
 *   1. Relatório diário — atividade da pessoa logada no dia (prospecção,
 *      reuniões, propostas/fechamentos). Upsert por (colaborador, data).
 *   2. Pipeline — cadastra/atualiza uma oportunidade do funil (modelo
 *      híbrido: liga a empresa existente OU prospect novo).
 */
export default function FormularioComercial({
  empresas,
}: {
  empresas: EmpresaMeta[]
}) {
  const [data, setData] = useState(hojeBRT())
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [feedbackPipe, setFeedbackPipe] = useState<Feedback>(null)
  const [pending, startTransition] = useTransition()
  const [pendingPipe, startPipe] = useTransition()

  async function onSubmit(formData: FormData) {
    setFeedback(null)
    const r = await salvarRelatorioComercialAction(formData)
    setFeedback(
      r.ok
        ? { tipo: "sucesso", mensagem: "Relatório do dia salvo." }
        : { tipo: "erro", mensagem: r.erro ?? "Erro." }
    )
  }

  async function onSubmitPipe(formData: FormData) {
    setFeedbackPipe(null)
    const r = await salvarPipelineAction(formData)
    setFeedbackPipe(
      r.ok
        ? { tipo: "sucesso", mensagem: "Oportunidade salva." }
        : { tipo: "erro", mensagem: r.erro ?? "Erro." }
    )
  }

  return (
    <div className="space-y-6">
      {/* Bloco 1 — Relatório diário */}
      <div className="glass" style={{ padding: 28 }}>
        <Titulo texto="Relatório diário · comercial" />
        <form
          action={(fd) => startTransition(() => onSubmit(fd))}
          className="space-y-4"
        >
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
              <NumCampo label="Ligações" name="ligacoes" />
              <NumCampo label="Mensagens / e-mails" name="mensagens" />
              <NumCampo label="Conexões novas" name="conexoes_novas" />
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
            rotulo="Salvar relatório do dia"
          />
        </form>
      </div>

      {/* Bloco 2 — Pipeline */}
      <div className="glass" style={{ padding: 28 }}>
        <Titulo texto="Oportunidade · pipeline" />
        <form
          action={(fd) => startPipe(() => onSubmitPipe(fd))}
          className="space-y-4"
        >
          <Campo label="Nome da empresa / prospect">
            <input
              type="text"
              name="nome"
              required
              className="glass-input"
              style={inputEstilo}
              placeholder="Ex.: Loja XPTO"
            />
          </Campo>

          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
            <Campo label="Etapa do funil">
              <select name="etapa" className="glass-input" style={inputEstilo}>
                {ETAPAS_FUNIL.map((e) => (
                  <option key={e} value={e}>
                    {ROTULO_ETAPA[e]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Valor estimado (R$)">
              <input
                type="text"
                name="valor_estimado"
                inputMode="decimal"
                className="glass-input"
                style={inputEstilo}
                placeholder="0,00"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
            <Campo label="Empresa do hub (opcional)">
              <select
                name="empresa_config_slug"
                className="glass-input"
                style={inputEstilo}
              >
                <option value="">— prospect novo —</option>
                {empresas.map((e) => (
                  <option key={e.slug} value={e.slug}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Origem do contato (opcional)">
              <input
                type="text"
                name="origem_contato"
                className="glass-input"
                style={inputEstilo}
                placeholder="inbound / outbound / indicação"
              />
            </Campo>
          </div>

          <Campo label="Observações (opcional)">
            <textarea
              name="observacoes"
              rows={2}
              className="glass-input"
              style={{ ...inputEstilo, resize: "vertical", minHeight: 56 }}
              placeholder="Notas da negociação…"
            />
          </Campo>

          <BotaoLinha
            pending={pendingPipe}
            feedback={feedbackPipe}
            rotulo="Salvar oportunidade"
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

function Titulo({ texto }: { texto: string }) {
  return (
    <p
      style={{
        fontSize: 11,
        letterSpacing: "1.5px",
        color: "var(--text-3)",
        textTransform: "uppercase",
        fontWeight: 500,
        marginBottom: 22,
      }}
    >
      {texto}
    </p>
  )
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
}: {
  pending: boolean
  feedback: Feedback
  rotulo: string
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
        disabled={pending}
        className="btn-gold-filled uppercase"
        style={{ opacity: pending ? 0.6 : 1 }}
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
