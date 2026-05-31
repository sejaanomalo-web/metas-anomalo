import SeletorPeriodo from "@/components/SeletorPeriodo"
import ListaRecorrentes from "@/components/financeiro/ListaRecorrentes"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import { mesValido, anoValido } from "@/lib/data"
import {
  listarRecorrentes,
  listarCategorias,
  listarContas,
} from "@/lib/financeiro"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function RecorrentesPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  await requererPermissao("dashboard_financeiro")

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  const [recorrentes, categorias, contas] = await Promise.all([
    listarRecorrentes(false),
    listarCategorias(undefined, false),
    listarContas(false),
  ])

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>
          Financeiro · Recorrentes
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
          <h1 style={{ fontSize: 36 }}>Pagamentos recorrentes</h1>
          <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 10 }}>
          Templates que geram lançamentos automaticamente (aluguel, plataformas, salários).
          Use <strong>Gerar lançamentos</strong> pra materializar manualmente o mês selecionado ·
          o cron mensal faz isso automaticamente todo dia 1.
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FinanceiroNav mes={mes} ano={ano} />

      <ListaRecorrentes
        recorrentes={recorrentes}
        categorias={categorias}
        contas={contas}
        mesAtual={mes}
        anoAtual={ano}
      />
    </main>
  )
}
