import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import FinanceiroNav from "@/components/financeiro/FinanceiroNav"
import BotoesExportarRelatorio from "@/components/financeiro/BotoesExportarRelatorio"
import { formatBRL, formatNumero } from "@/lib/data"
import { parsePeriodo } from "@/lib/periodo"
import { getDREPeriodo, getFluxoCaixaAnual, rotuloMes } from "@/lib/financeiro"
import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: { mes?: string; ano?: string; de?: string; ate?: string; modo?: string }
}) {
  await requererPermissao("dashboard_financeiro")

  const periodo = parsePeriodo(searchParams)
  const mes = periodo.mes
  const ano = periodo.ano

  const [dre, fluxo] = await Promise.all([
    // DRE respeita o período selecionado (mês/dia/intervalo); o histórico
    // e a projeção continuam ancorados no ANO/mês representativo.
    getDREPeriodo(periodo.de, periodo.ate, mes, ano),
    getFluxoCaixaAnual(ano),
  ])

  // Projeção 3 meses à frente: média móvel das receitas/despesas realizadas
  // nos 3 meses anteriores. O mês de referência vem do INÍCIO do período
  // selecionado, no calendário de verdade (1–12) — não do tipo `Mes`, que
  // pula janeiro a março.
  const mesRef = Number(periodo.de.slice(5, 7))
  const tresAntes = fluxo.slice(Math.max(0, mesRef - 1 - 3), mesRef - 1)
  const media = (campo: "receitas" | "despesas") =>
    tresAntes.length > 0
      ? tresAntes.reduce((s, p) => s + p[campo], 0) / tresAntes.length
      : 0
  const mediaReceita = media("receitas")
  const mediaDespesa = media("despesas")
  // Projeta sempre 3 meses, atravessando a virada do ano (dezembro → janeiro).
  const projecao = [1, 2, 3].map((offset) => {
    const m = ((mesRef - 1 + offset) % 12) + 1
    return {
      mes: m,
      rotulo: rotuloMes(m),
      receitas: mediaReceita,
      despesas: mediaDespesa,
      resultado: mediaReceita - mediaDespesa,
    }
  })

  return (
    <main className="mx-auto px-4 md:px-8 py-10 space-y-10" style={{ maxWidth: 1280 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>
          Financeiro · Relatórios
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
          <h1 style={{ fontSize: 36 }}>DRE e projeção · {periodo.rotulo}</h1>
          <SeletorPeriodoGlobal mesAtual={mes} anoAtual={ano} />
        </div>
        <div className="gold-divider" style={{ marginTop: 18 }} />
      </div>

      <FinanceiroNav mes={mes} ano={ano} />

      <div
        className="no-print"
        style={{ display: "flex", justifyContent: "flex-end" }}
      >
        <BotoesExportarRelatorio
          dre={dre}
          fluxo={fluxo}
          projecao={projecao}
          mes={mes}
          ano={ano}
          rotulo={periodo.rotulo}
        />
      </div>

      {/* DRE simplificado */}
      <section className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, alignItems: "start" }}>
        <BlocoDRE
          titulo="Receitas"
          total={dre.total_receitas}
          linhas={dre.receitas}
          cor="success"
        />
        <BlocoDRE
          titulo="Despesas"
          total={dre.total_despesas}
          linhas={dre.despesas}
          cor="danger"
        />
      </section>

      {/* Resultado */}
      <section
        className="glass"
        style={{
          padding: "24px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
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
            Resultado do período
          </p>
          <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginTop: 4 }}>
            Receitas − Despesas · {periodo.rotulo}
          </p>
        </div>
        <p
          style={{
            fontSize: 32,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: dre.resultado >= 0 ? "var(--success)" : "var(--destructive)",
          }}
        >
          {formatBRL(dre.resultado)}
        </p>
      </section>

      {/* Projeção 3 meses */}
      <section
        className="glass"
        style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}
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
            Projeção · próximos 3 meses
          </p>
          <h3 style={{ fontSize: 18, marginTop: 4 }}>Baseada na média móvel dos 3 meses anteriores</h3>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
            Tendência simples, não considera recorrentes futuros nem sazonalidade.
            Use só como referência inicial.
          </p>
        </div>

        {projecao.length === 0 ? (
          <p style={{ color: "var(--muted-foreground)" }}>Sem meses suficientes para projetar.</p>
        ) : (
          <div style={{ overflowX: "auto", marginLeft: -24, marginRight: -24 }}>
            <table
              style={{
                width: "100%",
                minWidth: 480,
                borderCollapse: "collapse",
                marginTop: 8,
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <Th>Mês</Th>
                  <Th align="right">Receita projetada</Th>
                  <Th align="right">Despesa projetada</Th>
                  <Th align="right">Resultado</Th>
                </tr>
              </thead>
              <tbody>
                {projecao.map((p) => (
                  <tr key={p.mes} style={{ borderBottom: "1px solid var(--border)" }}>
                    <Td>{p.rotulo}</Td>
                    <Td align="right" mono>{formatBRL(p.receitas)}</Td>
                    <Td align="right" mono>{formatBRL(p.despesas)}</Td>
                    <Td align="right" mono>
                      <span style={{ color: p.resultado >= 0 ? "var(--success)" : "var(--destructive)", fontWeight: 600 }}>
                        {formatBRL(p.resultado)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tabela ano todo */}
      <section
        className="glass"
        style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h3 style={{ fontSize: 18 }}>Histórico {ano}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <Th>Mês</Th>
                <Th align="right">Receitas</Th>
                <Th align="right">Despesas</Th>
                <Th align="right">Resultado</Th>
              </tr>
            </thead>
            <tbody>
              {fluxo.map((p) => {
                const ehAtual = p.mes === mesRef
                return (
                  <tr
                    key={p.mes}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: ehAtual ? "var(--surface-2)" : "transparent",
                      fontWeight: ehAtual ? 600 : 400,
                    }}
                  >
                    <Td>{rotuloMes(p.mes)}</Td>
                    <Td align="right" mono>{formatBRL(p.receitas)}</Td>
                    <Td align="right" mono>{formatBRL(p.despesas)}</Td>
                    <Td align="right" mono>
                      <span style={{ color: p.resultado >= 0 ? "var(--foreground)" : "var(--destructive)" }}>
                        {formatBRL(p.resultado)}
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
          {formatNumero(fluxo.length)} meses · só lançamentos realizados, pela data
          de competência — a mesma regra do DRE acima.
        </p>
      </section>
    </main>
  )
}

function BlocoDRE({
  titulo,
  total,
  linhas,
  cor,
}: {
  titulo: string
  total: number
  linhas: { categoria_id: string | null; categoria_nome: string; cor: string; total: number; qtd: number }[]
  cor: "success" | "danger"
}) {
  const corCSS = cor === "success" ? "var(--success)" : "var(--destructive)"
  return (
    <div className="glass" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--surface-2)",
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</p>
        <p
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: corCSS,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatBRL(total)}
        </p>
      </div>
      {linhas.length === 0 ? (
        <p style={{ padding: 20, color: "var(--muted-foreground)", fontSize: 13 }}>
          Nenhum lançamento.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {linhas.map((l, i) => {
              const pct = total > 0 ? (l.total / total) * 100 : 0
              return (
                <tr key={`${l.categoria_id ?? "null"}|${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 24px", verticalAlign: "middle" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: l.cor,
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500 }}>{l.categoria_nome}</p>
                        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                          {l.qtd} {l.qtd === 1 ? "lançamento" : "lançamentos"} · {pct.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {formatBRL(l.total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 16px",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--muted-foreground)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = "left",
  mono = false,
}: {
  children?: React.ReactNode
  align?: "left" | "right"
  mono?: boolean
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "10px 16px",
        verticalAlign: "middle",
        fontVariantNumeric: mono ? "tabular-nums" : "normal",
      }}
    >
      {children}
    </td>
  )
}
