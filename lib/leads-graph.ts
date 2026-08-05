// =============================================================================
// Cliente da Meta Graph API para leads (formulários instantâneos).
// =============================================================================
// Namespace SEPARADO do Sentinela (supabase/functions/sentinela/index.ts):
//   • Sentinela  → token de System User com escopo de AD ACCOUNT, lê insights.
//   • Aqui       → Page Access Token com escopo `leads_retrieval`, lê o lead.
// São credenciais diferentes, obtidas de formas diferentes. Não dá pra reusar
// o token de tokens_meta — por isso o token vive em leads_form_mapping, por
// página/formulário.
//
// Regra do módulo: NENHUMA função propaga exceção. Toda falha vira
// { ok: false, erro } — uma instabilidade da Meta num lead não pode derrubar a
// ingestão dos outros nem devolver 500 pro webhook (o que faria a Meta
// reentregar em loop).
// =============================================================================

import { createHmac, timingSafeEqual } from "crypto"

// Mesma versão usada pelo Sentinela — manter as duas em sincronia evita
// comportamento divergente entre os dois consumidores da Graph.
const GRAPH_VERSION = "v21.0"
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`

// Timeout defensivo por chamada. A Graph responde em ~1s; 15s evita que uma
// chamada travada segure a função serverless até o limite.
const TIMEOUT_MS = 15_000

export interface LeadGraph {
  id: string
  created_time?: string
  field_data?: unknown
  ad_id?: string
  adset_id?: string
  campaign_id?: string
  form_id?: string
}

export type ResultadoGraph<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; status?: number }

// -----------------------------------------------------------------------------
// Assinatura do webhook (X-Hub-Signature-256)
// -----------------------------------------------------------------------------

/**
 * Valida o header `X-Hub-Signature-256: sha256=<hex>` contra o corpo CRU da
 * requisição, usando o App Secret.
 *
 * IMPORTANTE: precisa do corpo exatamente como chegou (string crua). Fazer
 * `JSON.parse` e re-serializar muda espaços/ordem e quebra o HMAC — por isso a
 * rota lê `req.text()` e só depois faz o parse.
 *
 * Diferença pro webhook da Evolution (que usa segredo no PATH): aqui quem
 * escolhe o formato é a Meta, e ela assina o corpo. Comparação em tempo
 * constante pelo mesmo motivo do lib/cron-auth.ts.
 */
export function assinaturaValida(
  corpoCru: string,
  header: string | null | undefined
): boolean {
  const segredo = process.env.META_LEADGEN_APP_SECRET
  if (!segredo) {
    console.error("[leads-graph] META_LEADGEN_APP_SECRET ausente no ambiente")
    return false
  }
  if (!header || !header.startsWith("sha256=")) return false

  const recebido = header.slice("sha256=".length).trim()
  const esperado = createHmac("sha256", segredo).update(corpoCru, "utf8").digest("hex")

  // timingSafeEqual exige buffers do mesmo tamanho; hex de sha256 é sempre 64
  // chars, então tamanho diferente já é inválido de saída.
  const a = Buffer.from(recebido, "hex")
  const b = Buffer.from(esperado, "hex")
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

/**
 * Valida o handshake GET de verificação do webhook. A Meta chama a URL uma vez
 * com hub.mode=subscribe e espera receber o hub.challenge de volta em texto
 * puro. Sem isso ela nem cadastra a assinatura.
 */
export function validarHandshake(params: URLSearchParams): string | null {
  const verify = process.env.META_LEADGEN_VERIFY_TOKEN
  if (!verify) {
    console.error("[leads-graph] META_LEADGEN_VERIFY_TOKEN ausente no ambiente")
    return null
  }
  if (params.get("hub.mode") !== "subscribe") return null
  if (params.get("hub.verify_token") !== verify) return null
  return params.get("hub.challenge")
}

// -----------------------------------------------------------------------------
// Chamadas à Graph
// -----------------------------------------------------------------------------

const CAMPOS_LEAD = "id,created_time,field_data,ad_id,adset_id,campaign_id,form_id"

async function graphGet<T>(url: string, contexto: string): Promise<ResultadoGraph<T>> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // A Graph é sempre dinâmica; sem isto o fetch do Next poderia cachear.
      cache: "no-store",
    })
    const json: any = await resp.json().catch(() => null)

    if (!resp.ok) {
      const msg = json?.error?.message ?? `HTTP ${resp.status}`
      const code = json?.error?.code
      console.error(
        `[leads-graph] ${contexto} falhou: ${resp.status} code=${code} ${msg}`
      )
      return { ok: false, erro: msg, status: resp.status }
    }
    return { ok: true, dados: json as T }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[leads-graph] ${contexto} erro de rede: ${msg}`)
    return { ok: false, erro: msg }
  }
}

/**
 * Busca o lead completo (field_data com todas as respostas).
 *
 * O webhook entrega só o leadgen_id — os dados do lead exigem esta chamada,
 * que por sua vez exige a permissão `leads_retrieval` aprovada e um Page
 * Access Token válido da página dona do formulário.
 */
export async function buscarLead(
  leadgenId: string,
  pageToken: string
): Promise<ResultadoGraph<LeadGraph>> {
  if (!leadgenId) return { ok: false, erro: "leadgen_id_vazio" }
  if (!pageToken) return { ok: false, erro: "page_token_ausente" }

  const qs = new URLSearchParams({
    fields: CAMPOS_LEAD,
    access_token: pageToken,
  })
  return graphGet<LeadGraph>(
    `${GRAPH_URL}/${encodeURIComponent(leadgenId)}?${qs}`,
    `buscarLead(${leadgenId})`
  )
}

/**
 * Lista os leads de um formulário a partir de um instante — base do cron de
 * reconciliação.
 *
 * Pagina até `maxPaginas` pra não rodar sem teto se um formulário tiver
 * histórico grande (a reconciliação olha só as últimas 24h, então na prática
 * são poucas páginas; o teto é rede de segurança contra loop infinito).
 */
export async function listarLeadsDoForm(
  formId: string,
  pageToken: string,
  desdeUnix: number,
  maxPaginas = 10
): Promise<ResultadoGraph<LeadGraph[]>> {
  if (!formId) return { ok: false, erro: "form_id_vazio" }
  if (!pageToken) return { ok: false, erro: "page_token_ausente" }

  const qs = new URLSearchParams({
    fields: CAMPOS_LEAD,
    limit: "100",
    // Filtro server-side: só leads criados depois do instante dado. Evita
    // baixar o histórico inteiro do formulário a cada execução.
    filtering: JSON.stringify([
      { field: "time_created", operator: "GREATER_THAN", value: desdeUnix },
    ]),
    access_token: pageToken,
  })

  let url: string | null = `${GRAPH_URL}/${encodeURIComponent(formId)}/leads?${qs}`
  const acumulado: LeadGraph[] = []

  for (let i = 0; i < maxPaginas && url; i++) {
    const r: ResultadoGraph<{ data?: LeadGraph[]; paging?: { next?: string } }> =
      await graphGet(url, `listarLeadsDoForm(${formId}) pag.${i + 1}`)

    // Falha na 1ª página = falha do formulário. Falha numa página seguinte:
    // devolve o que já veio (melhor reconciliar parcialmente do que nada).
    if (!r.ok) {
      if (i === 0) return r
      break
    }

    acumulado.push(...(r.dados.data ?? []))
    url = r.dados.paging?.next ?? null
  }

  return { ok: true, dados: acumulado }
}

/**
 * Testa se um Page Access Token ainda responde, sem efeito colateral.
 * Usado pelo health-check: token do Meta expira/é revogado na prática (o
 * projeto já perdeu coleta por erro 190 "Application deleted"), e descobrir
 * isso pela AUSÊNCIA de leads é descobrir tarde demais.
 */
export async function tokenValido(
  pageToken: string
): Promise<{ ok: boolean; erro?: string }> {
  if (!pageToken) return { ok: false, erro: "page_token_ausente" }
  const qs = new URLSearchParams({ fields: "id", access_token: pageToken })
  const r = await graphGet<{ id?: string }>(`${GRAPH_URL}/me?${qs}`, "tokenValido")
  return r.ok ? { ok: true } : { ok: false, erro: r.erro }
}
