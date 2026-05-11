import SeletorPeriodo from "@/components/SeletorPeriodo"
import KPICard from "@/components/ui/KPICard"
import GraficoHub from "@/components/GraficoHub"
import {
  MESES,
  type Mes,
  type Ano,
  anoValido,
  anoTemProjecao,
  formatBRL,
  getResumoGrupo,
  mesValido,
  metaAcumuladaAteHoje,
} from "@/lib/data"
import {
  getDadosReaisDoMes,
  getFaturamentoMensalHub,
} from "@/lib/dados-reais"
import { listarEmpresas } from "@/lib/empresas-actions"
import { getOverridesTodasEmpresasMes } from "@/lib/metas-empresa"

type StatusKPI = "success" | "warning" | "danger" | "neutral"

function statusMeta(
  real: number,
  metaTotal: number,
  temReal: boolean,
  mes: Mes,
  ano: Ano,
  temProjecao: boolean
): StatusKPI {
  if (!temReal || !temProjecao || metaTotal === 0) return "neutral"
  if (real >= metaTotal) return "success"
  const acumulada = metaAcumuladaAteHoje(metaTotal, mes, ano)
  if (real >= acumulada) return "success"
  if (real >= acumulada * 0.8) return "warning"
  return "danger"
}

/** Cifrão (mantém o que já estava). */
function IconeCifrao() {
  return <span style={{ fontSize: 14, fontWeight: 700 }}>$</span>
}

/** Megafone — ícone semântico de Investimento em ADS (publicidade). */
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

/** Alvo (target) — ícone semântico de % da meta. */
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

function mesAnterior(mes: Mes): Mes | null {
  const idx = MESES.indexOf(mes)
  if (idx <= 0) return null
  return MESES[idx - 1]
}

function somarFaturamento(
  reaisDoMes: Awaited<ReturnType<typeof getDadosReaisDoMes>>
): { soma: number; tem: boolean } {
  let soma = 0
  let tem = false
  for (const bucket of reaisDoMes.values()) {
    for (const d of [bucket.pago, bucket.organico]) {
      if (!d) continue
      if (d.faturamento_real !== null && d.faturamento_real !== undefined) {
        soma += d.faturamento_real
        tem = true
      }
    }
  }
  return { soma, tem }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  // Auth guard já é feito no layout (app/dashboard/layout.tsx).
  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const temProjecao = anoTemProjecao(ano)
  const mesPrev = mesAnterior(mes)

  const [
    reaisDoMes,
    reaisMesAnterior,
    empresas,
    overridesMes,
    faturamentoMensal,
  ] = await Promise.all([
    getDadosReaisDoMes(mes, ano),
    mesPrev ? getDadosReaisDoMes(mesPrev, ano) : Promise.resolve(new Map()),
    listarEmpresas(true),
    getOverridesTodasEmpresasMes(mes, ano),
    getFaturamentoMensalHub(ano),
  ])
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)

  const { soma: somaFat, tem: temFat } = somarFaturamento(reaisDoMes)
  let somaInv = 0
  let temInv = false
  for (const bucket of reaisDoMes.values()) {
    if (
      bucket.pago?.investimento_real !== null &&
      bucket.pago?.investimento_real !== undefined
    ) {
      somaInv += bucket.pago.investimento_real
      temInv = true
    }
  }

  const { soma: somaFatPrev, tem: temFatPrev } = somarFaturamento(reaisMesAnterior)
  const podeCalcularDelta = !!mesPrev && temFat && temFatPrev && somaFatPrev > 0
  const deltaPct = podeCalcularDelta
    ? ((somaFat - somaFatPrev) / somaFatPrev) * 100
    : null

  const pctMeta =
    temProjecao && temFat && resumo.faturamento > 0
      ? (somaFat / resumo.faturamento) * 100
      : 0
  const statusFat = statusMeta(
    somaFat,
    resumo.faturamento,
    temFat,
    mes,
    ano,
    temProjecao
  )
  const statusInv = statusMeta(
    somaInv,
    resumo.investimento,
    temInv,
    mes,
    ano,
    temProjecao
  )

  // Status do ícone (verde/vermelho/neutro) por KPI. Critério:
  // real >= meta acumulada até hoje → success; abaixo → danger.
  // Sem dados ou sem projeção → neutral. Mais rigoroso que statusMeta
  // (que aceita warning ~80% como "intermediário").
  const metaAcumuladaFat = temProjecao
    ? metaAcumuladaAteHoje(resumo.faturamento, mes, ano)
    : 0
  const metaAcumuladaInv = temProjecao
    ? metaAcumuladaAteHoje(resumo.investimento, mes, ano)
    : 0
  const iconStatusFat: "success" | "danger" | "neutral" =
    !temFat || !temProjecao
      ? "neutral"
      : somaFat >= metaAcumuladaFat
      ? "success"
      : "danger"
  const iconStatusInv: "success" | "danger" | "neutral" =
    !temInv || !temProjecao
      ? "neutral"
      : somaInv >= metaAcumuladaInv
      ? "success"
      : "danger"
  const iconStatusPctMeta: "success" | "danger" | "neutral" =
    !temFat || !temProjecao
      ? "neutral"
      : somaFat >= metaAcumuladaFat
      ? "success"
      : "danger"

  const deltaInfo = (() => {
    if (deltaPct === null || !mesPrev) return undefined
    const positivo = deltaPct >= 0
    const seta = positivo ? "↑" : "↓"
    const abs = Math.abs(deltaPct)
    return {
      texto: `${seta} ${abs.toFixed(1)}% vs ${mesPrev}`,
      status: positivo ? ("success" as const) : ("danger" as const),
    }
  })()

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-10"
        style={{ maxWidth: 1280 }}
      >
        {/* Hero */}
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-3)",
              letterSpacing: "0.01em",
            }}
          >
            Visão geral
          </p>
          <h1 style={{ marginTop: 6, fontSize: 36 }}>
            Anômalo Hub · {mes} {ano}
          </h1>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <p
              style={{
                fontSize: 14,
                color: "var(--text-3)",
              }}
            >
              {empresas.length}{" "}
              {empresas.length === 1 ? "empresa ativa" : "empresas ativas"}
              {" · "}
              <span style={{ color: "var(--text-2)" }}>
                Atualmente {mes} {ano}
              </span>
              {temProjecao
                ? ""
                : " · planejamento futuro, sem projeção definida"}
            </p>
            <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
          </div>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {/* Faixa principal:
         *   Esquerda (50%)
         *     ┌ Faturamento do Hub (full width)
         *     └ Investimento em ADS | % da meta total (50/50)
         *   Direita (50%) — Gráfico
         */}
        <section
          className="grid grid-cols-1 lg:grid-cols-2"
          style={{ gap: 20, alignItems: "stretch" }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <KPICard
              label={`Faturamento do Hub de ${mes}`}
              valor={formatBRL(somaFat)}
              icon={<IconeCifrao />}
              iconStatus={iconStatusFat}
              destaque
              semDados={!temFat}
              delta={deltaInfo}
              meta={
                temProjecao && resumo.faturamento > 0
                  ? formatBRL(resumo.faturamento)
                  : undefined
              }
            />
            <div
              className="grid grid-cols-1 sm:grid-cols-2"
              style={{ gap: 16, flex: 1 }}
            >
              <KPICard
                label="Investimento em ADS"
                valor={formatBRL(somaInv)}
                icon={<IconeMegafone />}
                iconStatus={iconStatusInv}
                semDados={!temInv}
                delta={
                  temInv && temProjecao && resumo.investimento > 0
                    ? {
                        texto: `${Math.round(
                          (somaInv / resumo.investimento) * 100
                        )}% do previsto`,
                        status:
                          statusInv === "neutral" ? "neutral" : statusInv,
                      }
                    : undefined
                }
                progresso={
                  temInv && temProjecao && resumo.investimento > 0
                    ? {
                        pct: Math.min(
                          100,
                          Math.round((somaInv / resumo.investimento) * 100)
                        ),
                        status:
                          statusInv === "neutral" ? "neutral" : statusInv,
                      }
                    : undefined
                }
                meta={
                  temProjecao && resumo.investimento > 0
                    ? formatBRL(resumo.investimento)
                    : undefined
                }
              />
              <KPICard
                label="% da meta total"
                valor={
                  temFat && resumo.faturamento > 0
                    ? `${pctMeta.toFixed(1)}%`
                    : "—"
                }
                icon={<IconeAlvo />}
                iconStatus={iconStatusPctMeta}
                semDados={!temFat || !temProjecao}
                semDadosTexto={
                  !temProjecao
                    ? "Sem projeção definida"
                    : "Sem dados reais inseridos"
                }
                progresso={
                  temFat && temProjecao && resumo.faturamento > 0
                    ? {
                        pct: pctMeta,
                        status:
                          statusFat === "neutral" ? "neutral" : statusFat,
                      }
                    : undefined
                }
                meta={
                  temProjecao && resumo.faturamento > 0
                    ? formatBRL(resumo.faturamento)
                    : undefined
                }
              />
            </div>
          </div>
          <GraficoHub dados={faturamentoMensal} ano={ano} />
        </section>
      </main>

      <footer
        className="mx-auto px-8 py-8 text-center"
        style={{ maxWidth: 1280 }}
      >
        <p
          style={{
            fontSize: 11,
            color: "var(--text-4)",
            fontWeight: 400,
          }}
        >
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}
