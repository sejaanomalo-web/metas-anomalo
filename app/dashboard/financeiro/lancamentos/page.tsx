import Link from "next/link"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import TabelaLancamentos from "@/components/financeiro/TabelaLancamentos"
import { mesValido, anoValido } from "@/lib/data"
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
    tipo?: string
    status?: string
  }
}) {
  await requererPermissao("dashboard_financeiro")

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)
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
    listarLancamentos({ mes, ano, tipo, status }),
    listarCategorias(undefined, false),
    listarContas(false),
    listarEmpresas(true),
  ])

  const empresasUI = empresas.map((e) => ({ nome: e.nome, slug: e.slug }))

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)" }}>
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
          <h1 style={{ fontSize: 36 }}>Lançamentos de {mes}</h1>
          <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <FiltroChip
            href={`/dashboard/financeiro/lancamentos?mes=${mes}&ano=${ano}`}
            ativo={!tipo && !status}
          >
            Todos
          </FiltroChip>
          <FiltroChip
            href={`/dashboard/financeiro/lancamentos?mes=${mes}&ano=${ano}&tipo=receita`}
            ativo={tipo === "receita"}
          >
            Receitas
          </FiltroChip>
          <FiltroChip
            href={`/dashboard/financeiro/lancamentos?mes=${mes}&ano=${ano}&tipo=despesa`}
            ativo={tipo === "despesa"}
          >
            Despesas
          </FiltroChip>
          <FiltroChip
            href={`/dashboard/financeiro/lancamentos?mes=${mes}&ano=${ano}&status=previsto`}
            ativo={status === "previsto"}
          >
            Previstos
          </FiltroChip>
          <FiltroChip
            href={`/dashboard/financeiro/lancamentos?mes=${mes}&ano=${ano}&status=realizado`}
            ativo={status === "realizado"}
          >
            Realizados
          </FiltroChip>
        </div>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <TabelaLancamentos
        lancamentos={lancamentos}
        categorias={categorias}
        contas={contas}
        empresas={empresasUI}
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
        padding: "6px 12px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 500,
        border: `1px solid ${ativo ? "var(--foreground)" : "var(--border)"}`,
        background: ativo ? "var(--surface-2)" : "transparent",
        color: "var(--foreground)",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  )
}
