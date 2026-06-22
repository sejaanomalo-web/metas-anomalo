/**
 * Barra de KPIs consolidados (glass · 2 col no mobile, 4 no desktop) usada
 * em dois lugares com a MESMA identidade visual:
 *
 *   • Overview de Tráfego  → agregado de TODAS as empresas
 *   • Aba Clientes da empresa → agregado dos CLIENTES daquela empresa
 *
 * Recebe 4 KPIs já formatados (label + valor) pra não acoplar formatação.
 * `fmtBRLResumo` formata o BRL sem centavos (R$ 865, R$ 4), igual ao print
 * aprovado.
 */
type KpiResumo = { label: string; valor: string }

export default function PainelKpisResumo({ kpis }: { kpis: KpiResumo[] }) {
  return (
    <section
      className="glass grid grid-cols-2 lg:grid-cols-4"
      style={{ padding: "20px 24px", gap: 16 }}
    >
      {kpis.map((k) => (
        <KpiMini key={k.label} label={k.label} valor={k.valor} />
      ))}
    </section>
  )
}

function KpiMini({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          fontSize: 11,
          letterSpacing: "1px",
          color: "var(--text-4)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--text-1)",
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
          marginTop: 4,
        }}
      >
        {valor}
      </p>
    </div>
  )
}

/** BRL sem centavos pros KPIs de destaque (R$ 865, R$ 4) — igual ao print. */
export function fmtBRLResumo(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}
