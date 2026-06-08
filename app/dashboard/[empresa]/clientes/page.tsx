import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabsTrafego from "@/components/TabsTrafego"
import TrafegoRealtime from "@/components/TrafegoRealtime"
import CardClienteTrafego from "@/components/trafego/CardClienteTrafego"
import GerenciadorClientes from "@/components/trafego/GerenciadorClientes"
import BadgeStatusSentinela from "@/components/trafego/BadgeStatusSentinela"
import { requererPermissao } from "@/lib/auth"
import { subtituloDaEmpresa } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import {
  listarClientesDaEmpresa,
  getResumoTodosClientesMes,
} from "@/lib/clientes"
import { listarTokensDaEmpresa } from "@/lib/clientes-actions"
import {
  getUltimoLogSentinela,
  proximaExecucao,
  statusSentinela,
} from "@/lib/sentinela"

export const dynamic = "force-dynamic"

/**
 * Lista de clientes de uma empresa-agência (F2 Sports, Aton, etc).
 * Cada cliente = subconjunto de campanhas do ad_account da empresa,
 * isolado por campaign_filter. Mostra mini-cards com resumo do mês +
 * tag de status (ativo/desativado/sem conexão), atualizado pelo
 * Sentinela 3x/dia. Clicar num card abre o dashboard de tráfego
 * completo do cliente.
 */
export default async function ClientesPage({
  params,
  searchParams,
}: {
  params: { empresa: string }
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

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano
  const inicio = periodo.de
  const fim = periodo.ate

  const [resumos, clientes, tokens, ultimoLog] = await Promise.all([
    getResumoTodosClientesMes(empresa.nome, inicio, fim),
    listarClientesDaEmpresa(empresa.nome, false),
    listarTokensDaEmpresa(empresa.nome),
    getUltimoLogSentinela(),
  ])
  const stat = statusSentinela(ultimoLog)
  const prox = proximaExecucao()

  return (
    <>
      <TrafegoRealtime key={`${empresa.nome}-${mes}-${ano}`} empresaNome={empresa.nome} />

      <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
        <div>
          <Link
            href={`/dashboard/trafego?mes=${mes}&ano=${ano}`}
            style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}
            className="hover:text-[#C9953A] transition"
          >
            ← Tráfego
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
            <h1 style={{ fontSize: 36 }}>Tráfego por Cliente · {empresa.nome}</h1>
            <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
          </div>
          <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10 }}>
            {subtituloDaEmpresa(empresa)} · Clientes atualizados automaticamente
            pelo Sentinela
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
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <BadgeStatusSentinela
                statusCor={stat.cor}
                rotulo={stat.rotulo}
                ultimaExecucao={ultimoLog?.data_execucao ?? null}
                proximaLabelCompleto={prox.labelCompleto}
              />
              <GerenciadorClientes
                empresaNome={empresa.nome}
                clientes={clientes}
                tokens={tokens}
              />
            </div>
          </div>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {resumos.length === 0 ? (
          <div
            style={{
              padding: "40px 28px",
              borderRadius: 12,
              border: "1px dashed rgba(201,149,58,0.30)",
              background: "rgba(201,149,58,0.04)",
              textAlign: "center",
              color: "var(--text-2)",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <p style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>
              Nenhum cliente cadastrado ainda
            </p>
            <p>
              Clique em <strong>+ Novo cliente</strong> pra adicionar o primeiro.
              Cada cliente isola um conjunto de campanhas de {empresa.nome} por
              um filtro de nome (regex).
            </p>
          </div>
        ) : (
          <section
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 16 }}
          >
            {resumos.map((r) => (
              <CardClienteTrafego
                key={r.cliente.id}
                resumo={r}
                empresaSlug={empresa.slug}
                mes={mes}
                ano={ano}
              />
            ))}
          </section>
        )}
      </main>
    </>
  )
}
