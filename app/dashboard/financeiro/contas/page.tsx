import SeletorPeriodo from "@/components/SeletorPeriodo"
import ListaContas from "@/components/financeiro/ListaContas"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import { mesValido, anoValido } from "@/lib/data"
import { listarContas, getSaldoPorConta } from "@/lib/financeiro"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function ContasPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  await requererPermissao("dashboard_financeiro")

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  const [contas, saldosLista] = await Promise.all([
    listarContas(false),
    getSaldoPorConta(),
  ])

  const saldos = new Map(saldosLista.map((s) => [s.conta.id, s.saldo_atual]))

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>
          Financeiro · Contas
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
          <h1 style={{ fontSize: 36 }}>Contas</h1>
          <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10 }}>
          Banco, caixa, cartões e investimentos. Saldo atual = inicial + receitas
          realizadas − despesas realizadas.
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FinanceiroNav mes={mes} ano={ano} />

      <ListaContas contas={contas} saldos={saldos} />
    </main>
  )
}
