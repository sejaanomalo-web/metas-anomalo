import ListaCategorias from "@/components/financeiro/ListaCategorias"
import { listarCategorias } from "@/lib/financeiro"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function CategoriasPage() {
  await requererPermissao("dashboard_financeiro")

  const categorias = await listarCategorias(undefined, false)

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)" }}>
          Financeiro · Categorias
        </p>
        <h1 style={{ marginTop: 6, fontSize: 36 }}>Categorias</h1>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginTop: 10 }}>
          Organize lançamentos por categoria pra DRE e relatórios.
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <ListaCategorias categorias={categorias} />
    </main>
  )
}
