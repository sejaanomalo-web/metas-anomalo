import { type Mes, formatBRL, formatNumero } from "@/lib/data"

interface Coluna {
  chave: string
  titulo: string
  tipo?: "numero" | "brl" | "percent" | "texto"
}

export default function TabelaMeses({
  colunas,
  linhas,
  mesAtual,
}: {
  colunas: Coluna[]
  linhas: Record<string, string | number>[]
  mesAtual?: Mes
}) {
  return (
    <div
      style={{
        background: "#0c0c0c",
        border: "0.5px solid #141414",
        borderRadius: 10,
        padding: 24,
      }}
    >
      <p
        style={{
          fontSize: 11,
          letterSpacing: "1px",
          color: "#666",
          textTransform: "uppercase",
          fontWeight: 400,
          marginBottom: 16,
        }}
      >
        Detalhamento mensal
      </p>
      <div className="overflow-x-auto scrollbar-thin">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  style={{
                    fontSize: 11,
                    letterSpacing: "1px",
                    color: "#555",
                    textTransform: "uppercase",
                    fontWeight: 400,
                    textAlign: "left",
                    padding: "12px 16px",
                    borderBottom: "0.5px solid #141414",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => {
              const destacar =
                mesAtual !== undefined && linha.mes === mesAtual
              return (
                <tr
                  key={i}
                  style={{
                    background: destacar ? "#0e0e0e" : "transparent",
                  }}
                >
                  {colunas.map((c) => {
                    const v = linha[c.chave]
                    let conteudo: string = String(v ?? "—")
                    if (typeof v === "number") {
                      if (c.tipo === "brl") conteudo = formatBRL(v)
                      else if (c.tipo === "percent") conteudo = `${v}%`
                      else conteudo = formatNumero(v)
                    }
                    const ehFat =
                      c.chave === "faturamento" ||
                      c.chave === "receita" ||
                      c.chave === "receita_hub"

                    return (
                      <td
                        key={c.chave}
                        style={{
                          fontSize: 13,
                          color: ehFat ? "#C9953A" : "#888",
                          fontWeight: 400,
                          padding: "12px 16px",
                          borderBottom: "0.5px solid #141414",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {conteudo}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
