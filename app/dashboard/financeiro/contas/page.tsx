import ListaContas from "@/components/financeiro/ListaContas"
import { listarContas, getSaldoPorConta } from "@/lib/financeiro"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function ContasPage() {
  await requererPermissao("dashboard_financeiro")

  const [contas, saldosLista] = await Promise.all([
    listarContas(false),
    getSaldoPorConta(),
  ])

  const saldos = new Map(saldosLista.map((s) => [s.conta.id, s.saldo_atual]))

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)" }}>
          Financeiro · Contas
        </p>
        <h1 style={{ marginTop: 6, fontSize: 36 }}>Contas</h1>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginTop: 10 }}>
          Banco, caixa, cartões e investimentos. Saldo atual = inicial + receitas
          realizadas − despesas realizadas.
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <ListaContas contas={contas} saldos={saldos} />
    </main>
  )
}
