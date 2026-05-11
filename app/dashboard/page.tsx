import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import CardEmpresa from "@/components/CardEmpresa"
import DrawerEmpresas from "@/components/DrawerEmpresas"
import KPICard from "@/components/ui/KPICard"
import SectionHeader from "@/components/ui/SectionHeader"
import { estaAutenticado } from "@/lib/auth"
import {
  anoValido,
  anoTemProjecao,
  formatBRL,
  formatNumero,
  getResumoGrupo,
  mesValido,
  metaAcumuladaAteHoje,
} from "@/lib/data"
import { getDadosReaisDoMes } from "@/lib/dados-reais"
import {
  listarEmpresas,
  listarEmpresasInativas,
} from "@/lib/empresas-actions"
import { getOverridesTodasEmpresasMes } from "@/lib/metas-empresa"
import { getTimeDoHub } from "@/lib/strip"
import { supabaseConfigurado } from "@/lib/supabase"

type StatusKPI = "success" | "warning" | "danger" | "neutral"

/**
 * Status semântico baseado em real vs meta acumulada até hoje.
 * - success: bateu a meta total do mês OU está acima da meta acumulada
 * - warning: está atrás mas ainda dentro de 80% da acumulada
 * - danger: abaixo de 80% da acumulada
 */
function statusMeta(
  real: number,
  metaTotal: number,
  temReal: boolean,
  mes: ReturnType<typeof mesValido>,
  ano: ReturnType<typeof anoValido>,
  temProjecao: boolean
): StatusKPI {
  if (!temReal || !temProjecao || metaTotal === 0) return "neutral"
  if (real >= metaTotal) return "success"
  const acumulada = metaAcumuladaAteHoje(metaTotal, mes, ano)
  if (real >= acumulada) return "success"
  if (real >= acumulada * 0.8) return "warning"
  return "danger"
}

function deltaTexto(
  real: number,
  metaTotal: number,
  temReal: boolean,
  temProjecao: boolean
): string | undefined {
  if (!temReal || !temProjecao || metaTotal === 0) return undefined
  const pct = Math.round((real / metaTotal) * 100)
  return `${pct}% da meta · ${formatBRL(metaTotal)}`
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

  // Faixa de KPIs principais (4 cards padronizados)
  const kpis = [
    {
      label: "Faturamento do Hub",
      valor: formatBRL(somaFat),
      icon: "$",
      iconStatus: "success" as const,
      semDados: !temFat,
      delta: deltaTexto(somaFat, resumo.faturamento, temFat, temProjecao),
      status: statusMeta(somaFat, resumo.faturamento, temFat, mes, ano, temProjecao),
      progresso:
        temProjecao && temFat && resumo.faturamento > 0
          ? Math.min(100, Math.round((somaFat / resumo.faturamento) * 100))
          : 0,
      destaque: true,
    },
    {
      label: "Investimento em ads",
      valor: formatBRL(somaInv),
      icon: "▲",
      iconStatus: "neutral" as const,
      semDados: !temInv,
      delta: deltaTexto(somaInv, resumo.investimento, temInv, temProjecao),
      status: statusMeta(somaInv, resumo.investimento, temInv, mes, ano, temProjecao),
      progresso:
        temProjecao && temInv && resumo.investimento > 0
          ? Math.min(100, Math.round((somaInv / resumo.investimento) * 100))
          : 0,
      destaque: false,
    },
    {
      label: "Total de leads",
      valor: formatNumero(somaLeads),
      icon: "◉",
      iconStatus: "neutral" as const,
      semDados: !temLeads,
      delta: deltaTexto(somaLeads, resumo.leads, temLeads, temProjecao),
      status: statusMeta(somaLeads, resumo.leads, temLeads, mes, ano, temProjecao),
      progresso:
        temProjecao && temLeads && resumo.leads > 0
          ? Math.min(100, Math.round((somaLeads / resumo.leads) * 100))
          : 0,
      destaque: false,
    },
    {
      label: "Time do Hub",
      valor: formatNumero(time.total),
      icon: "✦",
      iconStatus: "gold" as const,
      semDados: false,
      delta: time.subLabel,
      status: "neutral" as const,
      progresso: 0,
      destaque: false,
      isTime: true,
    },
  ]

  // Faixa "Progresso vs Meta" — só renderiza se temProjecao + algum real
  const metaHoje = temProjecao
    ? metaAcumuladaAteHoje(resumo.faturamento, mes, ano)
    : 0
  const pctMeta =
    temProjecao && temFat && resumo.faturamento > 0
      ? (somaFat / resumo.faturamento) * 100
      : 0
  const pctMetaHoje =
    temProjecao && temFat && metaHoje > 0 ? (somaFat / metaHoje) * 100 : 0
  const statusProgresso: StatusKPI = !temFat
    ? "neutral"
    : pctMetaHoje >= 100
    ? "success"
    : pctMetaHoje >= 80
    ? "warning"
    : "danger"

  return (
    <>
      <Header>
        <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
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
          <h1 style={{ marginTop: 6 }}>Hub Anômalo · {mes} {ano}</h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 8,
            }}
          >
            {empresas.length} {empresas.length === 1 ? "empresa ativa" : "empresas ativas"}
            {temProjecao ? "" : " · planejamento futuro, sem projeção definida"}
          </p>
        </div>

        {/* Faixa principal de KPIs */}
        <section
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          style={{ gap: 16 }}
        >
          {kpis.map((k) => (
            <KPICard
              key={k.label}
              label={k.label}
              valor={k.valor}
              icon={k.icon}
              iconStatus={k.iconStatus}
              destaque={k.destaque}
              semDados={k.semDados}
              delta={
                k.delta
                  ? {
                      texto: k.delta,
                      status:
                        k.status === "neutral" ? "neutral" : k.status,
                    }
                  : undefined
              }
              progresso={
                k.isTime || !temProjecao
                  ? undefined
                  : {
                      pct: k.progresso,
                      status:
                        k.status === "neutral" ? "neutral" : k.status,
                    }
              }
            />
          ))}
        </section>

        {/* Faixa Progresso vs Meta — só com projeção */}
        {temProjecao && (
          <section
            className="grid grid-cols-1 md:grid-cols-3"
            style={{ gap: 16 }}
          >
            <KPICard
              label="Meta acumulada hoje"
              valor={formatBRL(metaHoje)}
              icon="◷"
              iconStatus="neutral"
            />
            <KPICard
              label="Faturado no mês"
              valor={formatBRL(somaFat)}
              icon="$"
              iconStatus={statusProgresso === "neutral" ? "neutral" : statusProgresso}
              semDados={!temFat}
              delta={
                temFat && metaHoje > 0
                  ? {
                      texto: `${Math.round(pctMetaHoje)}% da meta acumulada`,
                      status: statusProgresso === "neutral" ? "neutral" : statusProgresso,
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
              iconStatus={statusProgresso === "neutral" ? "neutral" : statusProgresso}
              semDados={!temFat}
              progresso={
                temFat && resumo.faturamento > 0
                  ? {
                      pct: pctMeta,
                      status: statusProgresso === "neutral" ? "neutral" : statusProgresso,
                    }
                  : undefined
              }
            />
          </section>
        )}

        {/* Empresas */}
        <section>
          <SectionHeader
            titulo="Empresas"
            descricao="Clique em um card para detalhar funil, metas e gráficos"
            acao={
              <>
                <DrawerEmpresas
                  empresas={empresas}
                  empresasInativas={empresasInativas}
                  supabaseOk={supabaseOk}
                />
                <Link
                  href="/dashboard/preenchedores"
                  className="btn-gold-filled"
                >
                  Formulários diários
                </Link>
                <Link
                  href={`/dashboard/comissionamento?mes=${mes}&ano=${ano}`}
                  className="btn-gold-filled"
                >
                  Comissionamento
                </Link>
              </>
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
                — clique em <strong>Gerenciar empresas</strong> acima.
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
