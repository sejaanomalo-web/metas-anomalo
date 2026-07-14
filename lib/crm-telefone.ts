// Normalização de telefone compartilhada entre lib/crm-leads-actions.ts e
// lib/crm-instancias-actions.ts. Módulo plano (sem "use server") — as duas
// chamadoras são "use server" e só podem exportar funções async, então essa
// função pura precisa morar fora delas pra ser reaproveitada nas duas.

/** Digitos puros; numero brasileiro sem DDI (10/11 digitos — fixo ou celular
 *  com o 9) ganha o 55 na frente, pro mesmo padrao dos leads que chegam pelo
 *  WhatsApp (telefoneDoJid em lib/crm-inbound.ts). */
export function normalizarTelefone(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "")
  if (digitos.length < 8) return null
  if (digitos.length <= 11) return `55${digitos}`
  return digitos
}
