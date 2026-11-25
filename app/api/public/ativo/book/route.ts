import { NextResponse } from "next/server"
import { limitar, reservarNativo, segredoValido, lerJsonNativo, validarAtribuicao, validarNome, validarWhatsapp } from "@/lib/reunioes-nativas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const headers = { "cache-control": "no-store" }
const erro = (status: number, code: string, message: string) => NextResponse.json({ code, message }, { status, headers })

export async function POST(req: Request) {
  if (!segredoValido(req.headers.get("authorization"))) return erro(401, "UNAUTHORIZED", "Acesso não autorizado.")
  if (process.env.NODE_ENV === "production" && new URL(req.url).protocol !== "https:") return erro(403, "HTTPS_REQUIRED", "Conexão segura necessária.")
  if (Number(req.headers.get("content-length") ?? 0) > 4096) return erro(413, "INVALID_INPUT", "Dados inválidos.")
  const ip = req.headers.get("x-ativo-visitor-ip")?.slice(0, 64) || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rate = await limitar(ip)
  if (rate === null) return erro(503, "TEMPORARY_FAILURE", "Serviço temporariamente indisponível.")
  if (!rate) return erro(429, "RATE_LIMITED", "Tente novamente mais tarde.")
  let body: Record<string, unknown>
  try {
    body = await lerJsonNativo(req)
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid")
  } catch { return erro(400, "INVALID_INPUT", "Dados inválidos.") }
  if (Object.keys(body).some(k => !["name", "whatsapp", "start", "idempotencyKey", "attribution"].includes(k))) return erro(400, "INVALID_INPUT", "Dados inválidos.")
  const name = validarNome(body.name)
  const whatsapp = validarWhatsapp(body.whatsapp)
  const attribution = validarAtribuicao(body.attribution)
  if (!name || !whatsapp || !attribution || typeof body.start !== "string" || typeof body.idempotencyKey !== "string") return erro(400, "INVALID_INPUT", "Confira nome, WhatsApp e horário.")
  const phoneRate = await limitar(`phone:${whatsapp}`, 5)
  if (phoneRate === null) return erro(503, "TEMPORARY_FAILURE", "Serviço temporariamente indisponível.")
  if (!phoneRate) return erro(429, "RATE_LIMITED", "Tente novamente mais tarde.")
  let result: Awaited<ReturnType<typeof reservarNativo>>
  try { result = await reservarNativo({ name, whatsapp, start: body.start, idempotencyKey: body.idempotencyKey, attribution }) }
  catch { return erro(503, "TEMPORARY_FAILURE", "Serviço temporariamente indisponível.") }
  if (!result || typeof result !== "object") return erro(503, "TEMPORARY_FAILURE", "Serviço temporariamente indisponível.")
  if (result.code === "SLOT_UNAVAILABLE") return erro(409, "SLOT_UNAVAILABLE", "Esse horário não está mais disponível.")
  if (result.code === "IDEMPOTENCY_MISMATCH") return erro(409, "IDEMPOTENCY_MISMATCH", "Essa tentativa já foi usada com outros dados.")
  if (result.code === "INVALID_INPUT") return erro(400, "INVALID_INPUT", "Dados inválidos.")
  if (result.code === "CONFIG_UNAVAILABLE") return erro(503, "CONFIG_UNAVAILABLE", "Agenda temporariamente indisponível.")
  if (result.code || !result.bookingId) return erro(503, "TEMPORARY_FAILURE", "Serviço temporariamente indisponível.")
  return NextResponse.json(result, { status: 201, headers })
}
