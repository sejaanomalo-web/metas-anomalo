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
        padding: 20,
      }}
    >
      <p
        style={{
          fontSize: 8,
          letterSpacing: "2px",
          color: "#202020",
          textTransform: "uppercase",
          fontWeight: 400,
          marginBottom: 14,
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
                    fontSize: 8,
                    letterSpacing: "2px",
                    color: "#1e1e1e",
                    textTransform: "uppercase",
                    fontWeight: 400,
                    textAlign: "left",
                    padding: "10px 14px",
                    borderBottom: "0.5px solid #111",
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
                        className="font-mono"
                        style={{
                          fontSize: 12,
                          color: ehFat ? "#C9953A" : "#484848",
                          fontWeight: 300,
                          padding: "10px 14px",
                          border: "0.5px solid #111",
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
