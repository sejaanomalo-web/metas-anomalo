import { NextResponse } from "next/server"
import { getUsuarioAtual, temPermissao } from "@/lib/auth"
import { dispararSentinelaDia } from "@/lib/sentinela-trigger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A coleta chama a edge function duas vezes (ontem + hoje) e cada uma
// processa todas as contas de tokens_meta — o próprio lib/sentinela-trigger
// documenta ~30s por data.
export const maxDuration = 120

/**
 * POST /api/sentinela/coletar — coleta do dia (ontem + hoje).
 *
 * POR QUE ISTO É UM ROUTE HANDLER E NÃO UMA SERVER ACTION
 * -------------------------------------------------------
 * O corpo é exatamente o mesmo de `dispararSentinelaDia()`. O que muda é o
 * CANAL, e o canal era o problema.
 *
 * O Next serializa Server Actions e `router.refresh()` numa fila única por
 * aba. Enquanto uma ação está em voo, toda outra ação e todo refresh esperam.
 * Como esta coleta leva de 30 a 60 segundos e dispara sozinha ao abrir a aba
 * de Tráfego (SentinelaAutoRefresh), o usuário entrava no Tráfego, saía para
 * o Workspace ou o Financeiro, e por até um minuto NENHUM clique que salva
 * respondia: o checkbox não marcava, o drawer não fechava, o botão ficava
 * "pensando". Sem nada na tela ligando uma coisa à outra.
 *
 * Um Route Handler é um fetch comum: não entra na fila do roteador. A coleta
 * continua levando o mesmo tempo, com a mesma pílula de progresso — só que
 * agora o resto do sistema continua respondendo enquanto ela roda.
 *
 * O padrão já é usado no projeto em app/api/workspace/notas/salvar/route.ts,
 * consumido por fetch em components/workspace/EditorNota.tsx.
 *
 * `dispararSentinelaDia` continua exportada e intacta: o botão manual e
 * qualquer outro chamador seguem funcionando como antes.
 */
export async function POST() {
  // Mesma checagem da Server Action. O handler lê o cookie de sessão, então
  // a autorização continua sendo feita no servidor, não no cliente.
  const usuario = await getUsuarioAtual()
  if (!usuario) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 })
  }
  if (!temPermissao(usuario, "dashboard_trafego")) {
    return NextResponse.json({ ok: false, erro: "Sem permissão." }, { status: 403 })
  }

  const resultado = await dispararSentinelaDia()
  // O shape da resposta é idêntico ao da Server Action — o provider não
  // precisa saber por onde a coleta veio.
  return NextResponse.json(resultado)
}
