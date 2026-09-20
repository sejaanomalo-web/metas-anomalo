import Link from "next/link"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import {
  GraficoCategoriasLazy,
  GraficoFluxoCaixaLazy,
} from "@/components/financeiro/graficos"
import ListaMovimentacoes from "@/components/financeiro/ListaMovimentacoes"
import KPICard from "@/components/ui/KPICard"
import { formatBRL } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import { periodoQS } from "@/lib/periodo-url"
import {
  getContaPorId,
  getFluxoAnualDaConta,
  getSaldoPorConta,
  listarCategorias,
  listarContas,
  listarLancamentosDaConta,
} from "@/lib/financeiro"
import {
  corDaCategoria,
  somarLancamentos,
  tipoContaRotulo,
  valorNumerico,
} from "@/lib/financeiro-regras"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function ContaDetalhePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { mes?: string; ano?: string; de?: string; ate?: string; modo?: string }
}) {
  await requererPermissao("dashboard_financeiro")

  const periodo = parsePeriodo(searchParams)
  const qs = periodoQS(periodo)
  const ano = Number(periodo.de.slice(0, 4))

  const conta = await getContaPorId(params.id)
  if (!conta) {
    return (
      <main className="mx-auto px-4 md:px-8 py-10" style={{ maxWidth: 900 }}>
        <h1 style={{ fontSize: 24 }}>Conta não encontrada</h1>
        <Link
          href={`/dashboard/financeiro/contas${qs ? `?${qs}` : ""}`}
          style={{ display: "inline-block", marginTop: 16, color: "var(--accent)" }}
        >
          ← Voltar para Contas
        </Link>
      </main>
    )
  }

  const [movimentacoes, fluxo, saldos, categorias, contas] = await Promise.all([
    listarLancamentosDaConta({ contaId: conta.id, de: periodo.de, ate: periodo.ate }),
    getFluxoAnualDaConta(conta.id, ano),
    getSaldoPorConta(),
    listarCategorias(undefined, false),
    listarContas(false),
  ])

  const saldoAtual =
    saldos.find((s) => s.conta.id === conta.id)?.saldo_atual ??
    valorNumerico(conta.saldo_inicial)

  const realizado = somarLancamentos(movimentacoes, "realizado")

  // Distribuição por categoria DESTA conta no período — mesma leitura do
  // donut geral, recortada pela conta.
  const catById = new Map(categorias.map((c) => [c.id, c]))
  type Acc = { total: number; qtd: number }
  const receitaAcc = new Map<string | null, Acc>()
  const despesaAcc = new Map<string | null, Acc>()
  for (const l of movimentacoes) {
    if (l.status !== "realizado") continue
    const acc = l.tipo === "receita" ? receitaAcc : despesaAcc
    const entry = acc.get(l.categoria_id) ?? { total: 0, qtd: 0 }
    entry.total += valorNumerico(l.valor)
    entry.qtd += 1
    acc.set(l.categoria_id, entry)
  }
  const construir = (acc: Map<string | null, Acc>) =>
    [...acc.entries()]
      .map(([catId, { total, qtd }]) => {
        const cat = catId ? catById.get(catId) : null
        return {
          categoria_id: catId,
          categoria_nome: cat?.nome ?? "Sem categoria",
          cor: corDaCategoria(cat),
          total,
          qtd,
        }
      })
      .sort((a, b) => b.total - a.total)

  const linhasReceita = construir(receitaAcc)
  const linhasDespesa = construir(despesaAcc)

  return (
    <main className="mx-auto px-4 md:px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <Link
          href={`/dashboard/financeiro/contas${qs ? `?${qs}` : ""}`}
          style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}
        >
          ← Voltar para Contas
        </Link>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontSize: 34 }}>{conta.nome}</h1>
          <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
        </div>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 8 }}>
          {tipoContaRotulo(conta.tipo)}
          {!conta.ativa && " · inativa"} · {periodo.rotulo}
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FinanceiroNav mes={periodo.mes} ano={periodo.ano} />

      <section className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16 }}>
        <KPICard
          label="Entrou · período"
          valor={formatBRL(realizado.entradas)}
          iconStatus="success"
          semDados={realizado.entradas === 0}
          semDadosTexto="Nada entrou no período"
        />
        <KPICard
          label="Saiu · período"
          valor={formatBRL(realizado.saidas)}
          iconStatus="danger"
          semDados={realizado.saidas === 0}
          semDadosTexto="Nada saiu no período"
        />
        <KPICard
          label="Saldo atual"
          valor={formatBRL(saldoAtual)}
          iconStatus={saldoAtual >= 0 ? "success" : "danger"}
          destaque
          delta={{
            texto: `Inicial: ${formatBRL(valorNumerico(conta.saldo_inicial))} em ${formatDataBR(conta.data_saldo_inicial)}`,
            status: "neutral",
          }}
        />
      </section>

      <section>
        <GraficoFluxoCaixaLazy dados={fluxo} ano={ano} />
      </section>

      {(linhasReceita.length > 0 || linhasDespesa.length > 0) && (
        <section>
          <GraficoCategoriasLazy
            despesas={linhasDespesa}
            receitas={linhasReceita}
            totalDespesas={realizado.saidas}
            totalReceitas={realizado.entradas}
            rotulo={periodo.rotulo}
            qsPeriodo={qs}
          />
        </section>
      )}

      <ListaMovimentacoes
        lancamentos={movimentacoes}
        contas={contas}
        titulo="Movimentações do período"
      />
    </main>
  )
}

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}
