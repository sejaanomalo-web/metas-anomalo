// =============================================================================
// SENTINELA ANÔMALO — Edge Function (v3 — Fase 2b/2c: nível adset + ad)
// =============================================================================
// Lê insights diários do Meta (campanha + conjunto + anúncio) pra cada cliente
// ativo em `tokens_meta`, agrega, faz UPSERT em dados_diarios_log /
// _campanha / _adset / _ad, detecta anomalias e registra em logs_sentinela.
// =============================================================================

/// <reference lib="deno.ns" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Secret do app (mesmo valor da env var SENTINELA_SECRET no Vercel) — é o que
// o botão "Atualizar dados" manda.
const SENTINELA_SECRET = Deno.env.get("SENTINELA_SECRET") ?? "";
// Secret alternativo, usado pelo pg_cron e por scripts de backfill. Existe
// porque o valor do Vercel é sensível e não pode ser lido de volta pra ser
// replicado no comando do cron; assim o cron tem credencial própria e
// rotacionar uma não derruba a outra. Opcional: se não estiver setado, só o
// SENTINELA_SECRET é aceito.
const SENTINELA_CRON_SECRET = Deno.env.get("SENTINELA_CRON_SECRET") ?? "";
const META_API_VERSION = "v21.0";
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const SENTINELA_PREENCHEDOR_ID = "e4b253c3-3f28-41d4-891b-ea92c367520d";
const MSG_ACTION = "onsite_conversion.messaging_conversation_started_7d";

// Mapa optimization_goal (do ADSET) -> action_types que representam o
// "Resultado" que o Gerenciador de Anúncios exibe naquela campanha.
//
// IMPORTANTE: cada lista é uma ordem de PREFERÊNCIA, não uma soma. O Meta
// devolve o MESMO evento sob vários action_types (ex.: um cadastro aparece
// como `lead` E como `onsite_conversion.lead_grouped`; uma compra aparece
// como `purchase`, `omni_purchase` E `offsite_conversion.fb_pixel_purchase`).
// Somar todos contava o mesmo resultado 2-3x — era o motivo de os leads do
// sistema virem inflados em relação ao Gerenciador. Usamos o PRIMEIRO
// action_type presente e paramos.
const GOAL_TO_RESULT_ACTIONS: Record<string, string[]> = {
  LEAD_GENERATION: ["onsite_conversion.lead_grouped", "lead"],
  QUALITY_LEAD: ["onsite_conversion.lead_grouped", "lead"],
  QUALITY_CALL: ["onsite_conversion.lead_grouped", "lead"],
  CONVERSATIONS: ["onsite_conversion.messaging_conversation_started_7d"],
  MESSAGING_APPOINTMENT_CONVERSION: [
    "onsite_conversion.messaging_conversation_started_7d",
  ],
  MESSAGING_PURCHASE_CONVERSION: [
    "onsite_conversion.messaging_conversation_started_7d",
  ],
  OFFSITE_CONVERSIONS: [
    "omni_purchase",
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "offsite_conversion.fb_pixel_lead",
    "complete_registration",
    "offsite_conversion.fb_pixel_complete_registration",
    "onsite_conversion.lead_grouped",
    "lead",
  ],
  VALUE: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  APP_INSTALLS: ["omni_app_install", "app_install", "mobile_app_install"],
  LINK_CLICKS: ["link_click"],
  LANDING_PAGE_VIEWS: ["landing_page_view"],
  // Objetivos SEM conversão: o "Resultado" do Gerenciador é alcance /
  // impressões / vídeo / engajamento — nada disso é lead. Lista vazia =
  // 0 resultados (mas spend/impressões/conversas seguem sendo gravados).
  REACH: [],
  IMPRESSIONS: [],
  AD_RECALL_LIFT: [],
  THRUPLAY: [],
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: [],
  POST_ENGAGEMENT: [],
  PAGE_LIKES: [],
  EVENT_RESPONSES: [],
  PROFILE_VISIT: [],
  VISIT_INSTAGRAM_PROFILE: [],
};

// Usado só quando não descobrimos o optimization_goal do adset (campanha
// sem adset legível, conta sem permissão, etc.). Também é ORDEM DE
// PREFERÊNCIA — pega o primeiro presente, nunca soma.
const FALLBACK_RESULT_ACTIONS: string[] = [
  "onsite_conversion.lead_grouped",
  "lead",
  "onsite_conversion.messaging_conversation_started_7d",
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "offsite_conversion.fb_pixel_lead",
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
  "submit_application_total",
];

const ANOMALY_LEADS_POSITIVE = 1.3;
const ANOMALY_LEADS_NEGATIVE = 0.5;
const ANOMALY_CPL_NEGATIVE = 1.3;
const HISTORICAL_WINDOW_DAYS = 7;

// -----------------------------------------------------------------------------
// TIPOS
// -----------------------------------------------------------------------------

interface TokenRow {
  empresa: string;
  ad_account_id: string;
  access_token: string;
  tipo_conversao: string;
  campaign_filter: string | null;
}

interface InsightAction { action_type: string; value: string }

interface CampaignRow {
  campaign_id: string;
  campaign_name?: string;
  spend?: string;
  actions?: InsightAction[];
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  reach?: string;
}

interface AdsetRow {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  spend?: string;
  actions?: InsightAction[];
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  reach?: string;
}

interface AdRow {
  campaign_id?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  actions?: InsightAction[];
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  reach?: string;
}

interface CampaignDetail {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  leads_atribuidos: number;
  optimization_goal: string;
  impressoes: number;
  cliques: number;
  alcance: number;
  conversas: number;
  categoria: string | null;
  destino: string | null;
  compras: number;
  carrinho: number;
  checkout: number;
  view: number;
  landing: number;
  objetivo: string | null;
  status: string | null;
}

interface AdsetDetail {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  status: string | null;
  spend: number;
  leads: number;
  conversas: number;
  compras: number;
  carrinho: number;
  checkout: number;
  view: number;
  landing: number;
  cliques: number;
  impressoes: number;
  alcance: number;
}

interface AdDetail {
  campaign_id: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  status: string | null;
  spend: number;
  leads: number;
  conversas: number;
  compras: number;
  carrinho: number;
  checkout: number;
  view: number;
  landing: number;
  cliques: number;
  todos_cliques: number;
  impressoes: number;
  alcance: number;
}

interface ClientMetrics {
  investimento_real: number;
  leads_real: number;
  cpl_real: number;
  impressoes_real: number;
  cliques_real: number;
  alcance_real: number;
  conversas_real: number;
  cpm_real: number;
  sem_atividade: boolean;
  raw_actions: Record<string, number>;
  campaigns_processadas: number;
  campaigns_detail?: CampaignDetail[];
  adsets_detail?: AdsetDetail[];
  ads_detail?: AdDetail[];
}

interface ClientResult {
  empresa: string;
  ad_account_id: string;
  success: boolean;
  metrics?: ClientMetrics;
  error?: string;
}

interface Anomaly {
  empresa: string;
  tipo: "positiva" | "negativa" | "critica";
  metrica: string;
  valor_atual: number;
  media_7dias: number;
  variacao_percentual: number;
}

// -----------------------------------------------------------------------------
// UTILS
// -----------------------------------------------------------------------------

function getYesterdayBRT(): string {
  const now = new Date();
  const spOffset = -3 * 60 * 60 * 1000;
  const sp = new Date(now.getTime() + spOffset);
  sp.setUTCDate(sp.getUTCDate() - 1);
  return sp.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(current: number, base: number): number {
  if (base === 0) return 0;
  return Math.round(((current - base) / base) * 1000) / 10;
}

function intFrom(v: string | undefined | null): number {
  return parseInt(v || "0", 10) || 0;
}

interface ActionAgg {
  leads: number;
  conversas: number;
  compras: number;
  carrinho: number;
  checkout: number;
  view: number;
  landing: number;
}

// Escolhe o valor do PRIMEIRO action_type presente na ordem de preferência.
// Nunca soma dois types que descrevem o mesmo evento (ver comentário em
// GOAL_TO_RESULT_ACTIONS).
function primeiroPresente(
  acts: Record<string, number>,
  preferencia: string[],
): number {
  for (const at of preferencia) {
    const v = acts[at];
    if (v !== undefined) return v;
  }
  return 0;
}

// Agrega o array `actions` do Meta no breakdown que persistimos.
// `resultActions` é a ORDEM DE PREFERÊNCIA do que conta como "resultado"
// (o mesmo número que o Gerenciador mostra na coluna "Resultados").
function aggregateActions(
  actions: InsightAction[] | undefined,
  resultActions: string[],
): ActionAgg {
  const acts: Record<string, number> = {};
  for (const a of actions || []) {
    acts[a.action_type] = (acts[a.action_type] || 0) + parseFloat(a.value || "0");
  }

  const conversas = acts[MSG_ACTION] ?? 0;
  // Compras: omni_purchase já é a versão deduplicada do Meta; só cai pros
  // outros types se ela não vier.
  const compras = primeiroPresente(acts, [
    "omni_purchase",
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
  ]);
  const carrinho = primeiroPresente(acts, ["omni_add_to_cart", "add_to_cart"]);
  const checkout = primeiroPresente(acts, [
    "omni_initiated_checkout",
    "initiate_checkout",
  ]);
  const view = primeiroPresente(acts, ["omni_view_content", "view_content"]);
  const landing = acts["landing_page_view"] ?? 0;
  const leads = primeiroPresente(acts, resultActions);

  return {
    leads: Math.round(leads),
    conversas: Math.round(conversas),
    compras: Math.round(compras),
    carrinho: Math.round(carrinho),
    checkout: Math.round(checkout),
    view: Math.round(view),
    landing: Math.round(landing),
  };
}

// -----------------------------------------------------------------------------
// META GRAPH API
// -----------------------------------------------------------------------------

async function fetchCampaignInsights(
  adAccountId: string,
  token: string,
  dateStr: string,
): Promise<CampaignRow[]> {
  const params = new URLSearchParams({
    level: "campaign",
    time_range: JSON.stringify({ since: dateStr, until: dateStr }),
    fields:
      "campaign_id,campaign_name,spend,actions,impressions,clicks,inline_link_clicks,reach",
    limit: "200",
    access_token: token,
  });
  const url = `${META_GRAPH_URL}/${adAccountId}/insights?${params}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (json.error) {
    throw new Error(`Meta API error (${json.error.code}): ${json.error.message}`);
  }
  return json.data || [];
}

// Insights genérico por nível (adset|ad) — Fase 2b/2c.
async function fetchInsightsLevel(
  adAccountId: string,
  token: string,
  dateStr: string,
  level: "adset" | "ad" | "account",
  fields: string,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    level,
    time_range: JSON.stringify({ since: dateStr, until: dateStr }),
    fields,
    limit: "500",
    access_token: token,
  });
  const url = `${META_GRAPH_URL}/${adAccountId}/insights?${params}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (json.error) {
    throw new Error(`Meta API error (${json.error.code}): ${json.error.message}`);
  }
  return json.data || [];
}

// effective_status em lote (adsets e/ou ads) -> rótulo curto.
async function fetchStatuses(
  ids: string[],
  token: string,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (ids.length === 0) return out;
  try {
    for (let i = 0; i < ids.length; i += 50) {
      const lote = ids.slice(i, i + 50);
      const params = new URLSearchParams({
        ids: lote.join(","),
        fields: "effective_status",
        access_token: token,
      });
      const resp = await fetch(`${META_GRAPH_URL}/?${params}`);
      const json = await resp.json();
      if (json.error) continue;
      for (const id of lote) out[id] = mapStatus(json[id]?.effective_status);
    }
  } catch (e) {
    console.warn(`fetchStatuses failed: ${e}`);
  }
  return out;
}

interface CampaignMeta {
  objective: string;
  effective_status: string;
}

// NÃO peça `optimization_goal` aqui: ele NÃO existe no nó Campaign do Graph
// (o Meta responde HTTP 400 e derruba a chamada inteira). optimization_goal
// vive no ADSET — ver fetchAdsetMeta. Era exatamente esse o bug: a chamada
// pedia só objective/effective_status e depois lia `json[id].optimization_goal`,
// que vinha sempre undefined → toda campanha caía no fallback "soma tudo".
async function fetchCampaignMeta(
  campaignIds: string[],
  token: string,
): Promise<Record<string, CampaignMeta>> {
  if (campaignIds.length === 0) return {};
  const params = new URLSearchParams({
    ids: campaignIds.join(","),
    fields: "objective,effective_status",
    access_token: token,
  });
  const url = `${META_GRAPH_URL}/?${params}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (json.error) {
    console.warn(`Failed to fetch campaign meta: ${json.error.message}`);
    return {};
  }
  const result: Record<string, CampaignMeta> = {};
  for (const id of campaignIds) {
    result[id] = {
      objective: json[id]?.objective || "",
      effective_status: json[id]?.effective_status || "",
    };
  }
  return result;
}

interface AdsetMeta {
  destino: string | null;
  remarketing: boolean;
  /** optimization_goal dos adsets da campanha (o Gerenciador deriva a coluna
   *  "Resultados" daqui). Vazio quando não conseguimos ler. */
  goals: string[];
}

function mapDestino(destType: string | undefined | null): string | null {
  if (!destType) return null;
  const d = String(destType).toUpperCase();
  if (d === "UNDEFINED" || d === "UNKNOWN" || d === "NULL") return null;
  if (d.includes("WHATSAPP")) return "whatsapp";
  if (d.includes("MESSENGER")) return "messenger";
  if (d.includes("INSTAGRAM")) return "instagram";
  if (d.includes("PHONE_CALL")) return "ligacao";
  if (d.includes("APP")) return "app";
  if (d.includes("WEBSITE") || d.includes("ON_AD")) return "site";
  return d.toLowerCase();
}

function mapStatus(s: string | undefined | null): string | null {
  if (!s) return null;
  const u = String(s).toUpperCase();
  if (u === "ACTIVE") return "ACTIVE";
  if (u === "ARCHIVED" || u === "DELETED") return "ARCHIVED";
  return "PAUSED";
}

// Lê os adsets da CONTA inteira de uma vez (antes era 1 request por campanha,
// limitado a 5 adsets cada) e indexa por campaign_id. Traz o
// `optimization_goal`, que é o que define o "Resultado" de cada campanha.
async function fetchAdsetMeta(
  adAccountId: string,
  campaignIds: string[],
  token: string,
): Promise<Record<string, AdsetMeta>> {
  const out: Record<string, AdsetMeta> = {};
  if (campaignIds.length === 0) return out;
  const querido = new Set(campaignIds);
  try {
    let url: string | null = `${META_GRAPH_URL}/${adAccountId}/adsets?` +
      new URLSearchParams({
        fields:
          "campaign_id,optimization_goal,destination_type,targeting{custom_audiences},promoted_object",
        limit: "500",
        access_token: token,
      });
    let paginas = 0;
    while (url && paginas < 10) {
      const resp: Response = await fetch(url);
      // deno-lint-ignore no-explicit-any
      const json: any = await resp.json();
      if (json.error) {
        console.warn(`fetchAdsetMeta error: ${json.error.message}`);
        break;
      }
      // deno-lint-ignore no-explicit-any
      for (const a of (json.data || []) as any[]) {
        const cid = a.campaign_id;
        if (!cid || !querido.has(cid)) continue;
        const cur = out[cid] ?? { destino: null, remarketing: false, goals: [] };
        if (!cur.destino) cur.destino = mapDestino(a.destination_type);
        const ca = a.targeting?.custom_audiences;
        if (Array.isArray(ca) && ca.length > 0) cur.remarketing = true;
        if (a.optimization_goal && !cur.goals.includes(a.optimization_goal)) {
          cur.goals.push(a.optimization_goal);
        }
        out[cid] = cur;
      }
      url = json.paging?.next ?? null;
      paginas++;
    }
  } catch (e) {
    console.warn(`fetchAdsetMeta failed: ${e}`);
  }
  return out;
}

/** Ordem de preferência de action_types pra uma campanha, derivada dos
 *  optimization_goals dos seus adsets. Sem goal legível → fallback global. */
function resultActionsParaGoals(goals: string[]): string[] {
  const out: string[] = [];
  let conhecido = false;
  for (const g of goals) {
    const lista = GOAL_TO_RESULT_ACTIONS[g];
    if (lista === undefined) continue;
    conhecido = true;
    for (const at of lista) if (!out.includes(at)) out.push(at);
  }
  return conhecido ? out : FALLBACK_RESULT_ACTIONS;
}

function derivarCategoria(
  meta: CampaignMeta | undefined,
  remarketing: boolean,
  campaignName?: string,
  goals: string[] = [],
): string | null {
  const n = (campaignName || "").toUpperCase();
  if (
    remarketing || n.includes("REMARKETING") || n.includes("REMKT") ||
    n.includes("RMKT") || n.includes("RETARGET")
  ) {
    return "remarketing";
  }
  if (
    n.includes("VENDA") || n.includes("SALES") || n.includes("PURCHASE") ||
    n.includes("CONVERSÃO") || n.includes("CONVERSAO")
  ) {
    return "vendas";
  }
  if (
    n.includes("LEAD") || n.includes("ENGAJ") || n.includes("MENSAG") ||
    n.includes("CONVERSA")
  ) {
    return "leads";
  }
  const s = `${meta?.objective || ""} ${goals.join(" ")}`.toUpperCase();
  if (s.includes("SALES") || s.includes("CONVERSION") || s.includes("PURCHASE") || s.includes("VALUE")) {
    return "vendas";
  }
  if (s.includes("LEAD") || s.includes("CONVERSATION") || s.includes("MESSAG") || s.includes("ENGAGEMENT")) {
    return "leads";
  }
  return null;
}

// -----------------------------------------------------------------------------
// AGREGAÇÃO POR CLIENTE
// -----------------------------------------------------------------------------

async function processClient(
  tokenRow: TokenRow,
  exclusionFilters: string[],
  dateStr: string,
): Promise<ClientResult> {
  try {
    const allCampaigns = await fetchCampaignInsights(
      tokenRow.ad_account_id,
      tokenRow.access_token,
      dateStr,
    );

    let campaigns: CampaignRow[];
    if (tokenRow.campaign_filter) {
      const regex = new RegExp(tokenRow.campaign_filter, "i");
      campaigns = allCampaigns.filter((c) => regex.test(c.campaign_name || ""));
    } else if (exclusionFilters.length > 0) {
      const regexes = exclusionFilters.map((f) => new RegExp(f, "i"));
      campaigns = allCampaigns.filter((c) => {
        const name = c.campaign_name || "";
        return !regexes.some((r) => r.test(name));
      });
    } else {
      campaigns = allCampaigns;
    }

    if (campaigns.length === 0) {
      return {
        empresa: tokenRow.empresa,
        ad_account_id: tokenRow.ad_account_id,
        success: true,
        metrics: {
          investimento_real: 0,
          leads_real: 0,
          cpl_real: 0,
          impressoes_real: 0,
          cliques_real: 0,
          alcance_real: 0,
          conversas_real: 0,
          cpm_real: 0,
          sem_atividade: true,
          raw_actions: {},
          campaigns_processadas: 0,
          campaigns_detail: [],
          adsets_detail: [],
          ads_detail: [],
        },
      };
    }

    const campaignIds = campaigns.map((c) => c.campaign_id).filter(Boolean);
    const [campMeta, adsetMeta] = await Promise.all([
      fetchCampaignMeta(campaignIds, tokenRow.access_token),
      fetchAdsetMeta(tokenRow.ad_account_id, campaignIds, tokenRow.access_token),
    ]);
    // Ordem de preferência de "resultado" por campanha (do optimization_goal
    // dos adsets). Reusada nos níveis adset/ad pra manter o mesmo critério.
    const resultActionsPorCampanha: Record<string, string[]> = {};
    for (const cid of campaignIds) {
      resultActionsPorCampanha[cid] = resultActionsParaGoals(
        adsetMeta[cid]?.goals ?? [],
      );
    }

    let totalSpend = 0;
    let totalResults = 0;
    let totalImpressoes = 0;
    let totalCliques = 0;
    let totalAlcance = 0;
    let totalConversas = 0;
    const rawActions: Record<string, number> = {};
    const campaignsDetail: CampaignDetail[] = [];

    for (const camp of campaigns) {
      const spend = parseFloat(camp.spend || "0");
      totalSpend += spend;

      const impressoes = intFrom(camp.impressions);
      const cliques = intFrom(camp.inline_link_clicks) || intFrom(camp.clicks);
      const alcance = intFrom(camp.reach);
      totalImpressoes += impressoes;
      totalCliques += cliques;
      totalAlcance += alcance;

      const meta = campMeta[camp.campaign_id];
      const am = adsetMeta[camp.campaign_id];
      const optGoal = (am?.goals ?? []).join(",");
      const resultActions = resultActionsPorCampanha[camp.campaign_id] ??
        FALLBACK_RESULT_ACTIONS;

      for (const action of camp.actions || []) {
        rawActions[action.action_type] =
          (rawActions[action.action_type] || 0) + parseFloat(action.value || "0");
      }
      const agg = aggregateActions(camp.actions, resultActions);
      totalResults += agg.leads;
      totalConversas += agg.conversas;

      campaignsDetail.push({
        campaign_id: camp.campaign_id,
        campaign_name: camp.campaign_name || "",
        spend: round2(spend),
        leads_atribuidos: agg.leads,
        optimization_goal: optGoal,
        impressoes,
        cliques,
        alcance,
        conversas: agg.conversas,
        categoria: derivarCategoria(
          meta,
          am?.remarketing ?? false,
          camp.campaign_name,
          am?.goals ?? [],
        ),
        destino: am?.destino ?? null,
        compras: agg.compras,
        carrinho: agg.carrinho,
        checkout: agg.checkout,
        view: agg.view,
        landing: agg.landing,
        objetivo: meta?.objective || null,
        status: mapStatus(meta?.effective_status),
      });
    }

    // ===== Nível ADSET + AD (Fase 2b/2c) — defensivo, não derruba a campanha
    const campaignIdSet = new Set(campaignIds);
    let adsetsDetail: AdsetDetail[] = [];
    let adsDetail: AdDetail[] = [];
    try {
      const [adsetRows, adRows] = await Promise.all([
        fetchInsightsLevel(
          tokenRow.ad_account_id, tokenRow.access_token, dateStr, "adset",
          "campaign_id,campaign_name,adset_id,adset_name,spend,actions,impressions,clicks,inline_link_clicks,reach",
        ),
        fetchInsightsLevel(
          tokenRow.ad_account_id, tokenRow.access_token, dateStr, "ad",
          "campaign_id,adset_id,adset_name,ad_id,ad_name,spend,actions,impressions,clicks,inline_link_clicks,reach",
        ),
      ]);
      const adsetsF = (adsetRows as unknown as AdsetRow[]).filter(
        (r) => r.campaign_id && campaignIdSet.has(r.campaign_id) && r.adset_id,
      );
      const adsF = (adRows as unknown as AdRow[]).filter(
        (r) => r.campaign_id && campaignIdSet.has(r.campaign_id) && r.ad_id,
      );
      const statusIds = [
        ...adsetsF.map((r) => r.adset_id as string),
        ...adsF.map((r) => r.ad_id as string),
      ];
      const statuses = await fetchStatuses(statusIds, tokenRow.access_token);
      adsetsDetail = adsetsF.map((r) => {
        const agg = aggregateActions(
          r.actions,
          resultActionsPorCampanha[r.campaign_id as string] ??
            FALLBACK_RESULT_ACTIONS,
        );
        return {
          campaign_id: r.campaign_id as string,
          campaign_name: r.campaign_name || "",
          adset_id: r.adset_id as string,
          adset_name: r.adset_name || "",
          status: statuses[r.adset_id as string] ?? null,
          spend: round2(parseFloat(r.spend || "0")),
          leads: agg.leads, conversas: agg.conversas, compras: agg.compras,
          carrinho: agg.carrinho, checkout: agg.checkout, view: agg.view, landing: agg.landing,
          cliques: intFrom(r.inline_link_clicks) || intFrom(r.clicks),
          impressoes: intFrom(r.impressions),
          alcance: intFrom(r.reach),
        };
      });
      adsDetail = adsF.map((r) => {
        const agg = aggregateActions(
          r.actions,
          resultActionsPorCampanha[r.campaign_id as string] ??
            FALLBACK_RESULT_ACTIONS,
        );
        return {
          campaign_id: r.campaign_id as string,
          adset_id: r.adset_id as string,
          adset_name: r.adset_name || "",
          ad_id: r.ad_id as string,
          ad_name: r.ad_name || "",
          status: statuses[r.ad_id as string] ?? null,
          spend: round2(parseFloat(r.spend || "0")),
          leads: agg.leads, conversas: agg.conversas, compras: agg.compras,
          carrinho: agg.carrinho, checkout: agg.checkout, view: agg.view, landing: agg.landing,
          cliques: intFrom(r.inline_link_clicks) || intFrom(r.clicks),
          todos_cliques: intFrom(r.clicks),
          impressoes: intFrom(r.impressions),
          alcance: intFrom(r.reach),
        };
      });
    } catch (e) {
      console.warn(`adset/ad fetch failed for ${tokenRow.empresa}: ${e}`);
    }

    // ALCANCE: o Meta deduplica pessoas, então somar o reach das campanhas
    // superestima (a mesma pessoa alcançada por 2 campanhas conta 2x) e joga
    // a frequência pra baixo. Quando a conta inteira é deste cliente (sem
    // filtro de campanha), pegamos o reach agregado no nível da CONTA — que é
    // exatamente o número do Gerenciador. Em conta compartilhada não dá pra
    // deduplicar por cliente; aí o somatório segue como aproximação.
    if (!tokenRow.campaign_filter && exclusionFilters.length === 0) {
      try {
        const contaRows = await fetchInsightsLevel(
          tokenRow.ad_account_id, tokenRow.access_token, dateStr, "account", "reach",
        );
        const r = intFrom((contaRows[0] as { reach?: string })?.reach);
        if (r > 0) totalAlcance = r;
      } catch (e) {
        console.warn(`reach nível conta falhou (${tokenRow.empresa}): ${e}`);
      }
    }

    const cpl = totalResults > 0 ? totalSpend / totalResults : 0;
    const cpm = totalImpressoes > 0 ? (totalSpend / totalImpressoes) * 1000 : 0;

    return {
      empresa: tokenRow.empresa,
      ad_account_id: tokenRow.ad_account_id,
      success: true,
      metrics: {
        investimento_real: round2(totalSpend),
        leads_real: Math.round(totalResults),
        cpl_real: round2(cpl),
        impressoes_real: totalImpressoes,
        cliques_real: totalCliques,
        alcance_real: totalAlcance,
        conversas_real: Math.round(totalConversas),
        cpm_real: round2(cpm),
        sem_atividade: totalSpend === 0 && totalResults === 0,
        raw_actions: rawActions,
        campaigns_processadas: campaigns.length,
        campaigns_detail: campaignsDetail,
        adsets_detail: adsetsDetail,
        ads_detail: adsDetail,
      },
    };
  } catch (e) {
    return {
      empresa: tokenRow.empresa,
      ad_account_id: tokenRow.ad_account_id,
      success: false,
      error: String(e),
    };
  }
}

// -----------------------------------------------------------------------------
// SUPABASE: UPSERT + ANOMALIAS
// -----------------------------------------------------------------------------

async function upsertResult(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  dateStr: string,
  result: ClientResult,
): Promise<void> {
  if (!result.success || !result.metrics) return;
  const { data: existing } = await supabase
    .from("dados_diarios_log")
    .select("investimento_real, leads_real, cpl_real")
    .eq("empresa", result.empresa)
    .eq("data", dateStr)
    .eq("origem", "pago")
    .maybeSingle();

  // deno-lint-ignore no-explicit-any
  const row: any = {
    empresa: result.empresa,
    data: dateStr,
    origem: "pago",
    preenchedor_id: SENTINELA_PREENCHEDOR_ID,
    preenchedor_nome: "Sentinela Anomalo",
    investimento_real: result.metrics.investimento_real,
    leads_real: result.metrics.leads_real,
    cpl_real: result.metrics.cpl_real,
    impressoes_real: result.metrics.impressoes_real,
    cliques_real: result.metrics.cliques_real,
    alcance_real: result.metrics.alcance_real,
    conversas_real: result.metrics.conversas_real,
    cpm_real: result.metrics.cpm_real,
    // Limpa a marca da ponte MCP: se este dia tinha sido preenchido pelo
    // bridge (coleta_status='mcp'/'mcp_disabled'), o reprocessamento pela
    // Sentinela oficial passa a ser a fonte da verdade e o badge "via MCP"
    // some. Sem isto o upsert só sobrescrevia as métricas e a linha seguia
    // marcada como aproximada pra sempre.
    coleta_status: null,
  };
  if (existing) {
    row.investimento_anterior = existing.investimento_real;
    row.leads_anterior = existing.leads_real;
    row.cpl_anterior = existing.cpl_real;
  }
  const { error } = await supabase
    .from("dados_diarios_log")
    .upsert(row, { onConflict: "empresa,data,origem" });
  if (error) throw new Error(`UPSERT failed for ${result.empresa}: ${error.message}`);
}

async function upsertCampanhas(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  dateStr: string,
  result: ClientResult,
): Promise<void> {
  if (!result.success || !result.metrics?.campaigns_detail) return;
  try {
    const rows = result.metrics.campaigns_detail
      .filter((c) => c.campaign_id)
      .map((c) => ({
        empresa_nome: result.empresa,
        cliente_nome: null,
        data: dateStr,
        origem: "pago",
        campanha_id: c.campaign_id,
        campanha_nome: c.campaign_name,
        categoria: c.categoria,
        destino: c.destino,
        investimento_real: c.spend,
        leads_real: c.leads_atribuidos,
        conversas_real: c.conversas,
        cliques_real: c.cliques,
        impressoes_real: c.impressoes,
        alcance_real: c.alcance,
        cpl_real: c.leads_atribuidos > 0 ? round2(c.spend / c.leads_atribuidos) : 0,
        status: c.status,
        objetivo: c.objetivo,
        compras_real: c.compras,
        carrinho_real: c.carrinho,
        checkout_real: c.checkout,
        view_real: c.view,
        landing_real: c.landing,
      }));
    if (rows.length === 0) return;
    const { error } = await supabase
      .from("dados_diarios_campanha")
      .upsert(rows, { onConflict: "empresa_nome,data,origem,campanha_id" });
    if (error) console.warn(`upsertCampanhas error: ${error.message}`);
  } catch (e) {
    console.warn(`upsertCampanhas failed: ${e}`);
  }
}

async function upsertAdsets(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  dateStr: string,
  result: ClientResult,
): Promise<void> {
  if (!result.success || !result.metrics?.adsets_detail) return;
  try {
    const rows = result.metrics.adsets_detail
      .filter((a) => a.adset_id)
      .map((a) => ({
        empresa_nome: result.empresa,
        cliente_nome: null,
        data: dateStr,
        origem: "pago",
        campanha_id: a.campaign_id,
        campanha_nome: a.campaign_name,
        adset_id: a.adset_id,
        adset_nome: a.adset_name,
        status: a.status,
        investimento_real: a.spend,
        leads_real: a.leads,
        conversas_real: a.conversas,
        compras_real: a.compras,
        carrinho_real: a.carrinho,
        checkout_real: a.checkout,
        view_real: a.view,
        landing_real: a.landing,
        cliques_real: a.cliques,
        impressoes_real: a.impressoes,
        alcance_real: a.alcance,
        cpl_real: a.leads > 0 ? round2(a.spend / a.leads) : 0,
      }));
    if (rows.length === 0) return;
    const { error } = await supabase
      .from("dados_diarios_adset")
      .upsert(rows, { onConflict: "empresa_nome,data,origem,adset_id" });
    if (error) console.warn(`upsertAdsets error: ${error.message}`);
  } catch (e) {
    console.warn(`upsertAdsets failed: ${e}`);
  }
}

async function upsertAds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  dateStr: string,
  result: ClientResult,
): Promise<void> {
  if (!result.success || !result.metrics?.ads_detail) return;
  try {
    const rows = result.metrics.ads_detail
      .filter((a) => a.ad_id)
      .map((a) => ({
        empresa_nome: result.empresa,
        cliente_nome: null,
        data: dateStr,
        origem: "pago",
        campanha_id: a.campaign_id,
        adset_id: a.adset_id,
        adset_nome: a.adset_name,
        ad_id: a.ad_id,
        ad_nome: a.ad_name,
        criativo_tipo: null,
        status: a.status,
        investimento_real: a.spend,
        leads_real: a.leads,
        conversas_real: a.conversas,
        compras_real: a.compras,
        carrinho_real: a.carrinho,
        checkout_real: a.checkout,
        view_real: a.view,
        landing_real: a.landing,
        cliques_real: a.cliques,
        todos_cliques_real: a.todos_cliques,
        impressoes_real: a.impressoes,
        alcance_real: a.alcance,
        cpl_real: a.leads > 0 ? round2(a.spend / a.leads) : 0,
      }));
    if (rows.length === 0) return;
    const { error } = await supabase
      .from("dados_diarios_ad")
      .upsert(rows, { onConflict: "empresa_nome,data,origem,ad_id" });
    if (error) console.warn(`upsertAds error: ${error.message}`);
  } catch (e) {
    console.warn(`upsertAds failed: ${e}`);
  }
}

/**
 * Consolida os resultados de TODAS as contas de anúncio de uma mesma empresa
 * numa única linha (ver comentário no handler). Cumulativos somam; derivadas
 * (CPL, CPM) são recalculadas dos totais — nunca médias de médias.
 *
 * Se QUALQUER conta da empresa falhar, a empresa inteira é marcada como falha
 * e nada é gravado: melhor não ter dado do que gravar um número parcial que
 * parece completo (e que o upsert cravaria por cima do valor bom).
 */
function consolidarResultados(
  empresa: string,
  parciais: ClientResult[],
): ClientResult {
  if (parciais.length === 1) return parciais[0];

  const falhou = parciais.find((p) => !p.success || !p.metrics);
  if (falhou) {
    return {
      empresa,
      ad_account_id: parciais.map((p) => p.ad_account_id).join(","),
      success: false,
      error: `conta ${falhou.ad_account_id}: ${falhou.error ?? "sem métricas"}`,
    };
  }

  const m = parciais.map((p) => p.metrics!);
  const soma = (f: (x: ClientMetrics) => number) =>
    m.reduce((s, x) => s + f(x), 0);

  const investimento = round2(soma((x) => x.investimento_real));
  const leads = soma((x) => x.leads_real);
  const impressoes = soma((x) => x.impressoes_real);
  const rawActions: Record<string, number> = {};
  for (const x of m) {
    for (const [k, v] of Object.entries(x.raw_actions)) {
      rawActions[k] = (rawActions[k] || 0) + v;
    }
  }

  return {
    empresa,
    ad_account_id: parciais.map((p) => p.ad_account_id).join(","),
    success: true,
    metrics: {
      investimento_real: investimento,
      leads_real: leads,
      cpl_real: leads > 0 ? round2(investimento / leads) : 0,
      impressoes_real: impressoes,
      cliques_real: soma((x) => x.cliques_real),
      // Alcance de contas diferentes não é deduplicável pela API — soma é o
      // melhor disponível (superestima se houver sobreposição de público).
      alcance_real: soma((x) => x.alcance_real),
      conversas_real: soma((x) => x.conversas_real),
      cpm_real: impressoes > 0 ? round2((investimento / impressoes) * 1000) : 0,
      sem_atividade: m.every((x) => x.sem_atividade),
      raw_actions: rawActions,
      campaigns_processadas: soma((x) => x.campaigns_processadas),
      campaigns_detail: m.flatMap((x) => x.campaigns_detail ?? []),
      adsets_detail: m.flatMap((x) => x.adsets_detail ?? []),
      ads_detail: m.flatMap((x) => x.ads_detail ?? []),
    },
  };
}

async function detectAnomalies(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  empresa: string,
  dateStr: string,
  current: ClientMetrics,
): Promise<Anomaly[]> {
  const baseDate = new Date(`${dateStr}T00:00:00Z`);
  const startDate = new Date(baseDate.getTime() - HISTORICAL_WINDOW_DAYS * 86400 * 1000);
  const startStr = startDate.toISOString().slice(0, 10);

  const { data: hist } = await supabase
    .from("dados_diarios_log")
    .select("leads_real, cpl_real, investimento_real")
    .eq("empresa", empresa)
    .eq("origem", "pago")
    .gte("data", startStr)
    .lt("data", dateStr);

  if (!hist || hist.length < 3) return [];
  // deno-lint-ignore no-explicit-any
  const validLeads = hist.filter((r: any) => r.leads_real !== null);
  // deno-lint-ignore no-explicit-any
  const validCpl = hist.filter((r: any) => r.cpl_real !== null && r.cpl_real > 0);
  if (validLeads.length === 0) return [];
  // deno-lint-ignore no-explicit-any
  const avgLeads = validLeads.reduce((s: number, r: any) => s + r.leads_real, 0) / validLeads.length;
  const avgCpl = validCpl.length > 0
    // deno-lint-ignore no-explicit-any
    ? validCpl.reduce((s: number, r: any) => s + r.cpl_real, 0) / validCpl.length
    : 0;

  const anomalies: Anomaly[] = [];
  if (avgLeads > 0 && current.leads_real > avgLeads * ANOMALY_LEADS_POSITIVE) {
    anomalies.push({ empresa, tipo: "positiva", metrica: "leads_real", valor_atual: current.leads_real, media_7dias: round2(avgLeads), variacao_percentual: pct(current.leads_real, avgLeads) });
  }
  if (avgLeads > 0 && current.leads_real < avgLeads * ANOMALY_LEADS_NEGATIVE) {
    anomalies.push({ empresa, tipo: "negativa", metrica: "leads_real", valor_atual: current.leads_real, media_7dias: round2(avgLeads), variacao_percentual: pct(current.leads_real, avgLeads) });
  }
  if (avgCpl > 0 && current.cpl_real > avgCpl * ANOMALY_CPL_NEGATIVE) {
    anomalies.push({ empresa, tipo: "negativa", metrica: "cpl_real", valor_atual: current.cpl_real, media_7dias: round2(avgCpl), variacao_percentual: pct(current.cpl_real, avgCpl) });
  }
  if (current.investimento_real > 0 && current.leads_real === 0 && avgLeads > 0) {
    anomalies.push({ empresa, tipo: "critica", metrica: "leads_zero_com_investimento", valor_atual: 0, media_7dias: round2(avgLeads), variacao_percentual: -100 });
  }
  return anomalies;
}

// -----------------------------------------------------------------------------
// HANDLER
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (SENTINELA_SECRET || SENTINELA_CRON_SECRET) {
    const provided = req.headers.get("x-sentinela-secret") ?? "";
    const ok = (!!SENTINELA_SECRET && provided === SENTINELA_SECRET) ||
      (!!SENTINELA_CRON_SECRET && provided === SENTINELA_CRON_SECRET);
    if (!ok) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("data") || getYesterdayBRT();
  const dryRun = url.searchParams.get("dry_run") === "1";

  const { data: tokens, error: tokensErr } = await supabase
    .from("tokens_meta")
    .select("empresa, ad_account_id, access_token, tipo_conversao, campaign_filter")
    .eq("ativo", true)
    .order("empresa");

  if (tokensErr || !tokens || tokens.length === 0) {
    await supabase.from("logs_sentinela").insert({
      total_contas_processadas: 0,
      total_contas_falhas: 0,
      anomalias_detectadas: [],
      contas_sem_atividade: [],
      erros_de_leitura: [{ erro: tokensErr?.message || "no tokens" }],
      status: "falha",
    });
    return new Response(
      JSON.stringify({ status: "falha", erro: tokensErr?.message || "no tokens" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const results: ClientResult[] = [];
  const allAnomalies: Anomaly[] = [];
  const semAtividade: { empresa: string }[] = [];
  const erros: { empresa: string; error: string }[] = [];
  let totalSpend = 0;
  let totalLeads = 0;
  let processadas = 0;
  let falhas = 0;

  const filtersByAccount: Record<string, string[]> = {};
  for (const t of tokens) {
    if (!filtersByAccount[t.ad_account_id]) filtersByAccount[t.ad_account_id] = [];
    if (t.campaign_filter) filtersByAccount[t.ad_account_id].push(t.campaign_filter);
  }

  // Uma empresa pode ter VÁRIAS linhas em tokens_meta (UNIQUE é
  // empresa+ad_account_id), ex.: um cliente que roda anúncios na própria BM
  // E dentro da conta compartilhada do Hub. Como dados_diarios_log tem UNIQUE
  // (empresa, data, origem), gravar token a token fazia a 2ª conta
  // SOBRESCREVER a 1ª em vez de somar — o cliente perdia o gasto de uma das
  // contas silenciosamente. Por isso agrupamos por empresa e só gravamos
  // depois de consolidar todas as contas dela.
  const tokensPorEmpresa = new Map<string, TokenRow[]>();
  for (const t of tokens as TokenRow[]) {
    const lista = tokensPorEmpresa.get(t.empresa);
    if (lista) lista.push(t);
    else tokensPorEmpresa.set(t.empresa, [t]);
  }

  // ORDEM DE PROCESSAMENTO = a ordem que o time definiu em "Gerenciar
  // empresas" (empresas_config.ordem). As contas são processadas uma a uma;
  // com a ordem alfabética anterior, a empresa mais importante podia ser a
  // última a atualizar. Empresa sem linha em empresas_config (ou se a leitura
  // falhar) vai pro fim, em ordem alfabética — nunca deixa de ser processada.
  const { data: ordemEmpresas } = await supabase
    .from("empresas_config")
    .select("nome, ordem")
    .order("ordem");
  const posicao = new Map<string, number>();
  for (const e of (ordemEmpresas ?? []) as { nome: string; ordem: number }[]) {
    posicao.set(e.nome, e.ordem);
  }
  const empresasOrdenadas = [...tokensPorEmpresa.entries()].sort((a, b) => {
    const pa = posicao.get(a[0]) ?? Number.MAX_SAFE_INTEGER;
    const pb = posicao.get(b[0]) ?? Number.MAX_SAFE_INTEGER;
    return pa - pb || a[0].localeCompare(b[0]);
  });

  for (const [empresa, tokensDaEmpresa] of empresasOrdenadas) {
    const parciais: ClientResult[] = [];
    for (const token of tokensDaEmpresa) {
      const exclusionFilters = token.campaign_filter
        ? []
        : filtersByAccount[token.ad_account_id] || [];
      parciais.push(await processClient(token, exclusionFilters, dateStr));
    }
    const result = consolidarResultados(empresa, parciais);
    results.push(result);

    if (result.success && result.metrics) {
      if (!dryRun) {
        try {
          await upsertResult(supabase, dateStr, result);
          await upsertCampanhas(supabase, dateStr, result);
          await upsertAdsets(supabase, dateStr, result);
          await upsertAds(supabase, dateStr, result);
          const anomalies = await detectAnomalies(supabase, result.empresa, dateStr, result.metrics);
          allAnomalies.push(...anomalies);
        } catch (e) {
          falhas++;
          erros.push({ empresa: result.empresa, error: `UPSERT/anomaly failed: ${e}` });
          continue;
        }
      }
      totalSpend += result.metrics.investimento_real;
      totalLeads += result.metrics.leads_real;
      processadas++;
      if (result.metrics.sem_atividade) semAtividade.push({ empresa: result.empresa });
    } else {
      falhas++;
      erros.push({ empresa: result.empresa, error: result.error || "unknown" });
    }
  }

  const cplMedioPond = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const status: "sucesso" | "parcial" | "falha" =
    falhas === 0 ? "sucesso" : processadas === 0 ? "falha" : "parcial";

  if (!dryRun) {
    await supabase.from("logs_sentinela").insert({
      total_contas_processadas: processadas,
      total_contas_falhas: falhas,
      investimento_total: round2(totalSpend),
      leads_totais: totalLeads,
      cpl_medio_ponderado: round2(cplMedioPond),
      anomalias_detectadas: allAnomalies,
      contas_sem_atividade: semAtividade,
      erros_de_leitura: erros,
      status,
    });
  }

  return new Response(
    JSON.stringify({
      status,
      data_referencia: dateStr,
      dry_run: dryRun,
      totais: {
        contas_processadas: processadas,
        contas_falhas: falhas,
        investimento_total: round2(totalSpend),
        leads_totais: totalLeads,
        cpl_medio_ponderado: round2(cplMedioPond),
      },
      clientes: results.map((r) => ({
        empresa: r.empresa,
        ad_account_id: r.ad_account_id,
        success: r.success,
        adsets: r.metrics?.adsets_detail?.length ?? 0,
        ads: r.metrics?.ads_detail?.length ?? 0,
        error: r.error,
      })),
      anomalias: allAnomalies,
      contas_sem_atividade: semAtividade,
      erros,
    }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});
