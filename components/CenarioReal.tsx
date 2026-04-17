import { type DadosReais } from "@/lib/supabase"
import {
  type Ano,
  type Mes,
  formatBRL,
  formatNumero,
  metaAcumuladaAteHoje,
} from "@/lib/data"

interface MetaComparavel {
  investimento?: number
  leads?: number
  reunioes?: number
  contratos?: number
  faturamento?: number
}

const LINHAS: {
  rotulo: string
  chave:
    | "investimento_real"
    | "leads_real"
    | "reunioes_real"
    | "contratos_real"
    | "faturamento_real"
  metaKey: keyof MetaComparavel
  tipo: "moeda" | "numero"
}[] = [
  {
    rotulo: "Investimento",
    chave: "investimento_real",
    metaKey: "investimento",
    tipo: "moeda",
  },
  {
    rotulo: "Leads",
    chave: "leads_real",
    metaKey: "leads",
    tipo: "numero",
  },
  {
    rotulo: "Reuniões",
    chave: "reunioes_real",
    metaKey: "reunioes",
    tipo: "numero",
  },
  {
    rotulo: "Contratos",
    chave: "contratos_real",
    metaKey: "contratos",
    tipo: "numero",
  },
  {
    rotulo: "Faturamento",
    chave: "faturamento_real",
    metaKey: "faturamento",
    tipo: "moeda",
  },
]

function corStatus(
  real: number | null,
  metaTotal: number | undefined,
  mes: Mes,
  ano: Ano
): string | null {
  if (real === null || metaTotal === undefined || metaTotal === 0) return null
  if (real >= metaTotal) return "#4caf50"
  const acumulada = metaAcumuladaAteHoje(metaTotal, mes, ano)
  if (real >= acumulada) return "#C9953A"
  return "#e24b4a"
}

export default function CenarioReal({
  dados,
  meta,
  mes,
  ano,
}: {
  dados: DadosReais | null
  meta: MetaComparavel
  mes: Mes
  ano: Ano
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
        }}
      >
        Cenário Real · {mes} {ano}
      </p>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        style={{ gap: "0.5px", background: "#111", marginTop: 14 }}
      >
        {LINHAS.map((l) => {
          const real = dados ? dados[l.chave] : null
          const metaValor = meta[l.metaKey]
          const temReal = typeof real === "number"
          const cor = corStatus(temReal ? real : null, metaValor, mes, ano)

          return (
            <div
              key={l.chave}
              style={{ background: "#0c0c0c", padding: "12px 14px" }}
            >
              <p
                style={{
                  fontSize: 8,
                  letterSpacing: "2px",
                  color: "#1c1c1c",
                  textTransform: "uppercase",
                  fontWeight: 400,
                }}
              >
                {l.rotulo}
              </p>
              {temReal ? (
                <p
                  className="font-mono"
                  style={{
                    fontSize: 18,
                    color: cor ?? "#e0e0e0",
                    fontWeight: 300,
                    letterSpacing: "-0.5px",
                    marginTop: 6,
                    lineHeight: 1,
                  }}
                >
                  {l.tipo === "moeda" ? formatBRL(real) : formatNumero(real)}
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: "#1c1c1c",
                    fontStyle: "italic",
                    fontWeight: 300,
                    marginTop: 6,
                    lineHeight: 1,
                  }}
                >
                  Não inserido
                </p>
              )}
              {metaValor !== undefined && (
                <p
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    color: temReal ? "#3a3a3a" : "#1c1c1c",
                    fontWeight: 300,
                    marginTop: 6,
                  }}
                >
                  Meta{" "}
                  {l.tipo === "moeda"
                    ? formatBRL(metaValor)
                    : formatNumero(metaValor)}
                </p>
              )}
            </div>
          )
        })}

        <div style={{ background: "#0c0c0c", padding: "12px 14px" }}>
          <p
            style={{
              fontSize: 8,
              letterSpacing: "2px",
              color: "#1c1c1c",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            CPL Real
          </p>
          {dados?.cpl_real !== null && dados?.cpl_real !== undefined ? (
            <p
              className="font-mono"
              style={{
                fontSize: 18,
                color: "#e0e0e0",
                fontWeight: 300,
                letterSpacing: "-0.5px",
                marginTop: 6,
                lineHeight: 1,
              }}
            >
              {formatBRL(dados.cpl_real)}
            </p>
          ) : (
            <p
              style={{
                fontSize: 13,
                color: "#1c1c1c",
                fontStyle: "italic",
                fontWeight: 300,
                marginTop: 6,
              }}
            >
              Não inserido
            </p>
          )}
          <p
            className="font-mono"
            style={{
              fontSize: 9,
              color: "#1c1c1c",
              fontWeight: 300,
              marginTop: 6,
            }}
          >
            invest. ÷ leads
          </p>
        </div>
      </div>

      {dados?.criativos_entregues !== null &&
        dados?.criativos_entregues !== undefined && (
          <div
            style={{
              marginTop: 14,
              background: "#090909",
              padding: "12px 14px",
            }}
          >
            <p
              style={{
                fontSize: 8,
                letterSpacing: "2px",
                color: "#1c1c1c",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Criativos entregues
            </p>
            <p
              className="font-mono"
              style={{
                fontSize: 15,
                color: "#e0e0e0",
                fontWeight: 300,
                letterSpacing: "-0.5px",
                marginTop: 4,
              }}
            >
              {formatNumero(dados.criativos_entregues)}
            </p>
          </div>
        )}

      {dados?.observacoes && (
        <div
          style={{
            marginTop: 14,
            background: "#090909",
            padding: "12px 14px",
          }}
        >
          <p
            style={{
              fontSize: 8,
              letterSpacing: "2px",
              color: "#1c1c1c",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            Observações
          </p>
          <p
            style={{
              fontSize: 12,
              color: "#686868",
              fontWeight: 300,
              marginTop: 4,
              whiteSpace: "pre-wrap",
            }}
          >
            {dados.observacoes}
          </p>
        </div>
      )}
    </div>
  )
}
