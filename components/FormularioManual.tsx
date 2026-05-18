"use client"

import { useMemo, useState, useTransition } from "react"
import type { EmpresaMeta, Mes } from "@/lib/data"
import { salvarFormularioManualAction } from "@/lib/formularios"

interface Props {
  empresas: EmpresaMeta[]
  mes: Mes
  ano: number
  copiarLinkPublico?: boolean
}

/**
 * Formulário manual de preenchimento diário, reusado em duas rotas:
 *   • /dashboard/formularios (admin, com botão "Copiar link público")
 *   • /formulario            (público, kiosk mode, sem chrome)
 *
 * Fluxo: usuário escolhe empresa no select → campos manuais aparecem
 * adaptados ao tipo da empresa (orçamentos vs reuniões vs vendas) →
 * Salvar dispara server action que grava em dados_diarios_log.
 */
export default function FormularioManual({
  empresas,
  mes,
  ano,
  copiarLinkPublico,
}: Props) {
  const [empresaDb, setEmpresaDb] = useState(empresas[0]?.db ?? "")
  const [feedback, setFeedback] = useState<
    | { tipo: "sucesso"; mensagem: string }
    | { tipo: "erro"; mensagem: string }
    | null
  >(null)
  const [pending, startTransition] = useTransition()

  const empresa = useMemo(
    () => empresas.find((e) => e.db === empresaDb),
    [empresas, empresaDb]
  )

  const rotuloReunioes =
    empresa?.tipo === "aton"
      ? "Orçamentos"
      : empresa?.tipo === "hato"
      ? "Vendas influenciador"
      : "Reuniões"
  const rotuloContratos =
    empresa?.tipo === "aton" || empresa?.tipo === "hato"
      ? "Vendas"
      : "Contratos"

  async function onSubmit(formData: FormData) {
    setFeedback(null)
    const resultado = await salvarFormularioManualAction(formData)
    if (resultado.ok) {
      setFeedback({
        tipo: "sucesso",
        mensagem: `Dados de ${empresa?.nome ?? "empresa"} salvos com sucesso.`,
      })
    } else {
      setFeedback({
        tipo: "erro",
        mensagem: resultado.erro ?? "Erro desconhecido.",
      })
    }
  }

  async function copiar() {
    if (typeof window === "undefined") return
    const url = `${window.location.origin}/formulario`
    try {
      await navigator.clipboard.writeText(url)
      setFeedback({
        tipo: "sucesso",
        mensagem: "Link público copiado.",
      })
      setTimeout(() => setFeedback(null), 2400)
    } catch {
      setFeedback({
        tipo: "erro",
        mensagem: "Não consegui copiar — copie manualmente: " + url,
      })
    }
  }

  return (
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
          Preenchimento manual · {mes} {ano}
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
        <input type="hidden" name="mes" value={mes} />
        <input type="hidden" name="ano" value={ano} />

        <Campo label="Empresa">
          <select
            name="empresa"
            value={empresaDb}
            onChange={(e) => setEmpresaDb(e.target.value)}
            required
            className="glass-input"
            style={inputEstilo}
          >
            {empresas.map((e) => (
              <option key={e.db} value={e.db}>
                {e.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo label={`${rotuloReunioes} realizadas hoje`}>
          <input
            type="number"
            name="reunioes_real"
            min="0"
            inputMode="numeric"
            className="glass-input"
            style={inputEstilo}
            placeholder="0"
          />
        </Campo>

        <Campo label={`${rotuloContratos} fechados hoje`}>
          <input
            type="number"
            name="contratos_real"
            min="0"
            inputMode="numeric"
            className="glass-input"
            style={inputEstilo}
            placeholder="0"
          />
        </Campo>

        <Campo label="Faturamento do dia (R$)">
          <input
            type="text"
            name="faturamento_real"
            inputMode="decimal"
            className="glass-input"
            style={inputEstilo}
            placeholder="0,00"
          />
        </Campo>

        <Campo label="Clientes ativos (estoque atual)">
          <input
            type="number"
            name="clientes_ativos"
            min="0"
            inputMode="numeric"
            className="glass-input"
            style={inputEstilo}
            placeholder="—"
          />
        </Campo>

        <Campo label="Observações (opcional)">
          <textarea
            name="observacoes"
            rows={3}
            className="glass-input"
            style={{
              ...inputEstilo,
              resize: "vertical",
              minHeight: 72,
            }}
            placeholder="Notas sobre o dia, anomalias, contextos…"
          />
        </Campo>

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
            disabled={pending || !empresaDb}
            className="btn-gold-filled uppercase"
            style={{ opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Salvando…" : "Salvar dados do dia"}
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
      </form>
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
