// =============================================================================
// Ingestão de leads — orquestração compartilhada.
// =============================================================================
// Um único caminho de gravação para as DUAS fontes:
//   • webhook  (tempo real)        → app/api/leads/meta/webhook
//   • reconciliação (rede diária)  → app/api/leads/reconciliar
//
// Ter um caminho só é o que garante que o lead recuperado pela reconciliação
// fique idêntico ao que teria chegado pelo webhook (mesma extração de campos,
// mesma resolução de cliente, mesmo dia BRT).
//
// Regras invioláveis deste módulo:
//   1. NUNCA propaga exceção. Toda função devolve um resultado descritivo.
//      Um lead problemático não pode derrubar o lote inteiro.
//   2. A deduplicação é do BANCO (unique em leadgen_id + ignoreDuplicates),
//      nunca um "select antes do insert" — webhook e cron podem rodar ao
//      mesmo tempo e a janela de corrida seria real.
//   3. Lead de formulário não mapeado é GRAVADO assim mesmo, com cliente_id
//      null. Descartar seria reintroduzir a perda de lead que o módulo veio
//      resolver.
// =============================================================================

import { getSupabaseAdmin } from "./supabase"
import { buscarLead, type LeadGraph } from "./leads-graph"
import { extrairDados } from "./leads-campos"
import { diaBRT } from "./leads-datas"

export interface EventoLeadgen {
  leadgen_id: string
  form_id: string
  page_id?: string | null
  ad_id?: string | null
  adset_id?: string | null
  campaign_id?: string | null
  /** Unix (webhook) ou ISO (Graph). Normalizado em normalizarCreatedTime. */
  created_time?: string | number | null
}

export interface ResultadoLead {
  leadgen_id: string
  /** true = linha nova gravada. false = já existia (duplicata) ou falhou. */
  gravado: boolean
  duplicado: boolean
  cliente_id: string | null
  erro?: string
}

interface MapeamentoResolvido {
  cliente_id: string
  page_access_token: string | null
}

// -----------------------------------------------------------------------------
// Parsing do payload do webhook
// -----------------------------------------------------------------------------

/**
 * Extrai os eventos de leadgen do payload do webhook da Meta.
 *
 * Formato entregue pela Meta:
 *   { object: "page",
 *     entry: [ { id, time, changes: [ { field: "leadgen", value: {...} } ] } ] }
 *
 * Um único POST pode trazer VÁRIOS entries e vários changes — a Meta agrupa
 * quando há rajada. Tratar como se fosse sempre um só perderia leads
 * silenciosamente.
 *
 * Tolerante a lixo: qualquer coisa fora do formato vira lista vazia, nunca
 * exceção (o payload já está salvo cru nesse ponto).
 */
export function extrairEventosLeadgen(payload: unknown): EventoLeadgen[] {
  const eventos: EventoLeadgen[] = []
  if (typeof payload !== "object" || payload === null) return eventos

  const entries = (payload as any).entry
  if (!Array.isArray(entries)) return eventos

  for (const entry of entries) {
    const changes = entry?.changes
    if (!Array.isArray(changes)) continue

    for (const change of changes) {
      if (change?.field !== "leadgen") continue
      const v = change?.value
      if (typeof v !== "object" || v === null) continue

      const leadgenId = v.leadgen_id ?? v.leadgenId
      const formId = v.form_id ?? v.formId
      if (!leadgenId || !formId) continue

      eventos.push({
        leadgen_id: String(leadgenId),
        form_id: String(formId),
        page_id: v.page_id ? String(v.page_id) : entry?.id ? String(entry.id) : null,
        ad_id: v.ad_id ? String(v.ad_id) : null,
        adset_id: v.adgroup_id ? String(v.adgroup_id) : null,
        campaign_id: v.campaign_id ? String(v.campaign_id) : null,
        created_time: v.created_time ?? null,
      })
    }
  }
  return eventos
}

/**
 * Normaliza created_time pra ISO.
 *
 * O webhook manda unix em SEGUNDOS; a Graph API manda ISO 8601. Tratar os
 * dois como a mesma coisa colocaria o lead em 1970 (segundos lidos como ms).
 */
function normalizarCreatedTime(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") {
    // Unix em segundos → ms. Valores absurdos viram null em vez de data doida.
    const ms = v * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const s = String(v).trim()
  // String puramente numérica também é unix em segundos.
  if (/^\d+$/.test(s)) return normalizarCreatedTime(parseInt(s, 10))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// -----------------------------------------------------------------------------
// Gravação
// -----------------------------------------------------------------------------

/** Resolve cliente + token a partir do form_id. null = formulário não mapeado. */
async function resolverMapeamento(
  formId: string
): Promise<MapeamentoResolvido | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  const { data, error } = await db
    .from("leads_form_mapping")
    .select("cliente_id, page_access_token")
    .eq("form_id", formId)
    .eq("ativo", true)
    .maybeSingle()
  if (error) {
    console.error("[leads-ingestao] resolverMapeamento error", error.message)
    return null
  }
  if (!data) return null
  return {
    cliente_id: data.cliente_id as string,
    page_access_token: (data.page_access_token as string | null) ?? null,
  }
}

/**
 * Grava UM lead, resolvendo cliente e buscando o field_data completo.
 *
 * `leadJaBuscado` permite à reconciliação pular a chamada extra à Graph: ela
 * já lista os leads com field_data embutido, então buscar de novo seria
 * desperdiçar quota à toa.
 */
export async function processarLead(
  evento: EventoLeadgen,
  origem: "webhook" | "reconciliacao",
  leadJaBuscado?: LeadGraph
): Promise<ResultadoLead> {
  const db = getSupabaseAdmin()
  if (!db) {
    return {
      leadgen_id: evento.leadgen_id,
      gravado: false,
      duplicado: false,
      cliente_id: null,
      erro: "service_role_ausente",
    }
  }

  const mapeamento = await resolverMapeamento(evento.form_id)
  const clienteId = mapeamento?.cliente_id ?? null

  // 1) field_data. Se já veio pronto, usa. Senão busca — o webhook só entrega
  //    o id, os dados exigem a chamada com o Page Access Token.
  let lead: LeadGraph | null = leadJaBuscado ?? null
  let erroBusca: string | null = null

  if (!lead) {
    if (mapeamento?.page_access_token) {
      const r = await buscarLead(evento.leadgen_id, mapeamento.page_access_token)
      if (r.ok) lead = r.dados
      else erroBusca = r.erro
    } else {
      // Sem token não dá pra buscar. O lead ainda é gravado (id + metadados) e
      // a reconciliação preenche o field_data quando o token for cadastrado.
      erroBusca = mapeamento ? "page_token_ausente" : "form_nao_mapeado"
    }
  }

  const extraidos = extrairDados(lead?.field_data)
  const createdTime =
    normalizarCreatedTime(lead?.created_time ?? evento.created_time) ?? null

  // Dia BRT: preferência pro created_time real do lead; sem ele, o momento da
  // ingestão. Passar por diaBRT garante que um lead das 22h fique no dia certo.
  const dataBrt = diaBRT(createdTime ? new Date(createdTime) : new Date())

  const linha = {
    leadgen_id: evento.leadgen_id,
    form_id: evento.form_id,
    page_id: evento.page_id ?? null,
    ad_id: lead?.ad_id ?? evento.ad_id ?? null,
    adset_id: lead?.adset_id ?? evento.adset_id ?? null,
    campaign_id: lead?.campaign_id ?? evento.campaign_id ?? null,
    cliente_id: clienteId,
    created_time: createdTime,
    data_brt: dataBrt,
    payload_bruto: { evento, lead: lead ?? null },
    field_data: (lead?.field_data ?? null) as any,
    nome: extraidos.nome,
    telefone: extraidos.telefone,
    email: extraidos.email,
    origem_registro: origem,
    processado: lead !== null,
    erro_processamento: erroBusca,
  }

  // 2) Insert idempotente. ignoreDuplicates faz o conflito em leadgen_id virar
  //    no-op silencioso — é exatamente o comportamento desejado quando o cron
  //    de reconciliação reencontra um lead que o webhook já gravou.
  const { data, error } = await db
    .from("leads_log")
    .upsert(linha, { onConflict: "leadgen_id", ignoreDuplicates: true })
    .select("id")

  if (error) {
    console.error(
      `[leads-ingestao] falha ao gravar ${evento.leadgen_id}: ${error.message}`
    )
    return {
      leadgen_id: evento.leadgen_id,
      gravado: false,
      duplicado: false,
      cliente_id: clienteId,
      erro: error.message,
    }
  }

  // Array vazio = conflito ignorado = o lead já existia.
  const duplicado = !data || data.length === 0

  return {
    leadgen_id: evento.leadgen_id,
    gravado: !duplicado,
    duplicado,
    cliente_id: clienteId,
    erro: erroBusca ?? undefined,
  }
}

/**
 * Adota os leads ÓRFÃOS de um formulário que acabou de ser mapeado.
 *
 * Por que é necessário: a gravação é idempotente por leadgen_id
 * (ignoreDuplicates), então um lead que chegou ANTES do formulário ser
 * cadastrado ficaria com cliente_id null PARA SEMPRE — a reconciliação o
 * reencontraria e não faria nada, porque a linha já existe. Sem esta função,
 * a promessa da tela interna ("cadastre o formulário e eles aparecem") seria
 * falsa.
 *
 * Faz duas coisas:
 *   1. Vincula os órfãos daquele form_id ao cliente.
 *   2. Se houver token, busca o field_data dos que ficaram sem (chegaram sem
 *      credencial pra consultar a Meta) — senão o lead apareceria pro cliente
 *      como uma ficha vazia.
 *
 * Nunca lança: é chamada de dentro de uma server action de cadastro, e uma
 * falha aqui não pode impedir o cadastro em si.
 */
export async function adotarOrfaos(
  formId: string,
  clienteId: string,
  pageToken: string | null,
  maxBusca = 100
): Promise<{ adotados: number; preenchidos: number }> {
  const db = getSupabaseAdmin()
  if (!db) return { adotados: 0, preenchidos: 0 }

  try {
    // 1) Adoção: órfãos deste formulário passam a pertencer ao cliente.
    const { data: adotadosRaw, error } = await db
      .from("leads_log")
      .update({ cliente_id: clienteId })
      .eq("form_id", formId)
      .is("cliente_id", null)
      .select("id")

    if (error) {
      console.error("[leads-ingestao] adotarOrfaos update error", error.message)
      return { adotados: 0, preenchidos: 0 }
    }

    const adotados = (adotadosRaw ?? []).length
    if (!pageToken) return { adotados, preenchidos: 0 }

    // 2) Preenchimento: QUALQUER lead deste formulário sem field_data — não só
    //    os recém-adotados. Cobre o caso de o formulário ter sido cadastrado
    //    sem token (leads entraram vazios) e o token chegar depois; a
    //    reconciliação não resolveria, porque a linha já existe e a gravação é
    //    idempotente.
    const { data: vaziosRaw, error: erroVazios } = await db
      .from("leads_log")
      .select("id, leadgen_id")
      .eq("form_id", formId)
      .is("field_data", null)
      .limit(maxBusca)

    if (erroVazios) {
      console.error("[leads-ingestao] adotarOrfaos select error", erroVazios.message)
      return { adotados, preenchidos: 0 }
    }

    // Sequencial e com teto — é uma ação de cadastro, não pode virar rajada
    // na Graph.
    let preenchidos = 0
    for (const l of (vaziosRaw ?? []) as Array<{ id: string; leadgen_id: string }>) {
      const r = await buscarLead(l.leadgen_id, pageToken)
      if (!r.ok) continue
      const extraidos = extrairDados(r.dados.field_data)
      const { error: upErr } = await db
        .from("leads_log")
        .update({
          field_data: (r.dados.field_data ?? null) as any,
          nome: extraidos.nome,
          telefone: extraidos.telefone,
          email: extraidos.email,
          processado: true,
          erro_processamento: null,
        })
        .eq("id", l.id)
      if (!upErr) preenchidos++
    }

    return { adotados, preenchidos }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[leads-ingestao] adotarOrfaos exceção: ${msg}`)
    return { adotados: 0, preenchidos: 0 }
  }
}

/**
 * Processa todos os leads de um payload de webhook.
 *
 * SEQUENCIAL de propósito: um POST em rajada com 20 leads dispararia 20
 * chamadas simultâneas à Graph, que é justamente o padrão que atrai rate
 * limit. O volume real (~10 clientes) não justifica paralelizar.
 */
export async function processarEventosLeadgen(
  eventos: EventoLeadgen[],
  origem: "webhook" | "reconciliacao" = "webhook"
): Promise<ResultadoLead[]> {
  const resultados: ResultadoLead[] = []
  for (const evento of eventos) {
    try {
      resultados.push(await processarLead(evento, origem))
    } catch (e) {
      // Cinto e suspensório: processarLead já captura tudo, mas se um dia
      // alguém introduzir um throw aqui dentro, o lote continua.
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[leads-ingestao] exceção em ${evento.leadgen_id}: ${msg}`)
      resultados.push({
        leadgen_id: evento.leadgen_id,
        gravado: false,
        duplicado: false,
        cliente_id: null,
        erro: msg,
      })
    }
  }
  return resultados
}
