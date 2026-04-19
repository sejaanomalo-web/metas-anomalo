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
  clientes_ativos: number | null
  updated_at?: string
}

export interface Comissionamento {
  id?: string
  // Fixos historicamente: felipe/vinicius/emanuel. Agora aceita qualquer
  // nome vindo da tabela colaboradores (lowercased).
  colaborador: string
  mes: string
  ano: number
  entregas_validas: number | null
  bonus_calculado: number
  detalhes: Record<string, boolean> | null
  updated_at?: string
}

export interface Faixa {
  minimo: number
  bonus: number
}

export interface GatilhoConfig {
  chave: string
  rotulo: string
  valor: number
  alvoRoas?: number
}

export type ModeloPersonalizado = "escala" | "gatilhos" | "fixo"

export interface ConfiguracaoPersonalizada {
  tipo: "personalizado"
  tipo_personalizado: true
  nome_tipo: string
  descricao: string
  modelo: ModeloPersonalizado
  escala?: Faixa[]
  gatilhos?: GatilhoConfig[]
  valor_fixo?: number
}

export type ConfiguracaoComissao =
  | { tipo: "gatilhos"; gatilhos: GatilhoConfig[] }
  | { tipo: "escala"; faixas: Faixa[] }
  | ConfiguracaoPersonalizada

export interface MetaComissionamento {
  id?: string
  colaborador: string
  mes: string
  ano: number
  configuracao: ConfiguracaoComissao
  updated_at?: string
}

export interface Colaborador {
  id?: string
  nome: string
  funcao: string
  tipo: "gatilhos" | "escala" | "personalizado"
  configuracao_padrao: ConfiguracaoComissao
  ativo: boolean
  data_entrada?: string | null
  observacoes?: string | null
  descricao?: string | null
  is_fixed?: boolean
  created_at?: string
}

export interface FuncaoTime {
  id?: string
  nome: string
  criada_em?: string
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
