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

function mesValido(m: string | undefined): Mes {
  if (m && (MESES as readonly string[]).includes(m)) return m as Mes
  return "Abril"
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  if (!estaAutenticado()) {
    redirect("/login")
  }

  const mes = mesValido(searchParams?.mes)
  const resumo = getResumoGrupo(mes)

  return (
    <>
      <Header>
        <SeletorMes mesAtual={mes} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-white">
              Visão geral do grupo
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {mes} de 2025 · 6 empresas
            </p>
          </div>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <CardMetrica
            titulo="Faturamento do Grupo"
            valor={formatBRL(resumo.faturamento)}
          />
          <CardMetrica
            titulo="Total de Leads"
            valor={formatNumero(resumo.leads)}
          />
          <CardMetrica
            titulo="Reuniões / Orçamentos"
            valor={formatNumero(resumo.reunioes)}
          />
          <CardMetrica
            titulo="Contratos / Vendas"
            valor={formatNumero(resumo.contratos)}
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
              <CardEmpresa key={empresa.slug} empresa={empresa} mes={mes} />
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
