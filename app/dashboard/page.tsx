import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import StripMetricas from "@/components/StripMetricas"
import SectionBar from "@/components/SectionBar"
import CardEmpresa from "@/components/CardEmpresa"
import { estaAutenticado } from "@/lib/auth"
import {
  anoTemProjecao,
  anoValido,
  empresas,
  formatBRL,
  formatNumero,
  getResumoGrupo,
  mesValido,
} from "@/lib/data"
import { getDadosReaisDoMes } from "@/lib/dados-reais"

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
  const resumo = getResumoGrupo(mes, ano)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)

  let somaFaturamentoReal = 0
  let somaInvestimentoReal = 0
  let somaLeadsReal = 0
  let somaCriativosReal = 0
  for (const d of reaisDoMes.values()) {
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

      <SectionBar titulo="Empresas" hint="Clique para detalhar" />

      <main
        style={{
          background: "#090909",
          padding: "16px 24px",
        }}
      >
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: 10 }}
        >
          {empresas.map((empresa) => (
            <CardEmpresa
              key={empresa.slug}
              empresa={empresa}
              mes={mes}
              ano={ano}
              faturamentoReal={
                reaisDoMes.get(empresa.db)?.faturamento_real ?? null
              }
            />
          ))}
        </div>
      </main>
    </>
  )
}
