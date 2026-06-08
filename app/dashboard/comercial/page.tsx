import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import KPICard from "@/components/ui/KPICard"
import SectionHeader from "@/components/ui/SectionHeader"
import FunilComercial from "@/components/FunilComercial"
import PipelineEtapaSelect from "@/components/PipelineEtapaSelect"
import { requererPermissao } from "@/lib/auth"
import { formatBRL, formatNumero } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import { type EtapaFunil } from "@/lib/comercial-tipos"
import {
  getResumoComercialPorIntervalo,
  listarPipelineAction,
} from "@/lib/relatorios-comerciais"

// Página dinâmica: SSR sem Data Cache — o seletor de período global
// precisa sempre recalcular a partir dos dados frescos.
export const dynamic = "force-dynamic"

/**
 * Painel Comercial. Visão em funil + KPIs do relatório diário no período
 * selecionado (mês/dia/intervalo) + lista de oportunidades. Reusa o
 * seletor de período global do topo, sincronizado com o resto do sistema.
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
  const [resumo, oportunidades] = await Promise.all([
    getResumoComercialPorIntervalo(periodo.de, periodo.ate),
    listarPipelineAction(),
  ])

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
            <h1 style={{ fontSize: 36 }}>Funil comercial · {periodo.rotulo}</h1>
            <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
          </div>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {/* KPIs do período (relatório diário agregado) */}
        <section
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
          style={{ gap: 16 }}
        >
          <KPICard
            label="Ligações"
            valor={formatNumero(resumo.ligacoes)}
            semDados={resumo.registros === 0}
          />
          <KPICard
            label="Mensagens"
            valor={formatNumero(resumo.mensagens)}
            semDados={resumo.registros === 0}
          />
          <KPICard
            label="Reuniões realizadas"
            valor={formatNumero(resumo.reunioes_realizadas)}
            semDados={resumo.registros === 0}
            delta={{
              texto: `${formatNumero(resumo.reunioes_agendadas)} agendadas`,
              status: "neutral",
            }}
          />
          <KPICard
            label="Propostas enviadas"
            valor={formatNumero(resumo.propostas_enviadas)}
            semDados={resumo.registros === 0}
          />
          <KPICard
            label="Contratos fechados"
            valor={formatNumero(resumo.contratos_fechados)}
            semDados={resumo.registros === 0}
            destaque
          />
          <KPICard
            label="Faturamento gerado"
            valor={formatBRL(resumo.faturamento_gerado)}
            semDados={resumo.registros === 0}
            destaque
          />
        </section>

        {/* Funil */}
        <section>
          <SectionHeader
            titulo="Funil de oportunidades"
            descricao="Pipeline atual por etapa · contagem e valor estimado"
          />
          <FunilComercial oportunidades={oportunidades} />
        </section>

        {/* Lista de oportunidades / clientes atendidos */}
        <section>
          <SectionHeader
            titulo="Empresas e clientes atendidos"
            descricao="Oportunidades ativas no pipeline (clientes do hub + prospects)"
          />
          {oportunidades.length === 0 ? (
            <div
              className="glass"
              style={{
                padding: "28px",
                textAlign: "center",
                borderStyle: "dashed",
                borderColor: "rgba(201,149,58,0.35)",
              }}
            >
              <p style={{ fontSize: 14, color: "var(--text-2)" }}>
                Nenhuma oportunidade cadastrada. Adicione pela aba
                Formulários → Comercial.
              </p>
            </div>
          ) : (
            <div className="glass" style={{ padding: 0, overflow: "hidden" }}>
              {oportunidades.map((o, i) => (
                <div
                  key={o.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "14px 18px",
                    borderTop:
                      i === 0 ? "none" : "0.5px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{o.nome}</p>
                    <p style={{ fontSize: 12, color: "var(--text-4)" }}>
                      {o.empresa_config_slug ? "Cliente do hub" : "Prospect"}
                      {o.responsavel_nome ? ` · ${o.responsavel_nome}` : ""}
                    </p>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--text-2)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {o.valor_estimado != null
                        ? formatBRL(o.valor_estimado)
                        : "·"}
                    </span>
                    <PipelineEtapaSelect
                      id={o.id}
                      etapaAtual={o.etapa as EtapaFunil}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
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
