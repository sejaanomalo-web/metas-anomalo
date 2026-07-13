// Normalização e correspondência de busca textual reaproveitadas por
// Conversas, Kanban e Calendário — remove acentos e ignora maiúsculas pra
// achar "joao" mesmo buscando "João".

export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/** true se `termo` (vazio = sem busca, sempre casa) aparece em algum dos campos. */
export function casaBusca(
  termo: string,
  ...campos: (string | null | undefined)[]
): boolean {
  const alvo = normalizarBusca(termo)
  if (!alvo) return true
  return campos.some((c) => !!c && normalizarBusca(c).includes(alvo))
}
