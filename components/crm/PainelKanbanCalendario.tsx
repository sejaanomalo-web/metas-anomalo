"use client"

import { useState } from "react"
import type { CrmEtapaRow } from "@/lib/crm-etapas"
import type { CrmLeadRow } from "@/lib/crm-leads"
import type { CrmAtividadeRow } from "@/lib/crm-atividades-actions"
import Kanban from "@/components/crm/Kanban"
import Calendario from "@/components/crm/Calendario"

/** Alternador Kanban/Calendário — só um visível por vez (jeito que o
 *  usuário preferiu, em vez de empilhar os dois sempre visíveis). */
export default function PainelKanbanCalendario({
  etapas,
  leads,
  corPorEmpresa,
  atividades,
  proximas,
}: {
  etapas: CrmEtapaRow[]
  leads: CrmLeadRow[]
  corPorEmpresa: Record<string, string>
  atividades: CrmAtividadeRow[]
  proximas: CrmAtividadeRow[]
}) {
  const [aba, setAba] = useState<"kanban" | "calendario">("kanban")

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setAba("kanban")}
          style={{
            fontSize: 11,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            padding: "6px 14px",
            borderRadius: 8,
            color: aba === "kanban" ? "#0a0a0a" : "var(--text-3)",
            background: aba === "kanban" ? "var(--gold, #C9953A)" : "transparent",
            border: "0.5px solid rgba(255,255,255,0.12)",
            fontWeight: 600,
          }}
        >
          Kanban
        </button>
        <button
          type="button"
          onClick={() => setAba("calendario")}
          style={{
            fontSize: 11,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            padding: "6px 14px",
            borderRadius: 8,
            color: aba === "calendario" ? "#0a0a0a" : "var(--text-3)",
            background: aba === "calendario" ? "var(--gold, #C9953A)" : "transparent",
            border: "0.5px solid rgba(255,255,255,0.12)",
            fontWeight: 600,
          }}
        >
          Calendário
        </button>
      </div>

      {aba === "kanban" ? (
        <Kanban etapas={etapas} leads={leads} corPorEmpresa={corPorEmpresa} />
      ) : (
        <Calendario atividades={atividades} proximas={proximas} />
      )}
    </div>
  )
}
