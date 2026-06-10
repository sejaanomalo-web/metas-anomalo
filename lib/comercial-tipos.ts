// Tipos compartilhados do Comercial.
//
// IMPORTANTE: este arquivo NÃO tem "use server". As actions ficam em
// lib/relatorios-comerciais.ts (que é "use server" e só pode exportar
// async functions). As interfaces vivem aqui para poderem ser importadas
// por client e server components sem violar a regra do Next.

/** Origem do lead do relatorio comercial: 'pago' (rotulo "Anuncios") ou
 *  'organico' (prospeccao fria). Mesmos valores internos das demais tabelas. */
export type OrigemComercial = "pago" | "organico"

export interface RelatorioComercial {
  id: string
  empresa: string
  colaborador_id: string | null
  colaborador_nome: string
  data: string
  origem: OrigemComercial
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

/** Uma anotacao (observacao) do time durante o processo, pra exibir no Time.
 *  Captura o que foi escrito + a data + a empresa + quem escreveu + origem. */
export interface ObservacaoComercial {
  data: string
  empresa: string
  colaborador_nome: string
  origem: OrigemComercial
  texto: string
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
