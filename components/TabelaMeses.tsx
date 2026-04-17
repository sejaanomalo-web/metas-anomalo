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
    <div className="card p-6">
      <p className="text-xs uppercase tracking-widest text-neutral-500 mb-4">
        Detalhamento mensal
      </p>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  className="text-[11px] uppercase tracking-widest text-neutral-500 font-normal pb-3 pr-4 whitespace-nowrap"
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr
                key={i}
                className="border-t border-neutral-900 hover:bg-white/[0.02]"
              >
                {colunas.map((c) => {
                  const v = linha[c.chave]
                  let conteudo: string = String(v ?? "—")
                  if (typeof v === "number") {
                    if (c.tipo === "brl") conteudo = formatBRL(v)
                    else if (c.tipo === "percent") conteudo = `${v}%`
                    else conteudo = formatNumero(v)
                  }
                  return (
                    <td
                      key={c.chave}
                      className="py-3 pr-4 text-white whitespace-nowrap"
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
