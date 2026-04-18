"use server"

import { revalidatePath } from "next/cache"
import {
  type ConfigResumos,
  getConfigResumos,
  salvarConfigResumos,
} from "./configuracoes"

export interface ResultadoConfig {
  ok: boolean
  erro?: string
}

export async function salvarConfigAction(
  formData: FormData
): Promise<ResultadoConfig> {
  const diario = formData.get("diario_ativo") === "on"
  const semanal = formData.get("semanal_ativo") === "on"
  const mensal = formData.get("mensal_ativo") === "on"
  const numerosStr = String(formData.get("numeros") ?? "")
  const numeros = numerosStr
    .split(/[\s,;]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0)

  const config: ConfigResumos = {
    diario_ativo: diario,
    semanal_ativo: semanal,
    mensal_ativo: mensal,
    numeros,
  }

  const r = await salvarConfigResumos(config)
  if (!r.ok) return { ok: false, erro: r.erro }
  revalidatePath("/dashboard/configuracoes")
  return { ok: true }
}

export async function testarResumoAction(tipo: string): Promise<ResultadoConfig> {
  if (tipo !== "diario" && tipo !== "semanal" && tipo !== "mensal") {
    return { ok: false, erro: "Tipo inválido" }
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${process.env.VERCEL_URL ?? "localhost:3000"}`
  const secret = process.env.CRON_SECRET

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (secret) headers.authorization = `Bearer ${secret}`

  try {
    const res = await fetch(
      `${origin}/api/cron/resumo-${tipo}${tipo === "mensal" ? "?force=1" : ""}`,
      { method: "POST", headers, cache: "no-store" }
    )
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; erro?: string }
      | null
    if (!res.ok || !body?.ok) {
      return { ok: false, erro: body?.erro ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao chamar endpoint"
    return { ok: false, erro: msg }
  }
}

export async function getConfigAction(): Promise<ConfigResumos> {
  return getConfigResumos()
}
