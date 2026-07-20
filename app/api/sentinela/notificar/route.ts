import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { getUltimoLogSentinela } from "@/lib/sentinela"
import { criarNotificacao } from "@/lib/notificacoes"

export const runtime = "nodejs"

function autorizado(req: Request): boolean {
  const esperado = process.env.SENTINELA_NOTIFY_SECRET ?? ""
  const recebido = req.headers.get("x-internal-secret") ?? ""
  if (!esperado || !recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

/**
 * Endpoint chamado pelo cron `sentinela_9h_notificar` (pg_cron, alguns
 * minutos depois de `sentinela_9h`) — avisa no sino do app que a coleta
 * automática do dia rodou. A Sentinela em si é uma Edge Function externa
 * (não roda código deste repo), então não pode chamar criarNotificacao()
 * diretamente; este endpoint faz a ponte lendo o último log dela.
 *
 * Autenticação: header x-internal-secret comparado em tempo-constante
 * contra SENTINELA_NOTIFY_SECRET (mesmo padrão de /api/push/dispatch).
 */
export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 403 })
  }

  const log = await getUltimoLogSentinela()
  if (!log) {
    return NextResponse.json({ ok: false, erro: "sem_log" })
  }

  const sucesso = log.status !== "falha"
  const titulo = sucesso ? "Tráfego atualizado" : "Falha na atualização do tráfego"
  const mensagem = sucesso
    ? `Coleta automática das 09:00 concluída — ${log.total_contas_processadas} contas processadas, ${formatBRL(log.investimento_total ?? 0)} de investimento, ${log.leads_totais ?? 0} leads.`
    : `A coleta automática das 09:00 falhou (${log.total_contas_falhas} contas com erro). Confira o log da Sentinela ou use "Atualizar dados".`

  await criarNotificacao({
    tipo: "dados_sentinela",
    titulo,
    mensagem,
    payload: {
      status: log.status,
      contas_processadas: log.total_contas_processadas,
      contas_falhas: log.total_contas_falhas,
      investimento_total: log.investimento_total,
      leads_totais: log.leads_totais,
      data_execucao: log.data_execucao,
    },
  })

  return NextResponse.json({ ok: true })
}
