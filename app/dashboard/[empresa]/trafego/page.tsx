import Link from "next/link"
import { notFound } from "next/navigation"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import TabsEmpresa from "@/components/TabsEmpresa"
import TrafegoRealtime from "@/components/TrafegoRealtime"
import PainelTrafego from "@/components/trafego/PainelTrafego"
import { requererPermissao } from "@/lib/auth"
import {
  MES_NUM,
  anoValido,
  diasNoMes,
  mesValido,
  subtituloDaEmpresa,
} from "@/lib/data"
import { getEmpresaAsync } from "@/lib/empresas-actions"
import {
  getEmpresasTrackeadas,
  getDiasSentinelaDaEmpresa,
  getLinhasDoMes,
  getUltimoLogSentinela,
  formatarMomentoBRT,
  proximaExecucao,
  resumirMesSentinela,
  statusSentinela,
  tempoDecorrido,
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
  searchParams: { mes?: string; ano?: string }
}) {
  await requererPermissao("dashboard_trafego")

  const empresa = await getEmpresaAsync(params.empresa)
  if (!empresa) notFound()

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  // Range YYYY-MM-01 .. YYYY-MM-{lastDay} para filtrar dados_diarios_log.
  const mesNum = String(MES_NUM[mes]).padStart(2, "0")
  const ultimoDia = String(diasNoMes(mes, ano)).padStart(2, "0")
  const inicio = `${ano}-${mesNum}-01`
  const fim = `${ano}-${mesNum}-${ultimoDia}`

  const [diasSentinela, linhas, ultimoLog, empresasTrackeadas] =
    await Promise.all([
      getDiasSentinelaDaEmpresa(empresa.nome, inicio, fim),
      getLinhasDoMes(empresa.nome, inicio, fim),
      getUltimoLogSentinela(),
      getEmpresasTrackeadas(),
    ])

  const resumo = resumirMesSentinela(diasSentinela)
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
            href={`/dashboard/${empresa.slug}?mes=${mes}&ano=${ano}`}
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              fontWeight: 500,
            }}
            className="hover:text-[#C9953A] transition"
          >
            ← {empresa.nome}
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
            <h1 style={{ fontSize: 36 }}>Tráfego pago — {empresa.nome}</h1>
            <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
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
            na última execução do Sentinela — campanhas pausadas ou sem
            investimento no período.
          </div>
        )}

        {/* Miolo compartilhado: KPIs + alertas + histórico */}
        <PainelTrafego
          resumo={resumo}
          anomalias={anomaliasEmpresa}
          linhas={linhas}
          cplMeta={empresa.cpl}
        />
      </main>
    </>
  )
}

/* ============ Componentes inline ============ */

function BadgeStatusSentinela({
  statusCor,
  rotulo,
  ultimaExecucao,
  proximaLabelCompleto,
}: {
  statusCor: "success" | "warning" | "danger" | "neutral"
  rotulo: string
  ultimaExecucao: string | null
  proximaLabelCompleto: string
}) {
  const corMap = {
    success: { fg: "var(--success)", bg: "var(--success-bg)", border: "rgba(22,163,74,0.25)" },
    warning: { fg: "var(--warning)", bg: "var(--warning-bg)", border: "rgba(234,179,8,0.30)" },
    danger: { fg: "var(--danger)", bg: "var(--danger-bg)", border: "rgba(239,68,68,0.30)" },
    neutral: { fg: "var(--text-3)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" },
  }
  const c = corMap[statusCor]
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: c.fg,
          padding: "6px 12px",
          borderRadius: 999,
          background: c.bg,
          border: `1px solid ${c.border}`,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <Bolinha cor={c.fg} pulse={statusCor === "success"} />
        🛡️ {rotulo}
        {ultimaExecucao && (
          <span style={{ color: "var(--text-3)", marginLeft: 2 }}>
            · há {tempoDecorrido(ultimaExecucao)}
          </span>
        )}
      </span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          fontSize: 10,
          color: "var(--text-4)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.4,
        }}
      >
        <span>
          última execução:{" "}
          {ultimaExecucao
            ? `${formatarMomentoBRT(ultimaExecucao)} BRT`
            : "—"}
        </span>
        <span>próxima execução: {proximaLabelCompleto}</span>
      </div>
    </div>
  )
}

function Bolinha({ cor, pulse }: { cor: string; pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: cor,
        boxShadow: pulse ? `0 0 0 0 ${cor}` : undefined,
        animation: pulse ? "pulseGold 2s ease-in-out infinite" : undefined,
      }}
    />
  )
}

