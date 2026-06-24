import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import SectionHeader from "@/components/ui/SectionHeader"
import FunilAtividadeComercial from "@/components/FunilAtividadeComercial"
import ClientesComercial from "@/components/comercial/ClientesComercial"
import AcoesResponderComercial from "@/components/comercial/AcoesResponderComercial"
import AbasArea from "@/components/AbasArea"
import { requererPermissao } from "@/lib/auth"
import { formatBRL, formatNumero } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import {
  getResumoComercialPorEmpresa,
  getResumoComercialPorIntervalo,
} from "@/lib/relatorios-comerciais"

// Página dinâmica: SSR sem Data Cache — o seletor de período global
// precisa sempre recalcular a partir dos dados frescos.
export const dynamic = "force-dynamic"

/**
 * Painel Comercial — enxuto. Um único funil VISUAL de ATIVIDADE do período
 * (Mensagens enviadas → Retorno → Qualificados → Agendamentos → Reuniões →
 * Contratos → Faturamento), vindo dos relatórios diários
 * (relatorios_comerciais). Sem pipeline de oportunidades (removido por ser
 * redundante com a atividade).
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
  const [resumo, porCliente] = await Promise.all([
    getResumoComercialPorIntervalo(periodo.de, periodo.ate),
    getResumoComercialPorEmpresa(periodo.de, periodo.ate),
  ])
  const qs = `?mes=${periodo.mes}&ano=${periodo.ano}`

  return (
    <>
      <main
        className="mx-auto px-8 py-10 space-y-10"
        style={{ maxWidth: 1280 }}
      >
        {/* Hero */}
        <div className="hero-banner">
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
          <div style={{ marginTop: 16 }}>
            <AcoesResponderComercial />
          </div>
          <div style={{ marginTop: 18 }}>
            <AbasArea
              itens={[
                {
                  label: "Funil",
                  href: `/dashboard/comercial${qs}`,
                  ativo: true,
                },
                {
                  label: "Time",
                  href: `/dashboard/comercial/time${qs}`,
                  ativo: false,
                },
              ]}
            />
          </div>
        </div>

        {/* Funil de atividade */}
        <section>
          <SectionHeader
            titulo="Funil de atividade"
            descricao="Da boca ao fundo · mensagens → qualificação → agendamentos → reuniões → contratos → faturamento"
          />
          <FunilAtividadeComercial resumo={resumo} />
        </section>

        {/* Por cliente — de quais clientes foram as prospecções */}
        <section>
          <SectionHeader
            titulo="Por cliente"
            descricao="De quais clientes foram as prospecções · clique num cliente pra ver o funil dele"
          />
          <ClientesComercial
            clientes={porCliente}
            titulo=""
            vazioMsg="Sem prospecções no período."
          />
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
