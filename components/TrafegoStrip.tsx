import Link from "next/link"
import type { EmpresaDb } from "@/lib/data"
import type { DadosReais } from "@/lib/supabase"
import { formatBRL, formatNumero } from "@/lib/data"
import {
  contaMetaDaEmpresa,
  metaTokenDisponivel,
} from "@/lib/meta-accounts"
import {
  insightsDaCampanha,
  intervaloDoPeriodo,
  listarCampanhas,
} from "@/lib/meta-campaigns"

export default async function TrafegoStrip({
  empresaSlug,
  empresaDb,
  mes,
  ano,
  dadosReais,
}: {
  empresaSlug: string
  empresaDb: EmpresaDb
  mes: string
  ano: number
  dadosReais: DadosReais | null
}) {
  const contaMeta = contaMetaDaEmpresa(empresaDb)
  const temToken = metaTokenDisponivel()
  const temIntegracao = Boolean(contaMeta && temToken)

  // Consolida insights do mês atual agregando todas as campanhas.
  let alcance: number | null = null
  let impressoes: number | null = null
  let ctr: number | null = null
  let mensagemApi: string | null = null

  if (temIntegracao) {
    const { data: campanhas, erro } = await listarCampanhas(empresaDb)
    if (erro) {
      mensagemApi = erro.mensagem
    } else if (campanhas && campanhas.length > 0) {
      // soma os insights de todas as campanhas no período do mês atual
      let somaAlcance = 0
      let somaImpressoes = 0
      let somaCliques = 0
      const intervalo = intervaloDoPeriodo("mes_atual")
      intervalo.since // marcador — usado indiretamente via insightsDaCampanha
      for (const c of campanhas.slice(0, 20)) {
        const { data: ins } = await insightsDaCampanha(c.id, "mes_atual")
        if (ins) {
          somaAlcance += ins.reach
          somaImpressoes += ins.impressions
          somaCliques += ins.clicks
        }
      }
      alcance = somaAlcance
      impressoes = somaImpressoes
      ctr =
        somaImpressoes > 0
          ? Number(((somaCliques / somaImpressoes) * 100).toFixed(2))
          : 0
    }
  }

  const investimento = dadosReais?.investimento_real ?? null
  const leads = dadosReais?.leads_real ?? null
  const cpl = dadosReais?.cpl_real ?? null

  return (
    <div className="glass" style={{ padding: 20 }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <p
            style={{
              fontSize: 11,
              color: "#ffffff",
              fontWeight: 500,
              letterSpacing: "0.3px",
            }}
          >
            Tráfego Pago
          </p>
          <span
            style={{
              fontSize: 9,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "#C9953A",
              background: "rgba(201,149,58,0.12)",
              border: "0.5px solid rgba(201,149,58,0.4)",
              borderRadius: 999,
              padding: "3px 10px",
              fontWeight: 500,
            }}
          >
            Meta Ads
          </span>
        </div>
        <Link
          href={`/dashboard/${empresaSlug}/trafego?mes=${mes}&ano=${ano}`}
          className="btn-gold-filled uppercase"
        >
          Ver campanhas →
        </Link>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        style={{ gap: "0.5px", background: "rgba(255,255,255,0.05)", marginTop: 16 }}
      >
        <CelulaTrafego
          label="Investimento"
          valor={investimento !== null ? formatBRL(investimento) : "—"}
        />
        <CelulaTrafego
          label="Leads"
          valor={leads !== null ? formatNumero(leads) : "—"}
        />
        <CelulaTrafego
          label="CPL"
          valor={cpl !== null ? formatBRL(cpl) : "—"}
        />
        <CelulaTrafego
          label="Alcance"
          valor={
            temIntegracao && alcance !== null ? formatNumero(alcance) : "—"
          }
          indisponivel={!temIntegracao}
        />
        <CelulaTrafego
          label="Impressões"
          valor={
            temIntegracao && impressoes !== null
              ? formatNumero(impressoes)
              : "—"
          }
          indisponivel={!temIntegracao}
        />
        <CelulaTrafego
          label="CTR"
          valor={temIntegracao && ctr !== null ? `${ctr}%` : "—"}
          indisponivel={!temIntegracao}
        />
      </div>

      {!temIntegracao && (
        <p
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.35)",
            fontWeight: 300,
            marginTop: 12,
          }}
        >
          {!temToken
            ? "META_ACCESS_TOKEN ausente — configurar no Vercel."
            : "Conta Meta não configurada para esta empresa."}
        </p>
      )}
      {mensagemApi && (
        <p
          style={{
            fontSize: 10,
            color: "#e24b4a",
            fontWeight: 400,
            marginTop: 12,
          }}
        >
          {mensagemApi}
        </p>
      )}
    </div>
  )
}

function CelulaTrafego({
  label,
  valor,
  indisponivel,
}: {
  label: string
  valor: string
  indisponivel?: boolean
}) {
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.25)",
        padding: "12px 14px",
      }}
    >
      <p
        style={{
          fontSize: 8,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 13,
          color: indisponivel ? "rgba(255,255,255,0.2)" : "#ffffff",
          fontWeight: 500,
          marginTop: 4,
          letterSpacing: "-0.2px",
        }}
      >
        {valor}
      </p>
    </div>
  )
}
