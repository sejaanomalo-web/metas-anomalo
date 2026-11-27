// Dados do painel administrativo do Funil Estáticos Meta (servidor).
import { getSupabaseAdmin } from "./supabase"
import { capiConfigurada } from "./funil-estaticos"
import {
  calcularFunil, type DefinicaoFunil, type LeadMetrica, type Qualificacao, type ReuniaoMetrica, type SessaoMetrica, type StatusComercial,
} from "./funil-estaticos-nucleo"

export const PERIODOS = { "7": 7, "30": 30, "90": 90, "365": 365 } as const
export type Periodo = keyof typeof PERIODOS

export interface CriativoAdmin { id: string; codigo: string; nome: string; hipotese: string | null; miniatura_url: string | null; meta_ad_id: string | null; status: string; inicio_em: string | null }
export interface LeadAdmin {
  id: string; nome: string; telefone_e164: string; email: string | null; instagram: string | null; criado_em: string; ultima_interacao_em: string
  respostas: Record<string, string>; interesse: string | null; pontuacao: number | null; qualificacao: Qualificacao; qualificacao_manual: boolean
  status_comercial: StatusComercial; valor_venda: number | null; responsavel_id: string | null; crm_lead_id: string | null; ambiente: string
  first_touch: Record<string, string>; last_touch: Record<string, string>; sessoes: number
  criativo_id: string | null; reuniao: { id: string; inicio: string | null; status: string; tarefa_id: string | null } | null
}

export async function carregarPainelFunil(slug: string, periodo: Periodo, incluirTeste: boolean) {
  const db = getSupabaseAdmin()
  if (!db) return { erro: "Banco indisponível." as const }
  const { data: f, error } = await db.from("funil_config").select("*").eq("slug", slug).maybeSingle()
  if (error?.code === "42P01" || error?.message?.includes("funil_config")) return { erro: "migracao" as const }
  if (!f) return { erro: "nao_encontrado" as const }
  const desde = new Date(Date.now() - PERIODOS[periodo] * 86400_000).toISOString()
  const ambientes = incluirTeste ? ["producao", "teste"] : ["producao"]

  const [versoes, criativos, sessoes, leads, conv, convPend, invManual, canal, tipos, disps, usuarios, instancias, hist] = await Promise.all([
    db.from("funil_versoes").select("id, numero, status, definicao, criado_em, publicada_em, criado_por").eq("funil_id", f.id).order("numero", { ascending: false }).limit(30),
    db.from("funil_criativos").select("id, codigo, nome, hipotese, miniatura_url, meta_ad_id, status, inicio_em").eq("funil_id", f.id).order("codigo"),
    db.from("funil_sessoes").select("id, criativo_id, canal_origem, aberta_em, iniciada_em, perguntas_concluidas, contato_em, agenda_vista_em, horario_selecionado_em, agendada_em, abandonada, etapa_abandono, lead_id, agendamento_id, atribuicao, versao_id, ambiente, apresentacao_vista_em, cta_inicial_em, variante_entrada, versao_visual, teste_reserva_inicio")
      .eq("funil_id", f.id).in("ambiente", ambientes).gte("aberta_em", desde).order("aberta_em", { ascending: false }).limit(20000),
    db.from("funil_leads").select("id, nome, telefone_e164, email, instagram, criado_em, ultima_interacao_em, respostas, interesse, pontuacao, qualificacao, qualificacao_manual, status_comercial, valor_venda, responsavel_id, crm_lead_id, ambiente, first_touch, last_touch, sessoes, primeira_sessao_id")
      .eq("funil_id", f.id).in("ambiente", ambientes).gte("criado_em", desde).order("criado_em", { ascending: false }).limit(5000),
    db.from("funil_conversoes").select("evento, status, motivo, ultimo_erro, enviado_em, criado_em, event_id, id, tentativas, ambiente").eq("funil_id", f.id).order("criado_em", { ascending: false }).limit(50),
    db.from("funil_conversoes").select("id", { count: "exact", head: true }).eq("funil_id", f.id).in("status", ["pendente", "erro"]),
    db.from("funil_investimentos").select("id, criativo_id, data, investimento, impressoes, alcance, cliques_link, observacao").eq("funil_id", f.id).gte("data", desde.slice(0, 10)).order("data", { ascending: false }),
    db.from("reunioes_canais_nativos").select("tipo_id, disponibilidade_id, ativo, exclusividade_verificada_em").eq("chave", f.canal_chave).maybeSingle(),
    db.from("reunioes_tipos").select("id, nome, duracao_min, intervalo_minutos, antecedencia_min_horas, horizonte_dias, responsavel_id, ativo, origem_comercial").order("nome"),
    db.from("reunioes_disponibilidades").select("id, nome, modo_nativo, responsavel_id, fuso").order("nome"),
    db.from("usuarios").select("id, nome, papel, ativo").eq("ativo", true).order("nome"),
    db.from("crm_instancias").select("usuario_id, empresa_slug").eq("ativo", true),
    db.from("funil_leads_historico").select("lead_id, campo, de, para, ator_id, em").order("em", { ascending: false }).limit(300),
  ])

  // Colunas da 20261128 ausentes = migration da fase 2 não aplicada.
  if (sessoes.error?.code === "42703") return { erro: "migracao_fase2" as const }
  const sess = (sessoes.data ?? []) as (SessaoMetrica & { atribuicao: Record<string, string>; versao_id: string; ambiente: string; versao_visual: string | null; teste_reserva_inicio: string | null })[]
  const leadRows = (leads.data ?? []) as (Omit<LeadAdmin, "criativo_id" | "reuniao"> & { primeira_sessao_id: string | null })[]

  // Reuniões das sessões e dos leads (estado da reunião vem do módulo de Reuniões).
  const agIds = Array.from(new Set(sess.map(s => s.agendamento_id).filter(Boolean) as string[]))
  const leadIds = leadRows.map(l => l.id)
  const [ags, sessLeads] = await Promise.all([
    agIds.length ? db.from("reunioes_agendamentos").select("id, status, inicio, fim, tarefa_id").in("id", agIds.slice(0, 1000)) : Promise.resolve({ data: [] as { id: string; status: string; inicio: string | null; fim: string | null; tarefa_id: string | null }[] }),
    leadIds.length ? db.from("funil_sessoes").select("lead_id, agendamento_id, criativo_id, aberta_em").in("lead_id", leadIds.slice(0, 1000)).order("aberta_em") : Promise.resolve({ data: [] as { lead_id: string; agendamento_id: string | null; criativo_id: string | null; aberta_em: string }[] }),
  ])
  const extraAg = (sessLeads.data ?? []).map(s => s.agendamento_id).filter((x): x is string => Boolean(x) && !agIds.includes(x!))
  const ags2 = extraAg.length ? (await db.from("reunioes_agendamentos").select("id, status, inicio, fim, tarefa_id").in("id", extraAg.slice(0, 1000))).data ?? [] : []
  const reunioes = new Map<string, ReuniaoMetrica & { inicio: string | null; tarefa_id: string | null }>()
  for (const a of [...(ags.data ?? []), ...ags2]) reunioes.set(a.id, a)

  const porLead = new Map<string, { criativo_id: string | null; agendamento_id: string | null }>()
  for (const s of sessLeads.data ?? []) {
    const atual = porLead.get(s.lead_id) ?? { criativo_id: null, agendamento_id: null }
    porLead.set(s.lead_id, { criativo_id: atual.criativo_id ?? s.criativo_id, agendamento_id: s.agendamento_id ?? atual.agendamento_id })
  }
  const leadsAdmin: LeadAdmin[] = leadRows.map(l => {
    const x = porLead.get(l.id)
    const r = x?.agendamento_id ? reunioes.get(x.agendamento_id) : null
    return { ...l, criativo_id: x?.criativo_id ?? null, reuniao: r ? { id: r.id, inicio: r.inicio, status: r.status, tarefa_id: r.tarefa_id } : null }
  })

  // Investimento: manual + Sentinela (dados_diarios_ad) para anúncios cadastrados.
  const adIds = (criativos.data ?? []).map(c => c.meta_ad_id).filter(Boolean) as string[]
  const sentinela = adIds.length
    ? (await db.from("dados_diarios_ad").select("ad_id, data, investimento_real, impressoes_real, alcance_real, cliques_real").in("ad_id", adIds).gte("data", desde.slice(0, 10))).data ?? []
    : []

  const versaoPub = (versoes.data ?? []).find(v => v.id === f.versao_publicada_id)
  const def = (versaoPub?.definicao ?? null) as DefinicaoFunil | null
  const nPerguntas = def?.perguntas.length ?? 3
  const metricas = calcularFunil(sess, nPerguntas, leadsAdmin as unknown as LeadMetrica[], reunioes)

  // Por criativo (inclui "Não identificado").
  const grupos = new Map<string | null, typeof sess>()
  for (const s of sess) { const k = s.criativo_id ?? null; grupos.set(k, [...(grupos.get(k) ?? []), s]) }
  const leadsPorCriativo = (cid: string | null) => leadsAdmin.filter(l => l.criativo_id === cid)
  const investimentoDe = (cid: string | null) => {
    const manual = (invManual.data ?? []).filter(i => i.criativo_id === cid)
    const c = (criativos.data ?? []).find(x => x.id === cid)
    const auto = c?.meta_ad_id ? sentinela.filter(x => x.ad_id === c.meta_ad_id) : []
    if (!manual.length && !auto.length) return null
    const soma = (arr: Record<string, unknown>[], k: string) => arr.reduce((a, x) => a + Number(x[k] ?? 0), 0)
    return {
      investimento: soma(manual, "investimento") + soma(auto, "investimento_real"),
      impressoes: soma(manual, "impressoes") + soma(auto, "impressoes_real"),
      alcanceSomado: soma(manual, "alcance") + soma(auto, "alcance_real"),
      cliques: soma(manual, "cliques_link") + soma(auto, "cliques_real"),
      fontes: [manual.length ? "manual" : null, auto.length ? "Sentinela (Meta)" : null].filter(Boolean) as string[],
    }
  }
  const linhasCriativo = [...(criativos.data ?? []).map(c => c.id as string | null), null].map(cid => {
    const ss = grupos.get(cid) ?? []
    const ls = leadsPorCriativo(cid)
    const m = calcularFunil(ss, nPerguntas, ls as unknown as LeadMetrica[], reunioes)
    return { criativoId: cid, metricas: m, investimento: investimentoDe(cid) }
  })
  const totalInvest = (() => {
    const itens = linhasCriativo.map(l => l.investimento).filter(Boolean) as NonNullable<ReturnType<typeof investimentoDe>>[]
    return itens.length ? itens.reduce((a, x) => ({ investimento: a.investimento + x.investimento, impressoes: a.impressoes + x.impressoes, cliques: a.cliques + x.cliques }), { investimento: 0, impressoes: 0, cliques: 0 }) : null
  })()

  // Apresentação x início direto (base para um futuro teste A/B; hoje só compara períodos/versões).
  const porVariante = (["apresentacao", "direto"] as const).map(v => {
    const ss = sess.filter(s => (s.variante_entrada ?? "direto") === v)
    const ids = new Set(ss.map(s => s.lead_id).filter(Boolean))
    return { variante: v, metricas: calcularFunil(ss, nPerguntas, leadsAdmin.filter(l => ids.has(l.id)) as unknown as LeadMetrica[], reunioes) }
  }).filter(x => x.metricas.contagens.sessoes > 0)

  const origens: Record<string, number> = {}
  for (const s of sess) origens[s.canal_origem] = (origens[s.canal_origem] ?? 0) + 1

  return {
    funil: f as Record<string, unknown> & { id: string; slug: string; nome: string; ativo: boolean; canal_chave: string; versao_publicada_id: string | null },
    versoes: versoes.data ?? [], versaoPublicada: versaoPub ?? null, def,
    criativos: (criativos.data ?? []) as CriativoAdmin[],
    leads: leadsAdmin, metricas, linhasCriativo, totalInvest, origens, porVariante,
    investimentosManuais: invManual.data ?? [],
    conversoes: conv.data ?? [], conversoesPendentes: convPend.count ?? 0,
    canal: canal.data, tipos: tipos.data ?? [], disponibilidades: disps.data ?? [], usuarios: usuarios.data ?? [],
    empresasCrm: Array.from(new Set((instancias.data ?? []).map(i => `${i.usuario_id}|${i.empresa_slug}`))),
    historico: hist.data ?? [],
    env: { capiToken: capiConfigurada(), cronSecret: Boolean(process.env.CRON_SECRET), ambiente: process.env.VERCEL_ENV ?? "development" },
    sessoesRecentes: sess.slice(0, 40).map(s => ({ id: s.id, aberta_em: s.aberta_em, ambiente: s.ambiente, entrada: s.variante_entrada ?? "direto", criativo_id: s.criativo_id, origem: s.canal_origem,
      etapa: s.abandonada ? `abandonou em ${s.etapa_abandono}` : s.agendamento_id ? "agendou" : s.teste_reserva_inicio ? "agendou (simulado, teste)" : s.contato_em ? "lead"
        : s.iniciada_em ? `pergunta ${s.perguntas_concluidas}` : s.cta_inicial_em ? "clicou no botão inicial" : s.apresentacao_vista_em ? "viu a apresentação" : "abriu" })),
  }
}
export type PainelFunil = Exclude<Awaited<ReturnType<typeof carregarPainelFunil>>, { erro: string }>
