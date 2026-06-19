"use client"

import { useState, useTransition } from "react"
import type { EmpresaMeta } from "@/lib/data"
import { salvarRelatorioComercialAction } from "@/lib/relatorios-comerciais"
import CampoInteiro from "@/components/inputs/CampoInteiro"
import CampoMoeda from "@/components/inputs/CampoMoeda"

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
  responsaveis,
  clientesPorEmpresa,
}: {
  empresas: EmpresaMeta[]
  copiarLinkPublico?: boolean
  responsaveis?: { id: string; nome: string }[]
  /** Clientes ativos por empresa (assessoria) — habilita o seletor de
   *  cliente pra lançar o comercial POR CLIENTE (orgânico por cliente). */
  clientesPorEmpresa?: Record<string, { id: string; nome: string }[]>
}) {
  const [empresa, setEmpresa] = useState(empresas[0]?.nome ?? "")
  const [clienteId, setClienteId] = useState("")
  const [data, setData] = useState(hojeBRT())
  const [responsavelId, setResponsavelId] = useState(
    responsaveis?.[0]?.id ?? ""
  )
  // Origem do lead: 'organico' (prospecção fria) ou 'pago' (rótulo "Anúncios").
  const [origem, setOrigem] = useState<"organico" | "pago">("organico")
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [pending, startTransition] = useTransition()

  // Nomes repetidos entre responsáveis (ex.: dois "Maria" no roster). Como a
  // página pública só expõe id+nome, desambiguamos a opção com um sufixo curto
  // do id pra não atribuir o relatório à pessoa errada.
  const nomesDuplicados = new Set(
    (responsaveis ?? [])
      .map((r) => r.nome)
      .filter((nome, i, arr) => arr.indexOf(nome) !== arr.lastIndexOf(nome))
  )

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
          {responsaveis && responsaveis.length > 0 && (
            <Campo label="Responsável (quem está reportando)">
              <select
                value={responsavelId}
                onChange={(e) => setResponsavelId(e.target.value)}
                className="glass-input"
                style={inputEstilo}
              >
                {responsaveis.map((r) => (
                  <option key={r.id} value={r.id}>
                    {nomesDuplicados.has(r.nome)
                      ? `${r.nome} · #${r.id.slice(0, 4)}`
                      : r.nome}
                  </option>
                ))}
              </select>
              <input type="hidden" name="colaborador_id" value={responsavelId} />
              <input
                type="hidden"
                name="colaborador_nome"
                value={
                  responsaveis.find((r) => r.id === responsavelId)?.nome ?? ""
                }
              />
            </Campo>
          )}

          <Campo label="Empresa">
            <select
              name="empresa"
              value={empresa}
              onChange={(e) => {
                setEmpresa(e.target.value)
                setClienteId("")
              }}
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

          {(clientesPorEmpresa?.[empresa]?.length ?? 0) > 0 && (
            <Campo label="Cliente (opcional — vazio = empresa toda)">
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="glass-input"
                style={inputEstilo}
              >
                <option value="">— Empresa toda —</option>
                {clientesPorEmpresa![empresa].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <input type="hidden" name="cliente_trafego_id" value={clienteId} />
              <input
                type="hidden"
                name="cliente_nome"
                value={
                  clientesPorEmpresa![empresa].find((c) => c.id === clienteId)
                    ?.nome ?? ""
                }
              />
            </Campo>
          )}

          <Campo label="Origem">
            <select
              name="origem"
              value={origem}
              onChange={(e) =>
                setOrigem(e.target.value as "organico" | "pago")
              }
              className="glass-input"
              style={inputEstilo}
            >
              <option value="organico">Orgânico</option>
              <option value="pago">Anúncios</option>
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
              <NumCampo
                label={
                  origem === "pago" ? "Mensagens recebidas" : "Mensagens enviadas"
                }
                name="mensagens"
              />
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
                <CampoMoeda
                  name="faturamento_gerado"
                  className="glass-input"
                  style={inputEstilo}
                  placeholder="R$ 0,00"
                />
              </Campo>
            </div>
          </Grupo>

          <Campo label="Observações (opcional)">
            <textarea
              name="observacoes"
              rows={3}
              maxLength={500}
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
      <CampoInteiro
        name={name}
        maxDigitos={6}
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
