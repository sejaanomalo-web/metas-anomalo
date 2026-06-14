import Link from "next/link"
import { formatBRL, formatNumero, type EmpresaMeta, type Mes } from "@/lib/data"

/**
 * Card de uma empresa na visão agregada de tráfego pago
 * (/dashboard/trafego). Mostra os KPIs do mês corrente e linka pra
 * /dashboard/[empresa]/trafego pra detalhes diários.
 *
 * Linguagem visual coerente com CardEmpresa (visão geral em
 * /dashboard/empresas), mas com foco nos campos de mídia paga:
 * investimento, leads, CPL, CPA. Sem faturamento/contratos no destaque
 * — esses ficam pra visão admin.
 */
export default function CardEmpresaTrafego({
  empresa,
  mes,
  ano,
  investimento,
  leads,
  cpl,
  cpm,
  resumoClientes,
}: {
  empresa: EmpresaMeta
  mes: Mes
  ano: number
  investimento: number
  leads: number
  cpl: number | null
  cpm: number | null
  /** Agregado dos clientes da assessoria (quando a empresa delega aos
   *  clientes-folha, ex.: Assessoria Sun). Mostra o que a agência movimenta
   *  mesmo sem rodar tráfego no próprio nome. */
  resumoClientes?: {
    qtdClientes: number
    investimento: number
    leads: number
  } | null
}) {
  const href = `/dashboard/${empresa.slug}/trafego?mes=${mes}&ano=${ano}`
  const semDados = investimento === 0 && leads === 0

  return (
    <Link
      href={href}
      className="glass glass-hover block"
      style={{
        padding: "20px 22px",
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Nome da empresa */}
      <div>
        <p
          style={{
            fontSize: 10,
            letterSpacing: "1.2px",
            color: "var(--text-4)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Tráfego pago · {mes} {ano}
        </p>
        <h3
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--text-1)",
            letterSpacing: "-0.01em",
            marginTop: 4,
          }}
        >
          {empresa.nome}
        </h3>
      </div>

      {/* KPIs principais */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
      >
        <Metric
          label="Investimento"
          valor={semDados ? "·" : formatBRL(investimento)}
          destacado
        />
        <Metric
          label="Leads"
          valor={semDados ? "·" : formatNumero(leads)}
        />
        <Metric label="CPL" valor={cpl ? formatBRL(cpl) : "·"} />
        <Metric label="CPM" valor={cpm ? formatBRL(cpm) : "·"} />
      </div>

      {/* Resumo dos clientes da assessoria (quando houver) */}
      {resumoClientes && resumoClientes.qtdClientes > 0 && (
        <div
          style={{
            borderTop: "0.5px solid rgba(255,255,255,0.08)",
            paddingTop: 12,
          }}
        >
          <p
            style={{
              fontSize: 10,
              letterSpacing: "0.8px",
              color: "var(--text-4)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Clientes da assessoria
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-2)",
              fontWeight: 500,
              marginTop: 3,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            👥 {resumoClientes.qtdClientes} cliente
            {resumoClientes.qtdClientes > 1 ? "s" : ""}
            {resumoClientes.investimento > 0
              ? ` · ${formatBRL(resumoClientes.investimento)}`
              : ""}
            {resumoClientes.leads > 0
              ? ` · ${formatNumero(resumoClientes.leads)} leads`
              : ""}
          </p>
        </div>
      )}

      {/* Footer link */}
      <p
        style={{
          fontSize: 11,
          color: "var(--accent)",
          fontWeight: 600,
          letterSpacing: "0.04em",
          marginTop: 4,
        }}
      >
        Ver detalhes →
      </p>
    </Link>
  )
}

function Metric({
  label,
  valor,
  destacado,
}: {
  label: string
  valor: string
  destacado?: boolean
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.8px",
          color: "var(--text-4)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: destacado ? 17 : 15,
          fontWeight: destacado ? 700 : 600,
          color: destacado ? "var(--accent)" : "var(--text-1)",
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
          marginTop: 3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {valor}
      </p>
    </div>
  )
}
