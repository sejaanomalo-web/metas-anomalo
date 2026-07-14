// Normalização de telefone compartilhada (lib/crm-leads-actions.ts,
// lib/crm-instancias-actions.ts, lib/crm-mensagens-actions.ts). Módulo plano
// (sem "use server") — as chamadoras são "use server" e só podem exportar
// funções async, então essas funções puras precisam morar fora delas.
//
// Contexto do bug que motivou a versão robusta: a Evolution rejeita com
// "Bad Request" qualquer número que não esteja em E.164 (só dígitos, com
// código do país, SEM o "+"). A versão antiga só prependia "55" quando o
// número tinha ≤ 11 dígitos — então um número digitado com o prefixo de
// tronco ("0" + DDD), tipo "045991122829" (12 dígitos), passava direto SEM
// ganhar o 55 e SEM perder o 0, indo malformado pro WhatsApp e falhando.

/**
 * Normaliza um número BRASILEIRO digitado à mão (form de novo contato) pra
 * E.164 só-dígitos (ex: 5545991122829). Trata:
 *   • pontuação/espaços;
 *   • prefixo internacional "00" (ex: 0055...);
 *   • prefixo de tronco/operadora "0"/"021"/"041" antes do DDD (E.164 NUNCA
 *     começa com 0, então zero à esquerda é sempre lixo);
 *   • número nacional cru (DDD + fixo/celular = 10 ou 11 dígitos) → ganha 55.
 * Retorna null se, mesmo depois disso, não sobrar um número plausível.
 *
 * Desenhado pra ENTRADA brasileira. Não use pra "consertar" números que já
 * chegaram limpos do WhatsApp (inbound) — esses podem ser estrangeiros
 * (ex: +44...) e prepender 55 os corromperia. Pro envio, use
 * corrigirNumeroEnvio, que só mexe no que é inequivocamente malformado.
 */
export function normalizarTelefone(bruto: string): string | null {
  let d = bruto.replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2) // discagem internacional (00 + país)
  d = d.replace(/^0+/, "") // tronco/operadora antes do DDD
  if (d.length < 10) return null // curto demais pra ser DDD(2) + número(8+)
  // Já em E.164 do Brasil: 55 + DDD(2) + número(8 fixo | 9 celular) = 12 ou 13.
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d
  // Número nacional (DDD + número), 10 (fixo) ou 11 (celular): só falta o país.
  if (d.length === 10 || d.length === 11) return `55${d}`
  // Fora dos formatos BR conhecidos: não reprepende país se já parecer ter um.
  return d.startsWith("55") ? d : `55${d}`
}

/**
 * Conserto CONSERVADOR aplicado na hora de ENVIAR, pra auto-curar números
 * já gravados errado (leads manuais antigos criados antes do normalizador
 * robusto) SEM arriscar corromper número estrangeiro legítimo que veio do
 * inbound.
 *
 * Regra segura e universal: E.164 nunca começa com 0. Um número começando
 * com "0" é sempre um brasileiro digitado com prefixo de tronco e sem o país
 * → normaliza. Qualquer outro (já com código de país — 55…, 44…, 1…) vai
 * como está, intocado.
 */
export function corrigirNumeroEnvio(numero: string): string {
  const d = numero.replace(/\D/g, "")
  if (d.startsWith("0")) return normalizarTelefone(d) ?? d
  return d
}
