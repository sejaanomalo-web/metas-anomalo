import Link from "next/link"
import {
  ANO_PADRAO,
  type EmpresaMeta,
  type Mes,
  SUBTITULO_EMPRESA,
  formatBRL,
  getFaturamentoMes,
  getVerbaMes,
  metaAcumuladaAteHoje,
} from "@/lib/data"

export default function CardEmpresa({
  empresa,
  mes,
  faturamentoReal,
}: {
  empresa: EmpresaMeta
  mes: Mes
  faturamentoReal: number | null
}) {
  const investimento = getVerbaMes(empresa.slug, mes)
  const meta = getFaturamentoMes(empresa.slug, mes)
  const inativa = meta === 0 && investimento === 0

  const metaAcumulada = metaAcumuladaAteHoje(meta, mes, ANO_PADRAO)
  const temReal = typeof faturamentoReal === "number" && faturamentoReal > 0

  const corBolinha = !temReal
    ? "#555"
    : faturamentoReal >= metaAcumulada
    ? "#4caf50"
    : "#e24b4a"

  const progressoPct =
    temReal && meta > 0
      ? Math.min(100, Math.round((faturamentoReal / meta) * 100))
      : 0

  const textoRodape = inativa
    ? `Sem dados neste mês${
        empresa.inicioEm ? ` — início em ${empresa.inicioEm}` : ""
      }`
    : temReal
    ? `${progressoPct}% da meta de ${mes} atingida`
    : "Nenhum dado inserido"

  return (
    <Link
      href={`/dashboard/${empresa.slug}?mes=${mes}`}
      className="block transition hover:brightness-110"
      style={{
        background: "#111111",
        border: "0.5px solid #1e1e1e",
        borderLeft: `2px solid ${inativa ? "#1e1e1e" : "#C9953A"}`,
        borderRadius: 10,
        padding: "16px 16px 16px 20px",
        opacity: inativa ? 0.5 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#ffffff",
              lineHeight: 1.2,
            }}
          >
            {empresa.nome}
          </h3>
          <p style={{ fontSize: 10, color: "#444", marginTop: 4 }}>
            {SUBTITULO_EMPRESA[empresa.slug]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: corBolinha,
              display: "inline-block",
            }}
            title={
              !temReal
                ? "Sem faturamento real inserido"
                : faturamentoReal >= metaAcumulada
                ? "Acima da meta acumulada"
                : "Abaixo da meta acumulada"
            }
          />
          <span
            style={{
              fontSize: 10,
              color: "#C9953A",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {mes}
          </span>
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-2"
        style={{ marginTop: 16 }}
      >
        <BlocoMetrica rotulo="Investimento" valor={formatBRL(investimento)} />
        <BlocoMetrica
          rotulo="Faturamento"
          valor={formatBRL(meta)}
          destaque
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <div
          style={{
            height: 2,
            background: "#1a1a1a",
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
        <p style={{ fontSize: 10, color: "#444", marginTop: 8 }}>
          {textoRodape}
        </p>
      </div>
    </Link>
  )
}

function BlocoMetrica({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div
      style={{
        background: "#0d0d0d",
        borderRadius: 6,
        padding: "10px 12px",
      }}
    >
      <p
        style={{
          fontSize: 9,
          color: "#444",
          letterSpacing: "1px",
          textTransform: "uppercase",
        }}
      >
        {rotulo}
      </p>
      <p
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: destaque ? "#C9953A" : "#ffffff",
          marginTop: 4,
          lineHeight: 1.1,
        }}
      >
        {valor}
      </p>
    </div>
  )
}
