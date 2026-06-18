import Link from "next/link"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import TabelaLancamentos from "@/components/financeiro/TabelaLancamentos"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import { parsePeriodo } from "@/lib/periodo"
import { periodoQS } from "@/lib/periodo-url"
import {
  listarLancamentos,
  listarCategorias,
  listarContas,
} from "@/lib/financeiro"
import { listarEmpresas } from "@/lib/empresas-actions"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

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

  const [lancamentos, categorias, contas, empresas] = await Promise.all([
    listarLancamentos({ de: periodo.de, ate: periodo.ate, tipo, status }),
    listarCategorias(undefined, false),
    listarContas(false),
    listarEmpresas(true),
  ])

  const empresasUI = empresas.map((e) => ({ nome: e.nome, slug: e.slug }))

  // Base de query que PRESERVA o período (modo/de/ate ou mes/ano) nos chips
  // de filtro — antes os chips fixavam ?mes=&ano= e derrubavam dia/intervalo.
  const base = periodoQS(periodo)
  const lancHref = (extra?: string) =>
    `/dashboard/financeiro/lancamentos?${base}${extra ? `&${extra}` : ""}`

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
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
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FinanceiroNav mes={mes} ano={ano} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FiltroChip href={lancHref()} ativo={!tipo && !status}>
          Todos
        </FiltroChip>
        <FiltroChip href={lancHref("tipo=receita")} ativo={tipo === "receita"}>
          Receitas
        </FiltroChip>
        <FiltroChip href={lancHref("tipo=despesa")} ativo={tipo === "despesa"}>
          Despesas
        </FiltroChip>
        <FiltroChip href={lancHref("status=previsto")} ativo={status === "previsto"}>
          Previstos
        </FiltroChip>
        <FiltroChip href={lancHref("status=realizado")} ativo={status === "realizado"}>
          Realizados
        </FiltroChip>
      </div>

      <TabelaLancamentos
        lancamentos={lancamentos}
        categorias={categorias}
        contas={contas}
        empresas={empresasUI}
        mesAtual={mes}
        anoAtual={ano}
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
