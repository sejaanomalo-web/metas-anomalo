import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import StripMetricas from "@/components/StripMetricas"
import SectionBar from "@/components/SectionBar"
import FunilCascata from "@/components/FunilCascata"
import CenarioReal from "@/components/CenarioReal"
import GraficoFaturamento from "@/components/GraficoFaturamento"
import TabelaMeses from "@/components/TabelaMeses"
import DrawerDadosReais from "@/components/DrawerDadosReais"
import { estaAutenticado } from "@/lib/auth"
import {
  SUBTITULO_EMPRESA,
  anoTemProjecao,
  anoValido,
  type EmpresaSlug,
  type LinhaAton,
  type LinhaDiego,
  type LinhaHato,
  type LinhaPadrao,
  type Mes,
  formatBRL,
  formatNumero,
  getDadosEmpresa,
  getEmpresa,
  getFunilCompleto,
  getResumoGrupo,
  mesValido,
} from "@/lib/data"
import { supabaseConfigurado } from "@/lib/supabase"
import { getDadosReais, getDadosReaisMes } from "@/lib/dados-reais"

export default async function EmpresaPage({
  params,
  searchParams,
}: {
  params: { empresa: string }
  searchParams: { mes?: string; ano?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const empresa = getEmpresa(params.empresa)
  if (!empresa) {
    notFound()
  }

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const temProjecao = anoTemProjecao(ano)

  const dados = getDadosEmpresa(empresa.slug as EmpresaSlug, ano)
  const etapas = getFunilCompleto(empresa.slug as EmpresaSlug, mes, ano)
  const resumo = getResumoGrupo(mes, ano)

  const real = await getDadosReaisMes(empresa.db, mes, ano)
  const todosReais = await getDadosReais(empresa.db, ano)
  const mapaReais = new Map(todosReais.map((r) => [r.mes, r]))
  const supabaseOk = supabaseConfigurado()

  const etapasReais: Record<string, number> = {}
  if (real) {
    if (real.investimento_real !== null)
      etapasReais.investimento = real.investimento_real
    if (real.criativos_entregues !== null)
      etapasReais.criativos = real.criativos_entregues
    if (real.leads_real !== null) etapasReais.leads = real.leads_real
    if (real.reunioes_real !== null) etapasReais.reunioes = real.reunioes_real
    if (real.contratos_real !== null)
      etapasReais.contratos = real.contratos_real
    if (real.faturamento_real !== null)
      etapasReais.faturamento = real.faturamento_real
  }

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

  const { colunas, linhas } = construirTabela(empresa, dados)
  const metaComparavel = extrairMetaComparavel(empresa.tipo, dados, mes)

  let somaFaturamentoReal = 0
  let somaInvestimentoReal = 0
  let somaLeadsReal = 0
  let somaCriativosReal = 0
  for (const d of todosReais) {
    somaFaturamentoReal += d.faturamento_real ?? 0
    somaInvestimentoReal += d.investimento_real ?? 0
    somaLeadsReal += d.leads_real ?? 0
    somaCriativosReal += d.criativos_entregues ?? 0
  }

  const celulas = temProjecao
    ? [
        {
          rotulo: "Faturamento do grupo",
          valor: formatBRL(resumo.faturamento),
          destaque: true,
        },
        {
          rotulo: "Total investido em ads",
          valor: formatBRL(resumo.investimento),
        },
        { rotulo: "Total de leads", valor: formatNumero(resumo.leads) },
        {
          rotulo: "Criativos do mês",
          valor: formatNumero(resumo.criativos),
          hint: `${resumo.criativosSemana} por semana · grupo`,
        },
      ]
    : [
        {
          rotulo: "Faturamento real do grupo",
          valor: formatBRL(somaFaturamentoReal),
          destaque: true,
        },
        {
          rotulo: "Investimento real",
          valor: formatBRL(somaInvestimentoReal),
        },
        { rotulo: "Leads reais", valor: formatNumero(somaLeadsReal) },
        {
          rotulo: "Criativos entregues",
          valor: formatNumero(somaCriativosReal),
        },
      ]

  return (
    <>
      <Header>
        <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
      </Header>

      <StripMetricas celulas={celulas} />

      <SectionBar titulo={empresa.nome} hint={SUBTITULO_EMPRESA[empresa.slug]} />

      <main
        style={{
          background: "#090909",
          padding: "16px 24px",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: 16 }}
        >
          <Link
            href={`/dashboard?mes=${mes}&ano=${ano}`}
            style={{
              fontSize: 8,
              letterSpacing: "2px",
              color: "#1e1e1e",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
            className="hover:text-[#686868] transition"
          >
            ← Voltar ao painel
          </Link>
          {empresa.tipo !== "diego" && (
            <DrawerDadosReais
              empresa={empresa.db}
              mes={mes}
              ano={ano}
              supabaseOk={supabaseOk}
              tipoEmpresa={empresa.tipo}
              existentes={real}
            />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {etapas.length > 0 && (
            <FunilCascata etapas={etapas} reais={etapasReais} />
          )}

          {empresa.tipo !== "diego" && (
            <CenarioReal
              dados={real}
              meta={metaComparavel}
              mes={mes}
              ano={ano}
            />
          )}

          {temProjecao && pontos.length > 0 && (
            <GraficoFaturamento dados={pontos} />
          )}

          {temProjecao && linhas.length > 0 && (
            <TabelaMeses colunas={colunas} linhas={linhas} mesAtual={mes} />
          )}

          {!temProjecao && (
            <div
              style={{
                background: "#0c0c0c",
                border: "0.5px solid #141414",
                borderRadius: 10,
                padding: 24,
                textAlign: "center",
                color: "#1c1c1c",
                fontSize: 12,
                fontWeight: 300,
              }}
            >
              Nenhuma projeção definida para {ano}. Os dados mostrados são
              apenas os reais inseridos manualmente.
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function extrairMetaComparavel(
  tipo: NonNullable<ReturnType<typeof getEmpresa>>["tipo"],
  dados: ReturnType<typeof getDadosEmpresa>,
  mes: Mes
) {
  if (tipo === "leads-reunioes-contratos") {
    const l = (dados as LinhaPadrao[]).find((x) => x.mes === mes)
    return l
      ? {
          investimento: l.verba,
          leads: l.leads,
          reunioes: l.reunioes,
          contratos: l.contratos,
          faturamento: l.faturamento,
        }
      : {}
  }
  if (tipo === "aton") {
    const l = (dados as LinhaAton[]).find((x) => x.mes === mes)
    return l
      ? {
          investimento: l.verba,
          leads: l.leads,
          reunioes: l.orcamentos,
          contratos: l.vendas,
          faturamento: l.faturamento,
        }
      : {}
  }
  if (tipo === "hato") {
    const l = (dados as LinhaHato[]).find((x) => x.mes === mes)
    return l
      ? {
          investimento: l.verba,
          leads: l.influenciadores,
          reunioes: l.vendas_influenciador,
          contratos: l.total_vendas,
          faturamento: l.receita,
        }
      : {}
  }
  return {}
}

function construirTabela(
  empresa: NonNullable<ReturnType<typeof getEmpresa>>,
  dados: ReturnType<typeof getDadosEmpresa>
) {
  if (empresa.tipo === "leads-reunioes-contratos") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        { chave: "verba", titulo: "Verba", tipo: "brl" as const },
        { chave: "criativos", titulo: "Criativos" },
        { chave: "leads", titulo: "Leads" },
        { chave: "reunioes", titulo: "Reuniões" },
        { chave: "contratos", titulo: "Contratos" },
        { chave: "churn", titulo: "Churn" },
        { chave: "clientes", titulo: "Clientes" },
        { chave: "ticket", titulo: "Ticket", tipo: "brl" as const },
        { chave: "faturamento", titulo: "Faturamento", tipo: "brl" as const },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  if (empresa.tipo === "aton") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        { chave: "verba", titulo: "Verba", tipo: "brl" as const },
        { chave: "criativos", titulo: "Criativos" },
        { chave: "leads", titulo: "Leads" },
        { chave: "orcamentos", titulo: "Orçamentos" },
        { chave: "vendas", titulo: "Vendas" },
        { chave: "ticket", titulo: "Ticket", tipo: "brl" as const },
        { chave: "faturamento", titulo: "Faturamento", tipo: "brl" as const },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  if (empresa.tipo === "hato") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        { chave: "verba", titulo: "Verba", tipo: "brl" as const },
        { chave: "criativos", titulo: "Criativos" },
        { chave: "influenciadores", titulo: "Influ." },
        { chave: "vendas_influenciador", titulo: "Vendas Influ." },
        { chave: "vendas_direto", titulo: "Vendas Direto" },
        { chave: "total_vendas", titulo: "Total Vendas" },
        { chave: "receita", titulo: "Receita", tipo: "brl" as const },
        {
          chave: "custo_influenciadores",
          titulo: "Custo Influ.",
          tipo: "brl" as const,
        },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  if (empresa.tipo === "diego") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        {
          chave: "faturamento_diego",
          titulo: "Faturamento Diego",
          tipo: "brl" as const,
        },
        { chave: "percentual", titulo: "%", tipo: "percent" as const },
        { chave: "receita_hub", titulo: "Receita Hub", tipo: "brl" as const },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  return { colunas: [], linhas: [] }
}
