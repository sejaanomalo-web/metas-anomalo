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
import Kanban from "@/components/crm/Kanban"
import Calendario from "@/components/crm/Calendario"

export const dynamic = "force-dynamic"

type Aba = "conversas" | "kanban" | "calendario"

const ABAS: { chave: Aba; label: string }[] = [
  { chave: "conversas", label: "Conversas" },
  { chave: "kanban", label: "Kanban" },
  { chave: "calendario", label: "Calendário" },
]

/**
 * CRM em tela cheia, estilo WhatsApp Web: um seletor no topo troca entre as
 * 3 telas (Conversas / Kanban / Calendário) — cada uma ocupa o espaço
 * inteiro disponível, em vez de ficarem empilhadas. Estado do seletor é a
 * URL (?view=), igual ao ?lead= do inbox — dá pra linkar direto (ex: um card
 * do Kanban abre em "?view=conversas&lead=X").
 */
export default async function CrmPage({
  searchParams,
}: {
  searchParams: { lead?: string; view?: string }
}) {
  await requererPermissao("crm")

  const aba: Aba = (["conversas", "kanban", "calendario"] as const).includes(
    searchParams.view as Aba
  )
    ? (searchParams.view as Aba)
    : "conversas"

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

  const leadId = aba === "conversas" ? searchParams.lead : undefined
  const [lead, pagina] = leadId
    ? await Promise.all([buscarLead(leadId), listarMensagensDoLead(leadId)])
    : [null, { mensagens: [], temMaisAntigas: false }]

  return (
    <main
      className="mx-auto px-8 py-8 flex flex-col"
      style={{ maxWidth: 1400, height: "100vh" }}
    >
      <CrmRealtime />
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ flexShrink: 0 }}>
        <div className="flex items-center gap-6">
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
            <h1 style={{ fontSize: 28, marginTop: 4 }}>
              {ABAS.find((a) => a.chave === aba)?.label}
            </h1>
          </div>
          <SeletorAba abaAtiva={aba} leadId={lead?.id} />
        </div>
        <Link
          href="/dashboard/crm/conexoes"
          style={{ fontSize: 12, color: "var(--gold, #C9953A)" }}
        >
          Conexões WhatsApp →
        </Link>
      </div>

      <div style={{ flex: 1, minHeight: 0, marginTop: 20 }}>
        {aba === "conversas" && (
          <div
            className="glass"
            style={{
              display: "grid",
              gridTemplateColumns: "360px 1fr",
              height: "100%",
              overflow: "hidden",
            }}
          >
            <div
              className="scrollbar-thin"
              style={{
                borderRight: "0.5px solid rgba(255,255,255,0.08)",
                overflowY: "auto",
                padding: 10,
                // Isola a pintura e impede o scroll de "vazar" pra página —
                // junto com content-visibility nas linhas, deixa o scroll
                // fluido mesmo com muitas conversas.
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
                  mensagensIniciais={pagina.mensagens}
                  temMaisAntigasInicial={pagina.temMaisAntigas}
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
        )}

        {aba === "kanban" && (
          <div className="glass" style={{ height: "100%", padding: 16, overflow: "hidden" }}>
            <Kanban etapas={etapas} leads={leads} corPorEmpresa={corPorEmpresa} />
          </div>
        )}

        {aba === "calendario" && (
          <div className="glass" style={{ height: "100%", padding: 20, overflow: "hidden" }}>
            <Calendario atividades={atividades} proximas={proximas} />
          </div>
        )}
      </div>
    </main>
  )
}

function SeletorAba({ abaAtiva, leadId }: { abaAtiva: Aba; leadId?: string }) {
  return (
    <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
      {ABAS.map((a) => {
        const ativa = a.chave === abaAtiva
        const href =
          a.chave === "conversas" && leadId
            ? `/dashboard/crm?view=conversas&lead=${leadId}`
            : `/dashboard/crm?view=${a.chave}`
        return (
          <Link
            key={a.chave}
            href={href}
            style={{
              fontSize: 11,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              padding: "7px 16px",
              borderRadius: 8,
              fontWeight: 600,
              color: ativa ? "#0a0a0a" : "var(--text-3)",
              background: ativa ? "var(--gold, #C9953A)" : "transparent",
              border: "0.5px solid rgba(255,255,255,0.12)",
            }}
          >
            {a.label}
          </Link>
        )
      })}
    </div>
  )
}
