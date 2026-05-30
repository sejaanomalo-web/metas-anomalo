import KPICard from "@/components/ui/KPICard"
import { formatBRL, formatNumero } from "@/lib/data"
import {
  SENTINELA_NOME,
  type AnomaliaSentinela,
  type LinhaDoMes,
  type ResumoMesSentinela,
} from "@/lib/sentinela"

/**
 * Miolo do dashboard de tráfego — 4 KPIs + alertas + histórico diário.
 * Compartilhado entre o painel de uma EMPRESA (/dashboard/[empresa]/trafego)
 * e o de um CLIENTE (/dashboard/[empresa]/clientes/[cliente]).
 *
 * Recebe os dados já carregados (resumo, anomalias, linhas) — não faz
 * fetch. O header (tabs, badge, banners) fica na página, que difere
 * entre empresa e cliente.
 */
export default function PainelTrafego({
  resumo,
  anomalias,
  linhas,
  cplMeta,
}: {
  resumo: ResumoMesSentinela
  anomalias: AnomaliaSentinela[]
  linhas: LinhaDoMes[]
  cplMeta?: number | null
}) {
  return (
    <>
      {/* KPIs do mês */}
      <section className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 16 }}>
        <KPICard
          label="Investimento no mês"
          valor={formatBRL(resumo.investimento)}
          icon={<IconeMegafone />}
          iconStatus="gold"
          destaque
          semDados={resumo.investimento === 0}
          semDadosTexto="Aguardando dados"
        />
        <KPICard
          label="Resultados"
          valor={formatNumero(resumo.leads)}
          icon={<IconeLeads />}
          iconStatus={resumo.leads > 0 ? "success" : "neutral"}
          semDados={resumo.leads === 0}
          semDadosTexto="Aguardando dados"
          delta={{
            texto: "leads / mensagens iniciadas / conversões",
            status: "neutral",
          }}
        />
        <KPICard
          label="CPL médio"
          valor={resumo.cpl !== null ? formatBRL(resumo.cpl) : "—"}
          icon={<IconeAlvo />}
          iconStatus={resumo.cpl !== null ? "success" : "neutral"}
          semDados={resumo.cpl === null}
          semDadosTexto="Sem leads ainda"
          meta={cplMeta && cplMeta > 0 ? formatBRL(cplMeta) : undefined}
        />
        <KPICard
          label="Dias com dados"
          valor={formatNumero(resumo.dias)}
          icon={<IconeCalendario />}
          iconStatus="neutral"
          semDados={resumo.dias === 0}
          semDadosTexto="Sem dados no mês"
          delta={
            resumo.diasParciais > 0
              ? { texto: `${resumo.diasParciais} parcial`, status: "warning" }
              : undefined
          }
        />
      </section>

      {/* Alertas / anomalias */}
      {anomalias.length > 0 && (
        <section className="glass" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            Alertas da última execução
          </h2>
          <ul
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {anomalias.map((a, idx) => (
              <CartaoAnomalia key={`${a.metrica}-${idx}`} anomalia={a} />
            ))}
          </ul>
        </section>
      )}

      {/* Histórico diário */}
      <section className="glass" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Histórico diário</h2>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
            🤖 = Sentinela · 👤 = preenchimento manual ·{" "}
            <span style={{ color: "var(--warning)" }}>parcial</span> = dia
            corrente, vai mudar na próxima execução
          </p>
        </div>
        {linhas.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-4)", fontStyle: "italic" }}>
            Nenhum movimento registrado no mês.
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "max-content",
              }}
            >
              <thead>
                <tr>
                  {[
                    "Dia",
                    "Fonte",
                    "Investimento",
                    "Resultados",
                    "CPL",
                    "Reuniões",
                    "Contratos",
                    "Faturamento",
                  ].map((h, idx) => (
                    <th
                      key={h}
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                        fontWeight: 600,
                        textAlign: "left",
                        padding: "10px 14px",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        whiteSpace: "nowrap",
                        ...(idx === 0 ? colunaFixaEstilo : undefined),
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <LinhaTabela key={l.data + l.preenchedor_nome} linha={l} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

/* ============ Componentes auxiliares ============ */

export function CartaoAnomalia({ anomalia }: { anomalia: AnomaliaSentinela }) {
  const corMap = {
    positiva: { fg: "var(--success)", bg: "var(--success-bg)", border: "rgba(22,163,74,0.25)", icone: "↑" },
    negativa: { fg: "var(--warning)", bg: "var(--warning-bg)", border: "rgba(234,179,8,0.30)", icone: "↓" },
    critica: { fg: "var(--danger)", bg: "var(--danger-bg)", border: "rgba(239,68,68,0.30)", icone: "!" },
  } as const
  const c = corMap[anomalia.tipo] ?? corMap.negativa
  return (
    <li
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: c.bg,
        border: `1px solid ${c.border}`,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "rgba(0,0,0,0.20)",
          color: c.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {c.icone}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600, marginBottom: 2 }}>
          {anomalia.metrica} ·{" "}
          <span style={{ color: c.fg }}>
            {anomalia.variacao_percentual > 0 ? "+" : ""}
            {anomalia.variacao_percentual.toFixed(0)}%
          </span>
        </p>
        <p style={{ fontSize: 12, color: "var(--text-3)" }}>
          Atual: <strong style={{ color: "var(--text-2)" }}>{anomalia.valor_atual}</strong>{" "}
          · média 7d: <strong style={{ color: "var(--text-2)" }}>{anomalia.media_7dias.toFixed(1)}</strong>
        </p>
      </div>
    </li>
  )
}

function LinhaTabela({ linha }: { linha: LinhaDoMes }) {
  const hojeISO = new Date().toISOString().slice(0, 10)
  const ehSentinela = linha.preenchedor_nome === SENTINELA_NOME
  const ehHoje = linha.data === hojeISO
  const parcial = ehSentinela && ehHoje
  const dia = linha.data.slice(8, 10)
  return (
    <tr>
      <td style={{ ...celulaStyle, ...colunaFixaEstilo }}>
        Dia {dia}
        {parcial && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 9,
              color: "var(--warning)",
              background: "var(--warning-bg)",
              padding: "2px 6px",
              borderRadius: 999,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
            }}
          >
            parcial
          </span>
        )}
      </td>
      <td style={celulaStyle}>
        {linha.preenchedor_nome ? (
          <span
            title={linha.preenchedor_nome}
            style={{
              fontSize: 11,
              color: ehSentinela ? "var(--accent)" : "var(--text-2)",
              background: ehSentinela ? "rgba(201,149,58,0.10)" : "rgba(255,255,255,0.04)",
              padding: "3px 8px",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {ehSentinela ? "🤖" : "👤"} {ehSentinela ? "Sentinela" : linha.preenchedor_nome}
          </span>
        ) : (
          <span style={{ color: "var(--text-4)", fontSize: 11 }}>—</span>
        )}
      </td>
      <td style={celulaStyle}>
        {linha.investimento_real !== null ? formatBRL(Number(linha.investimento_real)) : "—"}
      </td>
      <td style={celulaStyle}>
        {linha.leads_real !== null ? formatNumero(linha.leads_real) : "—"}
      </td>
      <td style={celulaStyle}>
        {linha.cpl_real !== null ? formatBRL(Number(linha.cpl_real)) : "—"}
      </td>
      <td style={{ ...celulaStyle, color: "var(--text-3)" }}>
        {linha.reunioes_real !== null ? formatNumero(linha.reunioes_real) : "—"}
      </td>
      <td style={{ ...celulaStyle, color: "var(--text-3)" }}>
        {linha.contratos_real !== null ? formatNumero(linha.contratos_real) : "—"}
      </td>
      <td style={{ ...celulaStyle, color: "var(--text-3)" }}>
        {linha.faturamento_real !== null ? formatBRL(Number(linha.faturamento_real)) : "—"}
      </td>
    </tr>
  )
}

const celulaStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-2)",
  fontWeight: 400,
  padding: "12px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
}

const colunaFixaEstilo: React.CSSProperties = {
  position: "sticky",
  left: 0,
  background: "var(--surface-1)",
  zIndex: 1,
  boxShadow: "2px 0 8px rgba(0,0,0,0.25)",
}

/* ============ Ícones ============ */

function IconeMegafone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function IconeAlvo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function IconeLeads() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 11l-3-3 3-3" />
    </svg>
  )
}

function IconeCalendario() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
