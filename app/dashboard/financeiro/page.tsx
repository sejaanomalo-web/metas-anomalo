import Link from "next/link"
import SeletorPeriodo from "@/components/SeletorPeriodo"
import KPICard from "@/components/ui/KPICard"
import GraficoFluxoCaixa from "@/components/financeiro/GraficoFluxoCaixa"
import { mesValido, anoValido, formatBRL, formatNumero } from "@/lib/data"
import {
  getResumoFinanceiroMes,
  getFluxoCaixaAnual,
  getSaldoTotal,
  getSaldoPorConta,
  getProximosPrevistos,
  listarCategorias,
  getConferenciaSentinela,
} from "@/lib/financeiro"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

function IconeCifrao() {
  return <span style={{ fontSize: 14, fontWeight: 700 }}>$</span>
}

function IconeArrowUp() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  )
}

function IconeArrowDown() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  )
}

function IconeBalanca() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <path d="M8 7H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
    </svg>
  )
}

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

export default async function FinanceiroOverviewPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string }
}) {
  await requererPermissao("dashboard_financeiro")

  const mes = mesValido(searchParams?.mes)
  const ano = anoValido(searchParams?.ano)

  const [resumo, fluxo, saldoTotal, saldoPorConta, proximosPrevistos, categorias, conferencia] =
    await Promise.all([
      getResumoFinanceiroMes(mes, ano),
      getFluxoCaixaAnual(ano),
      getSaldoTotal(),
      getSaldoPorConta(),
      getProximosPrevistos(5),
      listarCategorias(undefined, false),
      getConferenciaSentinela(mes, ano),
    ])

  const conferenciaProblemas = conferencia.filter(
    (c) => c.status === "ausente" || c.status === "atencao"
  )

  const catById = new Map(categorias.map((c) => [c.id, c]))

  const temReceita = resumo.total_receitas > 0
  const temDespesa = resumo.total_despesas > 0
  const statusResultado: "success" | "danger" | "neutral" =
    resumo.resultado > 0 ? "success" : resumo.resultado < 0 ? "danger" : "neutral"

  return (
    <main className="mx-auto px-8 py-10 space-y-10" style={{ maxWidth: 1280 }}>
      {/* Hero */}
      <div>
        <p
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--muted-foreground)",
            letterSpacing: "0.01em",
          }}
        >
          Financeiro
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
          <h1 style={{ fontSize: 36 }}>Caixa · {mes} {ano}</h1>
          <SeletorPeriodo mesAtual={mes} anoAtual={ano} />
        </div>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginTop: 10 }}>
          Receitas, despesas, recorrentes e fluxo de caixa da Anômalo Hub.
        </p>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      {/* Quick links */}
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SubLink href={`/dashboard/financeiro/lancamentos?mes=${mes}&ano=${ano}`}>
          Lançamentos
        </SubLink>
        <SubLink href="/dashboard/financeiro/recorrentes">Recorrentes</SubLink>
        <SubLink href="/dashboard/financeiro/categorias">Categorias</SubLink>
        <SubLink href="/dashboard/financeiro/contas">Contas</SubLink>
        <SubLink href={`/dashboard/financeiro/relatorios?mes=${mes}&ano=${ano}`}>
          Relatórios
        </SubLink>
      </nav>

      {/* KPI cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 16 }}>
        <KPICard
          label="Saldo total"
          valor={formatBRL(saldoTotal)}
          icon={<IconeCifrao />}
          iconStatus={saldoTotal >= 0 ? "success" : "danger"}
          destaque
          delta={{
            texto: `${formatNumero(saldoPorConta.length)} ${
              saldoPorConta.length === 1 ? "conta" : "contas"
            }`,
            status: "neutral",
          }}
        />
        <KPICard
          label={`Receitas de ${mes}`}
          valor={formatBRL(resumo.total_receitas)}
          icon={<IconeArrowUp />}
          iconStatus={temReceita ? "success" : "neutral"}
          semDados={!temReceita}
          semDadosTexto="Nenhuma receita realizada"
          delta={
            resumo.receitas_previstas > 0
              ? {
                  texto: `+ ${formatBRL(resumo.receitas_previstas)} previsto`,
                  status: "neutral",
                }
              : undefined
          }
        />
        <KPICard
          label={`Despesas de ${mes}`}
          valor={formatBRL(resumo.total_despesas)}
          icon={<IconeArrowDown />}
          iconStatus={temDespesa ? "danger" : "neutral"}
          semDados={!temDespesa}
          semDadosTexto="Nenhuma despesa realizada"
          delta={
            resumo.despesas_previstas > 0
              ? {
                  texto: `+ ${formatBRL(resumo.despesas_previstas)} previsto`,
                  status: "neutral",
                }
              : undefined
          }
        />
        <KPICard
          label={`Resultado de ${mes}`}
          valor={formatBRL(resumo.resultado)}
          icon={<IconeBalanca />}
          iconStatus={statusResultado}
          semDados={!temReceita && !temDespesa}
          semDadosTexto="Sem movimentação no mês"
          delta={
            resumo.qtd_lancamentos > 0
              ? {
                  texto: `${formatNumero(resumo.qtd_lancamentos)} ${
                    resumo.qtd_lancamentos === 1 ? "lançamento" : "lançamentos"
                  }`,
                  status: "neutral",
                }
              : undefined
          }
        />
      </section>

      {/* Gráfico fluxo de caixa */}
      <section>
        <GraficoFluxoCaixa dados={fluxo} ano={ano} />
      </section>

      {/* Conferência com Sentinela — só aparece se há divergência */}
      {conferenciaProblemas.length > 0 && (
        <section
          className="glass"
          style={{
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            borderColor: "rgba(212, 160, 23, 0.45)",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                color: "var(--warning)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Conferência com Sentinela
            </p>
            <h3 style={{ fontSize: 16, marginTop: 4 }}>
              Faturamento operacional sem receita registrada
            </h3>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
              Empresas que tiveram faturamento reportado pelo gestor de tráfego mas a
              receita ainda não foi lançada aqui. Pode indicar venda esperando cobrança.
            </p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Empresa</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Operacional</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Registrada</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {conferenciaProblemas.map((c) => (
                  <tr key={c.empresa} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 8, height: 8, borderRadius: "50%",
                          background: c.status === "ausente" ? "var(--destructive)" : "var(--warning)",
                          marginRight: 8,
                        }}
                      />
                      {c.empresa}
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: 8 }}>
                        {c.status === "ausente" ? "ausente" : "diverge"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatBRL(c.faturamento_operacional)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatBRL(c.receita_registrada)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--destructive)" }}>
                      {formatBRL(c.diferenca)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Saldo por conta + próximos vencimentos */}
      <section
        className="grid grid-cols-1 lg:grid-cols-2"
        style={{ gap: 16, alignItems: "start" }}
      >
        <div
          className="glass"
          style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <h3 style={{ fontSize: 16 }}>Saldo por conta</h3>
          {saldoPorConta.length === 0 ? (
            <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
              Nenhuma conta cadastrada. <Link href="/dashboard/financeiro/contas" style={{ color: "var(--primary)", textDecoration: "underline" }}>Cadastrar conta</Link>.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {saldoPorConta.map(({ conta, saldo_atual }) => (
                <div
                  key={conta.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border)",
                    opacity: conta.ativa ? 1 : 0.5,
                  }}
                >
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500 }}>{conta.nome}</p>
                    <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                      {conta.tipo.replace("_", " ")}
                      {!conta.ativa && " · inativa"}
                    </p>
                  </div>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color: saldo_atual >= 0 ? "var(--foreground)" : "var(--destructive)",
                    }}
                  >
                    {formatBRL(saldo_atual)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="glass"
          style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <h3 style={{ fontSize: 16 }}>Próximos vencimentos</h3>
          {proximosPrevistos.length === 0 ? (
            <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
              Nenhum lançamento previsto.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {proximosPrevistos.map((l) => {
                const cat = l.categoria_id ? catById.get(l.categoria_id) : null
                return (
                  <div
                    key={l.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {l.descricao}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: "var(--muted-foreground)",
                          marginTop: 2,
                        }}
                      >
                        {formatDataBR(l.data)}
                        {cat && ` · ${cat.nome}`}
                      </p>
                    </div>
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                        color: l.tipo === "receita" ? "var(--success)" : "var(--destructive)",
                        whiteSpace: "nowrap",
                        marginLeft: 12,
                      }}
                    >
                      {l.tipo === "receita" ? "+" : "−"} {formatBRL(l.valor)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function SubLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        padding: "8px 14px",
        background: "var(--background)",
        border: "1px solid var(--border)",
        borderRadius: 2,
        color: "var(--foreground)",
        fontSize: 13,
        fontWeight: 500,
        textDecoration: "none",
        transition: "background 0.15s",
      }}
    >
      {children}
    </Link>
  )
}
