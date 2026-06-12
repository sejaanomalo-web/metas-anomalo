import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getUsuarioAtual, temPermissao } from "@/lib/auth"
import { bearerValido } from "@/lib/cron-auth"
import { materializarRecorrentesDoMes } from "@/lib/financeiro-actions"
import { mesValido, anoValido, mesAtual, anoAtual } from "@/lib/data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/financeiro/materializar?mes=X&ano=Y
 *
 * Dois modos de invocação:
 *   1. Vercel Cron (header `Authorization: Bearer ${CRON_SECRET}`) —
 *      materializa o mês corrente automaticamente todo dia 1.
 *   2. Admin manual (sessão autenticada com permissão dashboard_financeiro) —
 *      botão "Gerar lançamentos" em /dashboard/financeiro/recorrentes.
 *
 * Idempotência garantida na função materializarRecorrentesDoMes (checa
 * existência por recorrente_id + mês antes de inserir).
 */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const mesParam = url.searchParams.get("mes")
  const anoParam = url.searchParams.get("ano")

  const mes = mesParam ? mesValido(mesParam) : mesAtual()
  const ano = anoParam ? anoValido(anoParam) : anoAtual()

  // Auth: cron secret OU sessão admin/permissão.
  const authHeader = headers().get("authorization")
  const isCronRequest = bearerValido(authHeader, process.env.CRON_SECRET)

  if (!isCronRequest) {
    const usuario = await getUsuarioAtual()
    if (!usuario) {
      return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 })
    }
    if (!temPermissao(usuario, "dashboard_financeiro")) {
      return NextResponse.json({ erro: "sem_permissao" }, { status: 403 })
    }
  }

  const resultado = await materializarRecorrentesDoMes(mes, ano)
  if (!resultado.ok) {
    return NextResponse.json(
      { erro: resultado.erro ?? "falha", criados: 0 },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    mes,
    ano,
    criados: resultado.criados,
    invocado_por: isCronRequest ? "cron" : "admin",
  })
}

// GET = listagem dos próximos a materializar (preview, sem efeito colateral).
// Útil pro botão admin saber quantos lançamentos serão criados antes de
// disparar. Retorna a mesma estrutura, mas o POST é o que aplica.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mesParam = url.searchParams.get("mes")
  const anoParam = url.searchParams.get("ano")
  const mes = mesParam ? mesValido(mesParam) : mesAtual()
  const ano = anoParam ? anoValido(anoParam) : anoAtual()

  const usuario = await getUsuarioAtual()
  if (!usuario) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 })
  if (!temPermissao(usuario, "dashboard_financeiro")) {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 })
  }

  return NextResponse.json({
    mes,
    ano,
    info: "Use POST para materializar. GET é apenas validação de acesso.",
  })
}
