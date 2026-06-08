import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import AbasArea from "@/components/AbasArea"
import TimeComercial from "@/components/time/TimeComercial"
import { requererPermissao } from "@/lib/auth"
import { parsePeriodo } from "@/lib/periodo"
import {
  getResumoComercialColaborador,
  listarTimePorPapel,
} from "@/lib/time"

export const dynamic = "force-dynamic"

/**
 * Sub-aba "Time" do Comercial — lista os usuários com papel comercial e
 * mostra as métricas individuais (atribuição real por colaborador_id).
 */
export default async function TimeComercialPage({
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
  const time = await listarTimePorPapel("comercial")
  const membros = await Promise.all(
    time.map(async (m) => ({
      ...m,
      resumo: await getResumoComercialColaborador(
        m.id,
        periodo.de,
        periodo.ate
      ),
    }))
  )
  const qs = `?mes=${periodo.mes}&ano=${periodo.ano}`

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>
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
          <h1 style={{ fontSize: 36 }}>Time comercial · {periodo.rotulo}</h1>
          <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10 }}>
          Métricas individuais do time comercial no período · clique num nome.
        </p>
        <div style={{ marginTop: 18 }}>
          <AbasArea
            itens={[
              {
                label: "Funil",
                href: `/dashboard/comercial${qs}`,
                ativo: false,
              },
              {
                label: "Time",
                href: `/dashboard/comercial/time${qs}`,
                ativo: true,
              },
            ]}
          />
        </div>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <TimeComercial membros={membros} />
    </main>
  )
}
