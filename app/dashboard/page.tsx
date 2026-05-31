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
  formatNumero,
  getResumoGrupo,
  mesValido,
  metaAcumuladaAteHoje,
} from "@/lib/data"
import {
  getFaturamentoMensalHubFromLogs,
  getResumoMensalPorEmpresa,
  type ResumoEmpresaMes,
} from "@/lib/sentinela"
import { listarEmpresas } from "@/lib/empresas-actions"
import { getOverridesTodasEmpresasMes } from "@/lib/metas-empresa"
import { requererPermissao } from "@/lib/auth"

// Página dinâmica: força SSR sem Data Cache. Necessário porque trocar
// mês/ano pelo SeletorPeriodo precisa sempre buscar dados frescos do
// Supabase (o cache de fetch do Next 14 reaproveitava respostas e dava
// desconfiguração ao alternar entre meses).
export const dynamic = "force-dynamic"

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

/** Ticket — ícone semântico do ticket médio (recibo/etiqueta). */
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
  resumos: Map<string, ResumoEmpresaMes>,
  empresas: { nome: string }[]
): { soma: number; tem: boolean } {
  let soma = 0
  let tem = false
  for (const empresa of empresas) {
    const r = resumos.get(empresa.nome)
    if (r && r.faturamento > 0) {
      soma += r.faturamento
      tem = true
    }
  }
  return { soma, tem }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  // RBAC: exige dashboard_principal. Sem auth → /login; sem permissão
  // → rota padrão do usuário (gestor cai em /dashboard/trafego, por ex).
  await requererPermissao("dashboard_principal")

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const temProjecao = anoTemProjecao(ano)
  const mesPrev = mesAnterior(mes)

  // Fonte unificada do dashboard: dados_diarios_log agregado por
  // empresa (lib/sentinela). origem=pago em todas as 3 pages do
  // dashboard (overview, /empresas, /[empresa]) — decisão consistente
  // com o painel de tráfego pago. Orgânico fica restrito ao detalhe
  // de empresa via ToggleOrigem (página individual).
  // Empresas é buscado primeiro porque seu output (nomes ativos)
  // restringe getFaturamentoMensalHubFromLogs — evita o gráfico
  // somar histórico de empresas removidas.
  const empresas = await listarEmpresas(true)
  const nomesAtivos = empresas.map((e) => e.nome)
  const [
    resumoAtual,
    resumoAnterior,
    overridesMes,
    faturamentoMensal,
  ] = await Promise.all([
    getResumoMensalPorEmpresa(mes, ano, "pago"),
    mesPrev
      ? getResumoMensalPorEmpresa(mesPrev, ano, "pago")
      : Promise.resolve(new Map<string, ResumoEmpresaMes>()),
    getOverridesTodasEmpresasMes(mes, ano),
    getFaturamentoMensalHubFromLogs(ano, "pago", nomesAtivos),
  ])
  const resumo = getResumoGrupo(mes, ano, empresas, overridesMes)

  // Agregação restrita a empresas ativas (listarEmpresas(true)). Iterar
  // direto sobre resumoAtual.values() vazaria empresas removidas que
  // ainda têm linhas em dados_diarios_log (ex.: tokens_meta ativos sem
  // empresa correspondente em empresas_config). Mesmo padrão do
  // /dashboard/trafego.
  const { soma: somaFat, tem: temFat } = somarFaturamento(resumoAtual, empresas)
  let somaInv = 0
  let temInv = false
  let somaContratos = 0
  let temContratos = false
  for (const empresa of empresas) {
    const r = resumoAtual.get(empresa.nome)
    if (!r) continue
    if (r.investimento > 0) {
      somaInv += r.investimento
      temInv = true
    }
    if (r.contratos > 0) {
      somaContratos += r.contratos
      temContratos = true
    }
  }

  // Ticket médio: faturamento total do Hub / total de contratos fechados.
  const temTicket = temFat && temContratos && somaContratos > 0
  const ticketMedioReal = temTicket ? somaFat / somaContratos : 0
  // Meta projetada do ticket médio: meta de faturamento / meta de contratos.
  const ticketMedioMeta =
    temProjecao && resumo.contratos > 0
      ? resumo.faturamento / resumo.contratos
      : 0

  const { soma: somaFatPrev, tem: temFatPrev } = somarFaturamento(
    resumoAnterior,
    empresas
  )
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
  const iconStatusTicket: "success" | "danger" | "neutral" =
    !temTicket || !temProjecao || ticketMedioMeta === 0
      ? "neutral"
      : ticketMedioReal >= ticketMedioMeta
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
                    : "·"
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
            <KPICard
              label="Ticket médio"
              valor={temTicket ? formatBRL(ticketMedioReal) : "·"}
              icon={<IconeTicket />}
              iconStatus={iconStatusTicket}
              semDados={!temTicket}
              semDadosTexto={
                !temFat
                  ? "Sem faturamento inserido"
                  : "Sem contratos fechados no mês"
              }
              delta={
                temTicket
                  ? {
                      texto: `${formatNumero(somaContratos)} ${
                        somaContratos === 1
                          ? "contrato fechado"
                          : "contratos fechados"
                      }`,
                      status: "neutral",
                    }
                  : undefined
              }
              meta={
                temProjecao && ticketMedioMeta > 0
                  ? formatBRL(ticketMedioMeta)
                  : undefined
              }
            />
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
