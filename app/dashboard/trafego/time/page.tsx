import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import AbasArea from "@/components/AbasArea"
import TimeTrafego from "@/components/time/TimeTrafego"
import { requererPermissao } from "@/lib/auth"
import { parsePeriodo } from "@/lib/periodo"
import { getResumoTrafegoOperacao, listarTimePorPapel } from "@/lib/time"

export const dynamic = "force-dynamic"

/**
 * Sub-aba "Time" do Tráfego — lista os gestores de tráfego. As métricas
 * são as da operação inteira (tráfego pago não tem atribuição por pessoa).
 */
export default async function TimeTrafegoPage({
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
  await requererPermissao("dashboard_trafego")

  const periodo = parsePeriodo(searchParams)
  const [membros, operacao] = await Promise.all([
    listarTimePorPapel("gestor_trafego"),
    getResumoTrafegoOperacao(periodo.de, periodo.ate),
  ])
  const qs = `?mes=${periodo.mes}&ano=${periodo.ano}`

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>
          Tráfego pago
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
          <h1 style={{ fontSize: 36 }}>Time de tráfego · {periodo.rotulo}</h1>
          <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10 }}>
          Gestores de tráfego · clique num nome.
        </p>
        <div style={{ marginTop: 18 }}>
          <AbasArea
            itens={[
              {
                label: "Visão geral",
                href: `/dashboard/trafego${qs}`,
                ativo: false,
              },
              {
                label: "Time",
                href: `/dashboard/trafego/time${qs}`,
                ativo: true,
              },
            ]}
          />
        </div>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <TimeTrafego membros={membros} operacao={operacao} />
    </main>
  )
}
