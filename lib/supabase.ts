import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export type OrigemDados = "pago" | "organico"

export interface CriativoDetalhe {
  nome: string
  publico: string
}

export interface PublicoProspectado {
  publico: string
  leads: number
}

export interface DadosReais {
  id?: string
  empresa: string
  mes: string
  ano: number
  origem?: OrigemDados
  investimento_real: number | null
  leads_real: number | null
  reunioes_agendadas_real?: number | null
  reunioes_real: number | null
  contratos_real: number | null
  faturamento_real: number | null
  criativos_entregues: number | null
  cpl_real: number | null
  cpa_real?: number | null
  criativos_usados?: number | null
  criativos_detalhe?: CriativoDetalhe[] | null
  respostas?: number | null
  publicos_prospectados?: PublicoProspectado[] | null
  observacoes: string | null
  clientes_ativos: number | null
  updated_at?: string
}

export interface DadosDiariosLog {
  id?: string
  empresa: string
  data: string
  origem: OrigemDados
  preenchedor_id: string | null
  preenchedor_nome: string | null
  investimento_real: number | null
  leads_real: number | null
  reunioes_agendadas_real: number | null
  reunioes_real: number | null
  contratos_real: number | null
  faturamento_real: number | null
  criativos_entregues: number | null
  clientes_ativos: number | null
  observacoes: string | null
  cpl_real: number | null
  cpa_real: number | null
  criativos_usados: number | null
  criativos_detalhe: CriativoDetalhe[] | null
  investimento_anterior: number | null
  leads_anterior: number | null
  reunioes_anterior: number | null
  contratos_anterior: number | null
  faturamento_anterior: number | null
  criativos_anterior: number | null
  cpl_anterior: number | null
  cpa_anterior: number | null
  criativos_usados_anterior: number | null
  criativos_detalhe_anterior: CriativoDetalhe[] | null
  respostas: number | null
  respostas_anterior: number | null
  publicos_prospectados: PublicoProspectado[] | null
  publicos_prospectados_anterior: PublicoProspectado[] | null
  created_at?: string
}

let cliente: SupabaseClient | null = null
let clienteAdmin: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (cliente) return cliente
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  cliente = createClient(url, key, {
    auth: { persistSession: false },
  })
  return cliente
}

/**
 * Client com service_role key — bypassa RLS. Use apenas em server-side
 * para ler tabelas sensíveis (usuarios.senha_hash, tokens_meta, etc.)
 * onde RLS não tem policy permissiva pro anon. Nunca expor no client.
 *
 * Requer env SUPABASE_SERVICE_ROLE_KEY (sem prefixo NEXT_PUBLIC).
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (clienteAdmin) return clienteAdmin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  clienteAdmin = createClient(url, key, {
    auth: { persistSession: false },
  })
  return clienteAdmin
}

export function supabaseConfigurado(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
