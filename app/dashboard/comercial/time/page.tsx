import Link from "next/link"
import AbasArea from "@/components/AbasArea"
import SeletorPeriodoFunil from "@/components/comercial/funis/SeletorPeriodoFunil"
import estilos from "@/components/comercial/funis/funis.module.css"
import { requererAdmin, requererPermissao } from "@/lib/auth"
import { formatBRL, formatNumero } from "@/lib/data"
import {
  formatarPct,
  hojeBRT,
  parsePeriodoFunil,
  periodoParaParams,
  resumirFunil,
} from "@/lib/funil-calculo"
import {
  listarFunis,
  listarLancamentos,
  listarUsuariosComercial,
} from "@/lib/funis-comerciais"

export const dynamic = "force-dynamic"

const celula: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  textAlign: "right",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
  borderTop: "1px solid var(--card-border)",
}
const titulo: React.CSSProperties = {
  ...celula,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-2)",
  borderTop: "none",
}

/**
 * Visão do admin sobre todas as interfaces comerciais. Cada funil tem as
 * próprias etapas, então só o que é comum entre eles entra no total do time:
 * investimento, perdidos e faturamento.
 */
export default async function TimeFunisPage({
  searchParams,
}: {
  searchParams: { modo?: string; de?: string; ate?: string; mes?: string; ano?: string }
}) {
  await requererPermissao("dashboard_comercial")
  await requererAdmin()

  const hoje = hojeBRT()
  const periodo = parsePeriodoFunil(searchParams, hoje)
  const paramsPeriodo = new URLSearchParams(periodoParaParams(periodo))

  const [usuarios, { funis, tabelaAusente }] = await Promise.all([
    listarUsuariosComercial(),
    listarFunis(),
  ])
  const lancamentos = await listarLancamentos(
    funis.map((f) => f.id),
    periodo.de,
    periodo.ate
  )

  const pessoas = usuarios.map((u) => ({
    ...u,
    funis: funis
      .filter((f) => f.usuario_id === u.id)
      .map((f) => ({
        funil: f,
        resumo: resumirFunil(
          f.etapas,
          lancamentos.filter((l) => l.funil_id === f.id)
        ),
      })),
  }))
  const resumos = pessoas.flatMap((p) => p.funis.map((f) => f.resumo))
  const investido = resumos.reduce((s, r) => s + r.investimento, 0)
  const faturado = resumos.reduce((s, r) => s + r.faturamento, 0)
  const perdidos = resumos.reduce((s, r) => s + r.perdidos, 0)

  return (
    <main className="mx-auto px-4 sm:px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div className={`hero-banner ${estilos.hero}`}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>
          Comercial · Time
        </p>
        <div className={estilos.heroTopo}>
          <h1 style={{ fontSize: 34 }}>{periodo.rotulo}</h1>
          <SeletorPeriodoFunil periodo={periodo} hoje={hoje} />
        </div>
        <div style={{ marginTop: 16 }}>
          <AbasArea
            itens={[
              {
                label: "Funis",
                href: `/dashboard/comercial?${paramsPeriodo.toString()}`,
                ativo: false,
              },
              {
                label: "Time",
                href: `/dashboard/comercial/time?${paramsPeriodo.toString()}`,
                ativo: true,
              },
              {
                label: "Histórico",
                href: "/dashboard/comercial/historico",
                ativo: false,
              },
            ]}
          />
        </div>
      </div>

      {tabelaAusente ? (
        <div className="glass" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 18 }}>Falta preparar o banco</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-2)" }}>
            Os funis precisam da migration{" "}
            <code>20261106_comercial_funis.sql</code>. Rode-a no SQL Editor do
            Supabase e recarregue a página.
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Total do time no período" className={estilos.kpis}>
            {[
              { rotulo: "Investido pelo time", valor: formatBRL(investido) },
              { rotulo: "Contratos perdidos", valor: formatNumero(perdidos) },
              { rotulo: "Faturamento gerado", valor: formatBRL(faturado) },
            ].map((k) => (
              <div key={k.rotulo} className={`glass ${estilos.kpi}`}>
                <p>{k.rotulo}</p>
                <p>{k.valor}</p>
              </div>
            ))}
          </section>

          {pessoas.map((p) => (
            <section key={p.id} data-pessoa={p.nome}>
              <h2 style={{ fontSize: 18, marginBottom: 10 }}>{p.nome}</h2>
              {p.funis.length === 0 ? (
                <p
                  className="glass"
                  style={{ padding: 16, fontSize: 13, color: "var(--text-3)" }}
                >
                  Sem funis criados.
                </p>
              ) : (
                <div className="glass" style={{ overflowX: "auto", padding: 4 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ ...titulo, textAlign: "left" }}>
                          Funil
                        </th>
                        <th scope="col" style={titulo}>Investido</th>
                        <th scope="col" style={titulo}>Topo</th>
                        <th scope="col" style={titulo}>Fechados</th>
                        <th scope="col" style={titulo}>Perdidos</th>
                        <th scope="col" style={titulo}>Faturamento</th>
                        <th scope="col" style={{ ...titulo, textAlign: "left" }}>
                          Maior gargalo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.funis.map(({ funil, resumo }) => {
                        const href = new URLSearchParams(paramsPeriodo)
                        href.set("usuario", p.id)
                        href.set("funil", funil.id)
                        return (
                          <tr key={funil.id}>
                            <th
                              scope="row"
                              style={{ ...celula, textAlign: "left", fontWeight: 600 }}
                            >
                              <Link
                                href={`/dashboard/comercial?${href.toString()}`}
                                style={{ color: "var(--accent)" }}
                              >
                                {funil.nome}
                              </Link>
                            </th>
                            <td style={celula}>{formatBRL(resumo.investimento)}</td>
                            <td style={celula}>
                              {formatNumero(resumo.etapas[0]?.valor ?? 0)}
                            </td>
                            <td style={celula}>{formatNumero(resumo.fechados)}</td>
                            <td style={celula}>{formatNumero(resumo.perdidos)}</td>
                            <td style={celula}>{formatBRL(resumo.faturamento)}</td>
                            <td style={{ ...celula, textAlign: "left" }}>
                              {resumo.gargalo
                                ? `${resumo.gargalo.de} → ${resumo.gargalo.para} (${formatarPct(resumo.gargalo.taxa)})`
                                : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </main>
  )
}
