import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorMes from "@/components/SeletorMes"
import FunilCascata from "@/components/FunilCascata"
import CenarioReal from "@/components/CenarioReal"
import MetaProjetada from "@/components/MetaProjetada"
import GraficoFaturamento from "@/components/GraficoFaturamento"
import TabelaMeses from "@/components/TabelaMeses"
import DrawerDadosReais from "@/components/DrawerDadosReais"
import { estaAutenticado } from "@/lib/auth"
import {
  ANO_PADRAO,
  MESES,
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
} from "@/lib/data"
import { supabaseConfigurado } from "@/lib/supabase"
import { getDadosReais, getDadosReaisMes } from "@/lib/dados-reais"

function mesValido(m: string | undefined, dados: { mes: Mes }[]): Mes {
  if (m && (MESES as readonly string[]).includes(m)) {
    const mes = m as Mes
    if (dados.some((l) => l.mes === mes)) return mes
  }
  return dados[0]?.mes ?? "Abril"
}

export default async function EmpresaPage({
  params,
  searchParams,
}: {
  params: { empresa: string }
  searchParams: { mes?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const empresa = getEmpresa(params.empresa)
  if (!empresa) {
    notFound()
  }

  const dados = getDadosEmpresa(empresa.slug as EmpresaSlug)
  const mes = mesValido(searchParams?.mes, dados as { mes: Mes }[])
  const etapas = getFunilCompleto(empresa.slug as EmpresaSlug, mes)

  const real = await getDadosReaisMes(empresa.db, mes)
  const todosReais = await getDadosReais(empresa.db)
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

  const cardsMeta = construirCardsMeta(empresa, dados, mes)
  const { colunas, linhas } = construirTabela(empresa, dados)

  const metaComparavel = extrairMetaComparavel(empresa.tipo, dados, mes)

  return (
    <>
      <Header>
        <SeletorMes mesAtual={mes} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Link
              href="/dashboard"
              className="text-xs uppercase tracking-widest text-neutral-500 hover:text-gold transition"
            >
              ← Voltar ao painel
            </Link>
            <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">
              {empresa.nome}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {mes} de {ANO_PADRAO} · Detalhamento completo
            </p>
          </div>
          {empresa.tipo !== "diego" && (
            <DrawerDadosReais
              empresa={empresa.db}
              mes={mes}
              ano={ANO_PADRAO}
              supabaseOk={supabaseOk}
              tipoEmpresa={empresa.tipo}
              existentes={real}
            />
          )}
        </div>

        {etapas.length > 0 && (
          <FunilCascata etapas={etapas} reais={etapasReais} />
        )}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {empresa.tipo !== "diego" && (
            <CenarioReal dados={real} meta={metaComparavel} />
          )}
          <MetaProjetada cards={cardsMeta} />
        </section>

        <section>
          <GraficoFaturamento dados={pontos} />
        </section>

        <section>
          <TabelaMeses colunas={colunas} linhas={linhas} />
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-10 text-center">
        <p className="text-[11px] uppercase tracking-widest text-neutral-700">
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}

function extrairMetaComparavel(
  tipo: ReturnType<typeof getEmpresa> extends infer T
    ? T extends { tipo: infer U }
      ? U
      : never
    : never,
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

function construirCardsMeta(
  empresa: NonNullable<ReturnType<typeof getEmpresa>>,
  dados: ReturnType<typeof getDadosEmpresa>,
  mes: Mes
): { titulo: string; valor: string; hint?: string }[] {
  if (empresa.tipo === "leads-reunioes-contratos") {
    const linha = (dados as LinhaPadrao[]).find((l) => l.mes === mes)
    if (!linha) return []
    const custoPorContrato =
      linha.contratos > 0 ? Math.round(linha.verba / linha.contratos) : 0
    return [
      { titulo: "CPL projetado", valor: empresa.cpl ? formatBRL(empresa.cpl) : "—" },
      { titulo: "Custo por contrato", valor: formatBRL(custoPorContrato) },
      { titulo: "Ticket médio", valor: formatBRL(linha.ticket) },
      { titulo: "Verba do mês", valor: formatBRL(linha.verba) },
      {
        titulo: "Criativos",
        valor: formatNumero(linha.criativos),
        hint: `${linha.criativos_semana}/semana`,
      },
      { titulo: "Clientes ativos", valor: formatNumero(linha.clientes) },
    ]
  }

  if (empresa.tipo === "aton") {
    const linha = (dados as LinhaAton[]).find((l) => l.mes === mes)
    if (!linha) return []
    const custoPorVenda =
      linha.vendas > 0 ? Math.round(linha.verba / linha.vendas) : 0
    return [
      { titulo: "CPL projetado", valor: empresa.cpl ? formatBRL(empresa.cpl) : "—" },
      { titulo: "Custo por venda", valor: formatBRL(custoPorVenda) },
      { titulo: "Ticket médio", valor: formatBRL(linha.ticket) },
      { titulo: "Verba do mês", valor: formatBRL(linha.verba) },
      {
        titulo: "Criativos",
        valor: formatNumero(linha.criativos),
        hint: `${linha.criativos_semana}/semana`,
      },
      { titulo: "Vendas projetadas", valor: formatNumero(linha.vendas) },
    ]
  }

  if (empresa.tipo === "hato") {
    const linha = (dados as LinhaHato[]).find((l) => l.mes === mes)
    if (!linha) return []
    const ticket =
      linha.total_vendas > 0 ? Math.round(linha.receita / linha.total_vendas) : 0
    return [
      { titulo: "Ticket médio", valor: formatBRL(ticket) },
      {
        titulo: "Custo influenciadores",
        valor: formatBRL(linha.custo_influenciadores),
      },
      { titulo: "Verba de mídia", valor: formatBRL(linha.verba) },
      { titulo: "Vendas totais", valor: formatNumero(linha.total_vendas) },
      {
        titulo: "Criativos",
        valor: formatNumero(linha.criativos),
        hint: `${linha.criativos_semana}/semana`,
      },
      { titulo: "Influenciadores", valor: formatNumero(linha.influenciadores) },
    ]
  }

  if (empresa.tipo === "diego") {
    const linha = (dados as LinhaDiego[]).find((l) => l.mes === mes)
    if (!linha) return []
    return [
      { titulo: "Faturamento Diego", valor: formatBRL(linha.faturamento_diego) },
      { titulo: "Percentual Hub", valor: `${linha.percentual}%` },
      { titulo: "Receita do Hub", valor: formatBRL(linha.receita_hub) },
    ]
  }

  return []
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
