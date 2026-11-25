import { NextResponse } from "next/server"
import { agendaNativa, limitar, segredoValido } from "@/lib/reunioes-nativas"
import { dataBR } from "@/lib/reunioes-nucleo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const headers = { "cache-control": "no-store" }
const erro = (status: number, code: string, message: string) => NextResponse.json({ code, message }, { status, headers })

export async function GET(req: Request) {
  if (!segredoValido(req.headers.get("authorization"))) return erro(401, "UNAUTHORIZED", "Acesso não autorizado.")
  if (process.env.NODE_ENV === "production" && new URL(req.url).protocol !== "https:") return erro(403, "HTTPS_REQUIRED", "Conexão segura necessária.")
  const ip = req.headers.get("x-ativo-visitor-ip")?.slice(0, 64) || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rate = await limitar(ip)
  if (rate === null) return erro(503, "TEMPORARY_FAILURE", "Agenda temporariamente indisponível.")
  if (!rate) return erro(429, "RATE_LIMITED", "Tente novamente mais tarde.")
  const url = new URL(req.url)
  const from = url.searchParams.get("from") ?? dataBR(new Date().toISOString())
  const days = Number(url.searchParams.get("days") ?? 14)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(Date.parse(`${from}T00:00:00Z`)) ||
      new Date(`${from}T00:00:00Z`).toISOString().slice(0, 10) !== from ||
      !Number.isInteger(days) || days < 1 || days > 14) return erro(400, "INVALID_INPUT", "Período inválido.")
  let agenda: Awaited<ReturnType<typeof agendaNativa>>
  try { agenda = await agendaNativa(from, days) } catch { return erro(503, "TEMPORARY_FAILURE", "Agenda temporariamente indisponível.") }
  if (!agenda) return erro(503, "CONFIG_UNAVAILABLE", "Agenda temporariamente indisponível.")
  return NextResponse.json(agenda, { headers })
}
