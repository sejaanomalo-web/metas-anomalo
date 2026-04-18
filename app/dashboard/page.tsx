import Link from "next/link"
import { redirect } from "next/navigation"
import Header from "@/components/Header"
import SeletorMes from "@/components/SeletorMes"
import CardEmpresa from "@/components/CardEmpresa"
import { estaAutenticado } from "@/lib/auth"
import {
  MESES,
  type Mes,
  corStatusMeta,
  empresas,
  formatBRL,
  formatNumero,
  getResumoGrupo,
} from "@/lib/data"
import { getDadosReaisDoMes } from "@/lib/dados-reais"

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
  const reaisDoMes = await getDadosReaisDoMes(mes)

  let somaFat = 0
  let somaInv = 0
  let somaLeads = 0
  let somaCri = 0
  let temFat = false
  let temInv = false
  let temLeads = false
  let temCri = false
  for (const d of reaisDoMes.values()) {
    if (d.faturamento_real !== null) {
      somaFat += d.faturamento_real
      temFat = true
    }
    if (d.investimento_real !== null) {
      somaInv += d.investimento_real
      temInv = true
    }
    if (d.leads_real !== null) {
      somaLeads += d.leads_real
      temLeads = true
    }
    if (d.criativos_entregues !== null) {
      somaCri += d.criativos_entregues
      temCri = true
    }
  }

  const celulas = [
    {
      rotulo: "Faturamento do grupo",
      real: temFat ? formatBRL(somaFat) : "—",
      cor: temFat ? corStatusMeta(somaFat, resumo.faturamento, true, mes) : "#C9953A",
      corMeta: corStatusMeta(somaFat, resumo.faturamento, temFat, mes),
      meta: `Meta ${formatBRL(resumo.faturamento)}`,
    },
    {
      rotulo: "Total investido em ads",
      real: temInv ? formatBRL(somaInv) : "—",
      cor: temInv ? corStatusMeta(somaInv, resumo.investimento, true, mes) : "#ffffff",
      corMeta: corStatusMeta(somaInv, resumo.investimento, temInv, mes),
      meta: `Meta ${formatBRL(resumo.investimento)}`,
    },
    {
      rotulo: "Total de leads",
      real: temLeads ? formatNumero(somaLeads) : "—",
      cor: temLeads ? corStatusMeta(somaLeads, resumo.leads, true, mes) : "#ffffff",
      corMeta: corStatusMeta(somaLeads, resumo.leads, temLeads, mes),
      meta: `Meta ${formatNumero(resumo.leads)}`,
    },
    {
      rotulo: "Criativos do mês",
      real: temCri ? formatNumero(somaCri) : "—",
      cor: temCri ? corStatusMeta(somaCri, resumo.criativos, true, mes) : "#ffffff",
      corMeta: corStatusMeta(somaCri, resumo.criativos, temCri, mes),
      meta: `Meta ${formatNumero(resumo.criativos)} · ${resumo.criativosSemana}/sem`,
    },
  ]

  return (
    <>
      <Header>
        <SeletorMes mesAtual={mes} />
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-6">
          <div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
              }}
            >
              Visão geral do Hub
            </h1>
            <div
              className="gold-divider"
              style={{ marginTop: 10, marginBottom: 10 }}
            />
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.45)",
                fontWeight: 300,
              }}
            >
              {mes} de 2025 · 6 empresas
            </p>
          </div>
          <Link
            href={`/dashboard/comissionamento?mes=${mes}`}
            className="btn-gold-outline uppercase"
          >
            Comissionamento do time →
          </Link>
        </div>

        <section
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-12"
          style={{ gap: 10 }}
        >
          {celulas.map((c) => (
            <div key={c.rotulo} className="glass" style={{ padding: "18px 22px" }}>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.4)",
                  fontWeight: 500,
                }}
              >
                {c.rotulo}
              </p>
              <p
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: c.cor,
                  marginTop: 10,
                  lineHeight: 1.1,
                }}
              >
                {c.real}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: c.corMeta,
                  fontWeight: 400,
                  marginTop: 4,
                }}
              >
                {c.meta}
              </p>
            </div>
          ))}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-5">
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "#ffffff",
                letterSpacing: "-0.3px",
              }}
            >
              Empresas
            </h2>
            <p
              style={{
                fontSize: 10,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.3)",
                fontWeight: 500,
              }}
            >
              Clique para detalhar
            </p>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 14 }}
          >
            {empresas.map((empresa) => (
              <CardEmpresa
                key={empresa.slug}
                empresa={empresa}
                mes={mes}
                faturamentoReal={
                  reaisDoMes.get(empresa.db)?.faturamento_real ?? null
                }
              />
            ))}
          </div>
        </section>
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
