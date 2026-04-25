"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { criarSessao, destruirSessao, validarSenha } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase"

const LIMITE_TENTATIVAS = 5
const JANELA_MINUTOS = 5

function ipDoRequest(): string {
  const h = headers()
  // Vercel/Cloudflare colocam em x-forwarded-for; o primeiro é o real.
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return h.get("x-real-ip") ?? "desconhecido"
}

async function passouRateLimit(ip: string): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return true // sem Supabase, não dá pra contar — libera
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString()
  const { count, error } = await supabase
    .from("tentativas_login")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("sucesso", false)
    .gte("created_at", desde)
  if (error) {
    console.error("[login] rate-limit query error", error.message)
    return true // erro consultando, não bloqueia o usuário legítimo
  }
  return (count ?? 0) < LIMITE_TENTATIVAS
}

async function registrarTentativa(ip: string, sucesso: boolean) {
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase
    .from("tentativas_login")
    .insert({ ip, sucesso })
  if (error) {
    console.error("[login] registrar tentativa error", error.message)
  }
}

export async function entrarAction(formData: FormData) {
  const senha = String(formData.get("senha") ?? "")
  const ip = ipDoRequest()

  if (!(await passouRateLimit(ip))) {
    redirect("/login?erro=bloqueado")
  }

  if (!validarSenha(senha)) {
    await registrarTentativa(ip, false)
    redirect("/login?erro=1")
  }

  await registrarTentativa(ip, true)
  criarSessao()
  redirect("/dashboard")
}

export async function sairAction() {
  destruirSessao()
  redirect("/login")
}
