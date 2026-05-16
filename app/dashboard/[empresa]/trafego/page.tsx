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
import { getDadosReaisMes } from "@/lib/dados-reais"
import { getDadosDiariosDoMes } from "@/lib/dados-diarios"
import { getSupabase } from "@/lib/supabase"

/**
 * Painel de tráfego pago da empresa. Lê 100% do Supabase:
 *
 *   • dados_reais (origem='pago')        → totais cumulativos do mês
 *   • dados_diarios_log                  → deltas diários (timeline)
 *   • tokens_meta                        → status da conexão Meta Ads
 *                                          (preenchida pelo agente Sentinela)
 *
 * A escrita em dados_reais é feita pelo agente Sentinela
 * (sistema/automação) que lê o Meta Ads via System User token e
 * grava aqui. Por isso esta página NÃO consulta a Meta Graph API
 * em runtime — todos os números vêm de tabelas locais, com latência
 * controlada pelo cron do agente.
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

  const [real, diarios, conexao] = await Promise.all([
    getDadosReaisMes(empresa.db, mes, ano, "pago"),
    getDadosDiariosDoMes(empresa.db, mes, ano, "pago"),
    buscarConexaoMeta(empresa.db),
  ])

  // Métricas principais derivadas de dados_reais (origem=pago):
  const investimento = real?.investimento_real ?? 0
  const leads = real?.leads_real ?? 0
  const contratos = real?.contratos_real ?? 0
  const faturamento = real?.faturamento_real ?? 0
  const cpl = real?.cpl_real ?? (leads > 0 ? investimento / leads : null)
  const cpa = real?.cpa_real ?? (contratos > 0 ? investimento / contratos : null)
  const criativosUsados = real?.criativos_usados ?? 0
  const criativosEntregues = real?.criativos_entregues ?? 0
  const ticketMedio = contratos > 0 ? faturamento / contratos : 0
  const conversao = leads > 0 ? (contratos / leads) * 100 : 0

  const temDadosReais = !!real && investimento > 0
  const criativosDetalhe = (real?.criativos_detalhe ?? []) as Array<{
    nome?: string
    publico?: string
  }>

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
            <StatusConexao conexao={conexao} />
          </div>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {!temDadosReais && (
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
            Nenhum dado de tráfego pago neste mês ainda. O agente Sentinela
            popula esta seção automaticamente — verifique se a empresa tem
            token cadastrado em <strong>tokens_meta</strong> e se a última
            execução do agente passou em <strong>logs_sentinela</strong>.
          </div>
        )}

        {/* Faixa principal de KPIs */}
        <section
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          style={{ gap: 16 }}
        >
          <KPICard
            label="Investimento real"
            valor={formatBRL(investimento)}
            icon={<IconeMegafone />}
            iconStatus="gold"
            semDados={!temDadosReais}
            destaque
          />
          <KPICard
            label="Leads gerados"
            valor={formatNumero(leads)}
            icon={<IconeLeads />}
            iconStatus="neutral"
            semDados={!temDadosReais}
          />
          <KPICard
            label="CPL"
            valor={cpl !== null ? formatBRL(cpl) : "—"}
            icon={<IconeAlvo />}
            iconStatus={cpl !== null && cpl > 0 ? "success" : "neutral"}
            semDados={!temDadosReais}
          />
          <KPICard
            label="CPA"
            valor={cpa !== null ? formatBRL(cpa) : "—"}
            icon={<IconeAlvo />}
            iconStatus={cpa !== null && cpa > 0 ? "success" : "neutral"}
            semDados={!temDadosReais}
            semDadosTexto={!temDadosReais ? "—" : "Sem contratos"}
          />
          <KPICard
            label="Contratos fechados"
            valor={formatNumero(contratos)}
            icon={<IconeContrato />}
            iconStatus={contratos > 0 ? "success" : "neutral"}
            semDados={!temDadosReais}
          />
          <KPICard
            label="Faturamento atribuído"
            valor={formatBRL(faturamento)}
            icon={<IconeCifrao />}
            iconStatus={faturamento > 0 ? "success" : "neutral"}
            semDados={!temDadosReais}
          />
          <KPICard
            label="Ticket médio"
            valor={ticketMedio > 0 ? formatBRL(ticketMedio) : "—"}
            icon={<IconeTicket />}
            iconStatus={ticketMedio > 0 ? "success" : "neutral"}
            semDados={!temDadosReais}
            semDadosTexto={!temDadosReais ? "—" : "Sem contratos"}
          />
          <KPICard
            label="Conversão lead → contrato"
            valor={leads > 0 ? `${conversao.toFixed(1)}%` : "—"}
            icon={<IconeFunil />}
            iconStatus={conversao > 0 ? "success" : "neutral"}
            semDados={!temDadosReais}
            semDadosTexto={!temDadosReais ? "—" : "Sem leads"}
          />
        </section>

        {/* Criativos do mês */}
        <section className="glass" style={{ padding: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Criativos no mês</h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatNumero(criativosUsados)} usados
              {" · "}
              {formatNumero(criativosEntregues)} entregues
            </p>
          </div>
          {criativosDetalhe.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-4)",
                fontStyle: "italic",
              }}
            >
              Nenhum criativo detalhado ainda neste mês.
            </p>
          ) : (
            <ul
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 10,
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {criativosDetalhe.map((c, idx) => (
                <li
                  key={`${c.nome ?? "criativo"}-${idx}`}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "var(--surface-2)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--text-1)",
                      fontWeight: 500,
                      marginBottom: 2,
                    }}
                  >
                    {c.nome ?? "Criativo sem nome"}
                  </p>
                  {c.publico && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                      }}
                    >
                      Público: {c.publico}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Timeline diária */}
        <section className="glass" style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>
              Evolução diária
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                marginTop: 4,
              }}
            >
              Deltas dia a dia agregados a partir de dados_diarios_log
            </p>
          </div>
          {diarios.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-4)",
                fontStyle: "italic",
              }}
            >
              Nenhum movimento diário registrado no mês.
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
                      "Investimento",
                      "Leads",
                      "CPL",
                      "Contratos",
                      "Faturamento",
                      "Criativos novos",
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
                  {diarios.map((d) => (
                    <tr key={d.data}>
                      <td style={celulaStyle}>
                        Dia {String(d.diaMes).padStart(2, "0")}
                      </td>
                      <td style={celulaStyle}>{formatBRL(d.investimento)}</td>
                      <td style={celulaStyle}>{formatNumero(d.leads)}</td>
                      <td style={celulaStyle}>
                        {d.cpl !== null ? formatBRL(d.cpl) : "—"}
                      </td>
                      <td style={celulaStyle}>{formatNumero(d.contratos)}</td>
                      <td style={celulaStyle}>{formatBRL(d.faturamento)}</td>
                      <td style={celulaStyle}>
                        {formatNumero(d.criativosAdicionados.length)}
                      </td>
                    </tr>
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
  // Apenas consulta de leitura na coluna pública — a coluna `access_token`
  // segue protegida por RLS (só service_role), então não vaza credenciais.
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

/* ============ Componentes inline ============ */

function StatusConexao({ conexao }: { conexao: ConexaoMeta | null }) {
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
    >
      <Bolinha cor="var(--success)" pulse />
      Sentinela conectado · {conexao.ad_account_id}
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

function IconeCifrao() {
  return <span style={{ fontSize: 14, fontWeight: 700 }}>$</span>
}

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

function IconeContrato() {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <polyline points="9 15 11 17 15 13" />
    </svg>
  )
}

function IconeTicket() {
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
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
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
