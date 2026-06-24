import { requererPermissao } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * CRM — placeholder da Fase 0. A fundacao ja esta no ar: o webhook da Evolution
 * cria leads e grava mensagens em crm_*. As telas (inbox, Kanban, calendario,
 * ficha) chegam nas Fases 1-4. Gated pela permissao 'crm'.
 */
export default async function CrmPage() {
  await requererPermissao("crm")

  return (
    <main className="mx-auto px-8 py-10 space-y-8" style={{ maxWidth: 1280 }}>
      <div className="hero-banner">
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
        <h1 style={{ fontSize: 36, marginTop: 6 }}>CRM · em construção</h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-3)",
            marginTop: 10,
            lineHeight: 1.6,
            maxWidth: 620,
          }}
        >
          Fundação no ar. Assim que as 3 instâncias da Evolution forem
          conectadas, os leads do WhatsApp já começam a entrar automaticamente.
          As telas — caixa de entrada, Kanban e calendário — chegam nas
          próximas fases.
        </p>
      </div>
    </main>
  )
}
