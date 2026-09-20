import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getUsuarioAtual, temPermissao } from "@/lib/auth"
import { bearerValido } from "@/lib/cron-auth"
import { materializarRecorrentesDoPeriodo } from "@/lib/financeiro-actions"
import { anoValido } from "@/lib/data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/financeiro/materializar?mes=1..12&ano=YYYY
 *
 * Dois modos de invocação:
 *   1. Vercel Cron (header `Authorization: Bearer ${CRON_SECRET}`) —
 *      materializa o mês corrente automaticamente todo dia 1.
 *   2. Admin manual (sessão autenticada com permissão dashboard_financeiro) —
 *      botão "Gerar lançamentos" em /dashboard/financeiro/recorrentes.
 *
 * `mes` é o mês do CALENDÁRIO (1–12). Antes o parâmetro era o nome do mês e
 * passava por `mesAtual()`, que cobre só Abril–Dezembro e devolve "Abril"
 * para janeiro, fevereiro e março: o cron do dia 1º de janeiro gerava os
 * recorrentes de ABRIL. Aqui o mês vem direto da data em São Paulo.
 *
 * Idempotência garantida em materializarRecorrentesDoPeriodo (consulta os já
 * gerados) e pelo índice único parcial no banco.
 */

/** Mês (1–12) e ano correntes em São Paulo, sem depender do fuso do runtime. */
function hojeEmSaoPaulo(): { ano: number; mes: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  return { ano: Number(partes.slice(0, 4)), mes: Number(partes.slice(5, 7)) }
}

/** Mês do parâmetro, se for 1–12. Senão, o mês corrente. */
function mesNumParam(v: string | null, padrao: number): number {
  if (!v) return padrao
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : padrao
}
export async function POST(req: Request) {
  const url = new URL(req.url)
  const mesParam = url.searchParams.get("mes")
  const anoParam = url.searchParams.get("ano")

  const hoje = hojeEmSaoPaulo()
  const mes = mesNumParam(mesParam, hoje.mes)
  const ano = anoParam ? anoValido(anoParam) : hoje.ano

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

  const resultado = await materializarRecorrentesDoPeriodo(ano, mes)
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
  const hoje = hojeEmSaoPaulo()
  const mes = mesNumParam(mesParam, hoje.mes)
  const ano = anoParam ? anoValido(anoParam) : hoje.ano

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
