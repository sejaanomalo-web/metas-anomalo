// Tipos compartilhados do Comercial.
//
// IMPORTANTE: este arquivo NÃO tem "use server". As actions ficam em
// lib/relatorios-comerciais.ts (que é "use server" e só pode exportar
// async functions). As interfaces vivem aqui para poderem ser importadas
// por client e server components sem violar a regra do Next.

export interface RelatorioComercial {
  id: string
  empresa: string
  colaborador_id: string | null
  colaborador_nome: string
  data: string
  ligacoes: number
  mensagens: number
  retorno_mensagens: number
  qualificados: number
  conexoes_novas: number
  reunioes_agendadas: number
  reunioes_realizadas: number
  no_shows: number
  propostas_enviadas: number
  contratos_fechados: number
  faturamento_gerado: number
  observacoes: string | null
}

export interface ResumoComercial {
  ligacoes: number
  mensagens: number
  retorno_mensagens: number
  qualificados: number
  reunioes_agendadas: number
  reunioes_realizadas: number
  no_shows: number
  propostas_enviadas: number
  contratos_fechados: number
  faturamento_gerado: number
  registros: number
}

/** Resumo comercial agregado de UM cliente (empresa) no período. */
export interface ResumoComercialCliente {
  empresa: string
  resumo: ResumoComercial
}

export interface ResultadoComercial {
  ok: boolean
  erro?: string
}
