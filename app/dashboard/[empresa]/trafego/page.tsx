import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import TabsEmpresa from "@/components/TabsEmpresa"
import KPICard from "@/components/ui/KPICard"
import { estaAutenticado } from "@/lib/auth"
import {
  anoValido,
  formatBRL,
  formatNumero,
  mesValido,
  subtituloDaEmpresa,
} from "@/lib/data"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import {
  agregarInsights,
  insightsDaCampanha,
  listarCampanhasMeta,
  type InsightsAgregados,
} from "@/lib/campanhas-meta"
import { getSupabase } from "@/lib/supabase"

/**
 * Painel de tráfego pago da empresa. Lê 100% do Supabase:
 *
 *   • campanhas_meta   → snapshot por campanha (insights do Meta puros)
 *   • tokens_meta      → status da conexão Meta Ads (System User)
 *
 * Apenas métricas reais do Meta Ads. Dados manuais (contratos,
 * faturamento, ticket médio) vivem em dados_reais e aparecem
 * exclusivamente na aba "Visão Geral" — aqui não.
 *
 * Suporta filtro por campanha via ?campanha={campanha_id}. Quando
 * vazio, mostra o agregado de todas as campanhas do período.
 */
export default async function TrafegoPage({
  params,
  searchParams,
}: {
  params: { empresa: string }
  searchParams: { mes?: string; ano?: string; campanha?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) notFound()

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const campanhaSelecionada = searchParams?.campanha?.trim() || null

  const [campanhas, conexao] = await Promise.all([
    listarCampanhasMeta(empresa.db, mes, ano),
    buscarConexaoMeta(empresa.db),
  ])

  // Campanha individual ou agregado de todas:
  const campanhaAtual =
    campanhaSelecionada !== null
      ? campanhas.find((c) => c.campanha_id === campanhaSelecionada) ?? null
      : null
  const insights: InsightsAgregados = campanhaAtual
    ? insightsDaCampanha(campanhaAtual)
    : agregarInsights(campanhas)

  const semCampanhas = campanhas.length === 0
  const linkBase = `/dashboard/${empresa.slug}/trafego?mes=${mes}&ano=${ano}`

  return (
    <>
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
            <StatusConexao
              conexao={conexao}
              ultimaSincronizacao={insights.ultimaSincronizacao}
            />
          </div>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {/* Seletor de campanha — sempre visível quando há campanhas */}
        {!semCampanhas && (
          <SeletorCampanha
            campanhas={campanhas}
            ativoId={campanhaSelecionada}
            linkBase={linkBase}
          />
        )}

        {semCampanhas && (
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              border: "1px solid rgba(201,149,58,0.30)",
              background: "rgba(201,149,58,0.06)",
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Nenhuma campanha sincronizada neste mês ainda. O agente
            Sentinela popula esta tabela (<strong>campanhas_meta</strong>)
            automaticamente — verifique se a empresa tem token cadastrado
            em <strong>tokens_meta</strong> e se a última execução do
            agente passou em <strong>logs_sentinela</strong>.
          </div>
        )}

        {/* Faixa principal de KPIs — só métricas reais do Meta */}
        <section
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          style={{ gap: 16 }}
        >
          <KPICard
            label="Investimento"
            valor={formatBRL(insights.spend)}
            icon={<IconeMegafone />}
            iconStatus="gold"
            destaque
            semDados={semCampanhas}
          />
          <KPICard
            label="Leads gerados"
            valor={formatNumero(insights.leads)}
            icon={<IconeLeads />}
            iconStatus="neutral"
            semDados={semCampanhas}
          />
          <KPICard
            label="CPL"
            valor={insights.cpl !== null ? formatBRL(insights.cpl) : "—"}
            icon={<IconeAlvo />}
            iconStatus={insights.cpl !== null && insights.cpl > 0 ? "success" : "neutral"}
            semDados={semCampanhas}
            semDadosTexto="Sem leads"
          />
          <KPICard
            label="Impressões"
            valor={formatNumero(insights.impressions)}
            icon={<IconeOlho />}
            iconStatus="neutral"
            semDados={semCampanhas}
          />
          <KPICard
            label="Alcance"
            valor={formatNumero(insights.reach)}
            icon={<IconeAlcance />}
            iconStatus="neutral"
            semDados={semCampanhas}
          />
          <KPICard
            label="Cliques"
            valor={formatNumero(insights.clicks)}
            icon={<IconeCliques />}
            iconStatus="neutral"
            semDados={semCampanhas}
          />
          <KPICard
            label="CTR"
            valor={
              insights.ctr !== null ? `${insights.ctr.toFixed(2)}%` : "—"
            }
            icon={<IconeFunil />}
            iconStatus={
              insights.ctr !== null && insights.ctr > 0 ? "success" : "neutral"
            }
            semDados={semCampanhas}
            semDadosTexto="Sem impressões"
          />
          <KPICard
            label="Frequência"
            valor={
              insights.frequencia !== null
                ? insights.frequencia.toFixed(2)
                : "—"
            }
            icon={<IconeRepeticao />}
            iconStatus="neutral"
            semDados={semCampanhas}
            semDadosTexto="Sem alcance"
          />
        </section>

        {/* Detalhes da campanha selecionada */}
        {campanhaAtual && (
          <DetalhesCampanha campanha={campanhaAtual} />
        )}

        {/* Tabela com todas as campanhas, sempre visível */}
        {!semCampanhas && (
          <section className="glass" style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>
                Todas as campanhas
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-3)",
                  marginTop: 4,
                }}
              >
                Clique em uma linha pra ver só os dados dela acima.
              </p>
            </div>

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
                      "Campanha",
                      "Status",
                      "Objetivo",
                      "Investimento",
                      "Leads",
                      "CPL",
                      "Impressões",
                      "Cliques",
                      "CTR",
                    ].map((h) => (
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
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campanhas.map((c) => {
                    const ativa = c.campanha_id === campanhaSelecionada
                    return (
                      <tr
                        key={c.id}
                        style={{
                          background: ativa
                            ? "rgba(201,149,58,0.06)"
                            : undefined,
                        }}
                      >
                        <td style={celulaStyle}>
                          <Link
                            href={
                              ativa
                                ? linkBase
                                : `${linkBase}&campanha=${c.campanha_id}`
                            }
                            style={{
                              color: ativa
                                ? "var(--accent)"
                                : "var(--text-1)",
                              fontWeight: ativa ? 600 : 500,
                              textDecoration: "none",
                            }}
                            className="hover:text-[#C9953A] transition"
                          >
                            {c.nome}
                          </Link>
                        </td>
                        <td style={celulaStyle}>
                          <BadgeStatus status={c.status} />
                        </td>
                        <td style={celulaStyle}>{c.objetivo || "—"}</td>
                        <td style={celulaStyle}>
                          {formatBRL(Number(c.spend ?? 0))}
                        </td>
                        <td style={celulaStyle}>
                          {formatNumero(c.leads ?? 0)}
                        </td>
                        <td style={celulaStyle}>
                          {c.cpl !== null && c.cpl !== undefined
                            ? formatBRL(Number(c.cpl))
                            : "—"}
                        </td>
                        <td style={celulaStyle}>
                          {formatNumero(c.impressions ?? 0)}
                        </td>
                        <td style={celulaStyle}>
                          {formatNumero(c.clicks ?? 0)}
                        </td>
                        <td style={celulaStyle}>
                          {c.ctr !== null && c.ctr !== undefined
                            ? `${Number(c.ctr).toFixed(2)}%`
                            : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </>
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

/* ============ Helpers server ============ */

interface ConexaoMeta {
  conectado: boolean
  ad_account_id?: string
  bm_id?: string | null
  data_geracao?: string | null
}

async function buscarConexaoMeta(
  empresaDb: string
): Promise<ConexaoMeta | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  // Apenas consulta de leitura na coluna pública — `access_token` segue
  // protegida por RLS (só service_role), então não vaza credenciais.
  const { data } = await supabase
    .from("tokens_meta")
    .select("ad_account_id, bm_id, data_geracao, ativo")
    .eq("empresa", empresaDb)
    .eq("ativo", true)
    .maybeSingle()
  if (!data) return { conectado: false }
  return {
    conectado: true,
    ad_account_id: data.ad_account_id as string,
    bm_id: (data.bm_id as string | null) ?? null,
    data_geracao: (data.data_geracao as string | null) ?? null,
  }
}

/* ============ Subcomponentes ============ */

function SeletorCampanha({
  campanhas,
  ativoId,
  linkBase,
}: {
  campanhas: { campanha_id: string; nome: string; status: string | null }[]
  ativoId: string | null
  linkBase: string
}) {
  return (
    <section>
      <p
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-3)",
          marginBottom: 10,
        }}
      >
        Filtrar por campanha
      </p>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <ChipCampanha
          href={linkBase}
          ativo={ativoId === null}
          label={`Todas (${campanhas.length})`}
        />
        {campanhas.map((c) => (
          <ChipCampanha
            key={c.campanha_id}
            href={`${linkBase}&campanha=${c.campanha_id}`}
            ativo={ativoId === c.campanha_id}
            label={c.nome}
            status={c.status}
          />
        ))}
      </div>
    </section>
  )
}

function ChipCampanha({
  href,
  ativo,
  label,
  status,
}: {
  href: string
  ativo: boolean
  label: string
  status?: string | null
}) {
  const ativaCampanha = status === "ACTIVE"
  return (
    <Link
      href={href}
      className="no-ds transition"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        textDecoration: "none",
        background: ativo
          ? "var(--accent)"
          : "var(--surface-2)",
        color: ativo ? "#000" : "var(--text-2)",
        border: `1px solid ${
          ativo ? "var(--accent)" : "rgba(255,255,255,0.06)"
        }`,
        boxShadow: ativo
          ? "0 0 12px rgba(201,149,58,0.22)"
          : undefined,
        maxWidth: 280,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {status && (
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: ativaCampanha ? "var(--success)" : "var(--text-4)",
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </Link>
  )
}

function DetalhesCampanha({
  campanha,
}: {
  campanha: {
    nome: string
    status: string | null
    objetivo: string | null
    orcamento_diario: number | null
    orcamento_total: number | null
    criativos_ativos: number | null
  }
}) {
  return (
    <section className="glass" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
        Detalhes da campanha
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        <Detalhe
          label="Nome"
          valor={campanha.nome}
          destaque
        />
        <Detalhe
          label="Status"
          valorComponent={<BadgeStatus status={campanha.status} />}
        />
        <Detalhe label="Objetivo" valor={campanha.objetivo || "—"} />
        <Detalhe
          label="Orçamento diário"
          valor={
            campanha.orcamento_diario !== null &&
            campanha.orcamento_diario !== undefined
              ? formatBRL(Number(campanha.orcamento_diario))
              : "—"
          }
        />
        <Detalhe
          label="Orçamento total"
          valor={
            campanha.orcamento_total !== null &&
            campanha.orcamento_total !== undefined
              ? formatBRL(Number(campanha.orcamento_total))
              : "—"
          }
        />
        <Detalhe
          label="Criativos ativos"
          valor={
            campanha.criativos_ativos !== null &&
            campanha.criativos_ativos !== undefined
              ? formatNumero(campanha.criativos_ativos)
              : "—"
          }
        />
      </div>
    </section>
  )
}

function Detalhe({
  label,
  valor,
  valorComponent,
  destaque,
}: {
  label: string
  valor?: string
  valorComponent?: React.ReactNode
  destaque?: boolean
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {label}
      </p>
      {valorComponent ?? (
        <p
          style={{
            fontSize: destaque ? 15 : 14,
            color: "var(--text-1)",
            fontWeight: destaque ? 600 : 500,
            lineHeight: 1.3,
          }}
        >
          {valor}
        </p>
      )}
    </div>
  )
}

function StatusConexao({
  conexao,
  ultimaSincronizacao,
}: {
  conexao: ConexaoMeta | null
  ultimaSincronizacao: string | null
}) {
  if (!conexao || !conexao.conectado) {
    return (
      <span
        style={{
          fontSize: 11,
          color: "var(--text-4)",
          padding: "6px 12px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Bolinha cor="var(--text-4)" />
        Sem token Meta cadastrado
      </span>
    )
  }
  return (
    <span
      style={{
        fontSize: 11,
        color: "var(--success)",
        padding: "6px 12px",
        borderRadius: 999,
        background: "var(--success-bg)",
        border: "1px solid rgba(22,163,74,0.25)",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontVariantNumeric: "tabular-nums",
      }}
      title={
        ultimaSincronizacao
          ? `Última sincronização: ${ultimaSincronizacao}`
          : undefined
      }
    >
      <Bolinha cor="var(--success)" pulse />
      Sentinela conectado · {conexao.ad_account_id}
    </span>
  )
}

function BadgeStatus({ status }: { status: string | null }) {
  const ativa = status === "ACTIVE"
  const cor = ativa ? "var(--success)" : "var(--text-3)"
  const bg = ativa ? "var(--success-bg)" : "rgba(255,255,255,0.04)"
  const label = ativa ? "Ativa" : status === "PAUSED" ? "Pausada" : status ?? "—"
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: "0.04em",
        color: cor,
        background: bg,
        border: `1px solid ${ativa ? "rgba(22,163,74,0.25)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 999,
        padding: "3px 10px",
        fontWeight: 600,
        textTransform: "uppercase",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
    </span>
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

function IconeOlho() {
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
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconeAlcance() {
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
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function IconeCliques() {
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
      <path d="M9 9l3 3 3-3" />
      <path d="M9 14l3 3 3-3" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

function IconeFunil() {
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
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function IconeRepeticao() {
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
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}
