import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import CardEmpresa from "@/components/CardEmpresa"
import DrawerEmpresas from "@/components/DrawerEmpresas"
import { estaAutenticado } from "@/lib/auth"
import {
  anoValido,
  anoTemProjecao,
  corStatusMeta,
  formatBRL,
  formatNumero,
  getResumoGrupo,
  mesValido,
} from "@/lib/data"
import { getDadosReaisDoMes } from "@/lib/dados-reais"
import {
  listarEmpresas,
  listarEmpresasInativas,
} from "@/lib/empresas-actions"
import { getOverridesTodasEmpresasMes } from "@/lib/metas-empresa"
import { getTimeDoHub } from "@/lib/strip"
import { supabaseConfigurado } from "@/lib/supabase"

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
  const [reaisDoMes, time, empresas, empresasInativas, overridesMes] =
    await Promise.all([
      getDadosReaisDoMes(mes, ano),
      getTimeDoHub(),
      listarEmpresas(true),
      listarEmpresasInativas(),
      getOverridesTodasEmpresasMes(mes, ano),
    ])
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)
  const supabaseOk = supabaseConfigurado()

  // Agregações do Hub:
  // - Investimento em ads → só 'pago' (orgânico por definição não tem verba)
  // - Leads e faturamento → soma 'pago' + 'organico' (o Hub vê o total)
  let somaFat = 0
  let somaInv = 0
  let somaLeads = 0
  let temFat = false
  let temInv = false
  let temLeads = false
  for (const bucket of reaisDoMes.values()) {
    const { pago, organico } = bucket
    if (pago?.investimento_real !== null && pago?.investimento_real !== undefined) {
      somaInv += pago.investimento_real
      temInv = true
    }
    for (const d of [pago, organico]) {
      if (!d) continue
      if (d.faturamento_real !== null) {
        somaFat += d.faturamento_real
        temFat = true
      }
      if (d.leads_real !== null) {
        somaLeads += d.leads_real
        temLeads = true
      }
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
    semMeta?: boolean
    subLabel?: string
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
      rotulo: "Time do hub",
      real: formatNumero(time.total),
      meta: 0,
      metaLabel: "",
      temReal: true,
      somaReal: time.total,
      tipo: "numero",
      semMeta: true,
      subLabel: time.subLabel,
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
              {mes} de {ano} · {empresas.length}{" "}
              {empresas.length === 1 ? "empresa" : "empresas"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <DrawerEmpresas
              empresas={empresas}
              empresasInativas={empresasInativas}
              supabaseOk={supabaseOk}
            />
            <Link
              href="/dashboard/preenchedores"
              className="btn-gold-filled uppercase"
            >
              Formulários diários →
            </Link>
            <Link
              href={`/dashboard/comissionamento?mes=${mes}&ano=${ano}`}
              className="btn-gold-filled uppercase"
            >
              Comissionamento do time →
            </Link>
          </div>
        </div>

        <section
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-12"
          style={{ gap: 14 }}
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
                style={{ padding: "24px 28px" }}
              >
                <p
                  style={{
                    fontSize: 10,
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
                    fontSize: 34,
                    fontWeight: 700,
                    color: "#ffffff",
                    marginTop: 10,
                    lineHeight: 1.1,
                  }}
                >
                  {c.real}
                </p>
                {c.semMeta ? (
                  <p
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.45)",
                      fontWeight: 300,
                      marginTop: 6,
                    }}
                  >
                    {c.subLabel}
                  </p>
                ) : (
                  <>
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
                  </>
                )}
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
            style={{ gap: 20 }}
          >
            {empresas.map((empresa) => {
              const bucket = reaisDoMes.get(empresa.db)
              const pago = bucket?.pago ?? null
              const organico = bucket?.organico ?? null
              const faturamentoSoma =
                (pago?.faturamento_real ?? 0) +
                (organico?.faturamento_real ?? 0)
              const faturamentoReal =
                pago?.faturamento_real === null &&
                organico?.faturamento_real === null
                  ? null
                  : pago?.faturamento_real !== undefined ||
                    organico?.faturamento_real !== undefined
                  ? faturamentoSoma
                  : null
              return (
                <CardEmpresa
                  key={empresa.slug}
                  empresa={empresa}
                  mes={mes}
                  ano={ano}
                  faturamentoReal={faturamentoReal}
                  investimentoReal={pago?.investimento_real ?? null}
                  override={overridesMes.get(empresa.db)}
                />
              )
            })}
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
