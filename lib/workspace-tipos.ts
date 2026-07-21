// =============================================================================
// Workspace — tipos e helpers PUROS. Seguro para o browser.
// =============================================================================
//
// Este arquivo existe separado de lib/workspace.ts por um motivo concreto:
// workspace.ts importa getSupabaseAdmin (service_role). Se um componente
// client importasse um helper de lá, o bundler puxaria a camada de leitura
// inteira — e o client Supabase admin junto — pro JavaScript do browser.
// O valor da chave não vazaria (Next só inlina NEXT_PUBLIC_*), mas é peso
// morto no bundle e um pé na porta que não deve ficar aberto.
//
// Regra: componente client importa daqui. Server importa de workspace.ts,
// que reexporta tudo isto.

export type TipoContexto = "geral" | "cliente" | "empresa" | "interno"
export type Prioridade = "baixa" | "normal" | "alta"

export interface Contexto {
  id: string
  nome: string
  tipo: TipoContexto
  empresa_nome: string | null
  cliente_id: string | null
  cor: string | null
  ordem: number
  arquivado_em: string | null
}

export interface Tarefa {
  id: string
  titulo: string
  descricao: string | null
  tarefa_pai_id: string | null
  responsavel_id: string | null
  criado_por: string | null
  prazo_em: string | null
  prazo_hora: string | null
  inicio_em: string | null
  prioridade: Prioridade
  concluida_em: string | null
  concluida_por: string | null
  ordem: number
  versao: number
  arquivada_em: string | null
  excluida_em: string | null
  created_at: string
  updated_at: string
}

/** Tarefa + tudo que a UI precisa pra desenhar uma linha sem N+1 queries. */
export interface TarefaComRelacoes extends Tarefa {
  contextos: Contexto[]
  responsavel_nome: string | null
  /** Progresso das subtarefas — só preenchido em tarefas-pai. */
  subtarefas_total: number
  subtarefas_concluidas: number
  comentarios_total: number
}

export interface Comentario {
  id: string
  tarefa_id: string
  autor_id: string | null
  autor_nome: string | null
  corpo: string
  created_at: string
  updated_at: string
}

export interface EventoAtividade {
  id: number
  tarefa_id: string
  ator_id: string | null
  ator_nome: string | null
  evento: string
  mudanca: Record<string, unknown> | null
  created_at: string
}

export interface FiltroTarefas {
  busca?: string
  responsavelId?: string
  contextoId?: string
  /** 'pendentes' (padrão) | 'concluidas' | 'todas' */
  situacao?: "pendentes" | "concluidas" | "todas"
  prazoDe?: string
  prazoAte?: string
  apenasAtrasadas?: boolean
  apenasSemPrazo?: boolean
  /** true = traz arquivadas/excluídas (aba Arquivo). Padrão false. */
  incluirArquivadas?: boolean
  limite?: number
  offset?: number
}

// ============================================================
// Helpers de rótulo
// ============================================================

export function tipoContextoRotulo(t: TipoContexto): string {
  switch (t) {
    case "geral": return "Geral"
    case "cliente": return "Cliente"
    case "empresa": return "Empresa"
    case "interno": return "Interno"
  }
}

export function prioridadeRotulo(p: Prioridade): string {
  switch (p) {
    case "baixa": return "Baixa"
    case "normal": return "Normal"
    case "alta": return "Alta"
  }
}

/** Cor do contexto, validada. Valor inválido no banco vira cinza neutro em
 *  vez de virar um atributo de estilo com conteúdo arbitrário. */
export function corDoContexto(c: Contexto): string {
  return c.cor && /^#[0-9a-fA-F]{6}$/.test(c.cor) ? c.cor : "#8a8a94"
}
