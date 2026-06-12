import { timingSafeEqual } from "crypto"

/**
 * Valida o header `Authorization: Bearer <CRON_SECRET>` em tempo constante.
 * Comparar com `===` vaza, por timing, quantos caracteres do segredo batem.
 * timingSafeEqual exige buffers do mesmo tamanho — por isso o guard de
 * comprimento antes (que só revela se acertou o TAMANHO, não o conteúdo).
 *
 * Comportamento idêntico ao `authHeader === \`Bearer ${secret}\`` anterior:
 * segredo correto passa, qualquer outra coisa falha. Só fecha o canal lateral.
 */
export function bearerValido(
  authHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) return false
  const esperado = `Bearer ${secret}`
  const recebido = authHeader ?? ""
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
