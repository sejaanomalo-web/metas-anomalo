import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { assinaturaValida, validarHandshake } from "@/lib/leads-graph"
import {
  extrairEventosLeadgen,
  processarEventosLeadgen,
} from "@/lib/leads-ingestao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Folga: um POST em rajada pode trazer vários leads, e cada um faz 1 chamada
// à Graph + 1 escrita, sequencialmente.
export const maxDuration = 60

/**
 * Webhook `leadgen` da Meta — entrada em tempo real dos leads dos formulários
 * instantâneos.
 *
 * Configurar em developers.facebook.com → App → Webhooks → Page → leadgen:
 *   Callback URL:  <APP_URL>/api/leads/meta/webhook
 *   Verify Token:  META_LEADGEN_VERIFY_TOKEN
 * e depois assinar cada página com POST /{page_id}/subscribed_apps.
 *
 * AUTENTICAÇÃO — diferente do webhook da Evolution (que usa segredo no PATH,
 * porque lá quem monta a URL somos nós). Aqui quem manda é a Meta: ela assina
 * o CORPO com o App Secret e envia em X-Hub-Signature-256. Por isso o corpo é
 * lido como TEXTO CRU e só depois parseado — `await req.json()` seguido de
 * re-serialização mudaria espaços/ordem e quebraria o HMAC.
 *
 * CONTRATO DE RESPOSTA (o detalhe que evita loop de reentrega):
 *   • assinatura inválida            → 401, e nada é gravado.
 *   • assinatura válida              → SEMPRE 200, mesmo se o processamento
 *                                      falhar. A Meta reentrega em caso de
 *                                      não-200, o que geraria loop; o erro
 *                                      fica em leads_webhook_eventos.
 */

/** GET — handshake de verificação. A Meta exige o challenge em TEXTO PURO
 *  (não JSON), senão a assinatura do webhook não é aceita. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const challenge = validarHandshake(searchParams)
  if (challenge === null) {
    return new NextResponse("forbidden", { status: 403 })
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}

export async function POST(req: Request) {
  // 1) Corpo CRU — obrigatório pra conferir a assinatura.
  let corpoCru: string
  try {
    corpoCru = await req.text()
  } catch {
    return NextResponse.json({ erro: "corpo_ilegivel" }, { status: 400 })
  }

  // 2) Assinatura. Única condição que faz a rota recusar a requisição.
  if (!assinaturaValida(corpoCru, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ erro: "assinatura_invalida" }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  if (!db) {
    console.error("[leads/webhook] service_role ausente")
    // 200 pra Meta não reentregar em loop — é erro de configuração nosso,
    // reentregar não conserta.
    return NextResponse.json({ ok: false, erro: "service_role_ausente" })
  }

  // 3) Parse. Payload malformado com assinatura válida é praticamente
  //    impossível, mas se acontecer registra e sai sem derrubar nada.
  let payload: unknown = null
  try {
    payload = JSON.parse(corpoCru)
  } catch {
    try {
      await db.from("leads_webhook_eventos").insert({
        // Trunca: o corpo é indecifrável de qualquer forma, e guardar payload
        // gigante malformado só enche a tabela.
        payload: { corpo_cru: corpoCru.slice(0, 10_000) },
        leads_no_payload: 0,
        processado: false,
        erro_processamento: "json_invalido",
      })
    } catch (e) {
      console.error("[leads/webhook] falha ao logar json inválido", e)
    }
    return NextResponse.json({ ok: false, erro: "json_invalido" })
  }

  const eventos = extrairEventosLeadgen(payload)

  // 4) PRIMEIRA ESCRITA — payload cru, antes de qualquer processamento. É a
  //    rede de segurança: se tudo abaixo falhar, o lead ainda dá pra
  //    reconstruir daqui sem depender da Meta.
  let eventoId: string | null = null
  try {
    const { data } = await db
      .from("leads_webhook_eventos")
      .insert({
        payload: payload as any,
        leads_no_payload: eventos.length,
        processado: false,
      })
      .select("id")
      .single()
    eventoId = (data?.id as string) ?? null
  } catch (e) {
    console.error("[leads/webhook] falha ao logar evento cru", e)
  }

  // 5) Processamento.
  try {
    const resultados = await processarEventosLeadgen(eventos, "webhook")

    const gravados = resultados.filter((r) => r.gravado).length
    const duplicados = resultados.filter((r) => r.duplicado).length
    const comErro = resultados.filter((r) => r.erro && !r.gravado)

    if (eventoId) {
      await db
        .from("leads_webhook_eventos")
        .update({
          // "processado" = o payload foi interpretado e percorrido. Um lead
          // com erro de busca não invalida o evento inteiro; o erro fica
          // registrado ao lado.
          processado: true,
          erro_processamento:
            comErro.length > 0
              ? comErro.map((r) => `${r.leadgen_id}: ${r.erro}`).join(" | ")
              : null,
        })
        .eq("id", eventoId)
    }

    return NextResponse.json({
      ok: true,
      recebidos: eventos.length,
      gravados,
      duplicados,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[leads/webhook] erro ao processar", msg)
    if (eventoId) {
      await db
        .from("leads_webhook_eventos")
        .update({ processado: false, erro_processamento: msg })
        .eq("id", eventoId)
    }
    // 200 mesmo em erro (ver contrato acima). A resposta não ecoa conteúdo do
    // payload — são dados pessoais.
    return NextResponse.json({ ok: false, erro: "erro_processamento" })
  }
}
