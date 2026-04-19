import Link from "next/link"
import {
  type Ano,
  type EmpresaMeta,
  type Mes,
  SUBTITULO_EMPRESA,
  anoTemProjecao,
  corStatusMeta,
  formatBRL,
  getFaturamentoMes,
  getVerbaMes,
  metaAcumuladaAteHoje,
} from "@/lib/data"

export default function CardEmpresa({
  empresa,
  mes,
  ano,
  faturamentoReal,
  investimentoReal,
}: {
  empresa: EmpresaMeta
  mes: Mes
  ano: Ano
  faturamentoReal: number | null
  investimentoReal: number | null
}) {
  const temProjecao = anoTemProjecao(ano)
  const investimento = getVerbaMes(empresa.slug, mes, ano)
  const meta = getFaturamentoMes(empresa.slug, mes, ano)
  const inativa = temProjecao && meta === 0 && investimento === 0

  const metaAcumulada = metaAcumuladaAteHoje(meta, mes, ano)
  const temReal = typeof faturamentoReal === "number" && faturamentoReal > 0
  const temRealInvest =
    typeof investimentoReal === "number" && investimentoReal > 0

  const corBolinha = !temReal
    ? "rgba(255,255,255,0.2)"
    : faturamentoReal >= metaAcumulada
    ? "#4caf50"
    : "#e24b4a"

  const progressoPct =
    temReal && meta > 0
      ? Math.min(100, Math.round((faturamentoReal / meta) * 100))
      : 0

  // Mesma lógica tri-status da bolinha, agora reaproveitada para as duas
  // linhas do rodapé (Meta = faturamento vs meta; Invest. = invest. real
  // vs investimento projetado).
  const corFaturamento = corStatusMeta(
    temReal ? faturamentoReal : 0,
    meta,
    temReal,
    mes,
    ano
  )
  const corInvestimento = corStatusMeta(
    temRealInvest ? investimentoReal : 0,
    investimento,
    temRealInvest,
    mes,
    ano
  )
  const corTextoProgresso = corFaturamento

  return (
    <Link
      href={`/dashboard/${empresa.slug}?mes=${mes}&ano=${ano}`}
      className="glass glass-hover block"
      style={{
        opacity: inativa ? 0.35 : 1,
      }}
    >
      <div style={{ padding: "18px 20px 14px" }}>
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: 10 }}
        >
          <div className="flex items-center gap-2">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: corBolinha,
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: 9,
                letterSpacing: "2px",
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              {mes} {ano}
            </span>
          </div>
        </div>

        <h3
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#ffffff",
            letterSpacing: "-0.3px",
            lineHeight: 1.2,
          }}
        >
          {empresa.nome}
        </h3>

        {!inativa && (
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
              fontWeight: 300,
              marginTop: 4,
            }}
          >
            {SUBTITULO_EMPRESA[empresa.slug]}
          </p>
        )}

        {inativa && (
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              fontWeight: 300,
              fontStyle: "italic",
              marginTop: 8,
            }}
          >
            Sem dados neste mês
            {empresa.inicioEm ? ` — início em ${empresa.inicioEm}` : ""}
          </p>
        )}
      </div>

      {!inativa && (
        <>
          <div className="divider-h" />

          <div className="grid grid-cols-2" style={{ position: "relative" }}>
            <div
              className="divider-v"
              style={{
                position: "absolute",
                left: "50%",
                top: 10,
                bottom: 10,
              }}
            />
            <BlocoMetrica
              rotulo="Investimento"
              valor={formatBRL(investimentoReal ?? 0)}
            />
            <BlocoMetrica
              rotulo="Faturamento"
              valor={formatBRL(faturamentoReal ?? 0)}
              destaque
            />
          </div>

          <div className="divider-h" />

          <div style={{ padding: "14px 20px 16px" }}>
            <div className="flex items-center gap-3">
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: corTextoProgresso,
                  width: 32,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {temReal ? `${progressoPct}%` : "—"}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 1.5,
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressoPct}%`,
                    background: "#C9953A",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 2,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 300,
                    color: temProjecao ? corFaturamento : "rgba(255,255,255,0.3)",
                  }}
                >
                  {temProjecao ? `Meta ${formatBRL(meta)}` : "Sem projeção"}
                </span>
                {temProjecao && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 300,
                      color: corInvestimento,
                    }}
                  >
                    Invest. {formatBRL(investimento)}
                  </span>
                )}
              </div>
            </div>
            <p
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.45)",
                marginTop: 8,
                fontWeight: 300,
                fontStyle: temReal ? "normal" : "italic",
              }}
            >
              {temReal
                ? `${progressoPct}% da meta de ${mes} atingida`
                : "Nenhum dado inserido"}
            </p>
          </div>
        </>
      )}
    </Link>
  )
}

function BlocoMetrica({
  rotulo,
  valor,
  destaque,
  esvaziado,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
  esvaziado?: boolean
}) {
  return (
    <div style={{ padding: "14px 20px" }}>
      <p
        style={{
          fontSize: 9,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.3)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {rotulo}
      </p>
      <p
        style={{
          fontSize: 17,
          fontWeight: destaque ? 600 : 400,
          color: esvaziado
            ? "rgba(255,255,255,0.2)"
            : destaque
            ? "#C9953A"
            : "rgba(255,255,255,0.7)",
          marginTop: 6,
          lineHeight: 1.1,
        }}
      >
        {valor}
      </p>
    </div>
  )
}
