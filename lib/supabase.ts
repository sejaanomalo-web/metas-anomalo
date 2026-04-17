import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface DadosReais {
  id?: string
  empresa: string
  mes: string
  ano: number
  investimento_real: number | null
  leads_real: number | null
  reunioes_real: number | null
  contratos_real: number | null
  faturamento_real: number | null
  criativos_entregues: number | null
  cpl_real: number | null
  observacoes: string | null
  updated_at?: string
}

export interface Comissionamento {
  id?: string
  colaborador: "felipe" | "vinicius" | "emanuel"
  mes: string
  ano: number
  entregas_validas: number | null
  entregas_descontadas: number | null
  bonus_calculado: number
  gatilhos_atingidos: Record<string, boolean> | null
  observacoes: string | null
  updated_at?: string
}

let cliente: SupabaseClient | null = null

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

export function supabaseConfigurado(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
