import Link from "next/link"
import { formatBRL, formatNumero } from "@/lib/data"
import {
  AGRUPAMENTOS,
  formatarPct,
  type AgrupamentoFunil,
  type BaldePeriodo,
  type ResumoFunil,
} from "@/lib/funil-calculo"

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
  whiteSpace: "normal",
  minWidth: 92,
  borderTop: "none",
  verticalAlign: "bottom",
}

/** Tabela do período fatiado (semana a semana etc.), com a taxa de cada passo. */
export default function EvolucaoFunil({
  linhas,
  agrupamento,
  disponiveis,
  hrefAgrupamento,
}: {
  linhas: { balde: BaldePeriodo; resumo: ResumoFunil }[]
  agrupamento: AgrupamentoFunil
  disponiveis: AgrupamentoFunil[]
  hrefAgrupamento: (a: AgrupamentoFunil) => string
}) {
  const etapas = linhas[0]?.resumo.etapas ?? []

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {AGRUPAMENTOS.filter((a) => disponiveis.includes(a.valor)).map((a) => {
          const ativo = a.valor === agrupamento
          return (
            <Link
              key={a.valor}
              href={hrefAgrupamento(a.valor)}
              scroll={false}
              aria-current={ativo ? "true" : undefined}
              className="no-ds"
              style={{
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                textDecoration: "none",
                color: ativo ? "#000" : "var(--text-2)",
                background: ativo ? "var(--accent)" : "transparent",
                border: ativo
                  ? "1px solid var(--accent)"
                  : "1px solid var(--input-border)",
              }}
            >
              {a.rotulo}
            </Link>
          )
        })}
      </div>

      <div className="glass" style={{ overflowX: "auto", padding: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...titulo, textAlign: "left" }}>
                Período
              </th>
              <th scope="col" style={titulo}>
                Investido
              </th>
              {etapas.map((e) => (
                <th key={e.id} scope="col" style={titulo}>
                  {e.nome}
                </th>
              ))}
              <th scope="col" style={titulo}>
                Perdidos
              </th>
              <th scope="col" style={titulo}>
                Faturamento
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ balde, resumo }) => {
              const vazia = resumo.registros === 0
              const apagado = vazia ? "var(--text-3)" : "var(--text-1)"
              return (
                <tr key={balde.de}>
                  <th
                    scope="row"
                    style={{
                      ...celula,
                      textAlign: "left",
                      fontWeight: 500,
                      color: apagado,
                    }}
                  >
                    {balde.rotulo}
                  </th>
                  <td style={{ ...celula, color: apagado }}>
                    {vazia ? "—" : formatBRL(resumo.investimento)}
                  </td>
                  {resumo.etapas.map((e, i) => (
                    <td key={e.id} style={{ ...celula, color: apagado }}>
                      {vazia ? "—" : formatNumero(e.valor)}
                      {!vazia && i > 0 && (
                        <span
                          style={{
                            display: "block",
                            fontSize: 11,
                            color:
                              resumo.gargalo?.indice === i
                                ? "#fca5a5"
                                : "var(--text-3)",
                          }}
                        >
                          {formatarPct(e.conversaoAnterior)}
                        </span>
                      )}
                    </td>
                  ))}
                  <td style={{ ...celula, color: apagado }}>
                    {vazia ? "—" : formatNumero(resumo.perdidos)}
                  </td>
                  <td style={{ ...celula, color: apagado }}>
                    {vazia ? "—" : formatBRL(resumo.faturamento)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
        Abaixo de cada número, a taxa em relação à etapa anterior. Em vermelho, o
        gargalo daquela linha.
      </p>
    </div>
  )
}
