/**
 * Tradutor de erros do Postgres/Supabase para frases que a pessoa entende.
 *
 * Numa tela de dinheiro, "erro desconhecido" é inaceitável: quem acabou de
 * tentar salvar um pagamento precisa saber se salvou, se duplicou ou se o
 * banco está desatualizado. Esta função nunca inventa — quando não reconhece
 * o código, devolve a mensagem original em vez de escondê-la.
 *
 * Puro: pode ser usado no servidor e no cliente.
 */

export interface ErroBanco {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/**
 * Os três códigos abaixo significam, quase sempre, a mesma coisa neste
 * projeto: o código novo já subiu mas a migração ainda não foi aplicada no
 * SQL Editor. As migrações deste repositório são aplicadas à mão, então esse
 * descompasso é esperado e merece uma mensagem que diga o que fazer.
 */
const SCHEMA_DESATUALIZADO = new Set([
  "23502", // not null violation — coluna nova obrigatória ainda sem default
  "42703", // undefined column
  "42883", // undefined function
  "42P01", // undefined table
  "PGRST204", // PostgREST: coluna não encontrada no cache do schema
])

export function traduzirErroBanco(
  erro: ErroBanco | null | undefined,
  contexto?: string
): string {
  if (!erro) return "Não foi possível concluir. Tente de novo."
  const code = erro.code ?? ""
  const msg = erro.message ?? ""

  if (SCHEMA_DESATUALIZADO.has(code)) {
    return (
      "O banco ainda não tem a migração mais recente do financeiro. " +
      "Aplique os arquivos de supabase/migrations no SQL Editor do Supabase " +
      `e tente de novo. (${code}: ${msg})`
    )
  }

  switch (code) {
    case "23505":
      // Violação de unicidade. O índice do recorrente é o caso comum.
      if (msg.includes("recorrente_mes")) {
        return "Esse recorrente já tem lançamento neste mês."
      }
      if (msg.includes("categoria")) {
        return "Já existe uma categoria com esse nome e tipo."
      }
      return "Esse registro já existe."
    case "23503":
      return (
        "Um dos vínculos não existe mais (categoria ou conta pode ter sido " +
        "excluída). Recarregue a página e tente de novo."
      )
    case "23514":
      return "Algum valor está fora do permitido para este campo."
    case "22P02":
      return "Um dos campos veio num formato inválido."
    case "57014":
      return "A consulta demorou demais. Reduza o período e tente de novo."
    case "42501":
      return "Sem permissão para essa operação no banco."
    default:
      break
  }

  if (!msg) return contexto ? `Falha em ${contexto}.` : "Não foi possível concluir."
  return msg
}

/**
 * Um DELETE barrado pela RLS devolve 0 linhas SEM erro — a tela diria
 * "excluído" e o registro continuaria lá. Por isso todo delete do módulo usa
 * `.select()` e passa por aqui.
 */
export function conferirLinhasAfetadas(
  linhas: unknown[] | null,
  oQue: string
): string | null {
  if (linhas && linhas.length > 0) return null
  return (
    `Nada foi alterado ao ${oQue}. Isso costuma ser falta de permissão no ` +
    "banco (a operação foi recusada silenciosamente). Confira seu acesso."
  )
}
