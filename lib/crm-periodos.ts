// Períodos relativos (ancorados em "hoje") reaproveitados por filtros do CRM —
// mesma lista de opções do calendário. Módulo plano (sem "use server"/"use
// client"), calculado no client. Retorna intervalos [inicio, fim] em midnight
// local (fim = fim do dia) pra comparar com timestamps ISO dos leads.

export type PeriodoConversaKey =
  | "todos"
  | "hoje"
  | "esta_semana"
  | "ult_7"
  | "ult_14"
  | "ult_30"
  | "este_mes"
  | "mes_passado"
  | "semana_passada"
  | "ult_90"
  | "ult_365"

export const PERIODOS_CONVERSA: { chave: PeriodoConversaKey; label: string }[] = [
  { chave: "todos", label: "Qualquer data" },
  { chave: "hoje", label: "Hoje" },
  { chave: "esta_semana", label: "Esta semana" },
  { chave: "ult_7", label: "Últimos 7 dias" },
  { chave: "ult_14", label: "Últimos 14 dias" },
  { chave: "ult_30", label: "Últimos 30 dias" },
  { chave: "este_mes", label: "Este mês" },
  { chave: "mes_passado", label: "Mês passado" },
  { chave: "semana_passada", label: "Semana passada" },
  { chave: "ult_90", label: "Últimos 3 meses" },
  { chave: "ult_365", label: "Últimos 365 dias" },
]

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function fimDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}
function addDias(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Intervalo [inicio, fim] do período, ou null para "todos" (sem filtro). */
export function calcularRangeConversa(
  chave: PeriodoConversaKey,
  hoje: Date
): { inicio: Date; fim: Date } | null {
  const h = inicioDoDia(hoje)
  switch (chave) {
    case "todos":
      return null
    case "hoje":
      return { inicio: h, fim: fimDoDia(h) }
    case "esta_semana": {
      const ini = addDias(h, -h.getDay())
      return { inicio: ini, fim: fimDoDia(addDias(ini, 6)) }
    }
    case "ult_7":
      return { inicio: addDias(h, -6), fim: fimDoDia(h) }
    case "ult_14":
      return { inicio: addDias(h, -13), fim: fimDoDia(h) }
    case "ult_30":
      return { inicio: addDias(h, -29), fim: fimDoDia(h) }
    case "este_mes":
      return {
        inicio: new Date(h.getFullYear(), h.getMonth(), 1),
        fim: fimDoDia(new Date(h.getFullYear(), h.getMonth() + 1, 0)),
      }
    case "mes_passado":
      return {
        inicio: new Date(h.getFullYear(), h.getMonth() - 1, 1),
        fim: fimDoDia(new Date(h.getFullYear(), h.getMonth(), 0)),
      }
    case "semana_passada": {
      const iniEsta = addDias(h, -h.getDay())
      return { inicio: addDias(iniEsta, -7), fim: fimDoDia(addDias(iniEsta, -1)) }
    }
    case "ult_90":
      return { inicio: addDias(h, -89), fim: fimDoDia(h) }
    case "ult_365":
      return { inicio: addDias(h, -364), fim: fimDoDia(h) }
  }
}
