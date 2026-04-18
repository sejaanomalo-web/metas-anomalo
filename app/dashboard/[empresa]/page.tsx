import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import CenarioReal from "@/components/CenarioReal"
import TrafegoStrip from "@/components/TrafegoStrip"
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
  getDadosEmpresa,
  getEmpresa,
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

  const [real, todosReais] = await Promise.all([
    getDadosReaisMes(empresa.db, mes, ano),
    getDadosReais(empresa.db, ano),
  ])
  const mapaReais = new Map(todosReais.map((r) => [r.mes, r]))
  const supabaseOk = supabaseConfigurado()

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

  return (
    <>
      <Header>
        <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Link
              href={`/dashboard?mes=${mes}&ano=${ano}`}
              style={{
                fontSize: 10,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.3)",
                fontWeight: 500,
              }}
              className="hover:text-[#C9953A] transition"
            >
              ← Voltar ao painel
            </Link>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
                marginTop: 14,
              }}
            >
              {empresa.nome}
            </h1>
            <div
              className="gold-divider"
              style={{ marginTop: 10, marginBottom: 10 }}
            />
            <MetadadosEmpresa
              mes={mes}
              clientesReais={real?.clientes_ativos ?? null}
              linhaProjetada={
                empresa.tipo === "leads-reunioes-contratos"
                  ? (dados as LinhaPadrao[]).find((l) => l.mes === mes)
                  : undefined
              }
              subtitulo={SUBTITULO_EMPRESA[empresa.slug]}
            />
          </div>
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
                  Planejamento futuro — sem projeção definida para {ano}.
                </p>
              </div>
            )}
          </section>
        )}

        {empresa.tipo !== "diego" && (
          <TrafegoStrip
            empresaSlug={empresa.slug}
            empresaDb={empresa.db}
            mes={mes}
            ano={ano}
            dadosReais={real}
          />
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
            />
          </section>
        )}
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
