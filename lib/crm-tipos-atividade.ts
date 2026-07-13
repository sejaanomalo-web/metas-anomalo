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

function semAcentoMinusculo(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/** Etapas/tipos cujo nome indica um compromisso com hora marcada (reunião,
 *  follow-up, fechamento) — pra essas o picker de etiqueta abre o formulário
 *  de agendar em vez de só trocar a fase na hora. */
export function precisaAgendar(nome: string): boolean {
  const n = semAcentoMinusculo(nome)
  return (
    n.includes("reuni") ||
    n.includes("agend") ||
    n.includes("follow") ||
    n.includes("fechamento")
  )
}

/** Emoji por palavra-chave do nome da etapa — só estética, tolerante a
 *  rename (cai no rótulo genérico 🏷️ quando não reconhece nada). */
export function emojiDaEtapa(nome: string): string {
  const n = semAcentoMinusculo(nome)
  if (n.includes("novo")) return "👋"
  if (n.includes("conversa")) return "💬"
  if (n.includes("qualific")) return "🎯"
  if (n.includes("reuni") || n.includes("agend")) return "📅"
  if (n.includes("proposta")) return "📩"
  if (n.includes("follow")) return "🔁"
  if (n.includes("fechamento")) return "✅"
  if (n.includes("cliente") || n.includes("ganho")) return "🏆"
  if (n.includes("perdid")) return "❌"
  return "🏷️"
}

/** "agora" local no formato do input datetime-local (YYYY-MM-DDTHH:mm). */
export function agoraLocalInput(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
