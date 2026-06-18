import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import ListaCategorias from "@/components/financeiro/ListaCategorias"
import GraficoCategorias from "@/components/financeiro/GraficoCategorias"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import { parsePeriodo } from "@/lib/periodo"
import { listarCategorias, getDREPeriodo } from "@/lib/financeiro"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string; de?: string; ate?: string; modo?: string }
}) {
  await requererPermissao("dashboard_financeiro")

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano
  const [categorias, dre] = await Promise.all([
    listarCategorias(undefined, false),
    getDREPeriodo(periodo.de, periodo.ate, mes, ano),
  ])

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>
          Financeiro · Categorias
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
          <h1 style={{ fontSize: 36 }}>Categorias</h1>
          <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10 }}>
          Organize lançamentos por categoria pra DRE e relatórios.
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FinanceiroNav mes={mes} ano={ano} />

      <ListaCategorias categorias={categorias} />

      {/* Divisão de gastos por categoria — mesmo gráfico da Visão geral,
          dirigido pelo período global selecionado. */}
      <GraficoCategorias
        despesas={dre.despesas}
        receitas={dre.receitas}
        totalDespesas={dre.total_despesas}
        totalReceitas={dre.total_receitas}
        rotulo={periodo.rotulo}
      />
    </main>
  )
}
