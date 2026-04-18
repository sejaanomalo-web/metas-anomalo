import { NextResponse } from "next/server"
import { getConfigResumos, destinatariosResumo } from "@/lib/configuracoes"
import { montarResumoMensal, ehUltimoDiaMes } from "@/lib/resumos"
import { enviarWhatsApp, verificarCronSecret } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  if (!verificarCronSecret(req)) {
    return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const forcar = url.searchParams.get("force") === "1"
  if (!forcar && !ehUltimoDiaMes()) {
    return NextResponse.json({
      ok: true,
      enviado: false,
      motivo: "nao_e_ultimo_dia",
    })
  }

  const config = await getConfigResumos()
  if (!config.mensal_ativo) {
    return NextResponse.json({ ok: true, enviado: false, motivo: "desativado" })
  }

  const mensagem = await montarResumoMensal()
  const destinatarios = destinatariosResumo(config)
  const resultado = await enviarWhatsApp(mensagem, destinatarios)

  return NextResponse.json({
    ok: resultado.ok,
    enviados: resultado.enviados ?? 0,
    erro: resultado.erro,
    preview: mensagem.slice(0, 120),
  })
}

export async function POST(req: Request) {
  return GET(req)
}
