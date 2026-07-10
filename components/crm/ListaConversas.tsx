import Link from "next/link"
import type { CrmLeadRow } from "@/lib/crm-leads"
import Avatar from "@/components/crm/Avatar"
import { EtiquetaChip } from "@/components/crm/Etiquetas"

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
  corPorEmpresa,
}: {
  leads: CrmLeadRow[]
  leadSelecionadoId?: string
  /** empresa_slug -> cor da instância (identificação visual por número). */
  corPorEmpresa: Record<string, string>
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
        const cor = corPorEmpresa[lead.empresa_slug] ?? "#C9953A"
        const nomeExibido = lead.nome || lead.telefone_e164 || "Lead sem nome"
        return (
          <Link
            key={lead.id}
            href={`/dashboard/crm?lead=${lead.id}`}
            className="flex items-start gap-3"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: selecionado ? "rgba(201,149,58,0.10)" : "transparent",
              border: selecionado
                ? "0.5px solid rgba(201,149,58,0.30)"
                : "0.5px solid transparent",
            }}
          >
            <Avatar nome={nomeExibido} cor={cor} fotoUrl={lead.foto_url} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: selecionado ? "var(--gold, #C9953A)" : "inherit",
                  }}
                  className="truncate"
                >
                  {nomeExibido}
                </p>
                <span style={{ fontSize: 10, color: "var(--text-4)", flexShrink: 0 }}>
                  {tempoRelativo(lead.ultima_interacao_em)}
                </span>
              </div>
              {lead.ultima_msg_preview && (
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p
                    style={{
                      fontSize: 11,
                      color: lead.nao_lidas > 0 ? "var(--text-2, #ddd)" : "var(--text-3)",
                      fontWeight: lead.nao_lidas > 0 ? 500 : 400,
                    }}
                    className="truncate"
                  >
                    {lead.ultima_msg_preview}
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
              )}
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span
                  style={{
                    fontSize: 10,
                    color: cor,
                    fontWeight: 500,
                  }}
                  className="truncate"
                >
                  {lead.empresa_nome}
                </span>
                {lead.nao_lidas > 0 && !lead.ultima_msg_preview && (
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
              {lead.etiquetas.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {lead.etiquetas.map((e) => (
                    <EtiquetaChip key={e.id} nome={e.nome} cor={e.cor} />
                  ))}
                </div>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
