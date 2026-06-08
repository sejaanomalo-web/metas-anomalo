"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"
import { parseNumeroForm } from "./parse-numero"
import {
  ETAPAS_FUNIL,
  type EtapaFunil,
  type OportunidadePipeline,
  type RelatorioComercial,
  type ResultadoComercial,
  type ResumoComercial,
} from "./comercial-tipos"

/**
 * Actions e queries do Comercial (server-only).
 *
 *   • relatorios_comerciais — trilha DIÁRIA por colaborador (atividade da
 *     pessoa: prospecção, reuniões, propostas/fechamentos). Upsert por
 *     (colaborador_id, data).
 *   • pipeline_comercial — oportunidades por etapa do funil (modelo
 *     híbrido: empresa/cliente existente OU prospect novo).
 *
 * "use server" → este arquivo só pode exportar async functions. Tipos e
 * constantes (ETAPAS_FUNIL, ROTULO_ETAPA, interfaces) vivem em
 * ./comercial-tipos. Padrão do projeto: retorno { ok, erro? }, nunca
 * throw, console.error("[comercial]", …).
 */

function intDoForm(v: FormDataEntryValue | null): number {
  if (v === null) return 0
  const n = parseInt(String(v).trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// ============================================================
// Relatório diário
// ============================================================

export async function salvarRelatorioComercialAction(
  formData: FormData
): Promise<ResultadoComercial> {
  // Funciona com OU sem login: na versão pública (link compartilhado) não
  // há sessão — registramos como "Formulário público". Logado, guarda
  // quem preencheu (informativo; a chave do upsert é empresa+data).
  const usuario = await getUsuarioAtual()

  const empresa = String(formData.get("empresa") ?? "").trim()
  if (!empresa) return { ok: false, erro: "Selecione a empresa." }

  const data = String(formData.get("data") ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, erro: "Data inválida." }
  }

  const fatParse = parseNumeroForm(formData.get("faturamento_gerado"))
  if (fatParse.erro) return { ok: false, erro: fatParse.erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const payload = {
    empresa,
    colaborador_id: usuario?.id ?? null,
    colaborador_nome: usuario?.nome ?? "Formulário público",
    data,
    ligacoes: intDoForm(formData.get("ligacoes")),
    mensagens: intDoForm(formData.get("mensagens")),
    conexoes_novas: intDoForm(formData.get("conexoes_novas")),
    reunioes_agendadas: intDoForm(formData.get("reunioes_agendadas")),
    reunioes_realizadas: intDoForm(formData.get("reunioes_realizadas")),
    no_shows: intDoForm(formData.get("no_shows")),
    propostas_enviadas: intDoForm(formData.get("propostas_enviadas")),
    contratos_fechados: intDoForm(formData.get("contratos_fechados")),
    faturamento_gerado: fatParse.value ?? 0,
    observacoes: (String(formData.get("observacoes") ?? "").trim() || null) as
      | string
      | null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from("relatorios_comerciais")
    .upsert(payload, { onConflict: "empresa,data" })
  if (error) {
    console.error("[comercial] salvar relatorio error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard", "layout")
  return { ok: true }
}

/** Relatórios diários no intervalo (YYYY-MM-DD, inclusivos). */
export async function listarRelatoriosComerciais(
  inicio: string,
  fim: string
): Promise<RelatorioComercial[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("relatorios_comerciais")
    .select("*")
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: true })
  if (error) {
    console.error("[comercial] listar relatorios error", error.message)
    return []
  }
  return (data ?? []) as RelatorioComercial[]
}

/** Soma os relatórios diários do intervalo num único resumo. */
export async function getResumoComercialPorIntervalo(
  inicio: string,
  fim: string
): Promise<ResumoComercial> {
  const linhas = await listarRelatoriosComerciais(inicio, fim)
  const acc: ResumoComercial = {
    ligacoes: 0,
    mensagens: 0,
    conexoes_novas: 0,
    reunioes_agendadas: 0,
    reunioes_realizadas: 0,
    no_shows: 0,
    propostas_enviadas: 0,
    contratos_fechados: 0,
    faturamento_gerado: 0,
    registros: 0,
  }
  for (const l of linhas) {
    acc.ligacoes += l.ligacoes
    acc.mensagens += l.mensagens
    acc.conexoes_novas += l.conexoes_novas
    acc.reunioes_agendadas += l.reunioes_agendadas
    acc.reunioes_realizadas += l.reunioes_realizadas
    acc.no_shows += l.no_shows
    acc.propostas_enviadas += l.propostas_enviadas
    acc.contratos_fechados += l.contratos_fechados
    acc.faturamento_gerado += Number(l.faturamento_gerado ?? 0)
    acc.registros += 1
  }
  return acc
}

// ============================================================
// Pipeline
// ============================================================

export async function listarPipelineAction(): Promise<OportunidadePipeline[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("pipeline_comercial")
    .select("*")
    .eq("ativo", true)
    .order("updated_at", { ascending: false })
  if (error) {
    console.error("[comercial] listar pipeline error", error.message)
    return []
  }
  return (data ?? []) as OportunidadePipeline[]
}

export async function salvarPipelineAction(
  formData: FormData
): Promise<ResultadoComercial> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }

  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { ok: false, erro: "Nome da oportunidade obrigatório." }

  const etapaRaw = String(formData.get("etapa") ?? "lead")
  const etapa: EtapaFunil = (ETAPAS_FUNIL as readonly string[]).includes(
    etapaRaw
  )
    ? (etapaRaw as EtapaFunil)
    : "lead"

  const valorParse = parseNumeroForm(formData.get("valor_estimado"))
  if (valorParse.erro) return { ok: false, erro: valorParse.erro }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  const hoje = new Date().toISOString().slice(0, 10)
  const payload = {
    nome,
    empresa_config_slug:
      (String(formData.get("empresa_config_slug") ?? "").trim() || null) as
        | string
        | null,
    etapa,
    responsavel_id: usuario.id,
    responsavel_nome: usuario.nome,
    valor_estimado: valorParse.value,
    origem_contato:
      (String(formData.get("origem_contato") ?? "").trim() || null) as
        | string
        | null,
    ultima_atualizacao: hoje,
    observacoes:
      (String(formData.get("observacoes") ?? "").trim() || null) as
        | string
        | null,
    ativo: true,
    updated_at: new Date().toISOString(),
  }

  const query = id
    ? supabase.from("pipeline_comercial").update(payload).eq("id", id)
    : supabase.from("pipeline_comercial").insert(payload)
  const { error } = await query
  if (error) {
    console.error("[comercial] salvar pipeline error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard", "layout")
  return { ok: true }
}

/** Atualiza só a etapa de uma oportunidade (drag entre colunas do funil). */
export async function moverEtapaPipelineAction(
  formData: FormData
): Promise<ResultadoComercial> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }

  const id = String(formData.get("id") ?? "").trim()
  const etapaRaw = String(formData.get("etapa") ?? "")
  if (!id || !(ETAPAS_FUNIL as readonly string[]).includes(etapaRaw)) {
    return { ok: false, erro: "Dados inválidos." }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { error } = await supabase
    .from("pipeline_comercial")
    .update({
      etapa: etapaRaw,
      ultima_atualizacao: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) {
    console.error("[comercial] mover etapa error", error.message)
    return { ok: false, erro: error.message }
  }

  revalidatePath("/dashboard", "layout")
  return { ok: true }
}
