import { type DadosReais } from "@/lib/supabase"
import {
  type Ano,
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
        }}
      >
        Cenário Real · {mes} {ano}
      </p>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        style={{ gap: "0.5px", background: "#141414", marginTop: 18 }}
      >
        {LINHAS.map((l) => {
          const real = dados ? dados[l.chave] : null
          const metaValor = meta[l.metaKey]
          const temReal = typeof real === "number"
          const cor =
            temReal && metaValor !== undefined
              ? corStatusMeta(real, metaValor, true, mes, ano)
              : null

          return (
            <div
              key={l.chave}
              style={{ background: "#0c0c0c", padding: "16px 18px" }}
            >
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: "0.3px",
                  color: "#666",
                  textTransform: "uppercase",
                  fontWeight: 400,
                }}
              >
                {l.rotulo}
              </p>
              {temReal ? (
                <p
                  style={{
                    fontSize: 24,
                    color: cor ?? "#fff",
                    fontWeight: 400,
                    marginTop: 8,
                    lineHeight: 1.1,
                  }}
                >
                  {l.tipo === "moeda" ? formatBRL(real) : formatNumero(real)}
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: "#333",
                    fontStyle: "italic",
                    fontWeight: 400,
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
                    fontSize: 12,
                    color: temReal ? "#555" : "#333",
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

        <div style={{ background: "#0c0c0c", padding: "16px 18px" }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.3px",
              color: "#666",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            CPL Real
          </p>
          {dados?.cpl_real !== null && dados?.cpl_real !== undefined ? (
            <p
              style={{
                fontSize: 24,
                color: "#fff",
                fontWeight: 400,
                marginTop: 8,
                lineHeight: 1.1,
              }}
            >
              {formatBRL(dados.cpl_real)}
            </p>
          ) : (
            <p
              style={{
                fontSize: 13,
                color: "#333",
                fontStyle: "italic",
                fontWeight: 400,
                marginTop: 8,
              }}
            >
              Não inserido
            </p>
          )}
          <p
            style={{
              fontSize: 12,
              color: "#333",
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
            style={{
              marginTop: 14,
              background: "#090909",
              padding: "14px 18px",
              borderRadius: 6,
            }}
          >
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.3px",
                color: "#666",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Criativos entregues
            </p>
            <p
              style={{
                fontSize: 18,
                color: "#fff",
                fontWeight: 400,
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
            padding: "14px 18px",
            borderRadius: 6,
          }}
        >
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.3px",
              color: "#666",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            Observações
          </p>
          <p
            style={{
              fontSize: 13,
              color: "#888",
              fontWeight: 400,
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
