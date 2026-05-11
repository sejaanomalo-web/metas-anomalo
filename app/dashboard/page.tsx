import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import KPICard from "@/components/ui/KPICard"
import GraficoHub from "@/components/GraficoHub"
import SidebarDashboard from "@/components/SidebarDashboard"
import { estaAutenticado } from "@/lib/auth"
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
import {
  listarEmpresas,
  listarEmpresasInativas,
} from "@/lib/empresas-actions"
import { getOverridesTodasEmpresasMes } from "@/lib/metas-empresa"
import { supabaseConfigurado } from "@/lib/supabase"

type StatusKPI = "success" | "warning" | "danger" | "neutral"

/**
 * Status semântico baseado em real vs meta acumulada até hoje.
 * - success: bateu a meta total OU está acima da acumulada
 * - warning: está atrás mas dentro de 80% da acumulada
 * - danger: abaixo de 80% da acumulada
 */
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

/**
 * Mês imediatamente anterior ao informado, dentro do mesmo ano.
 * Como MESES começa em Abril, retorna null quando mes=Abril (não há
 * Março comparável no nosso sistema). Ano permanece igual: a comparação
 * cross-year não é suportada porque os meses Janeiro–Março não existem
 * em nossa planilha.
 */
function mesAnterior(mes: Mes): Mes | null {
  const idx = MESES.indexOf(mes)
  if (idx <= 0) return null
  return MESES[idx - 1]
}

/**
 * Soma faturamento (pago + orgânico) de todos os buckets do
 * `getDadosReaisDoMes` num único valor. Devolve { soma, tem }.
 */
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
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const temProjecao = anoTemProjecao(ano)
  const mesPrev = mesAnterior(mes)

  // Busca em paralelo: dados do mês atual, mês anterior (pra delta),
  // overrides, lista de empresas e série mensal pro gráfico.
  const [
    reaisDoMes,
    reaisMesAnterior,
    empresas,
    empresasInativas,
    overridesMes,
    faturamentoMensal,
  ] = await Promise.all([
    getDadosReaisDoMes(mes, ano),
    mesPrev ? getDadosReaisDoMes(mesPrev, ano) : Promise.resolve(new Map()),
    listarEmpresas(true),
    listarEmpresasInativas(),
    getOverridesTodasEmpresasMes(mes, ano),
    getFaturamentoMensalHub(ano),
  ])
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)
  const supabaseOk = supabaseConfigurado()

  // Agregações do mês atual (pago + orgânico no faturamento; só pago
  // em investimento — orgânico não tem verba por definição).
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

  // Faturamento do mês anterior (pra delta % do KPI principal).
  const { soma: somaFatPrev, tem: temFatPrev } = somarFaturamento(reaisMesAnterior)
  const podeCalcularDelta = !!mesPrev && temFat && temFatPrev && somaFatPrev > 0
  const deltaPct = podeCalcularDelta
    ? ((somaFat - somaFatPrev) / somaFatPrev) * 100
    : null

  // % da meta total (KPI 3).
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

  // Texto do delta vs mês anterior, formatado com seta + cor semântica.
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
      <Header>
        <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
      </Header>

      <div
        className="max-w-7xl mx-auto px-6 py-10 flex flex-col lg:flex-row"
        style={{ gap: 24, alignItems: "flex-start" }}
      >
        <SidebarDashboard
          empresas={empresas}
          empresasInativas={empresasInativas}
          supabaseOk={supabaseOk}
          mes={mes}
          ano={ano}
        />

        <main style={{ flex: 1, minWidth: 0 }} className="space-y-8">
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
            <h1 style={{ marginTop: 6 }}>
              Hub Anômalo · {mes} {ano}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-3)",
                marginTop: 8,
              }}
            >
              {empresas.length}{" "}
              {empresas.length === 1 ? "empresa ativa" : "empresas ativas"}
              {temProjecao
                ? ""
                : " · planejamento futuro, sem projeção definida"}
            </p>
          </div>

          {/* Faixa principal de KPIs (3 cards proporcionais) */}
          <section
            className="grid grid-cols-1 sm:grid-cols-3"
            style={{ gap: 16 }}
          >
            <KPICard
              label={`Faturamento do Hub de ${mes}`}
              valor={formatBRL(somaFat)}
              icon="$"
              iconStatus="success"
              destaque
              semDados={!temFat}
              delta={deltaInfo}
            />
            <KPICard
              label="Investimento em ADS"
              valor={formatBRL(somaInv)}
              icon="▲"
              iconStatus="neutral"
              semDados={!temInv}
              delta={
                temInv && temProjecao && resumo.investimento > 0
                  ? {
                      texto: `${Math.round(
                        (somaInv / resumo.investimento) * 100
                      )}% do previsto · ${formatBRL(resumo.investimento)}`,
                      status: statusInv === "neutral" ? "neutral" : statusInv,
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
                      status: statusInv === "neutral" ? "neutral" : statusInv,
                    }
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
              icon="◎"
              iconStatus={statusFat === "neutral" ? "neutral" : statusFat}
              semDados={!temFat || !temProjecao}
              semDadosTexto={
                !temProjecao
                  ? "Sem projeção definida"
                  : "Sem dados reais inseridos"
              }
              delta={
                temFat && temProjecao && resumo.faturamento > 0
                  ? {
                      texto: `Meta total: ${formatBRL(resumo.faturamento)}`,
                      status: statusFat === "neutral" ? "neutral" : statusFat,
                    }
                  : undefined
              }
              progresso={
                temFat && temProjecao && resumo.faturamento > 0
                  ? {
                      pct: pctMeta,
                      status: statusFat === "neutral" ? "neutral" : statusFat,
                    }
                  : undefined
              }
            />
          </section>

          {/* Gráfico principal de faturamento mensal */}
          <section>
            <GraficoHub dados={faturamentoMensal} ano={ano} />
          </section>
        </main>
      </div>

      <footer className="max-w-7xl mx-auto px-6 py-8 text-center">
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
