import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorMes from "@/components/SeletorMes"
import CardMetrica from "@/components/CardMetrica"
import GraficoFaturamento from "@/components/GraficoFaturamento"
import FunilVisual from "@/components/FunilVisual"
import TabelaMeses from "@/components/TabelaMeses"
import { estaAutenticado } from "@/lib/auth"
import {
  MESES,
  type Mes,
  type EmpresaSlug,
  type LinhaAton,
  type LinhaDiego,
  type LinhaHato,
  type LinhaPadrao,
  formatBRL,
  formatNumero,
  getDadosEmpresa,
  getEmpresa,
  getFunilResumo,
} from "@/lib/data"

function mesValido(m: string | undefined, dados: { mes: Mes }[]): Mes {
  if (m && (MESES as readonly string[]).includes(m)) {
    const mes = m as Mes
    if (dados.some((l) => l.mes === mes)) return mes
  }
  return dados[0]?.mes ?? "Abril"
}

export default function EmpresaPage({
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
  const funil = getFunilResumo(empresa.slug as EmpresaSlug, mes)

  const pontos = (dados as { mes: string }[]).map((linha) => {
    let faturamento = 0
    if (empresa.tipo === "leads-reunioes-contratos") {
      faturamento = (linha as LinhaPadrao).faturamento
    } else if (empresa.tipo === "aton") {
      faturamento = (linha as LinhaAton).faturamento
    } else if (empresa.tipo === "hato") {
      faturamento = (linha as LinhaHato).receita
    } else if (empresa.tipo === "diego") {
      faturamento = (linha as LinhaDiego).receitaHub
    }
    return { mes: linha.mes.slice(0, 3), faturamento }
  })

  const cards = construirCards(empresa, dados, mes)
  const { colunas, linhas } = construirTabela(empresa, dados)
  const tituloFunil =
    empresa.tipo === "diego"
      ? "Resumo do mês"
      : empresa.tipo === "hato"
      ? "Vendas do mês"
      : "Funil do mês"

  return (
    <>
      <Header>
        <SeletorMes mesAtual={mes} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-end justify-between gap-4">
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
              {mes} de 2025 · Detalhamento completo
            </p>
          </div>
        </div>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {cards.map((c) => (
            <CardMetrica key={c.titulo} {...c} />
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GraficoFaturamento dados={pontos} />
          {funil && (
            <FunilVisual
              titulo={tituloFunil}
              etapas={funil.rotulos.map((rotulo, i) => ({
                rotulo,
                valor: funil.valores[i],
              }))}
            />
          )}
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

function construirCards(
  empresa: ReturnType<typeof getEmpresa>,
  dados: ReturnType<typeof getDadosEmpresa>,
  mes: Mes
) {
  if (!empresa) return []

  if (empresa.tipo === "leads-reunioes-contratos") {
    const linha = (dados as LinhaPadrao[]).find((l) => l.mes === mes)
    if (!linha) return []
    const custoPorContrato =
      linha.contratos > 0 ? Math.round(linha.verba / linha.contratos) : 0
    return [
      {
        titulo: "CPL",
        valor: empresa.cpl ? formatBRL(empresa.cpl) : "—",
      },
      {
        titulo: "Custo por contrato",
        valor: formatBRL(custoPorContrato),
      },
      {
        titulo: "Ticket médio",
        valor: formatBRL(linha.ticket),
      },
      {
        titulo: "Verba do mês",
        valor: formatBRL(linha.verba),
      },
    ]
  }

  if (empresa.tipo === "aton") {
    const linha = (dados as LinhaAton[]).find((l) => l.mes === mes)
    if (!linha) return []
    const custoPorVenda =
      linha.vendas > 0 ? Math.round(linha.verba / linha.vendas) : 0
    return [
      {
        titulo: "CPL",
        valor: empresa.cpl ? formatBRL(empresa.cpl) : "—",
      },
      {
        titulo: "Custo por venda",
        valor: formatBRL(custoPorVenda),
      },
      {
        titulo: "Ticket médio",
        valor: formatBRL(linha.ticket),
      },
      {
        titulo: "Verba do mês",
        valor: formatBRL(linha.verba),
      },
    ]
  }

  if (empresa.tipo === "hato") {
    const linha = (dados as LinhaHato[]).find((l) => l.mes === mes)
    if (!linha) return []
    const ticket = linha.totalVendas > 0 ? Math.round(linha.receita / linha.totalVendas) : 0
    return [
      {
        titulo: "Ticket médio",
        valor: formatBRL(ticket),
      },
      {
        titulo: "Custo influenciadores",
        valor: formatBRL(linha.custoInfluenciadores),
      },
      {
        titulo: "Verba de mídia",
        valor: formatBRL(linha.verba),
      },
      {
        titulo: "Vendas totais",
        valor: formatNumero(linha.totalVendas),
      },
    ]
  }

  if (empresa.tipo === "diego") {
    const linha = (dados as LinhaDiego[]).find((l) => l.mes === mes)
    if (!linha) return []
    return [
      {
        titulo: "Faturamento Diego",
        valor: formatBRL(linha.faturamentoDiego),
      },
      {
        titulo: "Percentual Hub",
        valor: `${linha.percentual}%`,
      },
      {
        titulo: "Receita do Hub",
        valor: formatBRL(linha.receitaHub),
      },
      {
        titulo: "—",
        valor: "",
      },
    ].filter((c) => c.titulo !== "—")
  }

  return []
}

function construirTabela(
  empresa: ReturnType<typeof getEmpresa>,
  dados: ReturnType<typeof getDadosEmpresa>
) {
  if (!empresa) return { colunas: [], linhas: [] }

  if (empresa.tipo === "leads-reunioes-contratos") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        { chave: "verba", titulo: "Verba", tipo: "brl" as const },
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
        { chave: "influenciadores", titulo: "Influ." },
        { chave: "vendasInfluenciador", titulo: "Vendas Influ." },
        { chave: "vendasDireto", titulo: "Vendas Direto" },
        { chave: "totalVendas", titulo: "Total Vendas" },
        { chave: "receita", titulo: "Receita", tipo: "brl" as const },
        { chave: "custoInfluenciadores", titulo: "Custo Influ.", tipo: "brl" as const },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  if (empresa.tipo === "diego") {
    return {
      colunas: [
        { chave: "mes", titulo: "Mês" },
        { chave: "faturamentoDiego", titulo: "Faturamento Diego", tipo: "brl" as const },
        { chave: "percentual", titulo: "%", tipo: "percent" as const },
        { chave: "receitaHub", titulo: "Receita Hub", tipo: "brl" as const },
      ],
      linhas: dados as unknown as Record<string, string | number>[],
    }
  }

  return { colunas: [], linhas: [] }
}
