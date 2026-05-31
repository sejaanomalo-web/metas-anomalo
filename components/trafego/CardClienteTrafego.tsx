import Link from "next/link"
import TagStatusCampanha from "./TagStatusCampanha"
import type { ResumoClienteMes } from "@/lib/clientes"
import { clienteDisplayName } from "@/lib/clientes"
import { formatBRL, formatNumero } from "@/lib/data"

/** Mini-card de um cliente na lista de Tráfego por Cliente.
 *  Mostra resumo do mês (investimento, leads, CPL) + tag de status.
 *  Clicar leva ao dashboard de tráfego completo do cliente. */
export default function CardClienteTrafego({
  resumo,
  empresaSlug,
  mes,
  ano,
}: {
  resumo: ResumoClienteMes
  empresaSlug: string
  mes: string
  ano: number
}) {
  const { cliente, investimento, leads, cpl } = resumo
  const href = `/dashboard/${empresaSlug}/clientes/${cliente.slug}?mes=${mes}&ano=${ano}`

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
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {clienteDisplayName(cliente)}
          </h3>
          {!cliente.ativo && (
            <span style={{ fontSize: 10, color: "var(--text-4)" }}>
              {cliente.empresa_origem_nome || cliente.campaign_filter
                ? "inativo"
                : "aguardando conta"}
            </span>
          )}
        </div>
        <TagStatusCampanha status={cliente.status_campanhas} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <Metrica label="Investimento" valor={formatBRL(investimento)} destaque />
        <Metrica label="Resultados" valor={formatNumero(leads)} />
        <Metrica label="CPL" valor={cpl !== null ? formatBRL(cpl) : "—"} />
      </div>

      {cliente.status_campanhas === "sem_conexao" && cliente.ultimo_erro && (
        <p
          style={{
            fontSize: 11,
            color: "var(--danger)",
            background: "var(--danger-bg)",
            border: "1px solid rgba(239,68,68,0.20)",
            borderRadius: 8,
            padding: "6px 10px",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={cliente.ultimo_erro}
        >
          {cliente.ultimo_erro}
        </p>
      )}
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
          fontSize: destaque ? 16 : 14,
          fontWeight: destaque ? 700 : 600,
          color: destaque ? "var(--accent)" : "var(--text-2)",
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
