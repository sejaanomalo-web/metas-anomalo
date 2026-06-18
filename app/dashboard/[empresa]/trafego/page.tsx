import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabsTrafego from "@/components/TabsTrafego"
import TrafegoRealtime from "@/components/TrafegoRealtime"
import PainelTrafego from "@/components/trafego/PainelTrafego"
import BadgeStatusSentinela from "@/components/trafego/BadgeStatusSentinela"
import { requererPermissao } from "@/lib/auth"
import { subtituloDaEmpresa } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import { periodoQS } from "@/lib/periodo-url"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import { empresaTemClientesTrafego } from "@/lib/clientes"
import {
  getCategoriasPorDia,
  getEmpresasTrackeadas,
  getLinhasDoMes,
  getUltimoLogSentinela,
  inicioJanela6Meses,
  proximaExecucao,
  resumirTrafego,
  serieMensalDeLinhas,
  statusSentinela,
  type AnomaliaSentinela,
} from "@/lib/sentinela"

// Página dinâmica: força SSR sem Data Cache (mesmo motivo das outras
// pages do dashboard). Resolve o bug de "desconfiguração" ao alternar
// entre meses no SeletorPeriodo.
export const dynamic = "force-dynamic"

/**
 * Painel de tráfego pago da empresa, alimentado pelo agente Sentinela
 * Anomalo. Lê SOMENTE de tabelas do Supabase — sem chamada Meta Graph
 * em runtime.
 *
 * Fonte:
 *   • dados_diarios_log filtrado por (empresa.nome, origem=pago)
 *     com flag de quem preencheu (Sentinela 🤖 vs humano 👤)
 *   • logs_sentinela (último) → status + anomalias detectadas
 *
 * Atualização em tempo real via TrafegoRealtime (client component que
 * dispara router.refresh ao receber INSERT/UPDATE do agente).
 */
export default async function TrafegoPage({
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

  // Período global (mês/dia/intervalo) → range YYYY-MM-DD para filtrar
  // dados_diarios_log.
  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano
  const inicio = periodo.de
  const fim = periodo.ate

  const [
    linhas,
    linhas6m,
    categoriasPorDia,
    ultimoLog,
    empresasTrackeadas,
    temClientes,
  ] = await Promise.all([
    getLinhasDoMes(empresa.nome, inicio, fim),
    getLinhasDoMes(empresa.nome, inicioJanela6Meses(fim), fim),
    getCategoriasPorDia(empresa.nome, inicio, fim),
    getUltimoLogSentinela(),
    getEmpresasTrackeadas(),
    empresaTemClientesTrafego(empresa.nome),
  ])

  const resumo = resumirTrafego(linhas)
  const serie = serieMensalDeLinhas(linhas6m)
  const trackeada = empresasTrackeadas.includes(empresa.nome)
  const stat = statusSentinela(ultimoLog)
  const prox = proximaExecucao()
  const anomaliasEmpresa: AnomaliaSentinela[] = (
    ultimoLog?.anomalias_detectadas ?? []
  ).filter((a) => a.empresa === empresa.nome)
  const erroEmpresa = (ultimoLog?.erros_de_leitura ?? []).find(
    (e) => e.empresa === empresa.nome
  )
  const semAtividade =
    ultimoLog?.contas_sem_atividade?.some(
      (c) => c.empresa === empresa.nome
    ) ?? false

  return (
    <>
      {/* key força remontar o canal Realtime ao trocar filtros — sem
          isso o canal permanece "preso" ao primeiro empresaNome/mes/ano
          montado e refreshes vêm com contexto desatualizado. */}
      <TrafegoRealtime
        key={`${empresa.nome}-${mes}-${ano}`}
        empresaNome={empresa.nome}
      />

      <main
        className="mx-auto px-8 py-10 space-y-8"
        style={{ maxWidth: 1280 }}
      >
        <div>
          <Link
            href={`/dashboard/trafego?${periodoQS(periodo)}`}
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              fontWeight: 500,
            }}
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
            <h1 style={{ fontSize: 36 }}>Tráfego pago · {empresa.nome}</h1>
            <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-3)",
              marginTop: 10,
            }}
          >
            {subtituloDaEmpresa(empresa)} · Atualizado automaticamente pelo
            Sentinela
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
            <TabsTrafego
              slug={empresa.slug}
              mes={mes}
              ano={ano}
              temClientes={temClientes}
            />
            <BadgeStatusSentinela
              statusCor={stat.cor}
              rotulo={stat.rotulo}
              ultimaExecucao={ultimoLog?.data_execucao ?? null}
              proximaLabelCompleto={prox.labelCompleto}
            />
          </div>
          <div className="gold-divider" style={{ marginTop: 18 }} />
        </div>

        {/* Banner pra empresas sem token Meta cadastrado */}
        {!trackeada && (
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              border: "1px solid rgba(201,149,58,0.30)",
              background: "rgba(201,149,58,0.06)",
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <strong>Token Meta não cadastrado pra esta empresa.</strong>{" "}
            O agente Sentinela só processa as empresas listadas em{" "}
            <code style={{ color: "var(--accent)" }}>tokens_meta</code>{" "}
            (hoje: {empresasTrackeadas.join(", ")}). Pra começar a
            trackear, cadastre o System User token no Supabase.
          </div>
        )}

        {/* Banner se Sentinela retornou erro pra essa empresa */}
        {trackeada && erroEmpresa && (
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              border: "1px solid rgba(239,68,68,0.30)",
              background: "var(--danger-bg)",
              color: "var(--text-1)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "var(--danger)" }}>
              Erro de leitura na última execução:
            </strong>{" "}
            <span style={{ color: "var(--text-2)" }}>
              {erroEmpresa.error}
            </span>
          </div>
        )}

        {/* Sem movimento detectado */}
        {trackeada && !erroEmpresa && semAtividade && (
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              border: "1px solid rgba(234,179,8,0.30)",
              background: "var(--warning-bg)",
              color: "var(--text-2)",
              fontSize: 13,
            }}
          >
            <strong style={{ color: "var(--warning)" }}>
              Sem atividade detectada no Meta Ads
            </strong>{" "}
            na última execução do Sentinela · campanhas pausadas ou sem
            investimento no período.
          </div>
        )}

        {/* Miolo compartilhado: herói + cartões + alertas + histórico */}
        <PainelTrafego
          resumo={resumo}
          anomalias={anomaliasEmpresa}
          linhas={linhas}
          serie={serie}
          categoriasPorDia={categoriasPorDia}
        />
      </main>
    </>
  )
}

