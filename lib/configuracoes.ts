import { getSupabase } from "./supabase"

export interface Contato {
  nome: string
  numero: string
}

export interface ConfigResumos {
  contatos: Contato[]
}

const PADRAO: ConfigResumos = { contatos: [] }

export async function getConfigResumos(): Promise<ConfigResumos> {
  const supabase = getSupabase()
  if (!supabase) return PADRAO
  const { data, error } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "resumos")
    .maybeSingle()
  if (error || !data) return PADRAO
  const v = data.valor as Partial<ConfigResumos> & {
    numeros?: string[]
  }

  // Compat com formato antigo (array de strings).
  if (!v.contatos && Array.isArray(v.numeros)) {
    return {
      contatos: v.numeros
        .filter((n) => typeof n === "string" && n.trim().length > 0)
        .map((numero) => ({ nome: "", numero: numero.trim() })),
    }
  }

  return {
    contatos: Array.isArray(v.contatos)
      ? v.contatos
          .filter(
            (c): c is Contato =>
              typeof c?.nome === "string" &&
              typeof c?.numero === "string" &&
              c.numero.trim().length > 0
          )
          .map((c) => ({ nome: c.nome.trim(), numero: c.numero.trim() }))
      : [],
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
