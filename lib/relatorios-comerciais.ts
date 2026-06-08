"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual, requererAdmin } from "./auth"
import { parseNumeroForm } from "./parse-numero"
import { MESES, type Mes } from "./data"
import { criarNotificacao } from "./notificacoes"
import type { ResumoEmpresaMes } from "./sentinela"
import {
  type RelatorioComercial,
  type ResultadoComercial,
  type ResumoComercial,
} from "./comercial-tipos"

const MES_NUM_COMERCIAL: Record<Mes, number> = {
  Abril: 4,
  Maio: 5,
  Junho: 6,
  Julho: 7,
  Agosto: 8,
  Setembro: 9,
  Outubro: 10,
  Novembro: 11,
  Dezembro: 12,
}

/**
 * Actions e queries do Comercial (server-only).
 *
 *   • relatorios_comerciais — trilha DIÁRIA por colaborador (atividade da
 *     pessoa: prospecção, reuniões, propostas/fechamentos). Upsert por
 *     (colaborador_id, data).
 *
 * "use server" → este arquivo só pode exportar async functions. As
 * interfaces vivem em ./comercial-tipos. Padrão do projeto: retorno
 * { ok, erro? }, nunca throw, console.error("[comercial]", …).
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
    retorno_mensagens: intDoForm(formData.get("retorno_mensagens")),
    qualificados: intDoForm(formData.get("qualificados")),
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

  // Notifica (tipo dados_comercial) — fan-out + push tratados na lib.
  await criarNotificacao({
    tipo: "dados_comercial",
    empresa,
    titulo: `Comercial · ${empresa}`,
    mensagem: `${payload.colaborador_nome} enviou o relatório comercial de ${empresa} (${data}).`,
    payload: { empresa, data },
  })

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
    retorno_mensagens: 0,
    qualificados: 0,
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
    acc.retorno_mensagens += l.retorno_mensagens
    acc.qualificados += l.qualificados
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
// Realizado ORGÂNICO do painel Metas, vindo do comercial.
//
// O painel Metas compara meta vs realizado por origem. O realizado
// orgânico de uma empresa é derivado de relatorios_comerciais (mesmos
// dados que o time comercial preenche), agregados por empresa e
// devolvidos no formato ResumoEmpresaMes — assim o detalhe de empresa
// reaproveita resumoComoDadosReais/CenarioReal/TabelaMeses sem mudanças.
//
// Mapeamento (confirmado com o usuário):
//   leads        ← mensagens   (mensagens enviadas — topo do funil orgânico)
//   reuniões     ← reunioes_realizadas
//   contratos    ← contratos_fechados
//   faturamento  ← faturamento_gerado
//   investimento = 0  (orgânico não tem verba de mídia)
// ============================================================

function comercialParaResumo(
  empresa: string,
  linhas: RelatorioComercial[]
): ResumoEmpresaMes {
  let leads = 0
  let reunioes = 0
  let contratos = 0
  let faturamento = 0
  for (const l of linhas) {
    leads += l.mensagens
    reunioes += l.reunioes_realizadas
    contratos += l.contratos_fechados
    faturamento += Number(l.faturamento_gerado ?? 0)
  }
  return {
    empresa,
    investimento: 0,
    leads,
    reunioes,
    contratos,
    faturamento,
    criativosEntregues: 0,
    criativosUsados: null,
    clientesAtivos: null,
    cplReal: null,
    cpaReal: null,
    cpmReal: null,
    impressoes: 0,
    observacoes: null,
    respostas: 0,
    temSentinela: false,
    cliques: 0,
    alcance: 0,
    conversas: 0,
    frequencia: null,
    ctr: null,
    cpc: null,
    custoPorConversa: null,
    lucro: faturamento,
    roi: null,
  }
}

async function linhasComerciaisDaEmpresa(
  empresa: string,
  de: string,
  ate: string
): Promise<RelatorioComercial[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("relatorios_comerciais")
    .select("*")
    .eq("empresa", empresa)
    .gte("data", de)
    .lte("data", ate)
  if (error) {
    console.error("[comercial] linhas da empresa error", error.message)
    return []
  }
  return (data ?? []) as RelatorioComercial[]
}

/** Realizado comercial (orgânico) de UMA empresa num intervalo. null se
 *  não houver nenhuma linha — deixa o "sem dados" explícito no painel. */
export async function getResumoComercialDaEmpresaIntervalo(
  empresa: string,
  de: string,
  ate: string
): Promise<ResumoEmpresaMes | null> {
  const linhas = await linhasComerciaisDaEmpresa(empresa, de, ate)
  if (linhas.length === 0) return null
  return comercialParaResumo(empresa, linhas)
}

/** Map<Mes, resumo> do ano para uma empresa — alimenta gráfico/tabela
 *  anuais do detalhe de Metas no modo orgânico. */
export async function getResumoComercialAnualDaEmpresa(
  empresa: string,
  ano: number
): Promise<Map<Mes, ResumoEmpresaMes>> {
  const linhas = await linhasComerciaisDaEmpresa(
    empresa,
    `${ano}-01-01`,
    `${ano}-12-31`
  )
  const porMes = new Map<Mes, RelatorioComercial[]>()
  for (const l of linhas) {
    const m = parseInt(l.data.slice(5, 7), 10)
    const mes = MESES.find((mm) => MES_NUM_COMERCIAL[mm] === m)
    if (!mes) continue
    const lista = porMes.get(mes)
    if (lista) lista.push(l)
    else porMes.set(mes, [l])
  }
  const out = new Map<Mes, ResumoEmpresaMes>()
  for (const [mes, ls] of porMes) out.set(mes, comercialParaResumo(empresa, ls))
  return out
}

// Pipeline de oportunidades removido — o painel Comercial agora é só o
// funil de atividade (relatorios_comerciais). A tabela pipeline_comercial
// permanece no banco, sem uso pela aplicação.

// ============================================================
// Admin (Configurações → Gerenciar dados): editar/excluir relatórios.
// Gate ESTRITO por papel admin (requererAdmin). NÃO dispara notificação
// (diferente do salvar do formulário — editar/excluir não é "envio").
// ============================================================

/** Todos os relatórios comerciais (admin), mais recentes primeiro. */
export async function listarRelatoriosComerciaisAdmin(): Promise<
  RelatorioComercial[]
> {
  await requererAdmin()
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("relatorios_comerciais")
    .select("*")
    .order("data", { ascending: false })
    .limit(500)
  if (error) {
    console.error("[comercial] listar admin error", error.message)
    return []
  }
  return (data ?? []) as RelatorioComercial[]
}

/** Exclusão definitiva por id. Exige confirmação textual "Excluir". */
export async function excluirRelatorioComercialAction(
  formData: FormData
): Promise<ResultadoComercial> {
  await requererAdmin()
  const id = String(formData.get("id") ?? "").trim()
  const confirmacao = String(formData.get("confirmacao") ?? "")
  if (!id) return { ok: false, erro: "ID inválido." }
  if (confirmacao !== "Excluir") {
    return { ok: false, erro: 'Digite exatamente "Excluir" pra confirmar.' }
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { error } = await supabase
    .from("relatorios_comerciais")
    .delete()
    .eq("id", id)
  if (error) {
    console.error("[comercial] excluir error", error.message)
    return { ok: false, erro: error.message }
  }
  revalidatePath("/dashboard", "layout")
  return { ok: true }
}

/** Edição por id (admin). Update direto — não usa upsert, então não
 *  colide com a chave (empresa,data) a menos que se troque empresa/data
 *  para um par já existente (tratado como 23505). */
export async function atualizarRelatorioComercialAction(
  formData: FormData
): Promise<ResultadoComercial> {
  await requererAdmin()
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

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

  const { error } = await supabase
    .from("relatorios_comerciais")
    .update({
      empresa,
      data,
      mensagens: intDoForm(formData.get("mensagens")),
      retorno_mensagens: intDoForm(formData.get("retorno_mensagens")),
      qualificados: intDoForm(formData.get("qualificados")),
      reunioes_agendadas: intDoForm(formData.get("reunioes_agendadas")),
      reunioes_realizadas: intDoForm(formData.get("reunioes_realizadas")),
      no_shows: intDoForm(formData.get("no_shows")),
      propostas_enviadas: intDoForm(formData.get("propostas_enviadas")),
      contratos_fechados: intDoForm(formData.get("contratos_fechados")),
      faturamento_gerado: fatParse.value ?? 0,
      observacoes: (String(formData.get("observacoes") ?? "").trim() ||
        null) as string | null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        erro: "Já existe relatório para essa empresa nessa data.",
      }
    }
    console.error("[comercial] atualizar error", error.message)
    return { ok: false, erro: error.message }
  }
  revalidatePath("/dashboard", "layout")
  return { ok: true }
}
