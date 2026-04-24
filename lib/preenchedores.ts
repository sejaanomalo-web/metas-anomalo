"use server"

import { revalidatePath } from "next/cache"
import { randomBytes } from "crypto"
import {
  type DadosDiariosLog,
  type DadosReais,
  type PapelPreenchedor,
  type Preenchedor,
  type PreenchedorEmpresa,
  getSupabase,
  supabaseConfigurado,
} from "./supabase"
import {
  type Mes,
  type OrigemDadosReais,
  getEmpresaPorDb,
} from "./data"

export interface ResultadoPreenchedor {
  ok: boolean
  erro?: string
}

function gerarToken(): string {
  // 24 bytes → 48 chars hex, suficientemente opaco pra magic link permanente
  return randomBytes(24).toString("hex")
}

function papelValido(p: string): p is PapelPreenchedor {
  return p === "gestor_trafego" || p === "sdr"
}

function origemDoPapel(papel: PapelPreenchedor): OrigemDadosReais {
  return papel === "gestor_trafego" ? "pago" : "organico"
}

// ============ CRUD de preenchedores ============

export async function listarPreenchedores(
  papel?: PapelPreenchedor
): Promise<Preenchedor[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  let query = supabase.from("preenchedores").select("*").order("nome", {
    ascending: true,
  })
  if (papel) query = query.eq("papel", papel)
  const { data, error } = await query
  if (error) {
    console.error("[preenchedores] list error", error.message)
    return []
  }
  return (data ?? []) as Preenchedor[]
}

export async function getPreenchedorByToken(
  token: string
): Promise<Preenchedor | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("preenchedores")
    .select("*")
    .eq("token", token)
    .eq("ativo", true)
    .maybeSingle()
  if (error) {
    console.error("[preenchedores] getByToken error", error.message)
    return null
  }
  return (data ?? null) as Preenchedor | null
}

export async function listarEmpresasAtribuidas(
  preenchedorId: string
): Promise<string[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("preenchedor_empresas")
    .select("empresa")
    .eq("preenchedor_id", preenchedorId)
  if (error) {
    console.error("[preenchedores] empresas error", error.message)
    return []
  }
  return (data ?? []).map((r: { empresa: string }) => r.empresa)
}

export async function listarTodasAtribuicoes(): Promise<
  Map<string, string[]>
> {
  const supabase = getSupabase()
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from("preenchedor_empresas")
    .select("preenchedor_id, empresa")
  if (error) {
    console.error("[preenchedores] todas atribuicoes error", error.message)
    return new Map()
  }
  const map = new Map<string, string[]>()
  for (const r of (data ?? []) as PreenchedorEmpresa[]) {
    const lista = map.get(r.preenchedor_id) ?? []
    lista.push(r.empresa)
    map.set(r.preenchedor_id, lista)
  }
  return map
}

export async function criarPreenchedorAction(
  formData: FormData
): Promise<ResultadoPreenchedor> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const nome = String(formData.get("nome") ?? "").trim()
  const papel = String(formData.get("papel") ?? "")
  if (!nome) return { ok: false, erro: "Nome é obrigatório." }
  if (!papelValido(papel)) return { ok: false, erro: "Papel inválido." }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const payload: Preenchedor = {
    nome,
    papel,
    ativo: true,
    token: gerarToken(),
  }
  const { error } = await supabase.from("preenchedores").insert(payload)
  if (error) {
    console.error("[preenchedores] insert error", error.message)
    return { ok: false, erro: error.message }
  }
  revalidatePath("/dashboard/preenchedores")
  return { ok: true }
}

export async function atualizarPreenchedorAction(
  formData: FormData
): Promise<ResultadoPreenchedor> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim()
  const papel = String(formData.get("papel") ?? "")
  const ativoRaw = String(formData.get("ativo") ?? "true")
  if (!id) return { ok: false, erro: "ID inválido." }
  if (!nome) return { ok: false, erro: "Nome é obrigatório." }
  if (!papelValido(papel)) return { ok: false, erro: "Papel inválido." }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("preenchedores")
    .update({
      nome,
      papel,
      ativo: ativoRaw === "true",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/preenchedores")
  return { ok: true }
}

export async function regenerarTokenAction(
  formData: FormData
): Promise<ResultadoPreenchedor> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }
  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { error } = await supabase
    .from("preenchedores")
    .update({ token: gerarToken(), updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/preenchedores")
  return { ok: true }
}

export async function removerPreenchedorAction(
  formData: FormData
): Promise<ResultadoPreenchedor> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }
  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { error } = await supabase
    .from("preenchedores")
    .delete()
    .eq("id", id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath("/dashboard/preenchedores")
  return { ok: true }
}

export async function atribuirEmpresasAction(
  formData: FormData
): Promise<ResultadoPreenchedor> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const id = String(formData.get("preenchedor_id") ?? "").trim()
  const empresasRaw = String(formData.get("empresas") ?? "[]")
  if (!id) return { ok: false, erro: "Preenchedor inválido." }
  let empresas: string[]
  try {
    const parsed = JSON.parse(empresasRaw)
    if (!Array.isArray(parsed)) throw new Error("lista inválida")
    empresas = parsed
      .map((e) => String(e).trim())
      .filter((e) => e.length > 0)
  } catch {
    return { ok: false, erro: "Lista de empresas inválida." }
  }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  // Apaga atribuições anteriores e insere o novo conjunto.
  const { error: erroDelete } = await supabase
    .from("preenchedor_empresas")
    .delete()
    .eq("preenchedor_id", id)
  if (erroDelete) return { ok: false, erro: erroDelete.message }

  if (empresas.length > 0) {
    const rows = empresas.map((empresa) => ({
      preenchedor_id: id,
      empresa,
    }))
    const { error: erroInsert } = await supabase
      .from("preenchedor_empresas")
      .insert(rows)
    if (erroInsert) return { ok: false, erro: erroInsert.message }
  }
  revalidatePath("/dashboard/preenchedores")
  return { ok: true }
}

// ============ Submissão do formulário diário ============

function mesAtualDoSistema(): { mes: Mes; ano: number } {
  const agora = new Date()
  // Ajuste simples para BRT — os resumos fazem o mesmo
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60000
  const brt = new Date(utc + -3 * 3600000)
  const idx = brt.getMonth() + 1
  const mapa: Record<number, Mes> = {
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
  }
  return {
    mes: mapa[idx] ?? "Abril",
    ano: brt.getFullYear(),
  }
}

function parseNumeroBR(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim().replace(/\./g, "").replace(",", ".")
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseIntNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim()
  if (s === "") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

export interface ResultadoSubmissao {
  ok: boolean
  erro?: string
  campo?: string // campo específico que falhou monotonicidade
}

/**
 * Submissão de uma empresa pelo formulário do preenchedor.
 * Regras:
 *   - Cada métrica cumulativa (invest., leads, reuniões, contratos, faturamento,
 *     criativos) só pode manter ou subir — monotonicidade.
 *   - clientes_ativos é snapshot (qualquer valor ≥ 0).
 *   - observacoes sobrescreve (texto).
 * Lê dados_reais atual → valida → upsert → log.
 */
export async function submeterFormularioAction(
  formData: FormData
): Promise<ResultadoSubmissao> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: "Supabase não configurado." }
  }
  const token = String(formData.get("token") ?? "").trim()
  const empresa = String(formData.get("empresa") ?? "").trim()
  if (!token || !empresa) {
    return { ok: false, erro: "Token ou empresa ausentes." }
  }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  // 1. Valida token e identifica preenchedor
  const preenchedor = await getPreenchedorByToken(token)
  if (!preenchedor) {
    return { ok: false, erro: "Link inválido ou desativado." }
  }

  // 2. Verifica que o preenchedor está atribuído a essa empresa
  const empresas = await listarEmpresasAtribuidas(preenchedor.id!)
  if (!empresas.includes(empresa)) {
    return { ok: false, erro: "Empresa não atribuída a este preenchedor." }
  }

  // 3. Descobre mês corrente e origem pelo papel
  const { mes, ano } = mesAtualDoSistema()
  const origem = origemDoPapel(preenchedor.papel)
  const ehPago = origem === "pago"

  // 4. Busca valor atual
  const { data: atualRow, error: erroLer } = await supabase
    .from("dados_reais")
    .select("*")
    .eq("empresa", empresa)
    .eq("mes", mes)
    .eq("ano", ano)
    .eq("origem", origem)
    .maybeSingle()
  if (erroLer) {
    console.error("[form] ler dados_reais", erroLer.message)
    return { ok: false, erro: erroLer.message }
  }
  const atual = (atualRow ?? null) as DadosReais | null

  // 5. Lê campos do form
  const investimento_real = ehPago
    ? parseNumeroBR(formData.get("investimento_real"))
    : null
  const leads_real = parseIntNull(formData.get("leads_real"))
  const reunioes_real = parseIntNull(formData.get("reunioes_real"))
  const contratos_real = parseIntNull(formData.get("contratos_real"))
  const faturamento_real = parseNumeroBR(formData.get("faturamento_real"))
  const criativos_entregues = ehPago
    ? parseIntNull(formData.get("criativos_entregues"))
    : null
  const clientes_ativos = ehPago
    ? parseIntNull(formData.get("clientes_ativos"))
    : atual?.clientes_ativos ?? null
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null

  // 6. Monotonicidade — só cresce
  type CampoCumul =
    | "investimento_real"
    | "leads_real"
    | "reunioes_real"
    | "contratos_real"
    | "faturamento_real"
    | "criativos_entregues"
  const cumulativos: { campo: CampoCumul; novo: number | null }[] = [
    { campo: "investimento_real", novo: investimento_real },
    { campo: "leads_real", novo: leads_real },
    { campo: "reunioes_real", novo: reunioes_real },
    { campo: "contratos_real", novo: contratos_real },
    { campo: "faturamento_real", novo: faturamento_real },
    { campo: "criativos_entregues", novo: criativos_entregues },
  ]
  for (const { campo, novo } of cumulativos) {
    if (novo === null) continue
    const anterior = atual?.[campo] ?? null
    if (anterior !== null && novo < anterior) {
      return {
        ok: false,
        erro: `O valor enviado (${novo}) para ${rotuloCampo(campo)} é menor que o atual (${anterior}).`,
        campo,
      }
    }
  }

  // 7. Calcula CPL quando pago
  const cpl_real =
    ehPago &&
    investimento_real !== null &&
    leads_real !== null &&
    leads_real > 0
      ? Number((investimento_real / leads_real).toFixed(2))
      : null

  // 8. Monta payload, preservando o atual para campos não enviados (null)
  const payload: DadosReais = {
    empresa,
    mes,
    ano,
    origem,
    investimento_real:
      investimento_real ?? atual?.investimento_real ?? null,
    leads_real: leads_real ?? atual?.leads_real ?? null,
    reunioes_real: reunioes_real ?? atual?.reunioes_real ?? null,
    contratos_real: contratos_real ?? atual?.contratos_real ?? null,
    faturamento_real: faturamento_real ?? atual?.faturamento_real ?? null,
    criativos_entregues:
      criativos_entregues ?? atual?.criativos_entregues ?? null,
    cpl_real,
    clientes_ativos,
    observacoes: observacoes ?? atual?.observacoes ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error: erroUpsert } = await supabase
    .from("dados_reais")
    .upsert(payload, { onConflict: "empresa,mes,ano,origem" })
  if (erroUpsert) {
    console.error("[form] upsert dados_reais", erroUpsert.message)
    return { ok: false, erro: erroUpsert.message }
  }

  // 9. Log de auditoria
  const logPayload: Partial<DadosDiariosLog> = {
    empresa,
    data: new Date().toISOString().slice(0, 10),
    origem,
    preenchedor_id: preenchedor.id ?? null,
    preenchedor_nome: preenchedor.nome,
    investimento_real,
    leads_real,
    reunioes_real,
    contratos_real,
    faturamento_real,
    criativos_entregues,
    clientes_ativos,
    observacoes,
    investimento_anterior: atual?.investimento_real ?? null,
    leads_anterior: atual?.leads_real ?? null,
    reunioes_anterior: atual?.reunioes_real ?? null,
    contratos_anterior: atual?.contratos_real ?? null,
    faturamento_anterior: atual?.faturamento_real ?? null,
    criativos_anterior: atual?.criativos_entregues ?? null,
  }
  const { error: erroLog } = await supabase
    .from("dados_diarios_log")
    .insert(logPayload)
  if (erroLog) {
    console.error("[form] insert log", erroLog.message)
    // Não falha a submissão principal por conta do log.
  }

  // 10. Revalida dashboards
  revalidatePath("/dashboard")
  const emp = getEmpresaPorDb(empresa)
  if (emp) revalidatePath(`/dashboard/${emp.slug}`)

  return { ok: true }
}

function rotuloCampo(campo: string): string {
  const mapa: Record<string, string> = {
    investimento_real: "Investimento",
    leads_real: "Leads",
    reunioes_real: "Reuniões",
    contratos_real: "Contratos",
    faturamento_real: "Faturamento",
    criativos_entregues: "Criativos entregues",
  }
  return mapa[campo] ?? campo
}
