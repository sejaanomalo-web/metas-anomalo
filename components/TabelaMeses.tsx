import { formatBRL, formatNumero } from "@/lib/data"

interface Coluna {
  chave: string
  titulo: string
  tipo?: "numero" | "brl" | "percent" | "texto"
}

export default function TabelaMeses({
  colunas,
  linhas,
}: {
  colunas: Coluna[]
  linhas: Record<string, string | number>[]
}) {
  return (
    <div className="glass" style={{ padding: 24 }}>
      <p
        style={{
          fontSize: 9,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          fontWeight: 500,
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
                    fontSize: 9,
                    letterSpacing: "2px",
                    color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase",
                    fontWeight: 500,
                    textAlign: "left",
                    padding: "12px 14px",
                    borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr key={i}>
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
                        color: ehFat ? "#C9953A" : "rgba(255,255,255,0.7)",
                        fontWeight: ehFat ? 500 : 400,
                        padding: "12px 14px",
                        borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {conteudo}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
