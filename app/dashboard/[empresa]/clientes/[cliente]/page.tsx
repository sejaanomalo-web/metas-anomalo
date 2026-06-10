import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabsTrafego from "@/components/TabsTrafego"
import TrafegoRealtime from "@/components/TrafegoRealtime"
import PainelTrafego from "@/components/trafego/PainelTrafego"
import TagStatusCampanha from "@/components/trafego/TagStatusCampanha"
import BadgeStatusSentinela from "@/components/trafego/BadgeStatusSentinela"
import { requererPermissao } from "@/lib/auth"
import { parsePeriodo } from "@/lib/periodo"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import {
  getUltimoLogSentinela,
  inicioJanela6Meses,
  proximaExecucao,
  resumirTrafego,
  serieMensalDeLinhas,
  statusSentinela,
} from "@/lib/sentinela"
import {
  getCategoriasPorDiaCliente,
  getClientePorSlug,
  getLinhasDoMesCliente,
  clienteDisplayName,
} from "@/lib/clientes"

export const dynamic = "force-dynamic"

/**
 * Dashboard de tráfego de UM cliente — idêntico ao da empresa
 * (4 KPIs + histórico), via PainelTrafego compartilhado. As métricas
 * vêm de dados_diarios_cliente (sub-filtro de campanhas do Sentinela).
 *
 * Alertas/anomalias hoje são detectados por empresa (não por cliente),
 * então o painel do cliente não exibe a seção de alertas — o status
 * das campanhas aparece como tag no header.
 */
export default async function ClienteTrafegoPage({
  params,
  searchParams,
}: {
  params: { empresa: string; cliente: string }
  searchParams: {
    mes?: string
    ano?: string
    de?: string
    ate?: string
    modo?: string
  }
}) {
  await requererPermissao("dashboard_trafego")

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) notFound()

  const cliente = await getClientePorSlug(empresa.nome, params.cliente)
  if (!cliente) notFound()

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano
  const inicio = periodo.de
  const fim = periodo.ate

  const [linhas, linhas6m, categoriasPorDia, ultimoLog] =
    await Promise.all([
      getLinhasDoMesCliente(cliente, inicio, fim),
      getLinhasDoMesCliente(cliente, inicioJanela6Meses(fim), fim),
      getCategoriasPorDiaCliente(cliente, inicio, fim),
      getUltimoLogSentinela(),
    ])
  const resumo = resumirTrafego(linhas)
  const serie = serieMensalDeLinhas(linhas6m)
  const nomeExibido = clienteDisplayName(cliente)
  const stat = statusSentinela(ultimoLog)
  const prox = proximaExecucao()

  return (
    <>
      <TrafegoRealtime
        key={`${empresa.nome}-${cliente.nome}-${mes}-${ano}`}
        empresaNome={empresa.nome}
      />

      <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
        <div>
          <Link
            href={`/dashboard/${empresa.slug}/clientes?mes=${mes}&ano=${ano}`}
            style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}
            className="hover:text-[#C9953A] transition"
          >
            ← Clientes de {empresa.nome}
          </Link>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 36 }}>{nomeExibido}</h1>
              <TagStatusCampanha status={cliente.status_campanhas} />
            </div>
            <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
          </div>
          <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10 }}>
            Cliente de {empresa.nome} · filtro{" "}
            <code style={{ color: "var(--accent)", fontSize: 12 }}>{cliente.campaign_filter}</code>
          </p>

          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <TabsTrafego slug={empresa.slug} mes={mes} ano={ano} />
            <BadgeStatusSentinela
              statusCor={stat.cor}
              rotulo={stat.rotulo}
              ultimaExecucao={ultimoLog?.data_execucao ?? null}
              proximaLabelCompleto={prox.labelCompleto}
            />
          </div>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {cliente.status_campanhas === "sem_conexao" && (
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              border: "1px solid rgba(239,68,68,0.30)",
              background: "var(--danger-bg)",
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "var(--danger)" }}>Sem conexão</strong> · o
            Sentinela não conseguiu ler as campanhas deste cliente na última
            execução
            {cliente.ultimo_erro ? `: ${cliente.ultimo_erro}` : "."}
          </div>
        )}

        <PainelTrafego
          resumo={resumo}
          anomalias={[]}
          linhas={linhas}
          serie={serie}
          categoriasPorDia={categoriasPorDia}
        />
      </main>
    </>
  )
}
