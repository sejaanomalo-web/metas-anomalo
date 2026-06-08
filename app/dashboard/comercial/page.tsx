import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import SectionHeader from "@/components/ui/SectionHeader"
import FunilAtividadeComercial from "@/components/FunilAtividadeComercial"
import { requererPermissao } from "@/lib/auth"
import { formatBRL, formatNumero } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import { getResumoComercialPorIntervalo } from "@/lib/relatorios-comerciais"

// Página dinâmica: SSR sem Data Cache — o seletor de período global
// precisa sempre recalcular a partir dos dados frescos.
export const dynamic = "force-dynamic"

/**
 * Painel Comercial — enxuto. Um único funil de ATIVIDADE do período
 * (Prospecção → Reuniões → Propostas → Contratos → Faturamento), vindo
 * dos relatórios diários (relatorios_comerciais). Sem pipeline de
 * oportunidades (removido por ser redundante com a atividade).
 */
export default async function ComercialPage({
  searchParams,
}: {
  searchParams: {
    mes?: string
    ano?: string
    de?: string
    ate?: string
    modo?: string
  }
}) {
  await requererPermissao("dashboard_comercial")

  const periodo = parsePeriodo(searchParams)
  const resumo = await getResumoComercialPorIntervalo(periodo.de, periodo.ate)

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-10"
        style={{ maxWidth: 1280 }}
      >
        {/* Hero */}
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-3)",
              letterSpacing: "0.01em",
            }}
          >
            Comercial
          </p>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ fontSize: 36 }}>Comercial · {periodo.rotulo}</h1>
            <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
            }}
          >
            {resumo.registros === 0
              ? "Sem relatórios no período."
              : `${formatNumero(resumo.contratos_fechados)} ${
                  resumo.contratos_fechados === 1 ? "contrato" : "contratos"
                } · ${formatBRL(resumo.faturamento_gerado)} gerado`}
          </p>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {/* Funil de atividade */}
        <section>
          <SectionHeader
            titulo="Funil de atividade"
            descricao="O que o time fez no período · prospecção → fechamento"
          />
          <FunilAtividadeComercial resumo={resumo} />
        </section>
      </main>

      <footer
        className="mx-auto px-8 py-8 text-center"
        style={{ maxWidth: 1280 }}
      >
        <p style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 400 }}>
          Anômalo Hub · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  )
}
