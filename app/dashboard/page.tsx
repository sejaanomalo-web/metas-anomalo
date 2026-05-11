import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import KPICard from "@/components/ui/KPICard"
import SectionHeader from "@/components/ui/SectionHeader"
import GraficoHub from "@/components/GraficoHub"
import CardEmpresa from "@/components/CardEmpresa"
import DrawerEmpresas from "@/components/DrawerEmpresas"
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

      <main
        className="mx-auto px-8 py-12 space-y-10"
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
          style={{ gap: 20 }}
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

        {/* Empresas do Hub — grid de cards */}
        <section id="empresas" style={{ scrollMarginTop: 80 }}>
          <SectionHeader
            titulo="Empresas do Hub"
            descricao="Clique em um card para detalhar funil, metas e gráficos"
            acao={
              <DrawerEmpresas
                empresas={empresas}
                empresasInativas={empresasInativas}
                supabaseOk={supabaseOk}
              />
            }
          />

          {empresas.length === 0 && (
            <div
              className="glass"
              style={{
                padding: "32px 28px",
                textAlign: "center",
                borderStyle: "dashed",
                borderColor: "rgba(201,149,58,0.35)",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-2)",
                  fontWeight: 400,
                  marginBottom: 0,
                  lineHeight: 1.5,
                }}
              >
                Nenhuma empresa cadastrada ainda. Comece criando sua primeira
                — clique em <strong>Gerenciar empresas</strong>.
              </p>
            </div>
          )}

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 16 }}
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
