import { getSupabase } from "./supabase"

export interface ConfigResumos {
  diario_ativo: boolean
  semanal_ativo: boolean
  mensal_ativo: boolean
  numeros: string[]
}

const PADRAO: ConfigResumos = {
  diario_ativo: true,
  semanal_ativo: true,
  mensal_ativo: true,
  numeros: [],
}

export async function getConfigResumos(): Promise<ConfigResumos> {
  const supabase = getSupabase()
  if (!supabase) return PADRAO
  const { data, error } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "resumos")
    .maybeSingle()
  if (error || !data) return PADRAO
  const v = data.valor as Partial<ConfigResumos>
  return {
    diario_ativo: v.diario_ativo ?? PADRAO.diario_ativo,
    semanal_ativo: v.semanal_ativo ?? PADRAO.semanal_ativo,
    mensal_ativo: v.mensal_ativo ?? PADRAO.mensal_ativo,
    numeros: Array.isArray(v.numeros) ? v.numeros : PADRAO.numeros,
  }
}

export async function salvarConfigResumos(
  config: ConfigResumos
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível" }
  const { error } = await supabase.from("configuracoes").upsert(
    {
      chave: "resumos",
      valor: config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chave" }
  )
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

export function destinatariosResumo(config: ConfigResumos): string[] {
  const principal = process.env.WHATSAPP_NUMBER
  const lista = [...config.numeros]
  if (principal && !lista.includes(principal)) lista.unshift(principal)
  return lista
}
