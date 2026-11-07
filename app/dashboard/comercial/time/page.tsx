import Link from "next/link"
import AbasArea from "@/components/AbasArea"
import SeletorPeriodoGlobal from "@/components/SeletorPeriodoGlobal"
import estilos from "@/components/comercial/funis/funis.module.css"
import { requererAdmin, requererPermissao } from "@/lib/auth"
import { formatBRL, formatNumero } from "@/lib/data"
import { formatarPct, resumirFunil, resumirPorFonte } from "@/lib/funil-calculo"
import { fontesDoFunil } from "@/lib/funil-tipos"
import {
  listarFunis,
  listarLancamentos,
  listarUsuariosComercial,
} from "@/lib/funis-comerciais"
import { parsePeriodo } from "@/lib/periodo"
import { periodoQS } from "@/lib/periodo-url"

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

  const periodo = parsePeriodo(searchParams)
  const paramsPeriodo = new URLSearchParams(periodoQS(periodo))

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

  // Fontes de funis diferentes se somam pelo nome. Etapas não entram, porque
  // cada funil tem as suas: só o que é comum a todos.
  const porFonte = new Map<
    string,
    { investido: number; fechados: number; perdidos: number; faturado: number }
  >()
  for (const f of funis) {
    const doFunil = lancamentos.filter((l) => l.funil_id === f.id)
    for (const { fonte, resumo } of resumirPorFonte(f.etapas, fontesDoFunil(f), doFunil)) {
      const linha = porFonte.get(fonte.nome) ?? {
        investido: 0,
        fechados: 0,
        perdidos: 0,
        faturado: 0,
      }
      linha.investido += resumo.investimento
      linha.fechados += resumo.fechados
      linha.perdidos += resumo.perdidos
      linha.faturado += resumo.faturamento
      porFonte.set(fonte.nome, linha)
    }
  }

  return (
    <main className="mx-auto px-4 md:px-8 py-10 space-y-10" style={{ maxWidth: 1280 }}>
      <div className="hero-banner">
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>
          Comercial
        </p>
        <div className={estilos.heroTopo}>
          <h1 style={{ fontSize: 36 }}>Time · {periodo.rotulo}</h1>
          <SeletorPeriodoGlobal mesAtual={periodo.mes} anoAtual={periodo.ano} />
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

          {porFonte.size > 0 && (
            <section data-por-fonte>
              <h2 style={{ fontSize: 18, marginBottom: 10 }}>Por fonte de demanda</h2>
              <div className="glass" style={{ overflowX: "auto", padding: 4 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th scope="col" style={{ ...titulo, textAlign: "left" }}>
                        Fonte
                      </th>
                      <th scope="col" style={titulo}>Investido</th>
                      <th scope="col" style={titulo}>Fechados</th>
                      <th scope="col" style={titulo}>Perdidos</th>
                      <th scope="col" style={titulo}>Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(porFonte, ([nome, l]) => (
                      <tr key={nome}>
                        <th
                          scope="row"
                          style={{ ...celula, textAlign: "left", fontWeight: 600 }}
                        >
                          {nome}
                        </th>
                        <td style={celula}>{formatBRL(l.investido)}</td>
                        <td style={celula}>{formatNumero(l.fechados)}</td>
                        <td style={celula}>{formatNumero(l.perdidos)}</td>
                        <td style={celula}>{formatBRL(l.faturado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

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
