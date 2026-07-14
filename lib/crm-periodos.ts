// Períodos relativos (ancorados em "hoje") — fonte ÚNICA reaproveitada pelos
// filtros de data das três telas do CRM (Conversas, Kanban, Calendário).
// Antes cada tela tinha sua própria lista/ordem (o Calendário até tinha mais
// opções que Conversas/Kanban, e nenhuma das duas tinha "Ontem") — unificado
// aqui pra garantir que elas fiquem sempre alinhadas: mudar uma opção aqui
// muda nas três de uma vez.
//
// Módulo plano (sem "use server"/"use client"), calculado no client. Retorna
// intervalos [inicio, fim] com fim = FIM do dia (23:59:59.999) — necessário
// pra Conversas/Kanban comparar contra timestamps ISO precisos
// (ultima_interacao_em); o Calendário só usa a parte AAAA-MM-DD desses
// valores (ver chaveDia em components/crm/Calendario.tsx), então o horário
// exato do "fim" não muda nada pro lado dele.
//
// "todos" (Qualquer data) só faz sentido pra Conversas/Kanban — o Calendário
// sempre precisa de um período ativo pra desenhar a grade, então ele filtra
// essa opção na hora de montar o próprio <select> (ver Calendario.tsx).

export type PeriodoFiltroKey =
  | "todos"
  | "hoje"
  | "ontem"
  | "esta_semana"
  | "ult_7"
  | "semana_passada"
  | "ult_14"
  | "ult_30"
  | "este_mes"
  | "mes_passado"
  | "ult_60"
  | "ult_90"
  | "ult_6m"
  | "este_ano"
  | "ult_365"
  | "personalizado"

export const PERIODOS_FILTRO: { chave: PeriodoFiltroKey; label: string }[] = [
  { chave: "todos", label: "Qualquer data" },
  { chave: "hoje", label: "Hoje" },
  { chave: "ontem", label: "Ontem" },
  { chave: "esta_semana", label: "Esta semana" },
  { chave: "ult_7", label: "Últimos 7 dias" },
  { chave: "semana_passada", label: "Semana passada" },
  { chave: "ult_14", label: "Últimos 14 dias" },
  { chave: "ult_30", label: "Últimos 30 dias" },
  { chave: "este_mes", label: "Este mês" },
  { chave: "mes_passado", label: "Mês passado" },
  { chave: "ult_60", label: "Últimos 60 dias" },
  { chave: "ult_90", label: "Últimos 90 dias" },
  { chave: "ult_6m", label: "Últimos 6 meses" },
  { chave: "este_ano", label: "Este ano" },
  { chave: "ult_365", label: "Últimos 365 dias" },
  { chave: "personalizado", label: "Personalizado…" },
]

export function formatarDataBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function fimDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}
function addDias(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Intervalo [inicio, fim] do período, ou null para "todos"/"personalizado"
 *  (sem filtro fixo — "personalizado" usa calcularRangePersonalizado). */
export function calcularRangeFiltro(
  chave: PeriodoFiltroKey,
  hoje: Date
): { inicio: Date; fim: Date } | null {
  const h = inicioDoDia(hoje)
  switch (chave) {
    case "todos":
      return null
    case "hoje":
      return { inicio: h, fim: fimDoDia(h) }
    case "ontem": {
      const o = addDias(h, -1)
      return { inicio: o, fim: fimDoDia(o) }
    }
    case "esta_semana": {
      const ini = addDias(h, -h.getDay())
      return { inicio: ini, fim: fimDoDia(addDias(ini, 6)) }
    }
    case "ult_7":
      return { inicio: addDias(h, -6), fim: fimDoDia(h) }
    case "semana_passada": {
      const iniEsta = addDias(h, -h.getDay())
      return { inicio: addDias(iniEsta, -7), fim: fimDoDia(addDias(iniEsta, -1)) }
    }
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
    case "ult_60":
      return { inicio: addDias(h, -59), fim: fimDoDia(h) }
    case "ult_90":
      return { inicio: addDias(h, -89), fim: fimDoDia(h) }
    case "ult_6m":
      return {
        inicio: new Date(h.getFullYear(), h.getMonth() - 6, h.getDate()),
        fim: fimDoDia(h),
      }
    case "este_ano":
      return {
        inicio: new Date(h.getFullYear(), 0, 1),
        fim: fimDoDia(new Date(h.getFullYear(), 11, 31)),
      }
    case "ult_365":
      return { inicio: addDias(h, -364), fim: fimDoDia(h) }
    case "personalizado":
      // O intervalo real vem de "de"/"até" escolhidos pelo usuário — quem
      // chama isso calcula com calcularRangePersonalizado e só cai aqui como
      // fallback antes das datas serem preenchidas.
      return null
  }
}

/** Range do período "Personalizado…" a partir de dois inputs
 *  `<input type="date">` (formato AAAA-MM-DD). Só "de" preenchido já filtra
 *  aquele dia único; com "até" também, filtra o intervalo (troca os dois se
 *  vierem invertidos). null enquanto "de" não foi preenchido — quem chama
 *  cai de volta no fallback de calcularRangeFiltro nesse caso. */
export function calcularRangePersonalizado(
  de: string,
  ate: string
): { inicio: Date; fim: Date } | null {
  if (!de) return null
  const iniD = new Date(`${de}T00:00:00`)
  const fimD = ate ? new Date(`${ate}T23:59:59.999`) : new Date(`${de}T23:59:59.999`)
  return iniD.getTime() <= fimD.getTime()
    ? { inicio: iniD, fim: fimD }
    : { inicio: new Date(`${ate}T00:00:00`), fim: new Date(`${de}T23:59:59.999`) }
}
