import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import CenarioReal from "@/components/CenarioReal"
import DrawerEditarMeta from "@/components/DrawerEditarMeta"
import GraficoFaturamento from "@/components/GraficoFaturamento"
import TabelaMeses from "@/components/TabelaMeses"
import ToggleOrigem from "@/components/ToggleOrigem"
import TabsMetas from "@/components/TabsMetas"
import BotaoAtualizar from "@/components/BotaoAtualizar"
import { empresaTemClientesTrafego } from "@/lib/clientes"
import { requererPermissao } from "@/lib/auth"
import {
  anoTemProjecao,
  type EmpresaSlug,
  type LinhaAton,
  type LinhaDiego,
  type LinhaHato,
  type LinhaPadrao,
  type Mes,
  getDadosEmpresa,
  origemValida,
  subtituloDaEmpresa,
} from "@/lib/data"
import {
  construirTabelaMetas,
  esqueletoMeses,
  extrairMetaComparavel,
} from "@/lib/metas-tabela"
import { type DadosReais } from "@/lib/supabase"
import {
  getResumoAnualDaEmpresa,
  getResumoPorIntervaloDaEmpresa,
  resumoComoDadosReais,
  type ResumoEmpresaMes,
} from "@/lib/sentinela"
import {
  getResumoComercialDaEmpresaIntervalo,
  getResumoComercialAnualDaEmpresa,
} from "@/lib/relatorios-comerciais"
import { parsePeriodo } from "@/lib/periodo"
import { getDadosDiariosDoMesPorNome } from "@/lib/dados-diarios"
import { getMetasOverrideEmpresa } from "@/lib/metas-empresa"
import { getEmpresaAsync } from "@/lib/empresas-actions"

/** Pago "comercial vira a conversão": mantém investimento/leads do tráfego e
 *  sobrepõe reuniões/contratos/faturamento do comercial 'Anúncios'. Sem comercial
 *  pago → mantém o tráfego; sem tráfego → só as conversões do comercial. */
function mesclarConversaoComercial(
  trafego: ResumoEmpresaMes | null,
  comercial: ResumoEmpresaMes | null
): ResumoEmpresaMes | null {
  if (!comercial) return trafego
  if (!trafego) {
    return { ...comercial, leads: 0, lucro: comercial.faturamento, roi: null }
  }
  const faturamento = comercial.faturamento
  return {
    ...trafego,
    reunioes: comercial.reunioes,
    contratos: comercial.contratos,
    faturamento,
    lucro: faturamento - trafego.investimento,
    roi:
      trafego.investimento > 0
        ? (faturamento - trafego.investimento) / trafego.investimento
        : null,
  }
}

/** Mesmo merge, mês a mês, pro gráfico/tabela anuais. */
function mesclarConversaoComercialAnual(
  trafego: Map<Mes, ResumoEmpresaMes>,
  comercial: Map<Mes, ResumoEmpresaMes>
): Map<Mes, ResumoEmpresaMes> {
  const out = new Map<Mes, ResumoEmpresaMes>()
  const meses = new Set<Mes>([...trafego.keys(), ...comercial.keys()])
  for (const mes of meses) {
    const merged = mesclarConversaoComercial(
      trafego.get(mes) ?? null,
      comercial.get(mes) ?? null
    )
    if (merged) out.set(mes, merged)
  }
  return out
}

// Página dinâmica: força SSR sem Data Cache. Igual /dashboard e
// /dashboard/empresas — evita resposta stale ao trocar mês/origem.
export const dynamic = "force-dynamic"

export default async function EmpresaPage({
  params,
  searchParams,
}: {
  params: { empresa: string }
  searchParams: {
    mes?: string
    ano?: string
    origem?: string
    de?: string
    ate?: string
    modo?: string
  }
}) {
  await requererPermissao("dashboard_empresa_detalhe")

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) {
    notFound()
  }

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano
  const origem = origemValida(searchParams?.origem)
  const temProjecao = anoTemProjecao(ano)
  // Aba "Metas por cliente" só aparece para assessorias com clientes de
  // tráfego (mesma regra do fluxo de Tráfego).
  const temClientes = await empresaTemClientesTrafego(empresa.nome)

  const dadosHardcoded = getDadosEmpresa(empresa.slug as EmpresaSlug, ano)

  // Fonte unificada com o restante do dashboard: dados_diarios_log
  // agregado via lib/sentinela. O Sentinela grava em
  // dados_diarios_log com empresa = empresa.nome (não slug), por isso
  // os helpers usam empresa.nome aqui. CenarioReal e DrawerDadosReais
  // recebem shape DadosReais compatível via resumoComoDadosReais.
  // Origem respeita o ?origem do searchParam (ToggleOrigem preserva a
  // flexibilidade pago/orgânico nessa view detalhada).
  // Origem PAGO → realizado vem do tráfego (dados_diarios_log, mesma
  // fonte do dashboard de Tráfego). Origem ORGÂNICO → realizado vem do
  // COMERCIAL (relatorios_comerciais), mapeado para o mesmo formato.
  // Assim o painel Metas compara meta vs realizado em ambas as origens.
  const ehOrganico = origem === "organico"
  const [overrides, dadosDiarios] = await Promise.all([
    getMetasOverrideEmpresa(empresa.db, ano, origem),
    // Timeline diária só existe pra pago (dados_diarios_log); no orgânico
    // fica vazia (o comercial é agregado por dia via relatorios_comerciais).
    ehOrganico
      ? Promise.resolve([])
      : getDadosDiariosDoMesPorNome(empresa.nome, mes, ano, origem),
  ])

  // Realizado por origem:
  //  • Orgânico → 100% do comercial (origem=organico).
  //  • Pago → investimento/leads do tráfego + reuniões/contratos/faturamento
  //    do comercial 'Anúncios' ("comercial vira a conversão").
  let resumoMes: ResumoEmpresaMes | null
  let resumoAno: Map<Mes, ResumoEmpresaMes>
  if (ehOrganico) {
    const [m, a] = await Promise.all([
      getResumoComercialDaEmpresaIntervalo(
        empresa.nome,
        periodo.de,
        periodo.ate,
        "organico"
      ),
      getResumoComercialAnualDaEmpresa(empresa.nome, ano, "organico"),
    ])
    resumoMes = m
    resumoAno = a
  } else {
    const [trafMes, trafAno, comMes, comAno] = await Promise.all([
      getResumoPorIntervaloDaEmpresa(empresa.nome, periodo.de, periodo.ate, "pago"),
      getResumoAnualDaEmpresa(empresa.nome, ano, "pago"),
      getResumoComercialDaEmpresaIntervalo(
        empresa.nome,
        periodo.de,
        periodo.ate,
        "pago"
      ),
      getResumoComercialAnualDaEmpresa(empresa.nome, ano, "pago"),
    ])
    resumoMes = mesclarConversaoComercial(trafMes, comMes)
    resumoAno = mesclarConversaoComercialAnual(trafAno, comAno)
  }
  const real: DadosReais | null = resumoComoDadosReais(
    resumoMes,
    mes,
    ano,
    origem
  )
  const todosReais: DadosReais[] = Array.from(resumoAno.entries())
    .map(([mesAno, r]) => resumoComoDadosReais(r, mesAno, ano, origem))
    .filter((x): x is DadosReais => x !== null)

  // Para empresas sem projeções hardcoded (adicionadas via UI), gera
  // skeleton com 9 meses vazios para que gráfico e tabela apareçam.
  const baseDados =
    dadosHardcoded.length > 0
      ? dadosHardcoded
      : esqueletoMeses(empresa.tipo)

  // Aplica overrides do Supabase por cima dos valores base.
  const dados = baseDados.map((linha) => {
    const ov = overrides.get(linha.mes)
    return ov ? { ...linha, ...ov } : linha
  }) as typeof baseDados
  const mapaReais = new Map(todosReais.map((r) => [r.mes, r]))

  const pontos = (dados as { mes: string }[]).map((linha) => {
    let meta = 0
    if (empresa.tipo === "leads-reunioes-contratos") {
      meta = (linha as LinhaPadrao).faturamento
    } else if (empresa.tipo === "aton") {
      meta = (linha as LinhaAton).faturamento
    } else if (empresa.tipo === "hato") {
      meta = (linha as LinhaHato).receita
    } else if (empresa.tipo === "diego") {
      meta = (linha as LinhaDiego).receita_hub
    }
    const r = mapaReais.get(linha.mes)
    return {
      mes: linha.mes.slice(0, 3),
      meta,
      real: r?.faturamento_real ?? null,
    }
  })

  const { colunas, linhas } = construirTabelaMetas(empresa.tipo, dados)
  const metaComparavel = extrairMetaComparavel(empresa.tipo, dados, mes)

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-8"
        style={{ maxWidth: 1280 }}
      >
        <div className="hero-banner">
          <Link
            href={`/dashboard/metas?mes=${mes}&ano=${ano}`}
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              fontWeight: 500,
            }}
            className="hover:text-[#C9953A] transition"
          >
            ← Metas
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
            <h1 style={{ fontSize: 36 }}>{empresa.nome}</h1>
            <BotaoAtualizar />
          </div>
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
            <div style={{ fontSize: 14, color: "var(--text-3)" }}>
              <MetadadosEmpresa
                mes={mes}
                clientesReais={real?.clientes_ativos ?? null}
                linhaProjetada={
                  empresa.tipo === "leads-reunioes-contratos"
                    ? (dados as LinhaPadrao[]).find((l) => l.mes === mes)
                    : undefined
                }
                subtitulo={subtituloDaEmpresa(empresa)}
              />
            </div>
          </div>
          {/* Linha de controles, equilibrando a tela: à esquerda as abas
              Metas/Metas por cliente + o toggle pago/orgânico (pago =
              realizado do tráfego; orgânico = do comercial); à direita o
              seletor de período (mês/dia/intervalo). As abas espelham o fluxo
              de Tráfego — o drill por cliente vive em /dashboard/[empresa]/metas. */}
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
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <TabsMetas
                slug={empresa.slug}
                mes={mes}
                ano={ano}
                temClientes={temClientes}
              />
              {empresa.tipo !== "diego" && <ToggleOrigem origem={origem} />}
            </div>
            <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
          </div>
        </div>

        {empresa.tipo !== "diego" && (
          <section
            className="grid grid-cols-1 lg:grid-cols-2"
            style={{ gap: 20, alignItems: "stretch" }}
          >
            <CenarioReal
              dados={real}
              meta={metaComparavel}
              mes={mes}
              ano={ano}
              origem={origem}
            />
            {temProjecao && pontos.length > 0 && (
              <GraficoFaturamento dados={pontos} />
            )}
            {!temProjecao && (
              <div
                className="glass h-full flex items-center justify-center"
                style={{ padding: 28 }}
              >
                <p
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.25)",
                    fontWeight: 300,
                    fontStyle: "italic",
                    textAlign: "center",
                  }}
                >
                  Planejamento futuro · sem projeção definida para {ano}.
                </p>
              </div>
            )}
          </section>
        )}

        {empresa.tipo === "diego" && temProjecao && pontos.length > 0 && (
          <section>
            <GraficoFaturamento dados={pontos} />
          </section>
        )}

        {temProjecao && linhas.length > 0 && (
          <section>
            <TabelaMeses
              colunas={colunas}
              linhas={linhas}
              reais={mapaReais}
              mesAtual={mes}
              origem={origem}
              dadosDiarios={dadosDiarios}
              acao={
                <DrawerEditarMeta
                  empresa={empresa.db}
                  empresaNome={empresa.nome}
                  tipoEmpresa={empresa.tipo}
                  ano={ano}
                  mesInicial={mes}
                  origem={origem}
                  linhasPorMes={Object.fromEntries(
                    (
                      linhas as unknown as Record<string, number | string>[]
                    ).map((l) => {
                      const chave = String(l.mes ?? "")
                      const numericos: Record<string, number> = {}
                      for (const [k, v] of Object.entries(l)) {
                        if (k === "mes") continue
                        if (typeof v === "number") numericos[k] = v
                      }
                      return [chave, numericos]
                    })
                  )}
                />
              }
            />
          </section>
        )}
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

function MetadadosEmpresa({
  mes,
  clientesReais,
  linhaProjetada,
  subtitulo,
}: {
  mes: Mes
  clientesReais: number | null
  linhaProjetada?: LinhaPadrao
  subtitulo: string
}) {
  const clientes =
    clientesReais !== null ? clientesReais : linhaProjetada?.clientes ?? 0
  return (
    <p
      style={{
        fontSize: 12,
        color: "rgba(255,255,255,0.35)",
        fontWeight: 300,
      }}
    >
      {mes} · {clientes} {clientes === 1 ? "cliente ativo" : "clientes ativos"}{" "}
      · {subtitulo}
    </p>
  )
}
