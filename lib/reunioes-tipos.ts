// =============================================================================
// Reuniões — tipos de TELA. Seguro para o browser (sem Supabase, sem crypto).
// =============================================================================

import type { BloqueioDisp, ExcecaoDisp, Janela, PeriodoDisp, StatusReuniao } from "./reunioes-nucleo"

export type { BloqueioDisp, ExcecaoDisp, Janela, PeriodoDisp, StatusReuniao }

/** Estado da conexão como a tela mostra (o pedido lista exatamente estes). */
export type EstadoConexao =
  | "nao_configurado"
  | "pendente"
  | "conectado"
  | "sincronizando"
  | "erro"
  | "desconectado"

export const ROTULO_CONEXAO: Record<EstadoConexao, string> = {
  nao_configurado: "Não configurado",
  pendente: "Configuração pendente",
  conectado: "Conectado",
  sincronizando: "Sincronizando",
  erro: "Conexão com erro",
  desconectado: "Desconectado",
}

export const COR_CONEXAO: Record<EstadoConexao, string> = {
  nao_configurado: "#8a93a3",
  pendente: "#C9953A",
  conectado: "#5da283",
  sincronizando: "#4573d2",
  erro: "#e24b4a",
  desconectado: "#8a93a3",
}

/**
 * Quem administra a aba Reuniões (integração, tipos, disponibilidade).
 *
 * Mesmo critério de requererAdmin: papel EFETIVO === 'admin'. Um admin que
 * escolheu uma visão simplificada em Configurações → "Meu nível de acesso"
 * fica com papel efetivo != admin de propósito (os gates de admin se fecham
 * em todo o app). Aqui NÃO furamos isso — só devolvemos o motivo, pra tela
 * dizer "você está numa visão simplificada" em vez de "só administradores",
 * que soa como se a pessoa não fosse admin.
 */
export type MotivoAcessoReunioes = "admin" | "visao_simplificada" | "sem_papel_admin"

export const ROTULO_VISAO: Record<string, string> = {
  gestor_trafego: "Gestor de tráfego",
  comercial: "Comercial",
  custom: "Escolher as interfaces",
}

export function acessoReunioes(u: { papel: string; papelReal: string; visao: string | null }): {
  podeAdministrar: boolean
  motivo: MotivoAcessoReunioes
} {
  if (u.papel === "admin") return { podeAdministrar: true, motivo: "admin" }
  if (u.papelReal === "admin" && u.visao) return { podeAdministrar: false, motivo: "visao_simplificada" }
  return { podeAdministrar: false, motivo: "sem_papel_admin" }
}

export interface IntegracaoTela {
  estado: EstadoConexao
  sincronizacaoAtiva: boolean
  contaUsername: string | null
  contaNome: string | null
  contaEmail: string | null
  webhookRegistrado: boolean
  feedIcsConectado: boolean
  ultimoTesteEm: string | null
  ultimoTesteOk: boolean | null
  ultimaSincronizacaoEm: string | null
  ultimoErro: string | null
  /** Quais variáveis de ambiente existem (nunca o valor). */
  env: { apiKey: boolean; webhookSecret: boolean; icsToken: boolean }
}

export interface TipoTela {
  id: string
  nome: string
  descricao: string | null
  duracao_min: number
  origem_comercial: string
  campanha_rotulo: string | null
  responsavel_id: string | null
  disponibilidade_id: string | null
  contexto_id: string | null
  calcom_event_type_id: number | null
  calcom_slug: string | null
  link_publico: string | null
  local: "cal_video" | "google_meet" | "definido_no_calcom"
  antecedencia_min_horas: number
  intervalo_min: number
  limite_diario: number | null
  horizonte_dias: number
  ativo: boolean
  ultima_sincronizacao_em: string | null
  ultimo_erro: string | null
}

export interface DisponibilidadeTela {
  id: string
  nome: string
  fuso: string
  responsavel_id: string | null
  janelas: Janela[]
  periodos: PeriodoDisp[]
  excecoes: ExcecaoDisp[]
  bloqueios: BloqueioDisp[]
  calcom_schedule_id: number | null
  publicado_em: string | null
  publicacao_erro: string | null
  updated_at: string
}

export interface AgendamentoTela {
  id: string
  booking_uid: string
  status: StatusReuniao
  inicio: string | null
  fim: string | null
  participante_nome: string | null
  participante_email: string | null
  participante_telefone: string | null
  tipo_nome: string | null
  origem_comercial: string | null
  responsavel_nome: string | null
  link_reuniao: string | null
  local_rotulo: string | null
  tarefa_id: string | null
  sync_status: "ok" | "pendente" | "erro"
  sync_erro: string | null
}

export interface EventoWebhookTela {
  id: string
  recebido_em: string
  gatilho: string | null
  status: "recebido" | "processado" | "ignorado" | "erro"
  resultado: string | null
  erro: string | null
  tentativas: number
}

export interface LogTela {
  id: number
  nivel: "info" | "aviso" | "erro"
  acao: string
  mensagem: string
  created_at: string
}

export interface EventTypeExterno {
  id: number
  title: string
  slug: string
  lengthInMinutes: number
  bookingUrl: string | null
}

export interface PainelReunioes {
  /** false = a migration 20261021_reunioes_calcom.sql ainda não foi aplicada. */
  migracaoAplicada: boolean
  integracao: IntegracaoTela
  tipos: TipoTela[]
  disponibilidades: DisponibilidadeTela[]
  proximas: AgendamentoTela[]
  encerradas: AgendamentoTela[]
  pendencias: AgendamentoTela[]
  eventosComErro: number
  eventos: EventoWebhookTela[]
  log: LogTela[]
  usuarios: { id: string; nome: string }[]
  contextos: { id: string; nome: string }[]
  /** Event types da conta (só quando a API está configurada e respondeu). */
  eventTypesExternos: EventTypeExterno[] | null
  eventTypesErro: string | null
}
