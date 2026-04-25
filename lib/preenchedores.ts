"use server"

import { revalidatePath } from "next/cache"
import { randomBytes } from "crypto"
import {
  type CriativoDetalhe,
  type DadosReais,
  type PapelPreenchedor,
  type Preenchedor,
  type PreenchedorEmpresa,
  type PublicoProspectado,
  getSupabase,
  supabaseConfigurado,
} from "./supabase"
import {
  type Mes,
  type OrigemDadosReais,
  getEmpresaPorDb,
} from "./data"
import { gravarDadosReaisComLog } from "./dados-reais"

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

function sanitizarCriativosDetalhe(raw: unknown): CriativoDetalhe[] {
  if (!Array.isArray(raw)) return []
  const out: CriativoDetalhe[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const nome = String((item as { nome?: unknown }).nome ?? "").trim()
    const publico = String((item as { publico?: unknown }).publico ?? "").trim()
    if (!nome && !publico) continue
    out.push({ nome, publico })
  }
  return out
}

function sanitizarPublicosProspectados(
  raw: unknown
): PublicoProspectado[] {
  if (!Array.isArray(raw)) return []
  const out: PublicoProspectado[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const publico = String((item as { publico?: unknown }).publico ?? "").trim()
    const leadsRaw = (item as { leads?: unknown }).leads
    const leads = Number(leadsRaw)
    if (!publico && (!Number.isFinite(leads) || leads <= 0)) continue
    out.push({
      publico,
      leads: Number.isFinite(leads) && leads > 0 ? Math.floor(leads) : 0,
    })
  }
  return out
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
  // - Gestor (pago): investimento, leads, criativos disponíveis, criativos
  //   usados, CPL, CPA, detalhe. NÃO envia reuniões/contratos/faturamento/
  //   clientes.
  // - SDR (orgânico): leads, respostas, reuniões, lista de públicos
  //   prospectados e observações. NÃO envia mais contratos nem
  //   faturamento.
  const investimento_real = ehPago
    ? parseNumeroBR(formData.get("investimento_real"))
    : null
  const leads_real = parseIntNull(formData.get("leads_real"))
  const reunioes_real = ehPago
    ? null
    : parseIntNull(formData.get("reunioes_real"))
  const contratos_real = null
  const faturamento_real = null
  const criativos_entregues = ehPago
    ? parseIntNull(formData.get("criativos_entregues"))
    : null
  const criativos_usados = ehPago
    ? parseIntNull(formData.get("criativos_usados"))
    : null
  const cpl_real = ehPago ? parseNumeroBR(formData.get("cpl_real")) : null
  const cpa_real = ehPago ? parseNumeroBR(formData.get("cpa_real")) : null
  const criativos_detalhe: CriativoDetalhe[] | null = ehPago
    ? (() => {
        const raw = String(formData.get("criativos_detalhe") ?? "")
        if (!raw) return []
        try {
          return sanitizarCriativosDetalhe(JSON.parse(raw))
        } catch {
          return []
        }
      })()
    : null
  const respostas = ehPago ? null : parseIntNull(formData.get("respostas"))
  const publicos_prospectados: PublicoProspectado[] | null = ehPago
    ? null
    : (() => {
        const raw = String(formData.get("publicos_prospectados") ?? "")
        if (!raw) return []
        try {
          return sanitizarPublicosProspectados(JSON.parse(raw))
        } catch {
          return []
        }
      })()
  // Snapshot: gestor não envia mais clientes_ativos; preserva o atual.
  const clientes_ativos = atual?.clientes_ativos ?? null
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null

  // 6. Monotonicidade — só cresce (investimento, leads, reuniões, contratos,
  //    faturamento, criativos entregues/disponíveis, criativos usados,
  //    respostas). CPL e CPA são snapshots (podem oscilar).
  type CampoCumul =
    | "investimento_real"
    | "leads_real"
    | "reunioes_real"
    | "contratos_real"
    | "faturamento_real"
    | "criativos_entregues"
    | "criativos_usados"
    | "respostas"
  const cumulativos: { campo: CampoCumul; novo: number | null }[] = [
    { campo: "investimento_real", novo: investimento_real },
    { campo: "leads_real", novo: leads_real },
    { campo: "reunioes_real", novo: reunioes_real },
    { campo: "contratos_real", novo: contratos_real },
    { campo: "faturamento_real", novo: faturamento_real },
    { campo: "criativos_entregues", novo: criativos_entregues },
    { campo: "criativos_usados", novo: criativos_usados },
    { campo: "respostas", novo: respostas },
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

  // 7. Monta payload, preservando o atual para campos não enviados (null)
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
    cpl_real: ehPago ? cpl_real ?? atual?.cpl_real ?? null : atual?.cpl_real ?? null,
    cpa_real: ehPago ? cpa_real ?? atual?.cpa_real ?? null : atual?.cpa_real ?? null,
    criativos_usados: ehPago
      ? criativos_usados ?? atual?.criativos_usados ?? null
      : atual?.criativos_usados ?? null,
    // Detalhe de criativos: gestor sobrescreve a lista inteira a cada
    // submissão; orgânico preserva o que já estava (caso exista).
    criativos_detalhe: ehPago
      ? criativos_detalhe
      : atual?.criativos_detalhe ?? null,
    respostas: ehPago
      ? atual?.respostas ?? null
      : respostas ?? atual?.respostas ?? null,
    // Públicos prospectados: SDR sobrescreve a lista; pago preserva.
    publicos_prospectados: ehPago
      ? atual?.publicos_prospectados ?? null
      : publicos_prospectados,
    clientes_ativos,
    observacoes: observacoes ?? atual?.observacoes ?? null,
    updated_at: new Date().toISOString(),
  }

  // 8. Centraliza upsert + log via helper compartilhada com o drawer.
  const resultado = await gravarDadosReaisComLog(payload, {
    id: preenchedor.id ?? null,
    nome: preenchedor.nome,
  })
  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro }
  }

  // 9. Revalida dashboards
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
    criativos_entregues: "Criativos disponíveis",
    criativos_usados: "Criativos usados",
    respostas: "Respostas",
  }
  return mapa[campo] ?? campo
}
