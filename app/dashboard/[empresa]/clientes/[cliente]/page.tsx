import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import TabsEmpresa from "@/components/TabsEmpresa"
import TrafegoRealtime from "@/components/TrafegoRealtime"
import PainelTrafego from "@/components/trafego/PainelTrafego"
import TagStatusCampanha from "@/components/trafego/TagStatusCampanha"
import BadgeStatusSentinela from "@/components/trafego/BadgeStatusSentinela"
import { requererPermissao } from "@/lib/auth"
import { MES_NUM, anoValido, diasNoMes, mesValido } from "@/lib/data"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import {
  getUltimoLogSentinela,
  proximaExecucao,
  resumirMesSentinela,
  statusSentinela,
} from "@/lib/sentinela"
import {
  getClientePorSlug,
  getDiasSentinelaDoCliente,
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
  searchParams: { mes?: string; ano?: string }
}) {
  await requererPermissao("dashboard_trafego")

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) notFound()

  const cliente = await getClientePorSlug(empresa.nome, params.cliente)
  if (!cliente) notFound()

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  const mesNum = String(MES_NUM[mes]).padStart(2, "0")
  const ultimoDia = String(diasNoMes(mes, ano)).padStart(2, "0")
  const inicio = `${ano}-${mesNum}-01`
  const fim = `${ano}-${mesNum}-${ultimoDia}`

  const [dias, linhas, ultimoLog] = await Promise.all([
    getDiasSentinelaDoCliente(cliente, inicio, fim),
    getLinhasDoMesCliente(cliente, inicio, fim),
    getUltimoLogSentinela(),
  ])
  const resumo = resumirMesSentinela(dias)
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
            <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
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
            <TabsEmpresa slug={empresa.slug} mes={mes} ano={ano} />
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
            <strong style={{ color: "var(--danger)" }}>Sem conexão</strong> — o
            Sentinela não conseguiu ler as campanhas deste cliente na última
            execução
            {cliente.ultimo_erro ? `: ${cliente.ultimo_erro}` : "."}
          </div>
        )}

        <PainelTrafego resumo={resumo} anomalias={[]} linhas={linhas} cplMeta={empresa.cpl} />
      </main>
    </>
  )
}
