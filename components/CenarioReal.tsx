import { type DadosReais } from "@/lib/supabase"
import {
  ORIGEM_PADRAO,
  type Ano,
  type Mes,
  type OrigemDadosReais,
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

type ChaveReal =
  | "investimento_real"
  | "leads_real"
  | "reunioes_real"
  | "contratos_real"
  | "faturamento_real"

interface LinhaMetricaReal {
  rotulo: string
  chave: ChaveReal
  metaKey: keyof MetaComparavel
  tipo: "moeda" | "numero"
  apenasPago?: boolean
}

const LINHAS: LinhaMetricaReal[] = [
  {
    rotulo: "Investimento",
    chave: "investimento_real",
    metaKey: "investimento",
    tipo: "moeda",
    apenasPago: true,
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
  ano,
  origem = ORIGEM_PADRAO,
}: {
  dados: DadosReais | null
  meta: MetaComparavel
  mes: Mes
  ano: Ano
  origem?: OrigemDadosReais
}) {
  const ehPago = origem === "pago"
  const linhasVisiveis = LINHAS.filter((l) => !l.apenasPago || ehPago)
  const rotuloOrigem = ehPago ? "Tráfego pago" : "Prospecção orgânica"
  const cpl =
    dados?.investimento_real !== null &&
    dados?.investimento_real !== undefined &&
    dados?.leads_real !== null &&
    dados?.leads_real !== undefined &&
    dados.leads_real > 0
      ? dados.investimento_real / dados.leads_real
      : null

  const cpa =
    dados?.investimento_real !== null &&
    dados?.investimento_real !== undefined &&
    dados?.contratos_real !== null &&
    dados?.contratos_real !== undefined &&
    dados.contratos_real > 0
      ? dados.investimento_real / dados.contratos_real
      : null

  return (
    <div
      className="glass h-full flex flex-col"
      style={{ padding: 24 }}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          style={{
            fontSize: 9,
            letterSpacing: "2px",
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Cenário Real · {mes} {ano}
        </p>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "1.5px",
            color: "#C9953A",
            textTransform: "uppercase",
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: 999,
            border: "0.5px solid rgba(201,149,58,0.4)",
            background: "rgba(201,149,58,0.08)",
          }}
        >
          {rotuloOrigem}
        </span>
      </div>

      <div
        className="grid grid-cols-2 flex-1"
        style={{ gap: 10, marginTop: 18 }}
      >
        {linhasVisiveis.map((l) => {
          const real = dados ? dados[l.chave] : null
          const metaValor = meta[l.metaKey]
          const temReal = typeof real === "number"
          const cor =
            temReal && metaValor !== undefined
              ? corStatusMeta(real, metaValor, true, mes, ano)
              : "#ffffff"

          return (
            <div
              key={l.chave}
              className="glass"
              style={{ padding: "14px 16px", borderRadius: 12 }}
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
                    fontSize: 22,
                    color: "#ffffff",
                    fontWeight: 600,
                    marginTop: 6,
                    lineHeight: 1.1,
                    letterSpacing: "-0.3px",
                  }}
                >
                  {l.tipo === "moeda" ? formatBRL(real) : formatNumero(real)}
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 13,
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
                    fontSize: 12,
                    color: temReal ? cor : "rgba(255,255,255,0.25)",
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

        {ehPago && (
        <div
          className="glass"
          style={{ padding: "14px 16px", borderRadius: 12 }}
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
                fontSize: 22,
                color: "#ffffff",
                fontWeight: 600,
                marginTop: 6,
                lineHeight: 1.1,
                letterSpacing: "-0.3px",
              }}
            >
              {formatBRL(cpl)}
            </p>
          ) : (
            <p
              style={{
                fontSize: 13,
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
        )}

        {ehPago && (
        <div
          className="glass"
          style={{ padding: "14px 16px", borderRadius: 12 }}
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
            CPA Real
          </p>
          {cpa !== null ? (
            <p
              style={{
                fontSize: 22,
                color: "#ffffff",
                fontWeight: 600,
                marginTop: 6,
                lineHeight: 1.1,
                letterSpacing: "-0.3px",
              }}
            >
              {formatBRL(cpa)}
            </p>
          ) : (
            <p
              style={{
                fontSize: 13,
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
            invest. ÷ contratos
          </p>
        </div>
        )}

        {ehPago && (
        <div
          className="glass"
          style={{ padding: "14px 16px", borderRadius: 12 }}
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
            Criativos Entregues
          </p>
          {dados?.criativos_entregues !== null &&
          dados?.criativos_entregues !== undefined ? (
            <p
              style={{
                fontSize: 22,
                color: "#ffffff",
                fontWeight: 600,
                marginTop: 6,
                lineHeight: 1.1,
                letterSpacing: "-0.3px",
              }}
            >
              {formatNumero(dados.criativos_entregues)}
            </p>
          ) : (
            <p
              style={{
                fontSize: 13,
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
            entregues no mês
          </p>
        </div>
        )}
      </div>

      {dados?.observacoes && (
        <div
          className="glass"
          style={{
            marginTop: 10,
            padding: "12px 16px",
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
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
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
