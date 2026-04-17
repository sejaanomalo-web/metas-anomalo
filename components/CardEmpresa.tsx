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
    ? "#252525"
    : faturamentoReal >= metaAcumulada
    ? "#4caf50"
    : "#e24b4a"

  const progressoPct =
    temReal && meta > 0
      ? Math.min(100, Math.round((faturamentoReal / meta) * 100))
      : 0

  return (
    <Link
      href={`/dashboard/${empresa.slug}?mes=${mes}&ano=${ano}`}
      className="block card-surface"
      style={{
        opacity: inativa ? 0.18 : 1,
      }}
    >
      <div style={{ padding: "14px 16px 12px" }}>
        <div className="flex items-center gap-1.5" style={{ marginBottom: 9 }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: corBolinha,
              display: "inline-block",
            }}
          />
          <span
            className="font-mono"
            style={{
              fontSize: 8,
              letterSpacing: "2px",
              color: "#1e1e1e",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            {mes.toUpperCase()} {ano}
          </span>
        </div>

        <h3
          className="font-serif"
          style={{
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 20,
            letterSpacing: "-0.3px",
            lineHeight: 1.1,
            color: inativa ? "#303030" : "#e0e0e0",
          }}
        >
          {empresa.nome}
        </h3>

        {!inativa && (
          <p
            style={{
              fontSize: 9,
              letterSpacing: "0.3px",
              color: "#1c1c1c",
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
            style={{ gap: "0.5px", background: "#111" }}
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
              padding: "10px 16px 13px",
              borderTop: "0.5px solid #111",
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="font-mono text-right"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.3px",
                  width: 32,
                  flexShrink: 0,
                  color: temReal ? "#C9953A" : "#1c1c1c",
                  fontWeight: 300,
                }}
              >
                {temReal ? `${progressoPct}%` : "—"}
              </span>

              <div
                style={{
                  flex: 1,
                  height: 1.5,
                  background: "#161616",
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
                className="font-mono whitespace-nowrap"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.2px",
                  color: "#242424",
                  flexShrink: 0,
                  fontWeight: 300,
                }}
              >
                {temProjecao ? `Meta ${formatBRL(meta)}` : "Meta não definida"}
              </span>
            </div>
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
    <div style={{ background: "#0c0c0c", padding: "10px 16px" }}>
      <p
        style={{
          fontSize: 8,
          letterSpacing: "2px",
          color: "#1c1c1c",
          textTransform: "uppercase",
          fontWeight: 400,
          marginBottom: 4,
        }}
      >
        {rotulo}
      </p>
      <p
        className="font-mono"
        style={{
          fontSize: 15,
          fontWeight: 300,
          letterSpacing: "-0.5px",
          color: esvaziado ? "#1c1c1c" : destaque ? "#C9953A" : "#3a3a3a",
          lineHeight: 1.1,
        }}
      >
        {valor}
      </p>
    </div>
  )
}
