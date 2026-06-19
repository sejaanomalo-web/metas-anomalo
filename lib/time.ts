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
  /** Origem do integrante:
   *   • "usuario"     → usuário de login (public.usuarios) que se qualifica.
   *   • "colaborador" → integrante do roster comercial (colaboradores_comerciais),
   *     sem necessidade de conta de login. Ausente = "usuario" (compat). */
  tipo?: "usuario" | "colaborador"
  /** Outros colaborador_id que pertencem a ESTA mesma pessoa (ex.: a pessoa
   *  era do roster e ganhou login com o mesmo e-mail; os relatórios antigos
   *  ficaram sob o uuid do roster). A aba Time agrega as métricas sob `id` +
   *  todos os `idsHistoricos`, evitando "perder" histórico ao mesclar. */
  idsHistoricos?: string[]
}

/**
 * Time que exerce a FUNÇÃO correspondente ao papel pedido (id, nome, email),
 * ordenado por nome.
 *
 * Para COMERCIAL, a lista é a UNIÃO de duas fontes:
 *   1. Usuários de login (public.usuarios) que se qualificam — ver regra abaixo.
 *   2. Integrantes do roster comercial (public.colaboradores_comerciais ativos),
 *      que NÃO precisam de conta de login — cadastrados na aba Comercial › Time.
 * Assim, novos integrantes do comercial aparecem no seletor "Responsável" do
 * formulário e na aba Time mesmo sem login. Deduplicado por e-mail/nome contra
 * os usuários (preferindo o usuário de login quando há sobreposição).
 *
 * Regra dos usuários de login: não basta o papel exato — quem é `custom`
 * (personalizado) e recebeu a função de formulário também conta (assim
 * Felipe/Guilherme, custom com formulario_comercial/trafego, entram). Mapeamento
 * papel → permissão:
 *   comercial      → formulario_comercial
 *   gestor_trafego → formulario_trafego
 * Admins ficam de fora dos usuários de login (são donos, não responsáveis) — se
 * um admin precisa aparecer como responsável do comercial, cadastre-o também no
 * roster (colaboradores_comerciais).
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

  const usuariosTime: MembroTime[] = ((data ?? []) as LinhaUsuario[])
    .filter((u) => {
      if (u.papel === "admin") return false
      if (u.papel === papel) return true // papel canônico (ex.: comercial)
      // custom/personalizado com a função de formulário correspondente
      return permForm ? u.permissoes?.[permForm] === true : false
    })
    .map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      tipo: "usuario" as const,
      idsHistoricos: [] as string[],
    }))

  // Só o comercial tem roster desacoplado de login. Os demais papéis
  // (ex.: gestor_trafego) seguem só com usuários de login.
  if (papel !== "comercial") {
    return usuariosTime.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  }

  const { data: rosterData, error: rosterErr } = await supabase
    .from("colaboradores_comerciais")
    .select("id, nome, email")
    .eq("ativo", true)
  if (rosterErr) {
    console.error("[time] roster comercial error", rosterErr.message)
    return usuariosTime.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  }

  // Dedup/merge — APENAS por E-MAIL (identidade forte). Nome NÃO é usado:
  //   • casar por nome dropava integrantes distintos que por acaso têm o mesmo
  //     nome de um usuário de login (dois "João Silva" reais);
  //   • mesclar por nome juntaria métricas de pessoas DIFERENTES (atribuição
  //     errada). E-mail é único, então só ele identifica "a mesma pessoa".
  // Quando o e-mail do roster casa com um usuário de login, é a MESMA conta:
  // não criamos uma 2ª linha — em vez disso anexamos o id do roster ao
  // `idsHistoricos` do usuário, para que a aba Time SOME os relatórios lançados
  // sob qualquer um dos dois uuids (o colaborador_id é congelado no envio e
  // nunca é reconciliado). Sem e-mail, ou com e-mail distinto, o integrante é
  // uma linha própria (sua própria identidade/métricas).
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase()
  const usuarioPorEmail = new Map<string, MembroTime>()
  for (const u of usuariosTime) {
    const e = norm(u.email)
    if (e) usuarioPorEmail.set(e, u)
  }

  const roster: MembroTime[] = []
  for (const c of (rosterData ?? []) as {
    id: string
    nome: string
    email: string | null
  }[]) {
    const e = norm(c.email)
    const usuarioCasado = e ? usuarioPorEmail.get(e) : undefined
    if (usuarioCasado) {
      // Mesma conta → mescla: agrega métricas sob os dois uuids.
      usuarioCasado.idsHistoricos = [
        ...(usuarioCasado.idsHistoricos ?? []),
        c.id,
      ]
      continue
    }
    roster.push({
      id: c.id,
      nome: c.nome,
      email: c.email ?? "",
      tipo: "colaborador",
      idsHistoricos: [],
    })
  }

  return [...usuariosTime, ...roster].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR")
  )
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

/** Soma o que UMA pessoa comercial entregou no intervalo (atribuição real por
 *  colaborador_id). Aceita um id OU vários — vários quando a pessoa tem
 *  identidades mescladas (roster + login com o mesmo e-mail; ver
 *  listarTimePorPapel.idsHistoricos), pra somar os relatórios sob qualquer um
 *  dos uuids. Lista vazia / sem ids → resumo zerado. */
export async function getResumoComercialColaborador(
  colaboradorId: string | string[],
  inicio: string,
  fim: string
): Promise<ResumoComercial> {
  const acc = resumoComercialVazio()
  const ids = (Array.isArray(colaboradorId) ? colaboradorId : [colaboradorId])
    .filter((x) => Boolean(x))
  if (ids.length === 0) return acc
  const supabase = getSupabaseAdmin()
  if (!supabase) return acc
  const { data, error } = await supabase
    .from("relatorios_comerciais")
    .select("*")
    .in("colaborador_id", ids)
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
