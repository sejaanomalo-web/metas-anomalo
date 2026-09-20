import Link from "next/link"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabelaLancamentos from "@/components/financeiro/TabelaLancamentos"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import { parsePeriodo } from "@/lib/periodo"
import { periodoQS } from "@/lib/periodo-url"
import {
  listarLancamentosDetalhado,
  listarCategorias,
  listarContas,
} from "@/lib/financeiro"
import { ehCaminhoInternoSeguro } from "@/lib/financeiro-regras"
import type { EixoPeriodo, SituacaoFinanceira } from "@/lib/financeiro-regras"
import { listarEmpresas } from "@/lib/empresas-actions"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

function situacaoValida(v?: string): SituacaoFinanceira {
  return v === "realizado" || v === "previsto" ? v : "total"
}

export default async function FinanceiroLancamentosPage({
  searchParams,
}: {
  searchParams: {
    mes?: string
    ano?: string
    de?: string
    ate?: string
    modo?: string
    tipo?: string
    status?: string
    situacao?: string
    eixo?: string
    lanc?: string
    voltar?: string
    busca?: string
  }
}) {
  await requererPermissao("dashboard_financeiro")

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano
  const tipo = searchParams?.tipo === "receita" || searchParams?.tipo === "despesa"
    ? (searchParams.tipo as "receita" | "despesa")
    : undefined
  const status =
    searchParams?.status === "previsto" ||
    searchParams?.status === "realizado" ||
    searchParams?.status === "cancelado"
      ? (searchParams.status as "previsto" | "realizado" | "cancelado")
      : undefined

  // Situação decide o que os TOTAIS somam (R1/R2). Os chips acima filtram
  // quais LINHAS aparecem. São coisas diferentes e a tela diz isso.
  const situacao = situacaoValida(searchParams?.situacao)

  // R6. Links vindos da agenda perguntam "o que vence neste dia", não "de que
  // mês é este dinheiro" — aí o recorte e a ordem passam pelo vencimento.
  const eixo: EixoPeriodo =
    searchParams?.eixo === "vencimento" ? "vencimento" : "competencia"

  // Redirect aberto: só caminho interno é aceito como destino do "Voltar".
  const voltar = ehCaminhoInternoSeguro(searchParams?.voltar)
    ? (searchParams!.voltar as string)
    : null

  const busca = (searchParams?.busca ?? "").trim() || undefined

  const [resultado, categorias, contas, empresas] = await Promise.all([
    listarLancamentosDetalhado({
      de: periodo.de,
      ate: periodo.ate,
      tipo,
      status,
      eixo,
      busca,
    }),
    listarCategorias(undefined, false),
    listarContas(false),
    listarEmpresas(true),
  ])

  const empresasUI = empresas.map((e) => ({ nome: e.nome, slug: e.slug }))

  // Base de query que PRESERVA o período (modo/de/ate ou mes/ano) nos chips
  // de filtro — antes os chips fixavam ?mes=&ano= e derrubavam dia/intervalo.
  const base = periodoQS(periodo)
  const extras: string[] = []
  if (eixo === "vencimento") extras.push("eixo=vencimento")
  if (voltar) extras.push(`voltar=${encodeURIComponent(voltar)}`)
  const sufixo = extras.length > 0 ? `&${extras.join("&")}` : ""

  const lancHref = (extra?: string) =>
    `/dashboard/financeiro/lancamentos?${base}${extra ? `&${extra}` : ""}${sufixo}`

  const filtroAtual = (novo: string) => {
    const partes: string[] = []
    if (tipo) partes.push(`tipo=${tipo}`)
    if (status) partes.push(`status=${status}`)
    if (busca) partes.push(`busca=${encodeURIComponent(busca)}`)
    partes.push(novo)
    return partes.join("&")
  }

  return (
    <main className="mx-auto px-4 md:px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>
          Financeiro · Lançamentos
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
          <h1 style={{ fontSize: 36 }}>Lançamentos · {periodo.rotulo}</h1>
          <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
        </div>
        {voltar && (
          <Link
            href={voltar}
            style={{
              display: "inline-block",
              marginTop: 10,
              fontSize: 13,
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            ← {voltar.startsWith("/dashboard/workspace") ? "Voltar para a agenda" : "Voltar"}
          </Link>
        )}
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FinanceiroNav mes={mes} ano={ano} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FiltroChip href={lancHref(filtroAtual("").replace(/^tipo=[^&]*&?/, ""))} ativo={!tipo}>
          Todos
        </FiltroChip>
        <FiltroChip href={lancHref(filtroAtual("tipo=receita"))} ativo={tipo === "receita"}>
          Receitas
        </FiltroChip>
        <FiltroChip href={lancHref(filtroAtual("tipo=despesa"))} ativo={tipo === "despesa"}>
          Despesas
        </FiltroChip>
        <FiltroChip href={lancHref(filtroAtual("status=previsto"))} ativo={status === "previsto"}>
          Previstos
        </FiltroChip>
        <FiltroChip href={lancHref(filtroAtual("status=realizado"))} ativo={status === "realizado"}>
          Realizados
        </FiltroChip>
      </div>

      <TabelaLancamentos
        lancamentos={resultado.lancamentos}
        truncado={resultado.truncado}
        limite={resultado.limite}
        categorias={categorias}
        contas={contas}
        empresas={empresasUI}
        situacao={situacao}
        eixo={eixo}
        // Funções não atravessam a fronteira servidor→cliente: os três links
        // vão prontos.
        hrefsSituacao={{
          realizado: lancHref(filtroAtual("situacao=realizado")),
          previsto: lancHref(filtroAtual("situacao=previsto")),
          total: lancHref(filtroAtual("situacao=total")),
        }}
        lancDeepLink={searchParams?.lanc ?? null}
        mesNum={Number(periodo.de.slice(5, 7))}
        anoAtual={Number(periodo.de.slice(0, 4))}
      />
    </main>
  )
}

function FiltroChip({
  href,
  ativo,
  children,
}: {
  href: string
  ativo: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "6px 14px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        border: `0.5px solid ${ativo ? "var(--accent)" : "rgba(255,255,255,0.10)"}`,
        background: ativo ? "rgba(201,149,58,0.15)" : "transparent",
        color: ativo ? "var(--accent)" : "var(--text-3)",
        textDecoration: "none",
        transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
      }}
    >
      {children}
    </Link>
  )
}
