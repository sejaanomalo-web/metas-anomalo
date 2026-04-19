"use server"

import { revalidatePath } from "next/cache"
import {
  type ConfigResumos,
  type Contato,
  getConfigResumos,
  salvarConfigResumos,
} from "./configuracoes"

export interface ResultadoConfig {
  ok: boolean
  erro?: string
}

function sanitizarNumero(raw: string): string {
  return raw.replace(/[^\d]/g, "")
}

export async function salvarConfigAction(
  formData: FormData
): Promise<ResultadoConfig> {
  const cru = formData.getAll("contato") as string[]
  const contatos: Contato[] = []
  for (let i = 0; i < cru.length; i++) {
    try {
      const parsed = JSON.parse(cru[i]) as Contato
      const nome = String(parsed.nome ?? "").trim()
      const numero = sanitizarNumero(String(parsed.numero ?? ""))
      if (numero.length === 0) continue
      contatos.push({ nome, numero })
    } catch {
      // ignora entradas inválidas
    }
  }

  const config: ConfigResumos = { contatos }
  const r = await salvarConfigResumos(config)
  if (!r.ok) return { ok: false, erro: r.erro }
  revalidatePath("/dashboard/configuracoes")
  return { ok: true }
}

export async function getConfigAction(): Promise<ConfigResumos> {
  return getConfigResumos()
}
