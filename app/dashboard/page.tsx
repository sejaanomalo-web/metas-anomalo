import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorMes from "@/components/SeletorMes"
import CardMetrica from "@/components/CardMetrica"
import CardEmpresa from "@/components/CardEmpresa"
import { estaAutenticado } from "@/lib/auth"
import {
  MESES,
  type Mes,
  empresas,
  formatBRL,
  formatNumero,
  getResumoGrupo,
} from "@/lib/data"
import { getMesesComDadosReais } from "@/lib/dados-reais"

function mesValido(m: string | undefined): Mes {
  if (m && (MESES as readonly string[]).includes(m)) return m as Mes
  return "Abril"
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const mes = mesValido(searchParams?.mes)
  const resumo = getResumoGrupo(mes)
  const mesesReais = await getMesesComDadosReais()

  return (
    <>
      <Header>
        <SeletorMes mesAtual={mes} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-white">
              Visão geral do grupo
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {mes} de 2025 · 6 empresas
            </p>
          </div>
          <Link
            href={`/dashboard/comissionamento?mes=${mes}`}
            className="text-xs uppercase tracking-widest text-gold hover:brightness-110 border border-gold/40 rounded-lg px-4 py-2"
          >
            Comissionamento do time →
          </Link>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <CardMetrica
            titulo="Faturamento do Grupo"
            valor={formatBRL(resumo.faturamento)}
          />
          <CardMetrica
            titulo="Total Investido em Ads"
            valor={formatBRL(resumo.investimento)}
          />
          <CardMetrica
            titulo="Total de Leads"
            valor={formatNumero(resumo.leads)}
          />
          <CardMetrica
            titulo="Criativos do mês"
            valor={formatNumero(resumo.criativos)}
            hint={`${resumo.criativosSemana}/semana no grupo`}
          />
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-medium text-white">Empresas</h2>
            <p className="text-xs uppercase tracking-widest text-neutral-500">
              Clique para detalhar
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {empresas.map((empresa) => (
              <CardEmpresa
                key={empresa.slug}
                empresa={empresa}
                mes={mes}
                temDadosReais={mesesReais.has(`${empresa.db}:${mes}`)}
              />
            ))}
          </div>
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
