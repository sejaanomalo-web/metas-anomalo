import Link from "next/link"
import type { CrmLeadRow } from "@/lib/crm-leads"

function tempoRelativo(iso: string | null): string {
  if (!iso) return ""
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export default function ListaConversas({
  leads,
  leadSelecionadoId,
}: {
  leads: CrmLeadRow[]
  leadSelecionadoId?: string
}) {
  if (leads.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-3)", padding: 16 }}>
        Nenhuma conversa ainda. Conecte um número em{" "}
        <Link href="/dashboard/crm/conexoes" style={{ color: "var(--gold, #C9953A)" }}>
          Conexões
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {leads.map((lead) => {
        const selecionado = lead.id === leadSelecionadoId
        return (
          <Link
            key={lead.id}
            href={`/dashboard/crm?lead=${lead.id}`}
            className="block"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: selecionado
                ? "rgba(201,149,58,0.10)"
                : "transparent",
              border: selecionado
                ? "0.5px solid rgba(201,149,58,0.30)"
                : "0.5px solid transparent",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: selecionado ? "var(--gold, #C9953A)" : "inherit",
                }}
                className="truncate"
              >
                {lead.nome || lead.telefone_e164 || "Lead sem nome"}
              </p>
              <span style={{ fontSize: 10, color: "var(--text-4)", flexShrink: 0 }}>
                {tempoRelativo(lead.ultima_interacao_em)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <p style={{ fontSize: 11, color: "var(--text-3)" }} className="truncate">
                {lead.empresa_nome}
              </p>
              {lead.nao_lidas > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#0a0a0a",
                    background: "var(--gold, #C9953A)",
                    borderRadius: 999,
                    padding: "1px 7px",
                    flexShrink: 0,
                  }}
                >
                  {lead.nao_lidas}
                </span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
