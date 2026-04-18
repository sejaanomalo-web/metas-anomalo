import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import CardEmpresa from "@/components/CardEmpresa"
import { estaAutenticado } from "@/lib/auth"
import {
  anoValido,
  anoTemProjecao,
  corStatusMeta,
  empresas,
  formatBRL,
  formatNumero,
  getResumoGrupo,
  mesValido,
} from "@/lib/data"
import { getDadosReaisDoMes } from "@/lib/dados-reais"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const temProjecao = anoTemProjecao(ano)
  const resumo = getResumoGrupo(mes, ano)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)

  let somaFat = 0
  let somaInv = 0
  let somaLeads = 0
  let somaCri = 0
  let temFat = false
  let temInv = false
  let temLeads = false
  let temCri = false
  for (const d of reaisDoMes.values()) {
    if (d.faturamento_real !== null) {
      somaFat += d.faturamento_real
      temFat = true
    }
    if (d.investimento_real !== null) {
      somaInv += d.investimento_real
      temInv = true
    }
    if (d.leads_real !== null) {
      somaLeads += d.leads_real
      temLeads = true
    }
    if (d.criativos_entregues !== null) {
      somaCri += d.criativos_entregues
      temCri = true
    }
  }

  interface Celula {
    rotulo: string
    real: string
    meta: number
    metaLabel: string
    temReal: boolean
    somaReal: number
    tipo: "moeda" | "numero"
  }

  const celulas: Celula[] = [
    {
      rotulo: "Faturamento do Hub",
      real: formatBRL(somaFat),
      meta: resumo.faturamento,
      metaLabel: formatBRL(resumo.faturamento),
      temReal: temFat,
      somaReal: somaFat,
      tipo: "moeda",
    },
    {
      rotulo: "Total investido em ads",
      real: formatBRL(somaInv),
      meta: resumo.investimento,
      metaLabel: formatBRL(resumo.investimento),
      temReal: temInv,
      somaReal: somaInv,
      tipo: "moeda",
    },
    {
      rotulo: "Total de leads",
      real: formatNumero(somaLeads),
      meta: resumo.leads,
      metaLabel: formatNumero(resumo.leads),
      temReal: temLeads,
      somaReal: somaLeads,
      tipo: "numero",
    },
    {
      rotulo: "Criativos do mês",
      real: formatNumero(somaCri),
      meta: resumo.criativos,
      metaLabel: formatNumero(resumo.criativos),
      temReal: temCri,
      somaReal: somaCri,
      tipo: "numero",
    },
  ]

  return (
    <>
      <Header>
        <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-6">
          <div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
              }}
            >
              Visão geral do Hub
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
              {mes} de {ano} · 6 empresas
            </p>
          </div>
          <Link
            href={`/dashboard/comissionamento?mes=${mes}&ano=${ano}`}
            className="btn-gold-outline uppercase"
          >
            Comissionamento do time →
          </Link>
        </div>

        <section
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-12"
          style={{ gap: 10 }}
        >
          {celulas.map((c) => {
            const cor = temProjecao
              ? corStatusMeta(c.somaReal, c.meta, c.temReal, mes, ano)
              : "rgba(255,255,255,0.2)"
            const pct =
              c.temReal && c.meta > 0
                ? Math.min(100, Math.round((c.somaReal / c.meta) * 100))
                : 0
            return (
              <div
                key={c.rotulo}
                className="glass"
                style={{ padding: "18px 22px" }}
              >
                <p
                  style={{
                    fontSize: 9,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.4)",
                    fontWeight: 500,
                  }}
                >
                  {c.rotulo}
                </p>
                <p
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "#ffffff",
                    marginTop: 10,
                    lineHeight: 1.1,
                  }}
                >
                  {c.real}
                </p>
                {temProjecao ? (
                  <p
                    style={{
                      fontSize: 11,
                      color: cor,
                      fontWeight: 400,
                      marginTop: 6,
                    }}
                  >
                    Meta {c.metaLabel}
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.2)",
                      fontWeight: 300,
                      fontStyle: "italic",
                      marginTop: 6,
                    }}
                  >
                    Planejamento futuro — sem projeção definida
                  </p>
                )}
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: 2,
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: cor,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: cor,
                      width: 34,
                      textAlign: "right",
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
            )
          })}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-5">
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "#ffffff",
                letterSpacing: "-0.3px",
              }}
            >
              Empresas
            </h2>
            <p
              style={{
                fontSize: 10,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.3)",
                fontWeight: 500,
              }}
            >
              Clique para detalhar
            </p>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 14 }}
          >
            {empresas.map((empresa) => (
              <CardEmpresa
                key={empresa.slug}
                empresa={empresa}
                mes={mes}
                ano={ano}
                faturamentoReal={
                  reaisDoMes.get(empresa.db)?.faturamento_real ?? null
                }
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-10 text-center">
        <p
          style={{
            fontSize: 10,
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.15)",
            fontWeight: 400,
          }}
        >
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}
