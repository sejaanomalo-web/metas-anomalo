import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { bearerValido } from "@/lib/cron-auth"
import { criarNotificacao } from "@/lib/notificacoes"
import { hojeISO, somarDiasISO } from "@/lib/workspace-datas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const ROTA = "/dashboard/workspace"

/**
 * Cron diário: avisa quem tem tarefa ATRASADA há 2+ dias.
 *
 * Por que 2 e não 1: passar do prazo em um dia é rotina — a tarefa fica pro
 * dia seguinte e ninguém quer um alerta por isso. A partir do segundo dia
 * vira esquecimento de verdade.
 *
 * IDEMPOTÊNCIA: cada tarefa alertada grava `alerta_atraso_em`, e a consulta
 * só pega quem tem esse campo nulo. Sem isso, a mesma tarefa geraria uma
 * notificação por dia até ser concluída — e o time desligaria o tipo inteiro.
 * Reabrir/replanejar não limpa o campo de propósito: um segundo alerta pela
 * mesma tarefa já foi visto uma vez.
 *
 * A notificação é PESSOAL (usuarioIds = responsável) e respeita a preferência
 * `ws_tarefa` de cada um, como todo o resto do módulo.
 */
async function executar() {
  const authHeader = headers().get("authorization")
  if (!bearerValido(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    return NextResponse.json({ erro: "service_role_ausente" }, { status: 500 })
  }

  // Prazo <= anteontem (BRT). Hoje-1 = ontem fica de fora (regra dos 2 dias).
  const limite = somarDiasISO(hojeISO(), -2)

  const { data: atrasadas, error } = await db
    .from("ws_tarefas")
    .select("id, titulo, prazo_em, responsavel_id")
    .is("tarefa_pai_id", null)
    .is("concluida_em", null)
    .is("excluida_em", null)
    .is("arquivada_em", null)
    .is("alerta_atraso_em", null)
    .not("responsavel_id", "is", null)
    .not("prazo_em", "is", null)
    .lte("prazo_em", limite)
    .limit(200)

  if (error) {
    console.error("[workspace/atrasadas] leitura", error.message)
    return NextResponse.json({ erro: "falha_leitura" }, { status: 500 })
  }

  const tarefas = (atrasadas ?? []) as {
    id: string
    titulo: string
    prazo_em: string
    responsavel_id: string
  }[]
  if (tarefas.length === 0) {
    return NextResponse.json({ ok: true, notificadas: 0 })
  }

  // Agrupa por pessoa: 5 tarefas atrasadas viram UM aviso, não cinco.
  const porResponsavel = new Map<string, typeof tarefas>()
  for (const t of tarefas) {
    const lista = porResponsavel.get(t.responsavel_id) ?? []
    lista.push(t)
    porResponsavel.set(t.responsavel_id, lista)
  }

  const hoje = hojeISO()
  let notificadas = 0

  for (const [usuarioId, lista] of porResponsavel) {
    const n = lista.length
    const primeira = lista[0]
    const dias = Math.max(
      ...lista.map((t) => {
        const [a1, m1, d1] = t.prazo_em.split("-").map(Number)
        const [a2, m2, d2] = hoje.split("-").map(Number)
        return Math.round(
          (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000
        )
      })
    )

    await criarNotificacao({
      tipo: "ws_tarefa",
      titulo: n === 1 ? "Tarefa atrasada" : `${n} tarefas atrasadas`,
      mensagem:
        n === 1
          ? `"${primeira.titulo}" está atrasada há ${dias} dias. Veja no Workspace.`
          : `Você tem ${n} tarefas atrasadas (a mais antiga há ${dias} dias). Veja no Workspace.`,
      payload:
        n === 1
          ? { tarefa_id: primeira.id, url: `${ROTA}?tarefa=${primeira.id}` }
          : { url: `${ROTA}/minhas` },
      usuarioIds: [usuarioId],
    })

    // Marca DEPOIS de notificar: se a criação falhar, o cron tenta de novo
    // amanhã em vez de engolir o alerta em silêncio.
    const { error: errMarca } = await db
      .from("ws_tarefas")
      .update({ alerta_atraso_em: new Date().toISOString() })
      .in("id", lista.map((t) => t.id))
    if (errMarca) {
      console.error("[workspace/atrasadas] marcar", errMarca.message)
    }
    notificadas += n
  }

  return NextResponse.json({ ok: true, notificadas, pessoas: porResponsavel.size })
}

export async function GET() {
  return executar()
}

export async function POST() {
  return executar()
}
