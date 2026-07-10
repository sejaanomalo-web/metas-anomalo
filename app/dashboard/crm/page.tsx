import Link from "next/link"
import { requererPermissao } from "@/lib/auth"
import { listarLeadsInbox, buscarLead, listarMensagensDoLead } from "@/lib/crm-leads"
import { listarInstancias } from "@/lib/crm-instancias-actions"
import { listarEtapas } from "@/lib/crm-etapas"
import { listarEtiquetas } from "@/lib/crm-etiquetas-actions"
import {
  listarAtividadesCalendario,
  listarProximasAtividades,
  listarTiposAtividade,
} from "@/lib/crm-atividades-actions"
import ListaConversas from "@/components/crm/ListaConversas"
import Thread from "@/components/crm/Thread"
import CrmRealtime from "@/components/crm/CrmRealtime"
import PainelKanbanCalendario from "@/components/crm/PainelKanbanCalendario"

export const dynamic = "force-dynamic"

/**
 * CRM: inbox (conversas) em cima, alternador Kanban/Calendário embaixo —
 * todos reaproveitando a MESMA lista de leads do usuário logado (isolamento
 * total: cada usuário só vê o que ele mesmo conectou). Master-detail do
 * inbox via query string (?lead=<id>).
 */
export default async function CrmPage({
  searchParams,
}: {
  searchParams: { lead?: string }
}) {
  await requererPermissao("crm")

  const agora = new Date()
  const inicioJanela = new Date(agora.getFullYear(), agora.getMonth() - 2, 1).toISOString()
  const fimJanela = new Date(agora.getFullYear(), agora.getMonth() + 7, 0).toISOString()

  const [leads, instancias, etapas, etiquetas, atividades, proximas, tipos] =
    await Promise.all([
      listarLeadsInbox(),
      listarInstancias(),
      listarEtapas(),
      listarEtiquetas(),
      listarAtividadesCalendario(inicioJanela, fimJanela),
      listarProximasAtividades(),
      listarTiposAtividade(),
    ])

  const corPorEmpresa: Record<string, string> = {}
  for (const inst of instancias) corPorEmpresa[inst.empresa_slug] = inst.cor

  const leadId = searchParams.lead
  const [lead, mensagens] = leadId
    ? await Promise.all([buscarLead(leadId), listarMensagensDoLead(leadId)])
    : [null, []]

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <CrmRealtime />
      <div className="flex items-center justify-between">
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
          gridTemplateColumns: "340px 1fr",
          // Mais alta e responsiva à janela (antes era fixa em 560, cortava
          // mensagens). Mínimo garante uso em telas menores.
          height: "min(760px, calc(100vh - 210px))",
          minHeight: 520,
          overflow: "hidden",
        }}
      >
        <div
          className="scrollbar-thin"
          style={{
            borderRight: "0.5px solid rgba(255,255,255,0.08)",
            overflowY: "auto",
            padding: 10,
            // Isola a pintura e impede o scroll de "vazar" pra página — junto
            // com content-visibility nas linhas, deixa o scroll fluido.
            contain: "paint",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <ListaConversas
            leads={leads}
            leadSelecionadoId={lead?.id}
            corPorEmpresa={corPorEmpresa}
          />
        </div>

        <div style={{ minWidth: 0 }}>
          {lead ? (
            <Thread
              key={lead.id}
              lead={lead}
              mensagens={mensagens}
              cor={corPorEmpresa[lead.empresa_slug] ?? "#C9953A"}
              todasEtiquetas={etiquetas}
              tiposCustom={tipos}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p style={{ fontSize: 13, color: "var(--text-3)" }}>
                Selecione uma conversa à esquerda.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="glass" style={{ padding: 20 }}>
        <PainelKanbanCalendario
          etapas={etapas}
          leads={leads}
          corPorEmpresa={corPorEmpresa}
          atividades={atividades}
          proximas={proximas}
        />
      </div>
    </main>
  )
}
