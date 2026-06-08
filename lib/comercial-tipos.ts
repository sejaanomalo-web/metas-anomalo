// Tipos e constantes compartilhados do Comercial.
//
// IMPORTANTE: este arquivo NÃO tem "use server". As actions ficam em
// lib/relatorios-comerciais.ts (que é "use server" e só pode exportar
// async functions). Constantes/objetos (ETAPAS_FUNIL, ROTULO_ETAPA) e
// interfaces vivem aqui para poderem ser importados por client components
// e server components sem violar a regra do Next.

export const ETAPAS_FUNIL = [
  "lead",
  "qualificado",
  "reuniao",
  "proposta",
  "fechado",
  "perdido",
] as const
export type EtapaFunil = (typeof ETAPAS_FUNIL)[number]

export const ROTULO_ETAPA: Record<EtapaFunil, string> = {
  lead: "Lead",
  qualificado: "Qualificado",
  reuniao: "Reunião",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
}

export interface RelatorioComercial {
  id: string
  colaborador_id: string | null
  colaborador_nome: string
  data: string
  ligacoes: number
  mensagens: number
  conexoes_novas: number
  reunioes_agendadas: number
  reunioes_realizadas: number
  no_shows: number
  propostas_enviadas: number
  contratos_fechados: number
  faturamento_gerado: number
  observacoes: string | null
}

export interface OportunidadePipeline {
  id: string
  nome: string
  empresa_config_slug: string | null
  cliente_trafego_id: string | null
  etapa: EtapaFunil
  responsavel_id: string | null
  responsavel_nome: string | null
  valor_estimado: number | null
  origem_contato: string | null
  ultima_atualizacao: string | null
  observacoes: string | null
  ativo: boolean
}

export interface ResumoComercial {
  ligacoes: number
  mensagens: number
  conexoes_novas: number
  reunioes_agendadas: number
  reunioes_realizadas: number
  no_shows: number
  propostas_enviadas: number
  contratos_fechados: number
  faturamento_gerado: number
  registros: number
}

export interface ResultadoComercial {
  ok: boolean
  erro?: string
}
