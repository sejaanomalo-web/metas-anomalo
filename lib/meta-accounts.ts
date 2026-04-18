import type { EmpresaDb } from "./data"

// Mapeamento empresa_db → Meta Ads account ID (formato act_XXXXXXXX).
// Preencha manualmente conforme o setup do Business Manager.
// Ex.: a2_marketing: "act_1234567890"
export const META_ACCOUNTS: Partial<Record<EmpresaDb, string>> = {}

export function contaMetaDaEmpresa(empresa: EmpresaDb): string | null {
  return META_ACCOUNTS[empresa] ?? null
}

export function metaTokenDisponivel(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN)
}
