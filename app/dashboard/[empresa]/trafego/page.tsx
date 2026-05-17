import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import TabsEmpresa from "@/components/TabsEmpresa"
import TrafegoRealtime from "@/components/TrafegoRealtime"
import KPICard from "@/components/ui/KPICard"
import { estaAutenticado } from "@/lib/auth"
import {
  MES_NUM,
  anoValido,
  diasNoMes,
  formatBRL,
  formatNumero,
  mesValido,
  subtituloDaEmpresa,
} from "@/lib/data"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import {
  EMPRESAS_TRACKEADAS,
  SENTINELA_NOME,
  empresaTrackeadaPeloSentinela,
  getDiasSentinelaDaEmpresa,
  getLinhasDoMes,
  getUltimoLogSentinela,
  proximaExecucao,
  resumirMesSentinela,
  statusSentinela,
  tempoDecorrido,
  type AnomaliaSentinela,
  type LinhaDoMes,
} from "@/lib/sentinela"

// Página dinâmica: força SSR sem Data Cache (mesmo motivo das outras
// pages do dashboard). Resolve o bug de "desconfiguração" ao alternar
// entre meses no SeletorPeriodo.
export const dynamic = "force-dynamic"

/**
 * Painel de tráfego pago da empresa, alimentado pelo agente Sentinela
 * Anomalo. Lê SOMENTE de tabelas do Supabase — sem chamada Meta Graph
 * em runtime.
 *
 * Fonte:
 *   • dados_diarios_log filtrado por (empresa.nome, origem=pago)
 *     com flag de quem preencheu (Sentinela 🤖 vs humano 👤)
 *   • logs_sentinela (último) → status + anomalias detectadas
 *
 * Atualização em tempo real via TrafegoRealtime (client component que
 * dispara router.refresh ao receber INSERT/UPDATE do agente).
 */
export default async function TrafegoPage({
  params,
  searchParams,
}: {
  params: { empresa: string }
  searchParams: { mes?: string; ano?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) notFound()

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  // Range YYYY-MM-01 .. YYYY-MM-{lastDay} para filtrar dados_diarios_log.
  const mesNum = String(MES_NUM[mes]).padStart(2, "0")
  const ultimoDia = String(diasNoMes(mes, ano)).padStart(2, "0")
  const inicio = `${ano}-${mesNum}-01`
  const fim = `${ano}-${mesNum}-${ultimoDia}`

  const [diasSentinela, linhas, ultimoLog] = await Promise.all([
    getDiasSentinelaDaEmpresa(empresa.nome, inicio, fim),
    getLinhasDoMes(empresa.nome, inicio, fim),
    getUltimoLogSentinela(),
  ])

  const resumo = resumirMesSentinela(diasSentinela)
  const trackeada = empresaTrackeadaPeloSentinela(empresa.nome)
  const stat = statusSentinela(ultimoLog)
  const prox = proximaExecucao()
  const anomaliasEmpresa: AnomaliaSentinela[] = (
    ultimoLog?.anomalias_detectadas ?? []
  ).filter((a) => a.empresa === empresa.nome)
  const erroEmpresa = (ultimoLog?.erros_de_leitura ?? []).find(
    (e) => e.empresa === empresa.nome
  )
  const semAtividade =
    ultimoLog?.contas_sem_atividade?.some(
      (c) => c.empresa === empresa.nome
    ) ?? false

  return (
    <>
      {/* key força remontar o canal Realtime ao trocar filtros — sem
          isso o canal permanece "preso" ao primeiro empresaNome/mes/ano
          montado e refreshes vêm com contexto desatualizado. */}
      <TrafegoRealtime
        key={`${empresa.nome}-${mes}-${ano}`}
        empresaNome={empresa.nome}
      />

      <main
        className="mx-auto px-8 py-10 space-y-8"
        style={{ maxWidth: 1280 }}
      >
        <div>
          <Link
            href={`/dashboard/${empresa.slug}?mes=${mes}&ano=${ano}`}
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              fontWeight: 500,
            }}
            className="hover:text-[#C9953A] transition"
          >
            ← {empresa.nome}
          </Link>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ fontSize: 36 }}>Tráfego pago — {empresa.nome}</h1>
            <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
            }}
          >
            {subtituloDaEmpresa(empresa)} · Atualizado automaticamente pelo
            Sentinela
          </p>

          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <TabsEmpresa slug={empresa.slug} mes={mes} ano={ano} />
            <BadgeStatusSentinela
              statusCor={stat.cor}
              rotulo={stat.rotulo}
              ultimaExecucao={ultimoLog?.data_execucao ?? null}
              proximaLabel={prox.label}
            />
          </div>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {/* Banner pra empresas sem token Meta cadastrado */}
        {!trackeada && (
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              border: "1px solid rgba(201,149,58,0.30)",
              background: "rgba(201,149,58,0.06)",
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <strong>Token Meta não cadastrado pra esta empresa.</strong>{" "}
            O agente Sentinela só processa as empresas listadas em{" "}
            <code style={{ color: "var(--accent)" }}>tokens_meta</code>{" "}
            (hoje: {EMPRESAS_TRACKEADAS.join(", ")}). Pra começar a
            trackear, cadastre o System User token no Supabase.
          </div>
        )}

        {/* Banner se Sentinela retornou erro pra essa empresa */}
        {trackeada && erroEmpresa && (
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              border: "1px solid rgba(239,68,68,0.30)",
              background: "var(--danger-bg)",
              color: "var(--text-1)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "var(--danger)" }}>
              Erro de leitura na última execução:
            </strong>{" "}
            <span style={{ color: "var(--text-2)" }}>
              {erroEmpresa.error}
            </span>
          </div>
        )}

        {/* Sem movimento detectado */}
        {trackeada && !erroEmpresa && semAtividade && (
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              border: "1px solid rgba(234,179,8,0.30)",
              background: "var(--warning-bg)",
              color: "var(--text-2)",
              fontSize: 13,
            }}
          >
            <strong style={{ color: "var(--warning)" }}>
              Sem atividade detectada no Meta Ads
            </strong>{" "}
            na última execução do Sentinela — campanhas pausadas ou sem
            investimento no período.
          </div>
        )}

        {/* KPIs do mês — só métricas do agente Sentinela */}
        <section
          className="grid grid-cols-2 sm:grid-cols-4"
          style={{ gap: 16 }}
        >
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
            meta={
              empresa.cpl && empresa.cpl > 0
                ? formatBRL(empresa.cpl)
                : undefined
            }
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
                ? {
                    texto: `${resumo.diasParciais} parcial`,
                    status: "warning",
                  }
                : undefined
            }
          />
        </section>

        {/* Alertas / anomalias detectadas pra essa empresa */}
        {anomaliasEmpresa.length > 0 && (
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
              {anomaliasEmpresa.map((a, idx) => (
                <CartaoAnomalia key={`${a.metrica}-${idx}`} anomalia={a} />
              ))}
            </ul>
          </section>
        )}

        {/* Histórico diário — TODAS as linhas (Sentinela + manuais) */}
        <section className="glass" style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>
              Histórico diário
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                marginTop: 4,
              }}
            >
              🤖 = Sentinela · 👤 = preenchimento manual ·{" "}
              <span style={{ color: "var(--warning)" }}>parcial</span> = dia
              corrente, vai mudar na próxima execução
            </p>
          </div>
          {linhas.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-4)",
                fontStyle: "italic",
              }}
            >
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
                          borderBottom:
                            "1px solid rgba(255,255,255,0.06)",
                          whiteSpace: "nowrap",
                          // Primeira coluna fica fixa ao rolar horizontalmente
                          // (relevante no celular onde a tabela transborda).
                          // Background sólido + box-shadow à direita pra
                          // separar visualmente das colunas que rolam atrás.
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
      </main>
    </>
  )
}

/* ============ Componentes inline ============ */

function BadgeStatusSentinela({
  statusCor,
  rotulo,
  ultimaExecucao,
  proximaLabel,
}: {
  statusCor: "success" | "warning" | "danger" | "neutral"
  rotulo: string
  ultimaExecucao: string | null
  proximaLabel: string
}) {
  const corMap = {
    success: { fg: "var(--success)", bg: "var(--success-bg)", border: "rgba(22,163,74,0.25)" },
    warning: { fg: "var(--warning)", bg: "var(--warning-bg)", border: "rgba(234,179,8,0.30)" },
    danger: { fg: "var(--danger)", bg: "var(--danger-bg)", border: "rgba(239,68,68,0.30)" },
    neutral: { fg: "var(--text-3)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" },
  }
  const c = corMap[statusCor]
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: c.fg,
          padding: "6px 12px",
          borderRadius: 999,
          background: c.bg,
          border: `1px solid ${c.border}`,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <Bolinha cor={c.fg} pulse={statusCor === "success"} />
        🛡️ {rotulo}
        {ultimaExecucao && (
          <span style={{ color: "var(--text-3)", marginLeft: 2 }}>
            · há {tempoDecorrido(ultimaExecucao)}
          </span>
        )}
      </span>
      <span
        style={{
          fontSize: 10,
          color: "var(--text-4)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        próxima execução: {proximaLabel}
      </span>
    </div>
  )
}

function CartaoAnomalia({ anomalia }: { anomalia: AnomaliaSentinela }) {
  const corMap = {
    positiva: {
      fg: "var(--success)",
      bg: "var(--success-bg)",
      border: "rgba(22,163,74,0.25)",
      icone: "↑",
    },
    negativa: {
      fg: "var(--warning)",
      bg: "var(--warning-bg)",
      border: "rgba(234,179,8,0.30)",
      icone: "↓",
    },
    critica: {
      fg: "var(--danger)",
      bg: "var(--danger-bg)",
      border: "rgba(239,68,68,0.30)",
      icone: "!",
    },
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
          background: `rgba(0,0,0,0.20)`,
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
        <p
          style={{
            fontSize: 13,
            color: "var(--text-1)",
            fontWeight: 600,
            marginBottom: 2,
          }}
        >
          {anomalia.metrica} ·{" "}
          <span style={{ color: c.fg }}>
            {anomalia.variacao_percentual > 0 ? "+" : ""}
            {anomalia.variacao_percentual.toFixed(0)}%
          </span>
        </p>
        <p style={{ fontSize: 12, color: "var(--text-3)" }}>
          Atual: <strong style={{ color: "var(--text-2)" }}>
            {anomalia.valor_atual}
          </strong>{" "}
          · média 7d:{" "}
          <strong style={{ color: "var(--text-2)" }}>
            {anomalia.media_7dias.toFixed(1)}
          </strong>
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
              background: ehSentinela
                ? "rgba(201,149,58,0.10)"
                : "rgba(255,255,255,0.04)",
              padding: "3px 8px",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {ehSentinela ? "🤖" : "👤"}{" "}
            {ehSentinela ? "Sentinela" : linha.preenchedor_nome}
          </span>
        ) : (
          <span style={{ color: "var(--text-4)", fontSize: 11 }}>—</span>
        )}
      </td>
      <td style={celulaStyle}>
        {linha.investimento_real !== null
          ? formatBRL(Number(linha.investimento_real))
          : "—"}
      </td>
      <td style={celulaStyle}>
        {linha.leads_real !== null ? formatNumero(linha.leads_real) : "—"}
      </td>
      <td style={celulaStyle}>
        {linha.cpl_real !== null ? formatBRL(Number(linha.cpl_real)) : "—"}
      </td>
      <td style={{ ...celulaStyle, color: "var(--text-3)" }}>
        {linha.reunioes_real !== null
          ? formatNumero(linha.reunioes_real)
          : "—"}
      </td>
      <td style={{ ...celulaStyle, color: "var(--text-3)" }}>
        {linha.contratos_real !== null
          ? formatNumero(linha.contratos_real)
          : "—"}
      </td>
      <td style={{ ...celulaStyle, color: "var(--text-3)" }}>
        {linha.faturamento_real !== null
          ? formatBRL(Number(linha.faturamento_real))
          : "—"}
      </td>
    </tr>
  )
}

function Bolinha({ cor, pulse }: { cor: string; pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: cor,
        boxShadow: pulse ? `0 0 0 0 ${cor}` : undefined,
        animation: pulse ? "pulseGold 2s ease-in-out infinite" : undefined,
      }}
    />
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

/** Fixa a coluna "Dia" da tabela ao rolar horizontalmente.
 *  Necessário no celular onde a tabela transborda — sem isso o
 *  usuário perde o contexto do dia ao olhar valores à direita.
 *  Background sólido cobre o conteúdo que rola atrás e o box-shadow
 *  cria uma borda visual sutil indicando que tem mais coluna fora
 *  do viewport. Idempotente no desktop (não há scroll, sticky vira
 *  static visualmente). */
const colunaFixaEstilo: React.CSSProperties = {
  position: "sticky",
  left: 0,
  background: "var(--surface-1)",
  zIndex: 1,
  boxShadow: "2px 0 8px rgba(0,0,0,0.25)",
}

/* ============ Ícones SVG inline ============ */

function IconeMegafone() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function IconeAlvo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function IconeLeads() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 11l-3-3 3-3" />
    </svg>
  )
}

function IconeCalendario() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
