import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import StripMetricas from "@/components/StripMetricas"
import SectionBar from "@/components/SectionBar"
import CardEmpresa from "@/components/CardEmpresa"
import { estaAutenticado } from "@/lib/auth"
import {
  anoValido,
  empresas,
  getResumoGrupo,
  mesValido,
} from "@/lib/data"
import { getDadosReaisDoMes } from "@/lib/dados-reais"
import { montarCelulasGrupo } from "@/lib/strip"

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
  const resumo = getResumoGrupo(mes, ano)
  const reaisDoMes = await getDadosReaisDoMes(mes, ano)

  const celulas = montarCelulasGrupo(resumo, reaisDoMes, mes, ano)

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
          padding: "20px 24px",
        }}
      >
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: 12 }}
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
