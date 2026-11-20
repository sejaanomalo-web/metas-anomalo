import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase"
import { montarIcs, type ItemIcs } from "@/lib/reunioes-nucleo"
import { chaveContaValida, lerIntegracao } from "@/lib/reunioes-sync"
import { hojeISO, somarDiasISO } from "@/lib/workspace-datas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Feed ICS dos compromissos do Workspace que BLOQUEIAM a agenda pública.
 *
 * É o caminho oficial (sem Google Calendar) para o Cal.com enxergar um
 * horário ocupado criado no Workspace: o Cal.com assina este feed como
 * calendário (POST /v2/calendars/ics-feed/save, botão "Conectar feed" na aba
 * Reuniões) e passa a tratar cada evento daqui como conflito.
 *
 * Entra no feed SÓ tarefa marcada "Bloqueia agenda de reuniões" (tabela
 * ws_tarefa_bloqueios), com data E horário, não arquivada/excluída/concluída.
 * Tarefas que SÃO reuniões do Cal.com nunca entram — ele já ocupa o horário,
 * e repetir aqui criaria um loop de bloqueio sobre a própria reunião.
 *
 * VÁRIAS CONTAS: cada conta do Cal.com cadastra o feed com `?conta=<chave>`
 * (sem parâmetro = principal). Com "bloquear_outras_contas" ligado, o feed
 * daquela conta inclui também as reuniões ATIVAS das outras contas — é o que
 * impede marcar Marketing (Anômalo Hub) e Sistema (Ativo) no mesmo horário,
 * já que o Cal.com não enxerga uma conta a partir da outra. As reuniões da
 * PRÓPRIA conta nunca entram (ele já ocupa o horário; repetir criaria loop).
 *
 * Autenticação: token secreto no PATH (REUNIOES_ICS_TOKEN), comparado em
 * tempo constante. O conteúdo é mínimo de propósito: "Ocupado" + horário.
 */
function tokenValido(recebido: string): boolean {
  const esperado = process.env.REUNIOES_ICS_TOKEN
  if (!esperado || esperado.length < 24) return false
  const limpo = recebido.replace(/\.ics$/i, "")
  const a = Buffer.from(limpo)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface Linha {
  duracao_min: number
  ws_tarefas: {
    id: string
    prazo_em: string | null
    prazo_hora: string | null
    excluida_em: string | null
    arquivada_em: string | null
    concluida_em: string | null
    source_gid: string | null
  } | null
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (!tokenValido(params.token)) {
    return new NextResponse("not found", { status: 404 })
  }
  const db = getSupabaseAdmin()
  if (!db) return new NextResponse("indisponivel", { status: 503 })

  const desde = somarDiasISO(hojeISO(), -1)
  const { data, error } = await db
    .from("ws_tarefa_bloqueios")
    .select("duracao_min, ws_tarefas!inner(id, prazo_em, prazo_hora, excluida_em, arquivada_em, concluida_em, source_gid)")
    .gte("ws_tarefas.prazo_em", desde)
    .not("ws_tarefas.prazo_hora", "is", null)
    .limit(1000)
  if (error) {
    console.error("[reunioes/ics] erro", error.message)
    return new NextResponse("erro", { status: 500 })
  }

  const bloqueios: ItemIcs[] = ((data ?? []) as unknown as Linha[])
    .map((l) => ({ l, t: l.ws_tarefas }))
    .filter(({ t }) =>
      t && t.prazo_em && t.prazo_hora &&
      !t.excluida_em && !t.arquivada_em && !t.concluida_em &&
      !(t.source_gid ?? "").startsWith("calcom:")
    )
    .map(({ l, t }) => ({ id: t!.id, data: t!.prazo_em!, hora: t!.prazo_hora!.slice(0, 5), duracao_min: l.duracao_min }))

  // Reuniões das OUTRAS contas do Cal.com (só com a migration de várias
  // contas aplicada e a opção ligada na conta que lê o feed).
  const conta = chaveContaValida(new URL(req.url).searchParams.get("conta"))
  const integ = await lerIntegracao(db, conta)
  if (integ?.multi && integ.bloquear_outras_contas) {
    const { data: outras, error: errOutras } = await db
      .from("reunioes_agendamentos")
      .select("id, inicio, fim, integracao_id")
      .in("status", ["solicitada", "confirmada"])
      .not("integracao_id", "is", null)
      .neq("integracao_id", integ.id)
      .gte("inicio", `${desde}T00:00:00Z`)
      .not("fim", "is", null)
      .limit(1000)
    if (errOutras) {
      // Sem as reuniões das outras contas o feed ainda vale pelos bloqueios
      // manuais: melhor servir parcial do que derrubar o calendário inteiro.
      console.error("[reunioes/ics] outras contas", errOutras.message)
    } else {
      for (const a of (outras ?? []) as { id: string; inicio: string | null; fim: string | null }[]) {
        if (a.inicio && a.fim) bloqueios.push({ id: a.id, inicioIso: a.inicio, fimIso: a.fim, prefixoUid: "reuniao" })
      }
    }
  }

  return new NextResponse(montarIcs(bloqueios), {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}
