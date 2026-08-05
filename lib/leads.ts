// =============================================================================
// Leituras do módulo de leads (Meta Ads → dashboard do cliente).
// =============================================================================
// Módulo neutro (sem "use server"): importado por Server Components. As
// ESCRITAS vivem em lib/leads-actions.ts, mesma separação de
// clientes.ts / clientes-actions.ts.
//
// Todas as leituras usam service_role: leads_log e leads_form_mapping têm RLS
// ligada SEM policy. Isso vale inclusive pro dashboard público — o token da
// URL resolve o cliente e o filtro por cliente_id é aplicado NO SERVIDOR;
// a chave anon nunca toca essas tabelas.
// =============================================================================

import { getSupabaseAdmin } from "./supabase"
import { COLUNAS_CLIENTE, type ClienteTrafego } from "./clientes"
import { extrairDados, type CampoLead } from "./leads-campos"
import type { IntervaloLeads } from "./leads-datas"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Colunas do cliente + o token do dashboard de leads. Selecionado aqui, e
 *  não em COLUNAS_CLIENTE, para que uma migration ainda não aplicada derrube
 *  só as telas deste módulo — e não o dashboard de tráfego inteiro. */
const COLUNAS_CLIENTE_LEADS = `${COLUNAS_CLIENTE}, leads_dash_token`

/** ClienteTrafego acrescido do token do painel de leads. */
export interface ClienteComLeads extends ClienteTrafego {
  leads_dash_token: string
}

export interface LeadRegistro {
  id: string
  leadgen_id: string
  form_id: string
  cliente_id: string | null
  recebido_em: string
  created_time: string | null
  data_brt: string
  nome: string | null
  telefone: string | null
  email: string | null
  field_data: unknown
  origem_registro: string
  /** Rótulo do formulário, resolvido pelo mapeamento (não vem da tabela). */
  formulario: string
  /** Campos completos já normalizados pra exibição. */
  campos: CampoLead[]
}

export interface FormularioDoCliente {
  form_id: string
  rotulo: string
}

export interface MapeamentoForm {
  id: string
  cliente_id: string
  form_id: string
  page_id: string | null
  rotulo: string
  ativo: boolean
  /** Só indica SE existe token — o valor nunca sai desta camada. */
  tem_token: boolean
  created_at: string
  updated_at: string
}

const COLUNAS_LEAD =
  "id, leadgen_id, form_id, cliente_id, recebido_em, created_time, data_brt, nome, telefone, email, field_data, origem_registro"

// -----------------------------------------------------------------------------
// Dashboard público (por token)
// -----------------------------------------------------------------------------

/**
 * Resolve o cliente dono do token do dashboard de leads.
 *
 * O guard de regex ANTES da query é de propósito (mesmo padrão do
 * getClientePorVendasToken): token fora do formato uuid nem chega ao banco,
 * então varredura automatizada não gera carga nenhuma.
 */
export async function getClientePorLeadsToken(
  token: string
): Promise<ClienteComLeads | null> {
  if (!UUID_RE.test(token)) return null
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("cliente_trafego")
    .select(COLUNAS_CLIENTE_LEADS)
    .eq("leads_dash_token", token)
    .maybeSingle()
  if (error) {
    console.error("[leads] getClientePorLeadsToken error", error.message)
    return null
  }
  return (data ?? null) as ClienteComLeads | null
}

/** Formulários ativos do cliente — alimenta o filtro "Formulário". */
export async function listarFormulariosDoCliente(
  clienteId: string
): Promise<FormularioDoCliente[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("leads_form_mapping")
    .select("form_id, rotulo")
    .eq("cliente_id", clienteId)
    .eq("ativo", true)
    .order("rotulo")
  if (error) {
    console.error("[leads] listarFormulariosDoCliente error", error.message)
    return []
  }
  return (data ?? []) as FormularioDoCliente[]
}

/**
 * Leads do cliente no período, opcionalmente de um formulário só.
 *
 * Ordenação por recebido_em desc (mais novo primeiro) — dentro de um mesmo
 * dia, data_brt empataria tudo.
 *
 * `limite` existe pra proteger a página: um cliente com meses de histórico e
 * filtro "Tudo" traria dezenas de milhares de linhas pro browser.
 */
export async function listarLeadsDoCliente(
  clienteId: string,
  intervalo: IntervaloLeads,
  formId?: string | null,
  limite = 500,
  /** Formulários já carregados pela página — evita repetir a mesma query.
   *  Omitido, busca sozinho (mantém a função utilizável isolada). */
  formulariosConhecidos?: FormularioDoCliente[]
): Promise<LeadRegistro[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  let q = supabase
    .from("leads_log")
    .select(COLUNAS_LEAD)
    .eq("cliente_id", clienteId)

  // "tudo" vem com de/ate null — nesse caso nenhum filtro de data é aplicado.
  if (intervalo.de) q = q.gte("data_brt", intervalo.de)
  if (intervalo.ate) q = q.lte("data_brt", intervalo.ate)
  if (formId) q = q.eq("form_id", formId)

  const { data, error } = await q
    .order("recebido_em", { ascending: false })
    .limit(limite)

  if (error) {
    console.error("[leads] listarLeadsDoCliente error", error.message)
    return []
  }

  const linhas = (data ?? []) as Array<Record<string, any>>
  if (linhas.length === 0) return []

  // Rótulo do formulário: uma query só pro cliente inteiro, em vez de join
  // por linha. São poucos formulários por cliente.
  const forms =
    formulariosConhecidos ?? (await listarFormulariosDoCliente(clienteId))
  const rotulos = new Map(forms.map((f) => [f.form_id, f.rotulo]))

  return linhas.map((l) => {
    const extraidos = extrairDados(l.field_data)
    return {
      id: l.id,
      leadgen_id: l.leadgen_id,
      form_id: l.form_id,
      cliente_id: l.cliente_id,
      recebido_em: l.recebido_em,
      created_time: l.created_time,
      data_brt: l.data_brt,
      // Colunas materializadas na ingestão têm precedência; o extrator serve
      // de fallback pra linha antiga ou reprocessada.
      nome: l.nome ?? extraidos.nome,
      telefone: l.telefone ?? extraidos.telefone,
      email: l.email ?? extraidos.email,
      field_data: l.field_data,
      origem_registro: l.origem_registro,
      formulario: rotulos.get(l.form_id) ?? "Formulário",
      campos: extraidos.campos,
    }
  })
}

// -----------------------------------------------------------------------------
// Visão interna (admin)
// -----------------------------------------------------------------------------

/** Mapeamentos de um cliente. `tem_token` em vez do token — o Page Access
 *  Token nunca sobe pra camada de UI. */
export async function listarMapeamentosDoCliente(
  clienteId: string
): Promise<MapeamentoForm[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("leads_form_mapping")
    .select(
      "id, cliente_id, form_id, page_id, rotulo, ativo, page_access_token, created_at, updated_at"
    )
    .eq("cliente_id", clienteId)
    .order("rotulo")
  if (error) {
    console.error("[leads] listarMapeamentosDoCliente error", error.message)
    return []
  }
  return (data ?? []).map((m: any) => ({
    id: m.id,
    cliente_id: m.cliente_id,
    form_id: m.form_id,
    page_id: m.page_id,
    rotulo: m.rotulo,
    ativo: m.ativo,
    tem_token: Boolean(m.page_access_token),
    created_at: m.created_at,
    updated_at: m.updated_at,
  }))
}

/** Todos os clientes ativos, de todas as assessorias, ordenados pra tela
 *  interna de leads. Traz o ClienteTrafego completo porque a tela precisa do
 *  leads_dash_token pra montar o link copiável. */
export async function listarTodosClientesAtivos(): Promise<ClienteComLeads[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("cliente_trafego")
    .select(COLUNAS_CLIENTE_LEADS)
    .eq("ativo", true)
    .order("empresa_nome")
    .order("ordem")
    .order("nome")
  if (error) {
    console.error("[leads] listarTodosClientesAtivos error", error.message)
    return []
  }
  return (data ?? []) as ClienteComLeads[]
}

/** Mapeamentos de TODOS os clientes numa query só — evita N+1 na tela
 *  interna, que lista todos os clientes de uma vez. */
export async function listarTodosMapeamentos(): Promise<MapeamentoForm[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("leads_form_mapping")
    .select(
      "id, cliente_id, form_id, page_id, rotulo, ativo, page_access_token, created_at, updated_at"
    )
    .order("rotulo")
  if (error) {
    console.error("[leads] listarTodosMapeamentos error", error.message)
    return []
  }
  return (data ?? []).map((m: any) => ({
    id: m.id,
    cliente_id: m.cliente_id,
    form_id: m.form_id,
    page_id: m.page_id,
    rotulo: m.rotulo,
    ativo: m.ativo,
    tem_token: Boolean(m.page_access_token),
    created_at: m.created_at,
    updated_at: m.updated_at,
  }))
}

export interface ResumoLeadsCliente {
  cliente_id: string
  total: number
  hoje: number
}

/**
 * Contagem de leads por cliente pra tela interna.
 *
 * Faz UMA query trazendo só (cliente_id, data_brt) e agrega em memória. Com o
 * volume real (~10 clientes) isso é mais barato que N queries de count, e
 * evita ter que criar uma view só pra isso.
 */
export async function getResumoLeadsPorCliente(
  hojeBRT: string
): Promise<Map<string, ResumoLeadsCliente>> {
  const mapa = new Map<string, ResumoLeadsCliente>()
  const supabase = getSupabaseAdmin()
  if (!supabase) return mapa

  const { data, error } = await supabase
    .from("leads_log")
    .select("cliente_id, data_brt")
    .not("cliente_id", "is", null)
    .limit(50_000)

  if (error) {
    console.error("[leads] getResumoLeadsPorCliente error", error.message)
    return mapa
  }

  for (const l of (data ?? []) as Array<{ cliente_id: string; data_brt: string }>) {
    const atual = mapa.get(l.cliente_id) ?? {
      cliente_id: l.cliente_id,
      total: 0,
      hoje: 0,
    }
    atual.total += 1
    if (l.data_brt === hojeBRT) atual.hoje += 1
    mapa.set(l.cliente_id, atual)
  }
  return mapa
}

/**
 * Leads cujo formulário ainda não foi mapeado (cliente_id null).
 *
 * Esta lista É O ALERTA: campanha nova entrou no ar e ninguém cadastrou o
 * form_id. O lead não se perdeu (foi gravado assim mesmo), mas não aparece
 * pro cliente até alguém mapear.
 */
export async function listarLeadsOrfaos(limite = 100): Promise<LeadRegistro[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("leads_log")
    .select(COLUNAS_LEAD)
    .is("cliente_id", null)
    .order("recebido_em", { ascending: false })
    .limit(limite)
  if (error) {
    console.error("[leads] listarLeadsOrfaos error", error.message)
    return []
  }
  return ((data ?? []) as Array<Record<string, any>>).map((l) => {
    const extraidos = extrairDados(l.field_data)
    return {
      id: l.id,
      leadgen_id: l.leadgen_id,
      form_id: l.form_id,
      cliente_id: null,
      recebido_em: l.recebido_em,
      created_time: l.created_time,
      data_brt: l.data_brt,
      nome: l.nome ?? extraidos.nome,
      telefone: l.telefone ?? extraidos.telefone,
      email: l.email ?? extraidos.email,
      field_data: l.field_data,
      origem_registro: l.origem_registro,
      formulario: "Não mapeado",
      campos: extraidos.campos,
    }
  })
}

/** Últimos erros de processamento — diagnóstico rápido na tela interna. */
export async function listarFalhasRecentes(limite = 20): Promise<
  Array<{ id: string; recebido_em: string; erro: string }>
> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("leads_webhook_eventos")
    .select("id, recebido_em, erro_processamento")
    .eq("processado", false)
    .not("erro_processamento", "is", null)
    .order("recebido_em", { ascending: false })
    .limit(limite)
  if (error) {
    console.error("[leads] listarFalhasRecentes error", error.message)
    return []
  }
  return (data ?? []).map((e: any) => ({
    id: e.id,
    recebido_em: e.recebido_em,
    erro: e.erro_processamento as string,
  }))
}
