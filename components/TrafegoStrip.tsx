import type { EmpresaDb } from "@/lib/data"
import type { DadosReais } from "@/lib/supabase"
import { formatBRL, formatNumero } from "@/lib/data"

// Integração com Marketing API da Meta está preparada em lib/meta-campaigns.ts
// e lib/meta-accounts.ts, mas depende de App Review aprovado pelo Meta para
// liberar as permissões ads_read/ads_management. Enquanto não for aprovada,
// exibimos apenas os campos de entrada manual (Investimento/Leads/CPL).

export default async function TrafegoStrip({
  empresaDb: _empresaDb,
  mes: _mes,
  ano: _ano,
  dadosReais,
}: {
  empresaSlug: string
  empresaDb: EmpresaDb
  mes: string
  ano: number
  dadosReais: DadosReais | null
}) {
  const investimento = dadosReais?.investimento_real ?? null
  const leads = dadosReais?.leads_real ?? null
  const cpl = dadosReais?.cpl_real ?? null

  return (
    <div className="glass" style={{ padding: 20 }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p
          style={{
            fontSize: 11,
            color: "#ffffff",
            fontWeight: 500,
            letterSpacing: "0.3px",
          }}
        >
          Tráfego Pago
        </p>
      </div>

      <div
        className="grid grid-cols-3"
        style={{ gap: "0.5px", background: "rgba(255,255,255,0.05)", marginTop: 16 }}
      >
        <CelulaTrafego
          label="Investimento"
          valor={investimento !== null ? formatBRL(investimento) : "—"}
        />
        <CelulaTrafego
          label="Leads"
          valor={leads !== null ? formatNumero(leads) : "—"}
        />
        <CelulaTrafego
          label="CPL"
          valor={cpl !== null ? formatBRL(cpl) : "—"}
        />
      </div>
    </div>
  )
}

function CelulaTrafego({
  label,
  valor,
}: {
  label: string
  valor: string
}) {
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.25)",
        padding: "12px 14px",
      }}
    >
      <p
        style={{
          fontSize: 8,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "#ffffff",
          fontWeight: 500,
          marginTop: 4,
          letterSpacing: "-0.2px",
        }}
      >
        {valor}
      </p>
    </div>
  )
}
