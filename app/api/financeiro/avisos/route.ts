import { NextResponse } from "next/server"
import { headers } from "next/headers"
import * as Sentry from "@sentry/nextjs"
import { getSupabaseAdmin } from "@/lib/supabase"
import { bearerValido } from "@/lib/cron-auth"
import { criarNotificacao } from "@/lib/notificacoes"
import { getPreferenciasNotificacao } from "@/lib/preferencias-notificacao"
import { formatBRL } from "@/lib/data"
import { valorNumerico, vencimentoEfetivo } from "@/lib/financeiro-regras"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Avisos de vencimento — cron diário às 7h de São Paulo.
 *
 * Horário: o agendamento em vercel.json é "0 10 * * *" (10:00 UTC). Como BRT
 * é UTC-3, 10:00 UTC = 07:00 em São Paulo. (vercel.json é JSON estrito e não
 * aceita comentário, por isso a conta fica documentada aqui.)
 *
 * Dois avisos com naturezas diferentes:
 *
 *   • "A pagar hoje: <descrição>" — UMA vez, na manhã do vencimento.
 *     Repetir seria ruído; a pessoa já sabe.
 *
 *   • "Atrasada há N dias: <descrição>" — TODO dia, enquanto continuar
 *     vencida e não paga. Aqui a repetição é o ponto: uma conta atrasada que
 *     avisasse só uma vez seria uma conta esquecida. Para de chegar no
 *     instante em que alguém marca como paga.
 *
 * `aviso_enviado_dia` impede o aviso de "vence hoje" de sair duas vezes se o
 * cron rodar de novo. Como ele guarda o DIA, o aviso de atraso volta a passar
 * no dia seguinte naturalmente.
 */

/** Hoje em São Paulo. Usar o fuso do runtime jogaria o corte de meia-noite
 *  três horas para trás e avisaria contas do dia seguinte. */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(Number(de.slice(0, 4)), Number(de.slice(5, 7)) - 1, Number(de.slice(8, 10)))
  const b = Date.UTC(Number(ate.slice(0, 4)), Number(ate.slice(5, 7)) - 1, Number(ate.slice(8, 10)))
  return Math.round((b - a) / 86400000)
}

interface LinhaAviso {
  id: string
  descricao: string
  tipo: "receita" | "despesa"
  valor: number | string
  status: "previsto" | "realizado" | "cancelado"
  data: string
  data_vencimento: string | null
  aviso_enviado_dia: string | null
}

async function executar(): Promise<{
  ok: boolean
  hoje: string
  vencemHoje: number
  atrasadas: number
  erro?: string
}> {
  const hoje = hojeEmSaoPaulo()
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { ok: false, hoje, vencemHoje: 0, atrasadas: 0, erro: "supabase_indisponivel" }
  }

  // Em aberto com vencimento efetivo <= hoje. O segundo ramo cobre o caso de
  // não haver vencimento informado, em que a competência faz as vezes dele.
  const { data, error } = await supabase
    .from("lancamento_financeiro")
    .select("id, descricao, tipo, valor, status, data, data_vencimento, aviso_enviado_dia")
    .is("deletado_em", null)
    .eq("status", "previsto")
    .or(`data_vencimento.lte.${hoje},and(data_vencimento.is.null,data.lte.${hoje})`)

  if (error) {
    console.error("[financeiro/avisos] consulta", error.message)
    Sentry.captureException(error)
    return { ok: false, hoje, vencemHoje: 0, atrasadas: 0, erro: error.message }
  }

  const linhas = (data ?? []) as LinhaAviso[]
  if (linhas.length === 0) return { ok: true, hoje, vencemHoje: 0, atrasadas: 0 }

  // Destinatários: quem pode ver o financeiro. Notificar quem não tem acesso
  // ao módulo seria vazar valor de conta para quem não deveria ver.
  const { data: usuarios, error: errUsuarios } = await supabase
    .from("usuarios")
    .select("id, papel, permissoes")
    .eq("ativo", true)

  if (errUsuarios) {
    Sentry.captureException(errUsuarios)
    return { ok: false, hoje, vencemHoje: 0, atrasadas: 0, erro: errUsuarios.message }
  }

  const destinatarios = ((usuarios ?? []) as {
    id: string
    papel: string
    permissoes: Record<string, boolean> | null
  }[])
    .filter((u) => u.papel === "admin" || u.permissoes?.dashboard_financeiro === true)
    .map((u) => u.id)

  if (destinatarios.length === 0) return { ok: true, hoje, vencemHoje: 0, atrasadas: 0 }

  // Quem desligou um dos tipos não entra no fan-out daquele tipo.
  const preferencias = await Promise.all(
    destinatarios.map(async (id) => ({ id, pref: await getPreferenciasNotificacao(id) }))
  )
  const querVenceHoje = preferencias.filter((p) => p.pref.conta_vence_hoje).map((p) => p.id)
  const querAtrasada = preferencias.filter((p) => p.pref.conta_atrasada).map((p) => p.id)

  let vencemHoje = 0
  let atrasadas = 0

  for (const l of linhas) {
    const vencimento = vencimentoEfetivo(l)
    const atraso = diasEntre(vencimento, hoje)
    const ehReceita = l.tipo === "receita"
    const valor = formatBRL(valorNumerico(l.valor))
    const vencimentoBR = vencimento.split("-").reverse().join("/")

    // Deep link para o lançamento, no dia do vencimento e no eixo de
    // vencimento — que é exatamente a pergunta que o aviso levanta.
    const link =
      `/dashboard/financeiro/lancamentos?modo=dia&de=${vencimento}` +
      `&eixo=vencimento&lanc=${l.id}`

    if (atraso > 0) {
      // Atraso repete todo dia: não consulta aviso_enviado_dia de propósito.
      if (querAtrasada.length > 0) {
        await criarNotificacao({
          tipo: "conta_atrasada",
          titulo: `Atrasada há ${atraso} ${atraso === 1 ? "dia" : "dias"}: ${l.descricao}`,
          mensagem: `${ehReceita ? "A receber" : "A pagar"} · ${valor} · venceu em ${vencimentoBR}`,
          payload: { link, lancamento_id: l.id, prioridade: "critica" },
          usuarioIds: querAtrasada,
        })
        atrasadas += 1
      }
      continue
    }

    // Vence hoje: uma vez só.
    if (l.aviso_enviado_dia === hoje) continue

    if (querVenceHoje.length > 0) {
      await criarNotificacao({
        tipo: "conta_vence_hoje",
        titulo: `${ehReceita ? "A receber" : "A pagar"} hoje: ${l.descricao}`,
        mensagem: `${valor} · vence hoje`,
        payload: { link, lancamento_id: l.id, prioridade: "alta" },
        usuarioIds: querVenceHoje,
      })
      vencemHoje += 1
    }

    const { error: errCarimbo } = await supabase
      .from("lancamento_financeiro")
      .update({ aviso_enviado_dia: hoje })
      .eq("id", l.id)
    if (errCarimbo) {
      // Falhar o carimbo repete o aviso amanhã, não hoje — incômodo, não
      // perda. Registra e segue com os outros lançamentos.
      console.error("[financeiro/avisos] carimbo", errCarimbo.message)
      Sentry.captureException(errCarimbo)
    }
  }

  return { ok: true, hoje, vencemHoje, atrasadas }
}

async function autorizado(): Promise<boolean> {
  return bearerValido(headers().get("authorization"), process.env.CRON_SECRET)
}

// O Vercel Cron dispara via GET; POST fica para o teste manual.
export async function GET() {
  if (!(await autorizado())) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 })
  }
  const r = await executar()
  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}

export async function POST() {
  return GET()
}
