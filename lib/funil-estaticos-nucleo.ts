// =============================================================================
// Funil Estáticos Meta — regras PURAS (sem banco, sem crypto, sem DOM).
// Seguro para o browser e coberto por lib/funil-estaticos.test.ts.
// =============================================================================

export const FUNIL_CHAVE = "estaticos_meta"
export const FUNIL_SLUG_PADRAO = "estaticos-meta"

export type Interesse = "marketing" | "sistema" | "ambos"
export type ModoCampo = "oculto" | "opcional" | "obrigatorio"

export interface Opcao { id: string; texto: string; pontos?: number; interesse?: Interesse | null }
export interface Pergunta { id: string; texto: string; objetivo?: string; opcoes: Opcao[] }
export interface Textos {
  titulo: string; subtitulo: string; contato_titulo: string; contato_cta: string
  agenda_titulo: string; agenda_subtitulo: string; sem_horarios: string
  confirmacao_titulo: string; confirmacao_texto: string; inativo: string
}
export interface DefinicaoFunil {
  avanco_automatico: boolean
  textos: Textos
  contato: { email: ModoCampo; instagram: Exclude<ModoCampo, "obrigatorio"> }
  perguntas: Pergunta[]
}

export const QUALIFICACOES = ["nao_avaliado", "baixa", "media", "alta", "qualificado", "nao_qualificado"] as const
export type Qualificacao = (typeof QUALIFICACOES)[number]
export const ROTULO_QUALIFICACAO: Record<Qualificacao, string> = {
  nao_avaliado: "Não avaliado", baixa: "Baixa prioridade", media: "Média prioridade",
  alta: "Alta prioridade", qualificado: "Qualificado", nao_qualificado: "Não qualificado",
}

export const STATUS_COMERCIAL = [
  "lead_recebido", "aguardando_contato", "em_qualificacao", "nao_agendou", "reuniao_agendada",
  "reuniao_realizada", "nao_compareceu", "reagendamento", "proposta_enviada", "em_negociacao",
  "venda_realizada", "lead_perdido",
] as const
export type StatusComercial = (typeof STATUS_COMERCIAL)[number]
export const ROTULO_STATUS_COMERCIAL: Record<StatusComercial, string> = {
  lead_recebido: "Lead recebido", aguardando_contato: "Aguardando contato", em_qualificacao: "Em qualificação",
  nao_agendou: "Não agendou", reuniao_agendada: "Reunião agendada", reuniao_realizada: "Reunião realizada",
  nao_compareceu: "Não compareceu", reagendamento: "Reagendamento", proposta_enviada: "Proposta enviada",
  em_negociacao: "Em negociação", venda_realizada: "Venda realizada", lead_perdido: "Lead perdido",
}
/** Estágios que implicam "chegou pelo menos até aqui" (para o funil). */
const ORDEM_COMERCIAL: Record<StatusComercial, number> = {
  lead_recebido: 0, aguardando_contato: 0, em_qualificacao: 0, nao_agendou: 0, lead_perdido: 0,
  reuniao_agendada: 1, reagendamento: 1, nao_compareceu: 1, reuniao_realizada: 2,
  proposta_enviada: 3, em_negociacao: 3, venda_realizada: 4,
}
export function chegouEmProposta(s: StatusComercial): boolean { return ORDEM_COMERCIAL[s] >= 3 }

// -----------------------------------------------------------------------------
// Atribuição
// -----------------------------------------------------------------------------

/** Parâmetros aceitos da URL. Tudo é guardado como string (IDs da Meta incluídos). */
export const PARAMS_ATRIBUICAO = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "campaign_id", "adset_id", "ad_id", "placement", "site_source_name", "fbclid", "creative_id",
] as const
export type ParamAtribuicao = (typeof PARAMS_ATRIBUICAO)[number]
export type Atribuicao = Partial<Record<ParamAtribuicao | "referer_host" | "first_seen_at", string>>

const PARAM_SEGURO = /^[\p{L}\p{N} ._\-:|/+()[\]{}#@!,;=~%]{1,200}$/u

/** Limpa parâmetros de rastreamento. Nunca inventa valor ausente. */
export function sanitizarAtribuicao(entrada: Record<string, unknown>): Atribuicao {
  const out: Atribuicao = {}
  for (const k of PARAMS_ATRIBUICAO) {
    const v = entrada[k]
    if (typeof v !== "string") continue
    const t = v.trim()
    if (!t || t.length > (k === "fbclid" ? 500 : 200)) continue
    if (k === "fbclid" ? !/^[A-Za-z0-9_-]{10,500}$/.test(t) : !PARAM_SEGURO.test(t)) continue
    // Macro não substituída pelo Gerenciador ({{ad.id}}) não é dado.
    if (/\{\{.*\}\}/.test(t)) continue
    if (["campaign_id", "adset_id", "ad_id"].includes(k) && !/^[0-9]{3,25}$/.test(t)) continue
    out[k] = t
  }
  return out
}

export type CanalOrigem = "meta_pago" | "outro_pago" | "organico" | "direto" | "nao_identificado"
export function classificarOrigem(a: Atribuicao): CanalOrigem {
  const src = (a.utm_source ?? a.site_source_name ?? "").toLowerCase()
  const med = (a.utm_medium ?? "").toLowerCase()
  const pago = /paid|cpc|ppc|ads?$/.test(med)
  if (a.fbclid || a.ad_id || a.adset_id || a.campaign_id || (pago && /^(fb|ig|an|msg|facebook|instagram|meta|threads)/.test(src))) return "meta_pago"
  if (pago) return "outro_pago"
  if (src) return "organico"
  if (a.referer_host) return "organico"
  return Object.keys(a).length === 0 ? "direto" : "nao_identificado"
}

/** O valor do criativo: código manual (E01) via creative_id/utm_content, ou ad_id cadastrado. */
export function resolverCriativo(a: Atribuicao, criativos: { id: string; codigo: string; meta_ad_id: string | null }[]): string | null {
  if (a.ad_id) { const c = criativos.find(x => x.meta_ad_id === a.ad_id); if (c) return c.id }
  for (const v of [a.creative_id, a.utm_content]) {
    if (!v) continue
    const c = criativos.find(x => x.codigo.toUpperCase() === v.toUpperCase() || (x.meta_ad_id && x.meta_ad_id === v))
    if (c) return c.id
  }
  return null
}

/** Valor de _fbc derivado de fbclid (formato documentado pela Meta). Só com fbclid real. */
export function fbcDeFbclid(fbclid: string | undefined, agoraMs: number): string | null {
  if (!fbclid || !/^[A-Za-z0-9_-]{10,500}$/.test(fbclid)) return null
  return `fb.1.${agoraMs}.${fbclid}`
}

/** Parâmetros recomendados no campo "Parâmetros de URL" do anúncio. */
export const PARAMETROS_META_ADS =
  "utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}" +
  "&utm_term={{adset.id}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}"

// -----------------------------------------------------------------------------
// Contato
// -----------------------------------------------------------------------------

export function validarNomeLead(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 120 || /[<>\u0000-\u001f\u007f-\u009f]/u.test(v)) return null
  const nome = v.normalize("NFC").replace(/\s+/g, " ").trim()
  return nome.length >= 2 && /^[\p{L}\p{M} .'-]+$/u.test(nome) && /\p{L}/u.test(nome) ? nome : null
}
/** Telefone brasileiro → E.164 (+55DDNNNNNNNNN). Celular exige o 9. */
export function validarWhatsappLead(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 30 || /[^+()\d\s.-]/.test(v)) return null
  let d = v.replace(/\D/g, "")
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.startsWith("0")) d = d.slice(1)
  if (!/^[1-9][0-9]([2-9][0-9]{7}|9[0-9]{8})$/.test(d)) return null
  return `+55${d}`
}
export function validarEmailLead(v: unknown): string | null | false {
  if (v === undefined || v === null || v === "") return null
  if (typeof v !== "string") return false
  const e = v.trim().toLowerCase()
  return e.length <= 160 && /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/.test(e) ? e : false
}
export function validarInstagram(v: unknown): string | null | false {
  if (v === undefined || v === null || v === "") return null
  if (typeof v !== "string") return false
  const h = v.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "")
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : false
}
export function mascararTelefone(e164: string): string {
  const d = e164.replace(/^\+55/, "")
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
}

// -----------------------------------------------------------------------------
// Definição do formulário (editor + publicação)
// -----------------------------------------------------------------------------

const ID = /^[a-z0-9_]{1,40}$/
const TEXTO_LIVRE = (s: unknown, max: number) => typeof s === "string" && s.trim().length > 0 && s.length <= max && !/[<>]/.test(s)

/** Valida antes de publicar. Devolve a lista de problemas (vazia = ok). */
export function validarDefinicao(d: unknown): string[] {
  const erros: string[] = []
  if (!d || typeof d !== "object") return ["Definição ausente."]
  const def = d as DefinicaoFunil
  if (!Array.isArray(def.perguntas) || def.perguntas.length < 1 || def.perguntas.length > 8) erros.push("Use de 1 a 8 perguntas.")
  const ids = new Set<string>()
  for (const [i, p] of (def.perguntas ?? []).entries()) {
    const n = `Pergunta ${i + 1}`
    if (!p || !ID.test(p.id ?? "")) erros.push(`${n}: identificador inválido (a-z, 0-9, _).`)
    else if (ids.has(p.id)) erros.push(`${n}: identificador repetido (${p.id}).`)
    else ids.add(p.id)
    if (!TEXTO_LIVRE(p?.texto, 200)) erros.push(`${n}: texto obrigatório (até 200 caracteres, sem < >).`)
    if (!Array.isArray(p?.opcoes) || p.opcoes.length < 2 || p.opcoes.length > 8) { erros.push(`${n}: use de 2 a 8 alternativas.`); continue }
    const oids = new Set<string>()
    for (const [j, o] of p.opcoes.entries()) {
      if (!o || !ID.test(o.id ?? "") || oids.has(o.id)) erros.push(`${n}, alternativa ${j + 1}: identificador inválido ou repetido.`)
      else oids.add(o.id)
      if (!TEXTO_LIVRE(o?.texto, 160)) erros.push(`${n}, alternativa ${j + 1}: texto obrigatório (até 160).`)
      if (o?.pontos !== undefined && (!Number.isInteger(o.pontos) || o.pontos < -10 || o.pontos > 10)) erros.push(`${n}, alternativa ${j + 1}: pontos entre -10 e 10.`)
      if (o?.interesse != null && !["marketing", "sistema", "ambos"].includes(o.interesse)) erros.push(`${n}, alternativa ${j + 1}: interesse inválido.`)
    }
  }
  const t = def.textos as unknown as Record<string, unknown> | undefined
  const chaves: (keyof Textos)[] = ["titulo", "subtitulo", "contato_titulo", "contato_cta", "agenda_titulo", "agenda_subtitulo", "sem_horarios", "confirmacao_titulo", "confirmacao_texto", "inativo"]
  for (const k of chaves) if (!TEXTO_LIVRE(t?.[k], 400)) erros.push(`Texto "${k}" obrigatório (até 400 caracteres, sem < >).`)
  if (!["oculto", "opcional", "obrigatorio"].includes(def.contato?.email)) erros.push("Campo e-mail: modo inválido.")
  if (!["oculto", "opcional"].includes(def.contato?.instagram)) erros.push("Campo Instagram: modo inválido.")
  if (typeof def.avanco_automatico !== "boolean") erros.push("Avanço automático precisa ser sim/não.")
  return erros
}

/** Pontuação/interesse a partir das respostas (só opções que existem na versão). */
export function avaliarRespostas(def: DefinicaoFunil, respostas: Record<string, string>, regra: { ativo?: boolean; alta?: number; media?: number }) {
  let pontos = 0
  let interesse: Interesse | null = null
  for (const p of def.perguntas) {
    const o = p.opcoes.find(x => x.id === respostas[p.id])
    if (!o) continue
    pontos += o.pontos ?? 0
    if (o.interesse) interesse = interesse && interesse !== o.interesse ? "ambos" : o.interesse
  }
  let qualificacao: Qualificacao = "nao_avaliado"
  if (regra?.ativo) {
    const alta = Number.isFinite(regra.alta) ? Number(regra.alta) : Infinity
    const media = Number.isFinite(regra.media) ? Number(regra.media) : Infinity
    qualificacao = pontos >= alta ? "alta" : pontos >= media ? "media" : "baixa"
  }
  return { pontos, interesse, qualificacao }
}

/** Mantém só respostas válidas para a versão apresentada. */
export function filtrarRespostas(def: DefinicaoFunil, entrada: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!entrada || typeof entrada !== "object") return out
  for (const p of def.perguntas) {
    const v = (entrada as Record<string, unknown>)[p.id]
    if (typeof v === "string" && p.opcoes.some(o => o.id === v)) out[p.id] = v
  }
  return out
}

// -----------------------------------------------------------------------------
// Eventos internos
// -----------------------------------------------------------------------------

/** Eventos que o NAVEGADOR pode registrar. Os de negócio (lead_created,
 *  booking_confirmed, meeting_*) só o servidor/banco grava. */
export const EVENTOS_CLIENTE = [
  "funnel_page_view", "funnel_started", "question_viewed", "question_answered", "question_completed",
  "question_back", "contact_form_viewed", "contact_submitted", "booking_page_viewed", "booking_no_slots",
  "booking_slot_selected", "booking_failed", "client_error",
] as const
export type EventoCliente = (typeof EVENTOS_CLIENTE)[number]

// -----------------------------------------------------------------------------
// Métricas do dashboard (calculadas sobre linhas reais; nunca estima)
// -----------------------------------------------------------------------------

export interface SessaoMetrica {
  id: string; criativo_id: string | null; canal_origem: string; aberta_em: string
  iniciada_em: string | null; perguntas_concluidas: number; contato_em: string | null
  agenda_vista_em: string | null; horario_selecionado_em: string | null; agendada_em: string | null
  abandonada: boolean; etapa_abandono: string | null; lead_id: string | null; agendamento_id: string | null
  respostas_em?: Record<string, string> | null
}
export interface LeadMetrica { id: string; criativo_id: string | null; qualificacao: Qualificacao; status_comercial: StatusComercial; valor_venda: number | null }
export interface ReuniaoMetrica { id: string; status: string; fim: string | null }

export type Taxa = { valor: number | null; num: number; den: number }
export function taxa(num: number, den: number): Taxa { return { valor: den > 0 ? num / den : null, num, den } }

export interface Etapa { chave: string; rotulo: string; qtd: number }

export function calcularFunil(sessoes: SessaoMetrica[], nPerguntas: number, leads: LeadMetrica[], reunioes: Map<string, ReuniaoMetrica>, agora = new Date()) {
  const s = sessoes
  const iniciadas = s.filter(x => x.iniciada_em).length
  const porPergunta = Array.from({ length: nPerguntas }, (_, i) => s.filter(x => x.perguntas_concluidas >= i + 1).length)
  const comContato = s.filter(x => x.contato_em).length
  const agendaVista = s.filter(x => x.agenda_vista_em).length
  const selecionou = s.filter(x => x.horario_selecionado_em).length
  const agendadas = s.filter(x => x.agendamento_id)
  const reunioesDaCoorte = agendadas.map(x => reunioes.get(x.agendamento_id!)).filter(Boolean) as ReuniaoMetrica[]
  const realizadas = reunioesDaCoorte.filter(r => r.status === "realizada").length
  // Comparecimento: só reuniões que JÁ terminaram e não foram canceladas.
  const elegiveisComparecimento = reunioesDaCoorte.filter(r => r.status !== "cancelada" && r.fim && Date.parse(r.fim) < agora.getTime()).length
  const leadIds = new Set(s.map(x => x.lead_id).filter(Boolean) as string[])
  const leadsCoorte = leads.filter(l => leadIds.has(l.id))
  const naoCompareceu = leadsCoorte.filter(l => l.status_comercial === "nao_compareceu").length
  const propostas = leadsCoorte.filter(l => chegouEmProposta(l.status_comercial)).length
  const vendas = leadsCoorte.filter(l => l.status_comercial === "venda_realizada")
  const receita = vendas.reduce((a, l) => a + (l.valor_venda ?? 0), 0)
  const leadsAgendados = new Set(agendadas.map(x => x.lead_id).filter(Boolean)).size
  const qualificados = leadsCoorte.filter(l => l.qualificacao === "qualificado" || l.qualificacao === "alta").length

  const etapas: Etapa[] = [
    { chave: "entrada", rotulo: "Entrada", qtd: s.length },
    { chave: "inicio", rotulo: "Início", qtd: iniciadas },
    ...porPergunta.map((q, i) => ({ chave: `p${i + 1}`, rotulo: `Pergunta ${String(i + 1).padStart(2, "0")}`, qtd: q })),
    { chave: "lead", rotulo: "Lead", qtd: comContato },
    { chave: "agenda", rotulo: "Agenda", qtd: agendaVista },
    { chave: "horario", rotulo: "Horário selecionado", qtd: selecionou },
    { chave: "agendada", rotulo: "Reunião agendada", qtd: agendadas.length },
    { chave: "realizada", rotulo: "Reunião realizada", qtd: realizadas },
    { chave: "proposta", rotulo: "Proposta", qtd: propostas },
    { chave: "venda", rotulo: "Venda", qtd: vendas.length },
  ]
  // Abandono por etapa: só sessões marcadas como abandonadas por inatividade.
  const abandonoPorEtapa: Record<string, number> = {}
  for (const x of s) if (x.abandonada) abandonoPorEtapa[x.etapa_abandono ?? "?"] = (abandonoPorEtapa[x.etapa_abandono ?? "?"] ?? 0) + 1

  return {
    etapas, abandonoPorEtapa,
    contagens: { sessoes: s.length, iniciadas, comContato, leadsUnicos: leadIds.size, agendaVista, selecionou,
      agendadas: agendadas.length, realizadas, naoCompareceu, propostas, vendas: vendas.length, receita, qualificados },
    taxas: {
      inicio: taxa(iniciadas, s.length),
      conclusaoPerguntas: taxa(porPergunta[nPerguntas - 1] ?? 0, iniciadas),
      captura: taxa(comContato, s.length),
      agendamento: taxa(leadsAgendados, leadIds.size),
      comparecimento: taxa(realizadas, elegiveisComparecimento),
      fechamento: taxa(vendas.length, propostas),
    },
    tempos: {
      inicioAteLead: mediana(s.filter(x => x.iniciada_em && x.contato_em).map(x => Date.parse(x.contato_em!) - Date.parse(x.iniciada_em!))),
      leadAteAgendamento: mediana(s.filter(x => x.contato_em && x.agendada_em).map(x => Date.parse(x.agendada_em!) - Date.parse(x.contato_em!))),
    },
  }
}

export function mediana(v: number[]): number | null {
  const a = v.filter(Number.isFinite).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/** Custo só existe quando há investimento E denominador; senão null (UI mostra "Sem dados"). */
export function custoPor(investimento: number | null, qtd: number): number | null {
  return investimento !== null && investimento > 0 && qtd > 0 ? investimento / qtd : null
}
