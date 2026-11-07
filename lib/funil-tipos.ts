// Tipos e limites dos funis comerciais. Sem "use server" e sem dependência de
// servidor, para poder ser importado por client e server components.

export interface EtapaFunil {
  id: string
  nome: string
}

/** De onde a demanda vem: tráfego, indicação, prospecção fria... */
export type FonteFunil = EtapaFunil

export interface FunilComercial {
  id: string
  usuario_id: string
  nome: string
  descricao: string | null
  /** Ordem do array = ordem no funil. A última etapa é o fechamento. */
  etapas: EtapaFunil[]
  /** Ausente antes da migration 20261108: valem as fontes padrão. */
  fontes?: FonteFunil[]
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
  /** Id da fonte de demanda. Ausente antes da migration 20261108. */
  fonte?: string
  perdidos: number
  /** Soma das 1ªs parcelas dos contratos (o que entra no 1º mês). */
  faturamento: number
  /** Contratos fechados no lançamento. Ausente antes da migration 20261109. */
  contratos?: ContratoFechado[] | null
  observacoes: string | null
  criado_por: string | null
  created_at: string
  /** null/ausente = lançado à mão. 'meta' = veio de arquivo do Gerenciador. */
  origem_importacao?: "meta" | null
  detalhe_importacao?: { arquivo?: string; campanhas?: string[] } | null
}

/**
 * Um contrato fechado. A 1ª parcela pode ser maior que as demais (outro produto
 * vendido junto); as demais se repetem até completar os meses do contrato.
 * Total = primeira + mensal × (meses − 1).
 */
export interface ContratoFechado {
  cliente?: string | null
  /** Valor da 1ª parcela. */
  primeira: number
  /** Valor de cada parcela depois da 1ª. */
  mensal: number
  /** Duração do contrato em meses, contando a 1ª parcela. */
  meses: number
}

export function totalDoContrato(c: ContratoFechado): number {
  return c.primeira + c.mensal * Math.max(0, c.meses - 1)
}

/**
 * Contratos do lançamento. Lançamento de antes da lista de contratos só tinha o
 * faturamento: vale como um contrato de 1 mês com esse valor.
 */
export function contratosDoLancamento(l: {
  contratos?: ContratoFechado[] | null
  faturamento?: number | null
}): ContratoFechado[] {
  if (Array.isArray(l.contratos) && l.contratos.length > 0) return l.contratos
  const fat = Number(l.faturamento)
  return Number.isFinite(fat) && fat > 0
    ? [{ primeira: fat, mensal: 0, meses: 1 }]
    : []
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

/** Id fixo: é onde entra a importação do Meta, então não pode ser removida. */
export const FONTE_TRAFEGO = "trafego"

export const FONTES_PADRAO: readonly FonteFunil[] = [
  { id: FONTE_TRAFEGO, nome: "Tráfego" },
  { id: "indicacao", nome: "Indicação" },
  { id: "prospeccao", nome: "Prospecção fria" },
]

export function fontesDoFunil(funil: { fontes?: FonteFunil[] | null }): FonteFunil[] {
  return funil.fontes && funil.fontes.length > 0
    ? funil.fontes
    : [...FONTES_PADRAO]
}

export function fonteDoLancamento(l: { fonte?: string | null }): string {
  return l.fonte || FONTE_TRAFEGO
}

export const MAX_FONTES = 8
export const MAX_NOME_FONTE = 40
export const MIN_ETAPAS = 2
export const MAX_ETAPAS = 12
export const MAX_NOME_FUNIL = 80
export const MAX_NOME_ETAPA = 60
export const MAX_VALOR_ETAPA = 9_999_999
export const MAX_OBSERVACOES = 2000
export const MAX_CONTRATOS = 50
export const MAX_MESES_CONTRATO = 60
export const MESES_CONTRATO_PADRAO = 3
export const MAX_NOME_CLIENTE = 60
