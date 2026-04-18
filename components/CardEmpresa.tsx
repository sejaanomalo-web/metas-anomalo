import Link from "next/link"
import {
  type Ano,
  type EmpresaMeta,
  type Mes,
  SUBTITULO_EMPRESA,
  anoTemProjecao,
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
}: {
  empresa: EmpresaMeta
  mes: Mes
  ano: Ano
  faturamentoReal: number | null
}) {
  const temProjecao = anoTemProjecao(ano)
  const investimento = getVerbaMes(empresa.slug, mes, ano)
  const meta = getFaturamentoMes(empresa.slug, mes, ano)
  const inativa = temProjecao && meta === 0 && investimento === 0

  const metaAcumulada = metaAcumuladaAteHoje(meta, mes, ano)
  const temReal = typeof faturamentoReal === "number" && faturamentoReal > 0

  const corBolinha = !temReal
    ? "rgba(255,255,255,0.2)"
    : faturamentoReal >= metaAcumulada
    ? "#4caf50"
    : "#e24b4a"

  const progressoPct =
    temReal && meta > 0
      ? Math.min(100, Math.round((faturamentoReal / meta) * 100))
      : 0

  const corTextoProgresso = !temReal
    ? "rgba(255,255,255,0.3)"
    : faturamentoReal >= meta
    ? "#4caf50"
    : faturamentoReal >= metaAcumulada
    ? "#C9953A"
    : "#e24b4a"

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
              valor={temProjecao ? formatBRL(investimento) : "—"}
              esvaziado={!temProjecao}
            />
            <BlocoMetrica
              rotulo="Faturamento"
              valor={temProjecao ? formatBRL(meta) : "—"}
              destaque={temProjecao}
              esvaziado={!temProjecao}
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
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 300,
                  color: "rgba(255,255,255,0.3)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {temProjecao ? `Meta ${formatBRL(meta)}` : "Sem projeção"}
              </span>
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
