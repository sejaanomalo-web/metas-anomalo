import { type DadosReais } from "@/lib/supabase"
import {
  type Mes,
  corStatusMeta,
  formatBRL,
  formatNumero,
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
  { rotulo: "Leads", chave: "leads_real", metaKey: "leads", tipo: "numero" },
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

export default function CenarioReal({
  dados,
  meta,
  mes,
}: {
  dados: DadosReais | null
  meta: MetaComparavel
  mes: Mes
}) {
  const cpl =
    dados?.investimento_real !== null &&
    dados?.investimento_real !== undefined &&
    dados?.leads_real !== null &&
    dados?.leads_real !== undefined &&
    dados.leads_real > 0
      ? dados.investimento_real / dados.leads_real
      : null

  return (
    <div className="glass" style={{ padding: 24 }}>
      <p
        style={{
          fontSize: 9,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        Cenário Real · {mes}
      </p>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        style={{ gap: 10, marginTop: 18 }}
      >
        {LINHAS.map((l) => {
          const real = dados ? dados[l.chave] : null
          const metaValor = meta[l.metaKey]
          const temReal = typeof real === "number"
          const cor =
            temReal && metaValor !== undefined
              ? corStatusMeta(real, metaValor, true, mes)
              : "#ffffff"

          return (
            <div
              key={l.chave}
              className="glass"
              style={{ padding: "16px 18px", borderRadius: 12 }}
            >
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: "2px",
                  color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase",
                  fontWeight: 500,
                }}
              >
                {l.rotulo}
              </p>
              {temReal ? (
                <p
                  style={{
                    fontSize: 24,
                    color: cor,
                    fontWeight: 600,
                    marginTop: 8,
                    lineHeight: 1.1,
                    letterSpacing: "-0.3px",
                  }}
                >
                  {l.tipo === "moeda" ? formatBRL(real) : formatNumero(real)}
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.18)",
                    fontStyle: "italic",
                    fontWeight: 300,
                    marginTop: 8,
                    lineHeight: 1.1,
                  }}
                >
                  Não inserido
                </p>
              )}
              {metaValor !== undefined && (
                <p
                  style={{
                    fontSize: 11,
                    color: temReal
                      ? "rgba(255,255,255,0.35)"
                      : "rgba(255,255,255,0.2)",
                    fontWeight: 400,
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

        <div
          className="glass"
          style={{ padding: "16px 18px", borderRadius: 12 }}
        >
          <p
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            CPL Real
          </p>
          {cpl !== null ? (
            <p
              style={{
                fontSize: 24,
                color: "#ffffff",
                fontWeight: 600,
                marginTop: 8,
                lineHeight: 1.1,
                letterSpacing: "-0.3px",
              }}
            >
              {formatBRL(cpl)}
            </p>
          ) : (
            <p
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.18)",
                fontStyle: "italic",
                fontWeight: 300,
                marginTop: 8,
              }}
            >
              Não inserido
            </p>
          )}
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              fontWeight: 400,
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
            className="glass"
            style={{
              marginTop: 12,
              padding: "14px 18px",
              borderRadius: 12,
            }}
          >
            <p
              style={{
                fontSize: 9,
                letterSpacing: "2px",
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              Criativos entregues
            </p>
            <p
              style={{
                fontSize: 18,
                color: "#ffffff",
                fontWeight: 600,
                marginTop: 4,
              }}
            >
              {formatNumero(dados.criativos_entregues)}
            </p>
          </div>
        )}

      {dados?.observacoes && (
        <div
          className="glass"
          style={{
            marginTop: 12,
            padding: "14px 18px",
            borderRadius: 12,
          }}
        >
          <p
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Observações
          </p>
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.7)",
              fontWeight: 300,
              marginTop: 6,
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
