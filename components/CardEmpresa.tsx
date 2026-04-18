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
    ? "#252525"
    : faturamentoReal >= metaAcumulada
    ? "#4caf50"
    : "#e24b4a"

  const corStatus = corStatusMeta(
    temReal ? faturamentoReal : 0,
    meta,
    temReal,
    mes,
    ano
  )

  const progressoPct =
    temReal && meta > 0
      ? Math.min(100, Math.round((faturamentoReal / meta) * 100))
      : 0

  const textoRodape = inativa
    ? `Sem dados neste mês${
        empresa.inicioEm ? ` — início em ${empresa.inicioEm}` : ""
      }`
    : !temProjecao
    ? "Meta não definida"
    : temReal
    ? `${progressoPct}% da meta de ${mes} atingida`
    : `Nenhum dado inserido para ${mes}`

  return (
    <Link
      href={`/dashboard/${empresa.slug}?mes=${mes}&ano=${ano}`}
      className="block card-surface"
      style={{
        opacity: inativa ? 0.25 : 1,
      }}
    >
      <div style={{ padding: "16px 18px 14px" }}>
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
                fontSize: 11,
                letterSpacing: "1px",
                color: "#555",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              {mes} {ano}
            </span>
          </div>
        </div>

        <h3
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: inativa ? "#555" : "#fff",
            lineHeight: 1.2,
          }}
        >
          {empresa.nome}
        </h3>

        {!inativa && (
          <p
            style={{
              fontSize: 12,
              color: "#666",
              fontWeight: 400,
              marginTop: 4,
            }}
          >
            {SUBTITULO_EMPRESA[empresa.slug]}
          </p>
        )}
      </div>

      {!inativa && (
        <>
          <div className="divider-h" />

          <div
            className="grid grid-cols-2"
            style={{ gap: "0.5px", background: "#141414" }}
          >
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

          <div
            style={{
              padding: "14px 18px 16px",
              borderTop: "0.5px solid #141414",
            }}
          >
            <div
              style={{
                height: 3,
                background: "#141414",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressoPct}%`,
                  background:
                    temReal && temProjecao ? corStatus : "transparent",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
            <p
              style={{
                fontSize: 11,
                color: "#555",
                marginTop: 10,
                fontWeight: 400,
              }}
            >
              {textoRodape}
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
    <div style={{ background: "#0c0c0c", padding: "14px 18px" }}>
      <p
        style={{
          fontSize: 11,
          letterSpacing: "0.3px",
          color: "#888",
          textTransform: "uppercase",
          fontWeight: 400,
          marginBottom: 6,
        }}
      >
        {rotulo}
      </p>
      <p
        style={{
          fontSize: 18,
          fontWeight: 400,
          color: esvaziado ? "#333" : destaque ? "#C9953A" : "#fff",
          lineHeight: 1.1,
        }}
      >
        {valor}
      </p>
    </div>
  )
}
