import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { bearerValido } from "@/lib/cron-auth"
import { listarLeadsDoForm } from "@/lib/leads-graph"
import { processarLead, type EventoLeadgen } from "@/lib/leads-ingestao"
import { criarNotificacao } from "@/lib/notificacoes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Varre N formulários com paginação e espaçamento entre eles.
export const maxDuration = 300

/**
 * Cron diário de RECONCILIAÇÃO — a rede de segurança do módulo de leads.
 *
 * Por que existe: o webhook é entrega em tempo real, mas não é garantido.
 * Instabilidade da Meta, deploy no meio do caminho, token que expirou por
 * algumas horas — qualquer um desses perde leads silenciosamente, e "lead
 * perdido" é justamente o problema que este módulo veio resolver. Aqui o
 * sistema pergunta à Meta o que entrou e insere o que faltar.
 *
 * É esta rotina que sustenta a decisão de NÃO manter backup em Google Sheets:
 * o Sheets era gravado depois do banco, então nunca protegeu contra o lead
 * não chegar. Esta rotina protege.
 *
 * Janela de 48h (não 24h) de propósito: dá sobreposição entre execuções, então
 * uma falha isolada do cron não abre buraco. Reprocessar é barato — a
 * deduplicação é do banco (unique em leadgen_id).
 *
 * Idempotente: rodar duas vezes seguidas não duplica nada.
 */

const JANELA_HORAS = 48

// Espaçamento entre formulários pra não disparar N chamadas simultâneas na
// Graph — mesmo cuidado do MS_ENTRE_ENVIOS em /api/wa/diario.
const MS_ENTRE_FORMS = 400

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface LinhaMapeamento {
  id: string
  form_id: string
  page_id: string | null
  rotulo: string
  cliente_id: string
  page_access_token: string | null
}

async function executar() {
  const authHeader = headers().get("authorization")
  if (!bearerValido(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    return NextResponse.json({ erro: "service_role_ausente" }, { status: 500 })
  }

  const { data: mapeamentosRaw, error } = await db
    .from("leads_form_mapping")
    .select("id, form_id, page_id, rotulo, cliente_id, page_access_token")
    .eq("ativo", true)

  if (error) {
    console.error("[leads/reconciliar] erro ao ler mapeamentos", error.message)
    return NextResponse.json({ erro: "leitura_falhou" }, { status: 500 })
  }

  const mapeamentos = (mapeamentosRaw ?? []) as LinhaMapeamento[]
  const desdeUnix = Math.floor((Date.now() - JANELA_HORAS * 3600_000) / 1000)

  let recuperados = 0
  let jaExistiam = 0
  const semToken: string[] = []
  const falhas: Array<{ formulario: string; erro: string }> = []

  for (const m of mapeamentos) {
    // Sem token não dá pra consultar a Meta. Registra e segue — não é falha
    // do cron, é cadastro incompleto.
    if (!m.page_access_token) {
      semToken.push(m.rotulo)
      continue
    }

    const r = await listarLeadsDoForm(m.form_id, m.page_access_token, desdeUnix)

    if (!r.ok) {
      falhas.push({ formulario: m.rotulo, erro: r.erro })
      await dormir(MS_ENTRE_FORMS)
      continue
    }

    for (const lead of r.dados) {
      if (!lead?.id) continue
      const evento: EventoLeadgen = {
        leadgen_id: String(lead.id),
        form_id: m.form_id,
        page_id: m.page_id,
        ad_id: lead.ad_id ?? null,
        adset_id: lead.adset_id ?? null,
        campaign_id: lead.campaign_id ?? null,
        created_time: lead.created_time ?? null,
      }
      // O lead já vem com field_data da listagem — passa adiante pra evitar
      // uma segunda chamada à Graph por lead.
      const res = await processarLead(evento, "reconciliacao", lead)
      if (res.gravado) recuperados++
      else if (res.duplicado) jaExistiam++
    }

    await dormir(MS_ENTRE_FORMS)
  }

  // Notificação interna só quando há algo que exige AÇÃO HUMANA. Avisar todo
  // dia que está tudo bem treina o time a ignorar o sino.
  if (recuperados > 0) {
    await criarNotificacao({
      tipo: "dados_trafego",
      titulo: "Leads recuperados",
      mensagem:
        `A reconciliação encontrou ${recuperados} lead(s) que o webhook não ` +
        `havia registrado. Já estão no painel dos clientes.`,
      papelAlvo: ["admin", "gestor_trafego"],
    }).catch(() => undefined)
  }

  if (falhas.length > 0) {
    await criarNotificacao({
      tipo: "dados_trafego",
      titulo: "Falha ao consultar leads no Meta",
      mensagem:
        `${falhas.length} formulário(s) não responderam: ` +
        `${falhas.map((f) => f.formulario).join(", ")}. ` +
        `Provável token de página expirado.`,
      papelAlvo: ["admin", "gestor_trafego"],
    }).catch(() => undefined)
  }

  return NextResponse.json({
    ok: true,
    janela_horas: JANELA_HORAS,
    formularios: mapeamentos.length,
    recuperados,
    ja_existiam: jaExistiam,
    sem_token: semToken,
    falhas,
  })
}

// A Vercel dispara cron via GET; POST fica pro teste manual. Ambos exigem o
// Bearer e rodam a mesma rotina — mesmo padrão do /api/wa/diario.
export async function GET() {
  return executar()
}

export async function POST() {
  return executar()
}
