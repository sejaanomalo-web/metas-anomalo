import { getSupabaseAdmin } from "./supabase"
import type { ClienteTrafego } from "./clientes"

/**
 * Camada de leitura do RANKING DE CAMPANHAS + nível Campanhas do Gerenciador
 * de Anúncios. Lê de `dados_diarios_campanha` (nível campanha, escrito pelo
 * Sentinela). Agrega as linhas-dia da mesma `campanha_id` no período e deriva
 * CTR/CPC/CPM dos TOTAIS (mesma lógica de `resumirTrafego`).
 *
 * FASE 1: usa só as colunas que já existem hoje. Status (Ativa/Pausada),
 * objetivo e o breakdown de conversões (compras/carrinho/checkout/view) ficam
 * null — a UI mostra "—" até a Fase 2 (Sentinela v2 persistir esses campos).
 *
 * ATENÇÃO: `alcance` NÃO é aditivo entre dias (o Meta deduplica pessoas únicas
 * só dentro de um range). Somar `alcance_real` diário é APROXIMAÇÃO — ok pro
 * ranking, mas frequência/qualquer custo-por-alcance herdam esse viés.
 */

export type OrdenacaoRanking = "resultados" | "gasto" | "alcance" | "cliques"
export type TipoResultado = "leads" | "conversas" | "compras"
export type StatusEntidade = "ACTIVE" | "PAUSED" | "ARCHIVED" | null

export interface CampanhaRanking {
  campanhaId: string
  nome: string
  categoria: string | null
  destino: string | null
  objetivo: string | null // Fase 2
  status: StatusEntidade // Fase 2
  investimento: number
  alcance: number
  impressoes: number
  cliques: number
  conversas: number
  leads: number
  compras: number | null // Fase 2
  carrinho: number | null // Fase 2
  checkout: number | null // Fase 2
  view: number | null // Fase 2
  ctr: number | null // derivado
  cpc: number | null // derivado
  cpm: number | null // derivado
  resultados: number // conversão principal pelo objetivo/categoria
  tipoResultado: TipoResultado
}

interface LinhaCampanha {
  campanha_id: string | null
  campanha_nome: string | null
  categoria: string | null
  destino: string | null
  status: string | null
  objetivo: string | null
  investimento_real: number | null
  leads_real: number | null
  conversas_real: number | null
  cliques_real: number | null
  impressoes_real: number | null
  alcance_real: number | null
  compras_real: number | null
  carrinho_real: number | null
  checkout_real: number | null
  view_real: number | null
}

const COLUNAS =
  "campanha_id, campanha_nome, categoria, destino, status, objetivo, investimento_real, leads_real, conversas_real, cliques_real, impressoes_real, alcance_real, compras_real, carrinho_real, checkout_real, view_real"

/**
 * @param filtroRegex p/ cliente em modo regex — filtra `campanha_nome`
 *  (cliente_nome é sempre null em dados_diarios_campanha hoje).
 */
export async function getCampanhasRanking(
  empresaNome: string,
  inicio: string,
  fim: string,
  filtroRegex?: string | null
): Promise<CampanhaRanking[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("dados_diarios_campanha")
    .select(COLUNAS)
    .eq("empresa_nome", empresaNome)
    .eq("origem", "pago")
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error("[anuncios] getCampanhasRanking error", error.message)
    return []
  }

  let linhas = (data ?? []) as LinhaCampanha[]
  if (filtroRegex) {
    try {
      const re = new RegExp(filtroRegex, "i")
      linhas = linhas.filter((l) => re.test(l.campanha_nome ?? ""))
    } catch {
      /* regex inválido → não filtra */
    }
  }

  const mapa = new Map<string, CampanhaRanking>()
  for (const l of linhas) {
    const id = l.campanha_id
    if (!id) continue // linha sem campanha_id (coluna nullable) — ignora
    const acc =
      mapa.get(id) ??
      ({
        campanhaId: id,
        nome: l.campanha_nome ?? "Campanha sem nome",
        categoria: l.categoria ?? null,
        destino: l.destino ?? null,
        objetivo: null,
        status: null,
        investimento: 0,
        alcance: 0,
        impressoes: 0,
        cliques: 0,
        conversas: 0,
        leads: 0,
        compras: null,
        carrinho: null,
        checkout: null,
        view: null,
        ctr: null,
        cpc: null,
        cpm: null,
        resultados: 0,
        tipoResultado: "leads",
      } satisfies CampanhaRanking)
    acc.investimento += Number(l.investimento_real ?? 0)
    acc.alcance += Number(l.alcance_real ?? 0)
    acc.impressoes += Number(l.impressoes_real ?? 0)
    acc.cliques += Number(l.cliques_real ?? 0)
    acc.conversas += Number(l.conversas_real ?? 0)
    acc.leads += Number(l.leads_real ?? 0)
    acc.compras = somaNul(acc.compras, l.compras_real)
    acc.carrinho = somaNul(acc.carrinho, l.carrinho_real)
    acc.checkout = somaNul(acc.checkout, l.checkout_real)
    acc.view = somaNul(acc.view, l.view_real)
    if (!acc.objetivo && l.objetivo) acc.objetivo = l.objetivo
    if (!acc.status && l.status) acc.status = l.status as StatusEntidade
    if (!acc.categoria && l.categoria) acc.categoria = l.categoria
    if (!acc.destino && l.destino) acc.destino = l.destino
    mapa.set(id, acc)
  }

  return Array.from(mapa.values())
    .map(finalizar)
    .sort((a, b) => b.resultados - a.resultados)
}

/** Soma mantendo null enquanto TODOS os valores forem null — o campo segue
 *  "—" até o Sentinela v2 popular (e o backfill re-puxar maio/junho). */
function somaNul(
  acc: number | null,
  v: number | null | undefined
): number | null {
  if (v == null) return acc
  return (acc ?? 0) + Number(v)
}

function finalizar(c: CampanhaRanking): CampanhaRanking {
  c.ctr = c.impressoes > 0 ? c.cliques / c.impressoes : null
  c.cpc = c.cliques > 0 ? c.investimento / c.cliques : null
  c.cpm = c.impressoes > 0 ? (c.investimento / c.impressoes) * 1000 : null
  const r = resolverResultado(c)
  c.resultados = r.valor
  c.tipoResultado = r.tipo
  return c
}

/** "Resultados" = conversão principal pelo OBJETIVO; na Fase 1 (objetivo null)
 *  cai pra CATEGORIA já derivada pelo Sentinela. */
function resolverResultado(c: CampanhaRanking): {
  valor: number
  tipo: TipoResultado
} {
  const o = (c.objetivo ?? "").toUpperCase()
  if (o.includes("LEAD")) return { valor: c.leads, tipo: "leads" }
  if (
    o.includes("SALE") ||
    o.includes("CONVERSION") ||
    o.includes("PURCHASE") ||
    o.includes("OUTCOME_SALES")
  )
    return { valor: c.compras ?? 0, tipo: "compras" }
  if (o.includes("MESSAG") || o.includes("ENGAG") || o.includes("CONVERSATION"))
    return { valor: c.conversas, tipo: "conversas" }
  // Fallback Fase 1 pela categoria (Sentinela já deriva remarketing/vendas/leads).
  if (c.categoria === "vendas")
    return c.compras != null
      ? { valor: c.compras, tipo: "compras" }
      : { valor: c.leads, tipo: "leads" }
  if (c.categoria === "remarketing")
    return c.compras != null
      ? { valor: c.compras, tipo: "compras" }
      : { valor: c.conversas, tipo: "conversas" }
  return c.leads >= c.conversas
    ? { valor: c.leads, tipo: "leads" }
    : { valor: c.conversas, tipo: "conversas" }
}

/** Ranking de um CLIENTE: modo origem lê pela empresa de origem; modo regex
 *  lê pela empresa do cliente e filtra `campanha_nome` pelo `campaign_filter`. */
export async function getCampanhasRankingCliente(
  cliente: ClienteTrafego,
  inicio: string,
  fim: string
): Promise<CampanhaRanking[]> {
  if (cliente.empresa_origem_nome) {
    return getCampanhasRanking(cliente.empresa_origem_nome, inicio, fim)
  }
  if (cliente.campaign_filter) {
    return getCampanhasRanking(
      cliente.empresa_nome,
      inicio,
      fim,
      cliente.campaign_filter
    )
  }
  return []
}

// =====================================================================
// Fase 2b/2c — Conjuntos (adset) e Anúncios (ad)
// =====================================================================

export interface ConjuntoRanking {
  adsetId: string
  nome: string
  status: StatusEntidade
  investimento: number
  alcance: number
  impressoes: number
  cliques: number
  conversas: number
  leads: number
  compras: number | null
  carrinho: number | null
  ctr: number | null
  cpc: number | null
}

export interface AnuncioRanking {
  adId: string
  nome: string
  status: StatusEntidade
  investimento: number
  alcance: number
  impressoes: number
  frequencia: number | null
  cpm: number | null
  cliques: number
  todosCliques: number
  conversas: number
  leads: number
  compras: number | null
  carrinho: number | null
  checkout: number | null
  view: number | null
  ctr: number | null
  cpc: number | null
}

interface LinhaAdset {
  adset_id: string | null
  adset_nome: string | null
  status: string | null
  investimento_real: number | null
  alcance_real: number | null
  impressoes_real: number | null
  cliques_real: number | null
  conversas_real: number | null
  leads_real: number | null
  compras_real: number | null
  carrinho_real: number | null
}

/** Conjuntos (adsets) de UMA campanha no período, agregados por adset_id. */
export async function getConjuntosDaCampanha(
  empresaNome: string,
  campanhaId: string,
  inicio: string,
  fim: string
): Promise<ConjuntoRanking[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("dados_diarios_adset")
    .select(
      "adset_id, adset_nome, status, investimento_real, alcance_real, impressoes_real, cliques_real, conversas_real, leads_real, compras_real, carrinho_real"
    )
    .eq("empresa_nome", empresaNome)
    .eq("campanha_id", campanhaId)
    .eq("origem", "pago")
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error("[anuncios] getConjuntosDaCampanha error", error.message)
    return []
  }
  const mapa = new Map<string, ConjuntoRanking>()
  for (const l of (data ?? []) as LinhaAdset[]) {
    const id = l.adset_id
    if (!id) continue
    const acc =
      mapa.get(id) ??
      ({
        adsetId: id,
        nome: l.adset_nome ?? "Conjunto sem nome",
        status: null,
        investimento: 0,
        alcance: 0,
        impressoes: 0,
        cliques: 0,
        conversas: 0,
        leads: 0,
        compras: null,
        carrinho: null,
        ctr: null,
        cpc: null,
      } satisfies ConjuntoRanking)
    acc.investimento += Number(l.investimento_real ?? 0)
    acc.alcance += Number(l.alcance_real ?? 0)
    acc.impressoes += Number(l.impressoes_real ?? 0)
    acc.cliques += Number(l.cliques_real ?? 0)
    acc.conversas += Number(l.conversas_real ?? 0)
    acc.leads += Number(l.leads_real ?? 0)
    acc.compras = somaNul(acc.compras, l.compras_real)
    acc.carrinho = somaNul(acc.carrinho, l.carrinho_real)
    if (!acc.status && l.status) acc.status = l.status as StatusEntidade
    if (acc.nome === "Conjunto sem nome" && l.adset_nome) acc.nome = l.adset_nome
    mapa.set(id, acc)
  }
  return Array.from(mapa.values())
    .map((c) => {
      c.ctr = c.impressoes > 0 ? c.cliques / c.impressoes : null
      c.cpc = c.cliques > 0 ? c.investimento / c.cliques : null
      return c
    })
    .sort((a, b) => b.investimento - a.investimento)
}

interface LinhaAd {
  ad_id: string | null
  ad_nome: string | null
  status: string | null
  investimento_real: number | null
  alcance_real: number | null
  impressoes_real: number | null
  cliques_real: number | null
  todos_cliques_real: number | null
  conversas_real: number | null
  leads_real: number | null
  compras_real: number | null
  carrinho_real: number | null
  checkout_real: number | null
  view_real: number | null
}

/** Anúncios (ads) de UM conjunto no período, agregados por ad_id. */
export async function getAnunciosDoConjunto(
  empresaNome: string,
  adsetId: string,
  inicio: string,
  fim: string
): Promise<AnuncioRanking[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("dados_diarios_ad")
    .select(
      "ad_id, ad_nome, status, investimento_real, alcance_real, impressoes_real, cliques_real, todos_cliques_real, conversas_real, leads_real, compras_real, carrinho_real, checkout_real, view_real"
    )
    .eq("empresa_nome", empresaNome)
    .eq("adset_id", adsetId)
    .eq("origem", "pago")
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error("[anuncios] getAnunciosDoConjunto error", error.message)
    return []
  }
  const mapa = new Map<string, AnuncioRanking>()
  for (const l of (data ?? []) as LinhaAd[]) {
    const id = l.ad_id
    if (!id) continue
    const acc =
      mapa.get(id) ??
      ({
        adId: id,
        nome: l.ad_nome ?? "Anúncio sem nome",
        status: null,
        investimento: 0,
        alcance: 0,
        impressoes: 0,
        frequencia: null,
        cpm: null,
        cliques: 0,
        todosCliques: 0,
        conversas: 0,
        leads: 0,
        compras: null,
        carrinho: null,
        checkout: null,
        view: null,
        ctr: null,
        cpc: null,
      } satisfies AnuncioRanking)
    acc.investimento += Number(l.investimento_real ?? 0)
    acc.alcance += Number(l.alcance_real ?? 0)
    acc.impressoes += Number(l.impressoes_real ?? 0)
    acc.cliques += Number(l.cliques_real ?? 0)
    acc.todosCliques += Number(l.todos_cliques_real ?? 0)
    acc.conversas += Number(l.conversas_real ?? 0)
    acc.leads += Number(l.leads_real ?? 0)
    acc.compras = somaNul(acc.compras, l.compras_real)
    acc.carrinho = somaNul(acc.carrinho, l.carrinho_real)
    acc.checkout = somaNul(acc.checkout, l.checkout_real)
    acc.view = somaNul(acc.view, l.view_real)
    if (!acc.status && l.status) acc.status = l.status as StatusEntidade
    if (acc.nome === "Anúncio sem nome" && l.ad_nome) acc.nome = l.ad_nome
    mapa.set(id, acc)
  }
  return Array.from(mapa.values())
    .map((a) => {
      a.ctr = a.impressoes > 0 ? a.cliques / a.impressoes : null
      a.cpc = a.cliques > 0 ? a.investimento / a.cliques : null
      a.cpm = a.impressoes > 0 ? (a.investimento / a.impressoes) * 1000 : null
      a.frequencia = a.alcance > 0 ? a.impressoes / a.alcance : null
      return a
    })
    .sort((a, b) => b.investimento - a.investimento)
}

/** Nome da campanha (pro breadcrumb), de dados_diarios_campanha. */
export async function getNomeCampanha(
  empresaNome: string,
  campanhaId: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data } = await supabase
    .from("dados_diarios_campanha")
    .select("campanha_nome")
    .eq("empresa_nome", empresaNome)
    .eq("campanha_id", campanhaId)
    .not("campanha_nome", "is", null)
    .limit(1)
    .maybeSingle()
  return (data?.campanha_nome as string | undefined) ?? null
}

/** Querystring que PRESERVA o período atual (mês OU dia/intervalo) nos links
 *  do drill-down — senão os modos dia/intervalo cairiam pro mês cheio ao
 *  navegar entre níveis. */
export function qsPeriodo(p: {
  modo: string
  de: string
  ate: string
  mes: string
  ano: number
}): string {
  const u = new URLSearchParams()
  if (p.modo === "dia") {
    u.set("modo", "dia")
    u.set("de", p.de)
  } else if (p.modo === "intervalo") {
    u.set("modo", "intervalo")
    u.set("de", p.de)
    u.set("ate", p.ate)
  } else {
    u.set("mes", p.mes)
    u.set("ano", String(p.ano))
  }
  return u.toString()
}

/** Nome do conjunto (pro breadcrumb), de dados_diarios_adset. */
export async function getNomeConjunto(
  empresaNome: string,
  adsetId: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data } = await supabase
    .from("dados_diarios_adset")
    .select("adset_nome")
    .eq("empresa_nome", empresaNome)
    .eq("adset_id", adsetId)
    .not("adset_nome", "is", null)
    .limit(1)
    .maybeSingle()
  return (data?.adset_nome as string | undefined) ?? null
}
