import Link from "next/link"
import { requererPermissao } from "@/lib/auth"
import { listarLeadsInbox, buscarLead, listarMensagensDoLead } from "@/lib/crm-leads"
import ListaConversas from "@/components/crm/ListaConversas"
import Thread from "@/components/crm/Thread"
import CrmRealtime from "@/components/crm/CrmRealtime"

export const dynamic = "force-dynamic"

/**
 * Inbox do CRM (Fase 1). Master-detail via query string (?lead=<id>) em vez
 * de rota dinâmica, já que o Kanban da Fase 2 reaproveita a mesma lista de
 * leads. Fundação (schema + webhook Evolution) é da Fase 0.
 */
export default async function CrmPage({
  searchParams,
}: {
  searchParams: { lead?: string }
}) {
  await requererPermissao("crm")

  const leads = await listarLeadsInbox()
  const leadId = searchParams.lead
  const [lead, mensagens] = leadId
    ? await Promise.all([buscarLead(leadId), listarMensagensDoLead(leadId)])
    : [null, []]

  return (
    <main className="mx-auto px-8 py-10" style={{ maxWidth: 1280 }}>
      <CrmRealtime />
      <div className="flex items-center justify-between mb-6">
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-3)",
              letterSpacing: "0.01em",
            }}
          >
            CRM
          </p>
          <h1 style={{ fontSize: 32, marginTop: 6 }}>Conversas</h1>
        </div>
        <Link
          href="/dashboard/crm/conexoes"
          style={{ fontSize: 12, color: "var(--gold, #C9953A)" }}
        >
          Conexões WhatsApp →
        </Link>
      </div>

      <div
        className="glass"
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          height: "calc(100vh - 260px)",
          minHeight: 480,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            borderRight: "0.5px solid rgba(255,255,255,0.08)",
            overflowY: "auto",
            padding: 10,
          }}
        >
          <ListaConversas leads={leads} leadSelecionadoId={lead?.id} />
        </div>

        <div style={{ minWidth: 0 }}>
          {lead ? (
            <Thread lead={lead} mensagens={mensagens} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p style={{ fontSize: 13, color: "var(--text-3)" }}>
                Selecione uma conversa à esquerda.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
