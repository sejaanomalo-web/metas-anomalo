import Link from "next/link"
import ProgressBar, { type ProgressStatus } from "@/components/ui/ProgressBar"
import TagStatusCampanha from "@/components/trafego/TagStatusCampanha"
import { clienteDisplayName } from "@/lib/clientes"
import type { ResumoMetaClienteMes } from "@/lib/metas-cliente"
import { formatBRL } from "@/lib/data"

/**
 * Card de um cliente na lista de "Metas por cliente" de uma assessoria.
 * Mostra meta × realizado (faturamento) com barra de progresso — mesmo
 * espírito do CardEmpresa do Hub, mas a nível de cliente. Clicar leva ao
 * dashboard de metas completo do cliente.
 */
export default function CardClienteMeta({
  resumo,
  empresaSlug,
  mes,
  ano,
}: {
  resumo: ResumoMetaClienteMes
  empresaSlug: string
  mes: string
  ano: number
}) {
  const { cliente, investimentoReal, faturamentoReal, metaFaturamento, metaInvestimento } =
    resumo
  const href = `/dashboard/${empresaSlug}/metas/${cliente.slug}?mes=${mes}&ano=${ano}`

  const meta = metaFaturamento ?? 0
  const temReal = faturamentoReal > 0
  const progressoPct =
    temReal && meta > 0 ? Math.min(100, Math.round((faturamentoReal / meta) * 100)) : 0

  const status: ProgressStatus = (() => {
    if (!temReal || meta === 0) return "neutral"
    if (faturamentoReal >= meta) return "success"
    if (faturamentoReal >= meta * 0.8) return "warning"
    return "danger"
  })()

  const corStatus =
    status === "success"
      ? "var(--success)"
      : status === "warning"
      ? "var(--warning)"
      : status === "danger"
      ? "var(--danger)"
      : "var(--text-3)"

  return (
    <Link
      href={href}
      className="glass glass-hover no-ds"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "20px 22px",
        textDecoration: "none",
        opacity: cliente.ativo ? 1 : 0.6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-1)",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {clienteDisplayName(cliente)}
        </h3>
        <TagStatusCampanha status={cliente.status_campanhas} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Metrica label="Investimento" valor={formatBRL(investimentoReal)} />
        <Metrica label="Faturamento" valor={formatBRL(faturamentoReal)} destaque />
      </div>

      <div>
        <ProgressBar pct={progressoPct} status={status} mostrarNumero />
        <div
          style={{
            marginTop: 8,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 11,
            color: "var(--text-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>
            Meta:{" "}
            <strong style={{ color: corStatus }}>
              {metaFaturamento !== null ? formatBRL(metaFaturamento) : "R$ 0"}
            </strong>
          </span>
          <span>
            Invest. previsto:{" "}
            {metaInvestimento !== null ? formatBRL(metaInvestimento) : "R$ 0"}
          </span>
        </div>
      </div>
    </Link>
  )
}

function Metrica({
  label,
  valor,
  destaque,
}: {
  label: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          fontSize: 10,
          color: "var(--text-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 500,
          marginBottom: 2,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: destaque ? 22 : 18,
          fontWeight: 600,
          color: destaque ? "var(--text-1)" : "var(--text-2)",
          fontVariantNumeric: "tabular-nums",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {valor}
      </p>
    </div>
  )
}
