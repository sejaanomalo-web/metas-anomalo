import Link from "next/link"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import GraficoEvolucao from "@/components/financeiro/GraficoEvolucao"
import ListaMovimentacoes from "@/components/financeiro/ListaMovimentacoes"
import KPICard from "@/components/ui/KPICard"
import { formatBRL } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import { periodoQS } from "@/lib/periodo-url"
import {
  getCategoriaPorId,
  getEvolucaoCategoria,
  listarContas,
  listarLancamentosDaCategoria,
} from "@/lib/financeiro"
import {
  corDaCategoria,
  somarLancamentos,
  GRANULARIDADES,
  rotuloGranularidade,
  type Granularidade,
  type TipoLancamento,
} from "@/lib/financeiro-regras"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * Detalhe de uma categoria — ou, quando o id é "sem-categoria", dos
 * lançamentos que ficaram sem classificação.
 *
 * A rota sentinela existe porque "Sem categoria" é uma fatia legítima do
 * gráfico e costuma ser justamente a que precisa de atenção: é o bolo de
 * dinheiro que ninguém classificou. Ela recebe ?tipo= porque, sem categoria,
 * não há de onde inferir se são receitas ou despesas.
 */
const SEM_CATEGORIA = "sem-categoria"

function granularidadeValida(v?: string): Granularidade {
  return GRANULARIDADES.includes(v as Granularidade) ? (v as Granularidade) : "mes"
}

export default async function CategoriaDetalhePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: {
    mes?: string
    ano?: string
    de?: string
    ate?: string
    modo?: string
    g?: string
    tipo?: string
    busca?: string
  }
}) {
  await requererPermissao("dashboard_financeiro")

  const periodo = parsePeriodo(searchParams)
  const qs = periodoQS(periodo)
  const granularidade = granularidadeValida(searchParams?.g)
  const busca = (searchParams?.busca ?? "").trim() || undefined

  const ehSemCategoria = params.id === SEM_CATEGORIA
  const tipoParam =
    searchParams?.tipo === "receita" || searchParams?.tipo === "despesa"
      ? (searchParams.tipo as TipoLancamento)
      : undefined

  const categoria = ehSemCategoria ? null : await getCategoriaPorId(params.id)

  if (!ehSemCategoria && !categoria) {
    return (
      <main className="mx-auto px-8 py-10" style={{ maxWidth: 900 }}>
        <h1 style={{ fontSize: 24 }}>Categoria não encontrada</h1>
        <p style={{ color: "var(--text-3)", marginTop: 8, fontSize: 14 }}>
          Ela pode ter sido excluída. Os lançamentos continuam existindo, agora
          como &quot;Sem categoria&quot;.
        </p>
        <Link
          href={`/dashboard/financeiro/categorias${qs ? `?${qs}` : ""}`}
          style={{ display: "inline-block", marginTop: 16, color: "var(--accent)" }}
        >
          ← Voltar para Categorias
        </Link>
      </main>
    )
  }

  const tipo = categoria?.tipo ?? tipoParam

  const [serie, lancamentos, contas] = await Promise.all([
    getEvolucaoCategoria({
      categoriaId: categoria?.id ?? null,
      tipo,
      granularidade,
      referencia: periodo.ate,
    }),
    listarLancamentosDaCategoria({
      categoriaId: categoria?.id ?? null,
      tipo,
      de: periodo.de,
      ate: periodo.ate,
      busca,
    }),
    listarContas(false),
  ])

  const realizado = somarLancamentos(lancamentos, "realizado")
  const previsto = somarLancamentos(lancamentos, "previsto")

  const ehReceita = tipo === "receita"
  const nome = categoria?.nome ?? "Sem categoria"
  const cor = categoria ? corDaCategoria(categoria) : "#4c4e54"

  const hrefG = (g: Granularidade) => {
    const p = new URLSearchParams(qs)
    p.set("g", g)
    if (tipoParam) p.set("tipo", tipoParam)
    if (busca) p.set("busca", busca)
    return `/dashboard/financeiro/categorias/${params.id}?${p.toString()}`
  }

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <Link
          href={`/dashboard/financeiro/categorias${qs ? `?${qs}` : ""}`}
          style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}
        >
          ← Voltar para Categorias
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
          <h1 style={{ fontSize: 34, display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: cor,
                flexShrink: 0,
              }}
            />
            {nome}
            {categoria && !categoria.ativa && (
              <span style={{ fontSize: 14, color: "var(--text-3)" }}>(inativa)</span>
            )}
          </h1>
          <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
        </div>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 8 }}>
          {tipo ? (ehReceita ? "Receita" : "Despesa") : "Receitas e despesas"} ·{" "}
          {periodo.rotulo}
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FinanceiroNav mes={periodo.mes} ano={periodo.ano} />

      <section className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
        <KPICard
          label="Realizado no período"
          valor={formatBRL(ehReceita ? realizado.entradas : realizado.saidas)}
          iconStatus={ehReceita ? "success" : "danger"}
          semDados={realizado.quantidade === 0}
          semDadosTexto="Nada realizado no período"
          delta={{
            texto: `${realizado.quantidade} lançamento${realizado.quantidade === 1 ? "" : "s"}`,
            status: "neutral",
          }}
        />
        <KPICard
          label="Previsto em aberto"
          valor={formatBRL(ehReceita ? previsto.entradas : previsto.saidas)}
          iconStatus="neutral"
          semDados={previsto.quantidade === 0}
          semDadosTexto="Nada em aberto"
          delta={{
            texto: `${previsto.quantidade} lançamento${previsto.quantidade === 1 ? "" : "s"}`,
            status: "neutral",
          }}
        />
      </section>

      <section
        className="glass"
        style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                color: "var(--muted-foreground)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Evolução
            </p>
            <h3 style={{ fontSize: 17, marginTop: 4 }}>
              Só lançamentos realizados
            </h3>
          </div>
          <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--surface-2)", borderRadius: 10 }}>
            {GRANULARIDADES.map((g) => (
              <Link
                key={g}
                href={hrefG(g)}
                style={{
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 7,
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                  background: g === granularidade ? "var(--accent)" : "transparent",
                  color: g === granularidade ? "#000" : "var(--text-2)",
                  textDecoration: "none",
                }}
              >
                {rotuloGranularidade(g)}
              </Link>
            ))}
          </div>
        </div>
        <GraficoEvolucao serie={serie} destacar={ehReceita ? "receitas" : "despesas"} cor={cor} />
      </section>

      <ListaMovimentacoes
        lancamentos={lancamentos}
        contas={contas}
        titulo="Lançamentos do período"
      />
    </main>
  )
}
