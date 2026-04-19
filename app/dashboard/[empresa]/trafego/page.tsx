import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import OutrasPlataformas from "@/components/OutrasPlataformas"
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
  contaMetaDaEmpresa,
  metaTokenDisponivel,
} from "@/lib/meta-accounts"
import {
  insightsDaCampanha,
  listarCampanhas,
  type InsightsCampanha,
  type Periodo,
} from "@/lib/meta-campaigns"

const PERIODOS: { chave: Periodo; label: string }[] = [
  { chave: "hoje", label: "Hoje" },
  { chave: "7_dias", label: "7 dias" },
  { chave: "mes_atual", label: "Este mês" },
  { chave: "mes_anterior", label: "Mês anterior" },
]

function periodoValido(p: string | undefined): Periodo {
  const valido = PERIODOS.find((x) => x.chave === p)
  return valido?.chave ?? "mes_atual"
}

export default async function TrafegoPage({
  params,
  searchParams,
}: {
  params: { empresa: string }
  searchParams: { mes?: string; ano?: string; periodo?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) notFound()

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const periodo = periodoValido(searchParams?.periodo)

  const conta = contaMetaDaEmpresa(empresa.db)
  const temToken = metaTokenDisponivel()

  let mensagemErro: string | null = null
  let campanhas: {
    id: string
    nome: string
    status: string
    objetivo: string
    orcamentoDiario?: number
    insights?: InsightsCampanha
  }[] = []
  let resumo: InsightsCampanha = {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    ctr: 0,
    leads: 0,
    cpl: null,
  }

  if (!temToken) {
    mensagemErro =
      "META_ACCESS_TOKEN ausente — defina a variável no Vercel para conectar à Meta Ads."
  } else if (!conta) {
    mensagemErro =
      "Conta Meta não configurada para esta empresa. Edite lib/meta-accounts.ts."
  } else {
    const { data, erro } = await listarCampanhas(empresa.db)
    if (erro) {
      mensagemErro = erro.mensagem
    } else if (data && data.length > 0) {
      const comInsights = await Promise.all(
        data.slice(0, 30).map(async (c) => {
          const { data: ins } = await insightsDaCampanha(c.id, periodo)
          return { ...c, insights: ins }
        })
      )
      campanhas = comInsights
      for (const c of comInsights) {
        if (c.insights) {
          resumo.spend += c.insights.spend
          resumo.impressions += c.insights.impressions
          resumo.reach += c.insights.reach
          resumo.clicks += c.insights.clicks
          resumo.leads += c.insights.leads
        }
      }
      resumo.ctr =
        resumo.impressions > 0
          ? Number(((resumo.clicks / resumo.impressions) * 100).toFixed(2))
          : 0
      resumo.cpl =
        resumo.leads > 0
          ? Number((resumo.spend / resumo.leads).toFixed(2))
          : null
    }
  }

  return (
    <>
      <Header>
        <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div>
          <Link
            href={`/dashboard/${empresa.slug}?mes=${mes}&ano=${ano}`}
            style={{
              fontSize: 10,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.3)",
              fontWeight: 500,
            }}
            className="hover:text-[#C9953A] transition"
          >
            ← {empresa.nome}
          </Link>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.5px",
              lineHeight: 1.1,
              marginTop: 14,
            }}
          >
            Tráfego — {empresa.nome}
          </h1>
          <div
            className="gold-divider"
            style={{ marginTop: 10, marginBottom: 10 }}
          />
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 300,
            }}
          >
            {subtituloDaEmpresa(empresa)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <TabPlataforma ativa label="Meta Ads" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {PERIODOS.map((p) => (
            <Link
              key={p.chave}
              href={`/dashboard/${empresa.slug}/trafego?mes=${mes}&ano=${ano}&periodo=${p.chave}`}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.3px",
                background:
                  p.chave === periodo
                    ? "rgba(201,149,58,0.15)"
                    : "transparent",
                border: `0.5px solid ${
                  p.chave === periodo ? "#C9953A" : "rgba(255,255,255,0.1)"
                }`,
                color: p.chave === periodo ? "#C9953A" : "rgba(255,255,255,0.45)",
                transition: "background 0.15s ease",
              }}
            >
              {p.label}
            </Link>
          ))}
        </div>

        {mensagemErro && (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              border: "0.5px solid rgba(226,75,74,0.35)",
              background: "rgba(226,75,74,0.08)",
              color: "#e24b4a",
              fontSize: 12,
              fontWeight: 400,
            }}
          >
            {mensagemErro}
          </div>
        )}

        <section
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
          style={{ gap: 10 }}
        >
          <CardResumo label="Investimento" valor={formatBRL(resumo.spend)} />
          <CardResumo label="Leads" valor={formatNumero(resumo.leads)} />
          <CardResumo
            label="CPL"
            valor={resumo.cpl !== null ? formatBRL(resumo.cpl) : "—"}
          />
          <CardResumo label="Alcance" valor={formatNumero(resumo.reach)} />
          <CardResumo
            label="Impressões"
            valor={formatNumero(resumo.impressions)}
          />
          <CardResumo label="CTR" valor={`${resumo.ctr}%`} />
        </section>

        <section className="glass" style={{ padding: 24 }}>
          <p
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              fontWeight: 500,
              marginBottom: 16,
            }}
          >
            Campanhas
          </p>

          {campanhas.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.3)",
                fontStyle: "italic",
                fontWeight: 300,
              }}
            >
              {mensagemErro
                ? "—"
                : "Nenhuma campanha encontrada no período."}
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
                      "Nome",
                      "Status",
                      "Objetivo",
                      "Orçamento/dia",
                      "Investimento",
                      "Leads",
                      "CPL",
                      "Alcance",
                      "CTR",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          fontSize: 9,
                          letterSpacing: "2px",
                          color: "rgba(255,255,255,0.3)",
                          textTransform: "uppercase",
                          fontWeight: 500,
                          textAlign: "left",
                          padding: "10px 14px",
                          borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campanhas.map((c) => (
                    <tr key={c.id}>
                      <td
                        style={{
                          fontSize: 13,
                          color: "#fff",
                          fontWeight: 500,
                          padding: "12px 14px",
                          borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        {c.nome}
                      </td>
                      <td style={celulaStyle}>
                        <BadgeStatus status={c.status} />
                      </td>
                      <td style={celulaStyle}>{c.objetivo || "—"}</td>
                      <td style={celulaStyle}>
                        {c.orcamentoDiario
                          ? formatBRL(c.orcamentoDiario)
                          : "—"}
                      </td>
                      <td style={celulaStyle}>
                        {c.insights ? formatBRL(c.insights.spend) : "—"}
                      </td>
                      <td style={celulaStyle}>
                        {c.insights ? formatNumero(c.insights.leads) : "—"}
                      </td>
                      <td style={celulaStyle}>
                        {c.insights?.cpl !== null && c.insights
                          ? formatBRL(c.insights.cpl)
                          : "—"}
                      </td>
                      <td style={celulaStyle}>
                        {c.insights ? formatNumero(c.insights.reach) : "—"}
                      </td>
                      <td style={celulaStyle}>
                        {c.insights ? `${c.insights.ctr}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <OutrasPlataformas />
          </div>
        </section>
      </main>
    </>
  )
}

const celulaStyle: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(255,255,255,0.7)",
  fontWeight: 400,
  padding: "12px 14px",
  borderBottom: "0.5px solid rgba(255,255,255,0.04)",
  whiteSpace: "nowrap",
}

function BadgeStatus({ status }: { status: string }) {
  const ativa = status === "ACTIVE"
  const cor = ativa ? "#4caf50" : "#C9953A"
  const label = ativa ? "Ativa" : "Pausada"
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: "1px",
        color: cor,
        background: `${cor}22`,
        border: `0.5px solid ${cor}66`,
        borderRadius: 999,
        padding: "2px 10px",
        fontWeight: 500,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  )
}

function TabPlataforma({ label, ativa }: { label: string; ativa?: boolean }) {
  const cor = ativa ? "#C9953A" : "rgba(255,255,255,0.25)"
  return (
    <span
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.3px",
        background: ativa ? "rgba(201,149,58,0.12)" : "transparent",
        border: `0.5px solid ${ativa ? "#C9953A55" : "rgba(255,255,255,0.08)"}`,
        color: cor,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: ativa ? "default" : "not-allowed",
      }}
    >
      {label}
      {!ativa && (
        <span
          style={{
            fontSize: 8,
            letterSpacing: "1px",
            textTransform: "uppercase",
            background: "rgba(255,255,255,0.06)",
            padding: "2px 6px",
            borderRadius: 999,
            color: "rgba(255,255,255,0.35)",
          }}
        >
          Em breve
        </span>
      )}
    </span>
  )
}

function CardResumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="glass" style={{ padding: "14px 18px" }}>
      <p
        style={{
          fontSize: 9,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 20,
          color: "#ffffff",
          fontWeight: 600,
          marginTop: 6,
          lineHeight: 1.1,
          letterSpacing: "-0.3px",
        }}
      >
        {valor}
      </p>
    </div>
  )
}
