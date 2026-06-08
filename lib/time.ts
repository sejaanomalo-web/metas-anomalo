"use server"

import { getSupabaseAdmin } from "./supabase"
import type { PapelUsuario } from "./auth"
import type { RelatorioComercial, ResumoComercial } from "./comercial-tipos"
import { getDeltasDoPeriodo } from "./dados-diarios"

/**
 * Camada "Time" — lista pessoas do sistema por papel e agrega as métricas
 * individuais que cada uma entregou.
 *
 *   • Comercial: atribuição REAL por colaborador_id em relatorios_comerciais.
 *   • Tráfego: o tráfego pago é 100% automatizado (Sentinela), sem dono por
 *     pessoa — então a métrica do gestor é a OPERAÇÃO inteira do período
 *     (mesma pra todos os gestores, por decisão de produto).
 */

export interface MembroTime {
  id: string
  nome: string
  email: string
}

/**
 * Usuários ativos que exercem a FUNÇÃO correspondente ao papel pedido
 * (id, nome, email), ordenados por nome.
 *
 * Não basta o papel exato: quem é `custom` (personalizado) e recebeu a
 * função de formulário também conta — assim Felipe/Guilherme (custom com
 * formulario_comercial/trafego) aparecem no seletor de responsável e na aba
 * Time, conforme as funções marcadas. Mapeamento papel → permissão:
 *   comercial      → formulario_comercial
 *   gestor_trafego → formulario_trafego
 * Admins ficam de fora (são donos, não membros de time/responsáveis).
 */
export async function listarTimePorPapel(
  papel: PapelUsuario
): Promise<MembroTime[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, email, papel, permissoes")
    .eq("ativo", true)
    .order("nome")
  if (error) {
    console.error("[time] listar por papel error", error.message)
    return []
  }

  const permForm =
    papel === "comercial"
      ? "formulario_comercial"
      : papel === "gestor_trafego"
      ? "formulario_trafego"
      : null

  type LinhaUsuario = {
    id: string
    nome: string
    email: string
    papel: string
    permissoes: Record<string, boolean> | null
  }

  return ((data ?? []) as LinhaUsuario[])
    .filter((u) => {
      if (u.papel === "admin") return false
      if (u.papel === papel) return true // papel canônico (ex.: comercial)
      // custom/personalizado com a função de formulário correspondente
      return permForm ? u.permissoes?.[permForm] === true : false
    })
    .map((u) => ({ id: u.id, nome: u.nome, email: u.email }))
}

function resumoComercialVazio(): ResumoComercial {
  return {
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
}

/** Soma o que UM colaborador comercial entregou no intervalo (atribuição
 *  real por colaborador_id). Tabela vazia → resumo zerado. */
export async function getResumoComercialColaborador(
  colaboradorId: string,
  inicio: string,
  fim: string
): Promise<ResumoComercial> {
  const acc = resumoComercialVazio()
  const supabase = getSupabaseAdmin()
  if (!supabase) return acc
  const { data, error } = await supabase
    .from("relatorios_comerciais")
    .select("*")
    .eq("colaborador_id", colaboradorId)
    .gte("data", inicio)
    .lte("data", fim)
  if (error) {
    console.error("[time] resumo colaborador error", error.message)
    return acc
  }
  for (const l of (data ?? []) as RelatorioComercial[]) {
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

export interface ResumoTrafegoOperacao {
  investimento: number
  leads: number
  cpl: number
  reunioes: number
  contratos: number
  faturamento: number
  empresas: number
}

/** Operação de tráfego do período (todas as contas). É o "individual" do
 *  gestor por decisão de produto — tráfego pago não tem dono por pessoa. */
export async function getResumoTrafegoOperacao(
  inicio: string,
  fim: string
): Promise<ResumoTrafegoOperacao> {
  const d = await getDeltasDoPeriodo(inicio, fim)
  const cpl = d.somaLeads > 0 ? d.somaInvestimento / d.somaLeads : 0
  return {
    investimento: d.somaInvestimento,
    leads: d.somaLeads,
    cpl,
    reunioes: d.somaReunioes,
    contratos: d.somaContratos,
    faturamento: d.somaFaturamento,
    empresas: d.porEmpresa.size,
  }
}
