import Link from "next/link"
import ProgressBar, { type ProgressStatus } from "@/components/ui/ProgressBar"
import {
  type Ano,
  type EmpresaMeta,
  type Mes,
  anoTemProjecao,
  formatBRL,
  getFaturamentoMesComOverride,
  getVerbaMesComOverride,
  metaAcumuladaAteHoje,
  subtituloDaEmpresa,
} from "@/lib/data"

/**
 * Card de empresa do Hub. Layout:
 *
 *   ┌─────────────────────────────────────┐
 *   │ A2 Marketing            ↑ 105%     │   ← chip de status
 *   │ Agência de marketing                 │
 *   │                                      │
 *   │ Investimento     Faturamento         │   ← labels (sentence case)
 *   │ R$ 45.000        R$ 287.000          │   ← valores (24px)
 *   │                                      │
 *   │ ████████████████░░░░░░  68%          │   ← progresso
 *   └─────────────────────────────────────┘
 *
 * Dividers por respiro (sem linhas), chip de status no topo direito,
 * número-chave em destaque, progresso semântico.
 */
export default function CardEmpresa({
  empresa,
  mes,
  ano,
  faturamentoReal,
  investimentoReal,
  override,
}: {
  empresa: EmpresaMeta
  mes: Mes
  ano: Ano
  faturamentoReal: number | null
  investimentoReal: number | null
  override?: Record<string, number>
}) {
  const temProjecao = anoTemProjecao(ano)
  const investimento = getVerbaMesComOverride(empresa, mes, ano, override)
  const meta = getFaturamentoMesComOverride(empresa, mes, ano, override)
  // Empresas sem id no Supabase + meta/invest zerados → consideramos
  // "ainda não iniciada nesse mês" e atenuamos o card.
  const inativa =
    !empresa.id && temProjecao && meta === 0 && investimento === 0

  const temReal = typeof faturamentoReal === "number" && faturamentoReal > 0
  const acumulada = metaAcumuladaAteHoje(meta, mes, ano)
  const progressoPct =
    temReal && meta > 0
      ? Math.min(100, Math.round((faturamentoReal / meta) * 100))
      : 0

  // Status semântico unificado (mesmo critério do KPI card no /dashboard).
  const status: ProgressStatus = (() => {
    if (!temReal || !temProjecao || meta === 0) return "neutral"
    if (faturamentoReal >= meta) return "success"
    if (faturamentoReal >= acumulada) return "success"
    if (faturamentoReal >= acumulada * 0.8) return "warning"
    return "danger"
  })()

  const corStatus = (() => {
    if (status === "success") return "var(--success)"
    if (status === "warning") return "var(--warning)"
    if (status === "danger") return "var(--danger)"
    return "var(--text-3)"
  })()

  const chipBg = (() => {
    if (status === "success") return "var(--success-bg)"
    if (status === "warning") return "var(--warning-bg)"
    if (status === "danger") return "var(--danger-bg)"
    return "rgba(199,205,217,0.10)"
  })()

  const chipTexto = (() => {
    if (!temReal || !temProjecao) return null
    if (status === "success") return `↑ ${progressoPct}%`
    return `${progressoPct}%`
  })()

  return (
    <Link
      href={`/dashboard/${empresa.slug}?mes=${mes}&ano=${ano}`}
      className="glass glass-hover block"
      style={{
        opacity: inativa ? 0.4 : 1,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Topo: nome + chip de status */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-1)",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            {empresa.nome}
          </p>
          {!inativa && (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                marginTop: 4,
                lineHeight: 1.3,
              }}
            >
              {subtituloDaEmpresa(empresa)}
            </p>
          )}
          {inativa && (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-4)",
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              Sem dados neste mês
              {empresa.inicioEm ? ` — início em ${empresa.inicioEm}` : ""}
            </p>
          )}
        </div>
        {chipTexto && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: corStatus,
              background: chipBg,
              padding: "4px 10px",
              borderRadius: 999,
              whiteSpace: "nowrap",
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {chipTexto}
          </span>
        )}
      </div>

      {!inativa && (
        <>
          {/* Métricas principais (Investimento + Faturamento lado a lado) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <BlocoMetrica
              rotulo="Investimento"
              valor={formatBRL(investimentoReal ?? 0)}
              destaque={false}
            />
            <BlocoMetrica
              rotulo="Faturamento"
              valor={formatBRL(faturamentoReal ?? 0)}
              destaque
            />
          </div>

          {/* Barra de progresso + meta total */}
          <div>
            <ProgressBar
              pct={progressoPct}
              status={status}
              mostrarNumero
              height={6}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 8,
                fontSize: 11,
                color: "var(--text-3)",
                fontWeight: 400,
              }}
            >
              <span>
                {temProjecao ? (
                  <>
                    <span style={{ color: "var(--text-4)" }}>Meta: </span>
                    <span
                      style={{
                        color: "var(--accent)",
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatBRL(meta)}
                    </span>
                  </>
                ) : (
                  "Sem projeção"
                )}
              </span>
              {temProjecao && (
                <span>Invest. previsto: {formatBRL(investimento)}</span>
              )}
            </div>
          </div>
        </>
      )}
    </Link>
  )
}

function BlocoMetrica({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--text-3)",
          lineHeight: 1.3,
        }}
      >
        {rotulo}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: destaque ? 700 : 500,
          color: destaque ? "var(--text-1)" : "var(--text-2)",
          marginTop: 4,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {valor}
      </p>
    </div>
  )
}
