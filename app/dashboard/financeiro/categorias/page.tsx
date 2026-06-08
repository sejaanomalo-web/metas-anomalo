import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import ListaCategorias from "@/components/financeiro/ListaCategorias"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import { mesValido, anoValido } from "@/lib/data"
import { listarCategorias } from "@/lib/financeiro"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  await requererPermissao("dashboard_financeiro")

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
  const categorias = await listarCategorias(undefined, false)

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
    </main>
  )
}
