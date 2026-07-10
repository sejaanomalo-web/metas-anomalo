// Tipos de atividade PADRAO do CRM (pontos de contato / qualificacao do lead).
// Modulo plano, SEM "use server" (arquivos "use server" so exportam funcoes
// async) — importavel tanto pelas actions quanto pelos client components.
//
// Os 4 padrao vivem aqui (iguais pra todo mundo); tipos custom que o usuario
// adiciona pelo botao "+" ficam em public.crm_tipos_atividade (por usuario).

export interface TipoAtividadePadrao {
  nome: string
  /** eixo tecnico gravado em crm_atividades.tipo (respeita o CHECK do schema). */
  tipo: "tarefa" | "reuniao"
  emoji: string
}

export const TIPOS_ATIVIDADE_PADRAO: TipoAtividadePadrao[] = [
  { nome: "Follow-up", tipo: "tarefa", emoji: "🔁" },
  { nome: "Reunião agendada", tipo: "reuniao", emoji: "📅" },
  { nome: "Fechamento de follow-up", tipo: "tarefa", emoji: "✅" },
  { nome: "Fechamento", tipo: "reuniao", emoji: "🏁" },
]

/** Deriva o `tipo` tecnico (CHECK do schema) a partir do rotulo escolhido:
 *  qualquer categoria que fale de "reuniao"/"fechamento" vira 'reuniao', o
 *  resto 'tarefa'. Assim tipos custom tambem caem num tipo valido. */
export function tipoTecnicoDaCategoria(categoria: string): "tarefa" | "reuniao" {
  const padrao = TIPOS_ATIVIDADE_PADRAO.find(
    (t) => t.nome.toLowerCase() === categoria.trim().toLowerCase()
  )
  if (padrao) return padrao.tipo
  const c = categoria.toLowerCase()
  if (c.includes("reuni") || c.includes("fechamento") || c.includes("call")) {
    return "reuniao"
  }
  return "tarefa"
}
