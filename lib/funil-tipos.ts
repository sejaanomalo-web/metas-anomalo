// Tipos e limites dos funis comerciais. Sem "use server" e sem dependência de
// servidor, para poder ser importado por client e server components.

export interface EtapaFunil {
  id: string
  nome: string
}

export interface FunilComercial {
  id: string
  usuario_id: string
  nome: string
  descricao: string | null
  /** Ordem do array = ordem no funil. A última etapa é o fechamento. */
  etapas: EtapaFunil[]
  created_at: string
  updated_at: string
}

export interface LancamentoFunil {
  id: string
  funil_id: string
  /** YYYY-MM-DD */
  data: string
  investimento: number
  /** Mapa id da etapa → quantidade. */
  valores: Record<string, number>
  perdidos: number
  faturamento: number
  observacoes: string | null
  criado_por: string | null
  created_at: string
}

export interface ResultadoFunil {
  ok: boolean
  erro?: string
  /** Id do registro salvo. */
  id?: string
}

export const ETAPAS_PADRAO: readonly string[] = [
  "Leads gerados",
  "Responderam",
  "Reuniões agendadas",
  "Reuniões realizadas",
  "Propostas enviadas",
  "Contratos fechados",
]

export const MIN_ETAPAS = 2
export const MAX_ETAPAS = 12
export const MAX_NOME_FUNIL = 80
export const MAX_NOME_ETAPA = 60
export const MAX_VALOR_ETAPA = 9_999_999
export const MAX_OBSERVACOES = 2000
