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
  foto_url: string | null
  /**
   * Âncora do grupo de empresa a que este contexto pertence (tipo 'empresa'
   * aponta pra si mesmo). É a RELAÇÃO que define o grupo — empresa_nome virou
   * espelho. Antes o agrupamento casava a string e "ASSESSORIA SUN" vs
   * "Assessoria Sun" viravam dois grupos, um deles vazio.
   */
  grupo_id: string | null
  ordem: number
  arquivado_em: string | null
}

// ============================================================
// Recorrência — regra guardada na própria tarefa (jsonb)
// ============================================================

export type FreqRecorrencia = "diaria" | "semanal" | "mensal" | "anual"

export interface Recorrencia {
  freq: FreqRecorrencia
  /** Só na semanal: dias da semana (0=domingo … 6=sábado). */
  dias?: number[]
}

/** Valida o jsonb vindo do banco/formulário. Inválido → null (sem repetição). */
export function recorrenciaValida(v: unknown): Recorrencia | null {
  if (!v || typeof v !== "object") return null
  const o = v as { freq?: unknown; dias?: unknown }
  if (
    o.freq !== "diaria" && o.freq !== "semanal" &&
    o.freq !== "mensal" && o.freq !== "anual"
  ) {
    return null
  }
  const rec: Recorrencia = { freq: o.freq }
  if (o.freq === "semanal" && Array.isArray(o.dias)) {
    const dias = [...new Set(o.dias.filter(
      (d): d is number => Number.isInteger(d) && d >= 0 && d <= 6
    ))].sort()
    if (dias.length > 0) rec.dias = dias
  }
  return rec
}

export function rotuloRecorrencia(r: Recorrencia): string {
  switch (r.freq) {
    case "diaria": return "Diariamente"
    case "semanal": {
      if (!r.dias || r.dias.length === 0) return "Semanalmente"
      const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
      return `Semanal: ${r.dias.map((d) => nomes[d]).join(", ")}`
    }
    case "mensal": return "Mensalmente"
    case "anual": return "Anualmente"
  }
}

// ============================================================
// Abas customizadas e notas
// ============================================================

export type TipoAba = "calendario" | "nota" | "misto"

export interface Aba {
  id: string
  nome: string
  tipo: TipoAba
  contexto_id: string | null
  ordem: number
}

/** Escopo de uma coleção de notas — exatamente um dos três. */
export type EscopoNotas =
  | { contextoId: string }
  | { abaId: string }
  | { fixa: "arquivos" }

export interface Nota {
  id: string
  titulo: string
  corpo_html: string
  updated_at: string
}

export interface PreferenciaUsuario {
  usuario_id: string
  foto_url: string | null
  modo_cor: "colorido" | "mono"
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
  recorrencia: Recorrencia | null
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
  /** Foto de perfil do responsável (ws_preferencias), se houver. */
  responsavel_foto: string | null
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
  /** Foto de perfil do autor (ws_preferencias), se houver. */
  autor_foto: string | null
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
