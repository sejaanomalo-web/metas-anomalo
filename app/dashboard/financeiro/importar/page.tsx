import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import ImportarExtrato from "@/components/financeiro/ImportarExtrato"
import { parsePeriodo } from "@/lib/periodo"
import { listarCategorias, listarContas } from "@/lib/financeiro"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function ImportarExtratoPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string; de?: string; ate?: string; modo?: string }
}) {
  await requererPermissao("dashboard_financeiro")

  const periodo = parsePeriodo(searchParams)
  const [contas, categorias] = await Promise.all([
    listarContas(true),
    listarCategorias(undefined, true),
  ])

  return (
    <main className="mx-auto px-4 md:px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>
          Financeiro · Importar extrato
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
          <h1 style={{ fontSize: 36 }}>Importar extrato</h1>
          <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10, lineHeight: 1.55 }}>
          Leia o arquivo OFX do banco, confira linha por linha e só então
          importe. Nada vira lançamento antes da sua conferência.
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FinanceiroNav mes={periodo.mes} ano={periodo.ano} />

      <ImportarExtrato contas={contas} categorias={categorias} />
    </main>
  )
}
