"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { getUsuarioAtual, temPermissao, type UsuarioSessao } from "./auth"
import { dataValida, normalizarContratos } from "./funil-calculo"
import { parseNumeroForm } from "./parse-numero"
import { getSupabaseAdmin } from "./supabase"
import { erroDeTabelaAusente } from "./funis-comerciais"
import {
  FONTES_PADRAO,
  FONTE_TRAFEGO,
  MAX_ETAPAS,
  MAX_FONTES,
  MAX_NOME_ETAPA,
  MAX_NOME_FONTE,
  MAX_NOME_FUNIL,
  MAX_OBSERVACOES,
  MAX_VALOR_ETAPA,
  MIN_ETAPAS,
  type EtapaFunil,
  type FunilComercial,
  fontesDoFunil,
  type ResultadoFunil,
} from "./funil-tipos"

/**
 * Escrita dos funis comerciais. Toda action de "use server" é um endpoint
 * público, chamável sem passar pela tela. Por isso cada uma confere a sessão, a
 * permissão do Comercial e o DONO do funil, sempre a partir do registro no
 * banco e nunca de um dado enviado pelo formulário.
 *
 * Regra de acesso: cada pessoa mexe só nos próprios funis. Admin mexe em todos.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEM_ACESSO = "Você não tem acesso a este funil."
const MIGRATION_PENDENTE =
  "O banco ainda não tem as tabelas dos funis. Aplique a migration 20261106_comercial_funis."
const MIGRATION_IMPORTACAO_PENDENTE =
  "O banco ainda não está pronto para importar. Aplique a migration 20261107_funil_lancamentos_importacao."
const MIGRATION_FONTES_PENDENTE =
  "O banco ainda não tem as fontes de demanda. Aplique a migration 20261108_funis_fontes_demanda."
const MIGRATION_CONTRATOS_PENDENTE =
  "O banco ainda não tem a lista de contratos. Aplique a migration 20261109_funil_lancamentos_contratos."

/** Mensagem de migration pendente, ou null se o erro é de outra natureza. */
function migrationPendente(
  erro: { code?: string; message?: string } | null
): string | null {
  const faltaAlgo =
    erro?.code === "42703" || // coluna inexistente
    erro?.code === "PGRST204" || // coluna fora do cache do PostgREST
    erro?.code === "42P10" // ON CONFLICT sem índice único correspondente
  if (!faltaAlgo) return null
  const msg = erro?.message ?? ""
  if (/contratos/i.test(msg)) return MIGRATION_CONTRATOS_PENDENTE
  return /fonte/i.test(msg) ? MIGRATION_FONTES_PENDENTE : MIGRATION_IMPORTACAO_PENDENTE
}

async function usuarioDoComercial(): Promise<UsuarioSessao | null> {
  const usuario = await getUsuarioAtual()
  return temPermissao(usuario, "dashboard_comercial") ? usuario : null
}

function podeMexerNoFunil(
  usuario: UsuarioSessao,
  funil: { usuario_id: string }
): boolean {
  return usuario.papel === "admin" || funil.usuario_id === usuario.id
}

async function buscarFunil(id: unknown): Promise<FunilComercial | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("funis_comerciais")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    console.error("[funis] buscar funil error", error.message)
    return null
  }
  return (data as FunilComercial | null) ?? null
}

function revalidar() {
  revalidatePath("/dashboard/comercial", "layout")
}

function erroDeGravacao(
  contexto: string,
  error: { code?: string; message: string }
): ResultadoFunil {
  if (erroDeTabelaAusente(error)) return { ok: false, erro: MIGRATION_PENDENTE }
  const pendente = migrationPendente(error)
  if (pendente) return { ok: false, erro: pendente }
  console.error(`[funis] ${contexto} error`, error.message)
  return { ok: false, erro: "Não foi possível salvar. Tente de novo." }
}

// ── Funil ───────────────────────────────────────────────────────────────────

export interface EntradaFunil {
  /** Ausente = criar. */
  id?: string
  /** Só admin usa, para criar funil para outra pessoa. */
  usuarioId?: string
  nome: string
  descricao?: string
  etapas: { id?: string; nome: string }[]
  fontes?: { id?: string; nome: string }[]
}

/**
 * Valida a lista de etapas. Id só é mantido se já existe no funil: é ele que
 * liga a etapa aos números lançados. Qualquer outro recebe um id novo gerado
 * aqui.
 */
function normalizarLista(
  entrada: unknown,
  idsExistentes: Set<string>,
  regra: { min: number; max: number; maxNome: number; singular: string; plural: string }
): { itens: EtapaFunil[] } | { erro: string } {
  if (!Array.isArray(entrada)) return { erro: `${regra.plural} inválidas.` }
  if (entrada.length < regra.min) {
    return { erro: `O funil precisa de pelo menos ${regra.min} ${regra.plural.toLowerCase()}.` }
  }
  if (entrada.length > regra.max) {
    return { erro: `O funil pode ter no máximo ${regra.max} ${regra.plural.toLowerCase()}.` }
  }
  const nomes = new Set<string>()
  const ids = new Set<string>()
  const itens: EtapaFunil[] = []
  for (const bruta of entrada as { id?: unknown; nome?: unknown }[]) {
    const nome = String(bruta?.nome ?? "").trim()
    if (!nome) {
      return { erro: `Dê um nome para todas as ${regra.plural.toLowerCase()}.` }
    }
    if (nome.length > regra.maxNome) {
      return { erro: `Nome de ${regra.singular} com mais de ${regra.maxNome} caracteres.` }
    }
    const chave = nome.toLocaleLowerCase("pt-BR")
    if (nomes.has(chave)) {
      return { erro: `A ${regra.singular} "${nome}" está repetida.` }
    }
    nomes.add(chave)
    const idBruto = typeof bruta?.id === "string" ? bruta.id : ""
    const id =
      idsExistentes.has(idBruto) && !ids.has(idBruto) ? idBruto : randomUUID()
    ids.add(id)
    itens.push({ id, nome })
  }
  return { itens }
}

export async function salvarFunilAction(
  entrada: EntradaFunil
): Promise<ResultadoFunil> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const nome = String(entrada?.nome ?? "").trim()
  if (!nome) return { ok: false, erro: "Dê um nome para o funil." }
  if (nome.length > MAX_NOME_FUNIL) {
    return { ok: false, erro: `Nome com mais de ${MAX_NOME_FUNIL} caracteres.` }
  }
  const descricao = String(entrada?.descricao ?? "").trim().slice(0, 300) || null

  const existente = entrada?.id ? await buscarFunil(entrada.id) : null
  if (entrada?.id) {
    if (!existente || !podeMexerNoFunil(usuario, existente)) {
      return { ok: false, erro: SEM_ACESSO }
    }
  }

  const normalizadas = normalizarLista(
    entrada?.etapas,
    new Set((existente?.etapas ?? []).map((e) => e.id)),
    {
      min: MIN_ETAPAS,
      max: MAX_ETAPAS,
      maxNome: MAX_NOME_ETAPA,
      singular: "etapa",
      plural: "Etapas",
    }
  )
  if ("erro" in normalizadas) return { ok: false, erro: normalizadas.erro }

  // Os ids padrão valem sempre, para uma fonte removida poder voltar a mesma.
  const fontesAtuais = existente ? fontesDoFunil(existente) : [...FONTES_PADRAO]
  const normalizadasFontes = normalizarLista(
    entrada?.fontes ?? fontesAtuais,
    new Set([...fontesAtuais, ...FONTES_PADRAO].map((f) => f.id)),
    {
      min: 1,
      max: MAX_FONTES,
      maxNome: MAX_NOME_FONTE,
      singular: "fonte",
      plural: "Fontes",
    }
  )
  if ("erro" in normalizadasFontes) {
    return { ok: false, erro: normalizadasFontes.erro }
  }
  const fontes = normalizadasFontes.itens
  if (!fontes.some((f) => f.id === FONTE_TRAFEGO)) {
    return {
      ok: false,
      erro: "A fonte de tráfego não pode ser removida: a importação do Meta entra nela.",
    }
  }

  // Fonte com lançamento não sai: os números ficariam sem fonte para filtrar.
  if (existente) {
    const removidas = fontesAtuais.filter(
      (f) => !fontes.some((n) => n.id === f.id)
    )
    if (removidas.length > 0) {
      const { data: emUso, error: erroUso } = await supabase
        .from("funil_lancamentos")
        .select("fonte")
        .eq("funil_id", existente.id)
        .in("fonte", removidas.map((f) => f.id))
        .limit(1)
      if (erroUso) return erroDeGravacao("conferir fontes", erroUso)
      const usada = removidas.find(
        (f) => f.id === (emUso as { fonte: string }[] | null)?.[0]?.fonte
      )
      if (usada) {
        return {
          ok: false,
          erro: `A fonte "${usada.nome}" tem lançamentos. Mude a fonte deles antes de removê-la.`,
        }
      }
    }
  }

  const consulta = existente
    ? supabase
        .from("funis_comerciais")
        .update({
          nome,
          descricao,
          etapas: normalizadas.itens,
          fontes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existente.id)
    : supabase.from("funis_comerciais").insert({
        // Só admin escolhe o dono. Qualquer outro cria sempre para si.
        usuario_id:
          usuario.papel === "admin" &&
          typeof entrada?.usuarioId === "string" &&
          UUID.test(entrada.usuarioId)
            ? entrada.usuarioId
            : usuario.id,
        nome,
        descricao,
        etapas: normalizadas.itens,
        fontes,
      })
  const { data, error } = await consulta.select("id").single()
  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um funil com esse nome." }
    }
    return erroDeGravacao("salvar funil", error)
  }
  revalidar()
  return { ok: true, id: (data as { id: string }).id }
}

/** Apaga o funil e, por CASCADE, todos os lançamentos dele. */
export async function excluirFunilAction(id: string): Promise<ResultadoFunil> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  const funil = await buscarFunil(id)
  if (!funil || !podeMexerNoFunil(usuario, funil)) {
    return { ok: false, erro: SEM_ACESSO }
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { error } = await supabase
    .from("funis_comerciais")
    .delete()
    .eq("id", funil.id)
  if (error) return erroDeGravacao("excluir funil", error)
  revalidar()
  return { ok: true }
}

// ── Lançamento ──────────────────────────────────────────────────────────────

function moedaDoForm(
  v: FormDataEntryValue | null,
  rotulo: string
): { valor: number } | { erro: string } {
  const r = parseNumeroForm(v)
  if (r.erro) return { erro: r.erro }
  const valor = r.value ?? 0
  if (valor < 0) return { erro: `${rotulo} não pode ser negativo.` }
  if (valor >= 1e12) return { erro: `${rotulo} acima do limite.` }
  return { valor }
}

function inteiroDoForm(v: FormDataEntryValue | null): number | null {
  const bruto = String(v ?? "").trim()
  if (bruto === "") return 0
  if (!/^\d+$/.test(bruto)) return null
  const n = parseInt(bruto, 10)
  return n <= MAX_VALOR_ETAPA ? n : null
}

/** Cria ou edita. Lançamento novo soma com os demais da mesma data. */
export async function salvarLancamentoAction(
  formData: FormData
): Promise<ResultadoFunil> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const lancamentoId = String(formData.get("id") ?? "").trim()
  let funilId = String(formData.get("funil_id") ?? "").trim()
  let importado = false

  // Na edição, o funil vem do registro gravado. Um funil_id enviado pelo
  // formulário permitiria mover o lançamento para o funil de outra pessoa.
  if (lancamentoId) {
    if (!UUID.test(lancamentoId)) return { ok: false, erro: SEM_ACESSO }
    const { data, error } = await supabase
      .from("funil_lancamentos")
      .select("funil_id, origem_importacao")
      .eq("id", lancamentoId)
      .maybeSingle()
    if (error) return erroDeGravacao("buscar lancamento", error)
    if (!data) return { ok: false, erro: "Esse lançamento não existe mais." }
    const linha = data as { funil_id: string; origem_importacao: string | null }
    funilId = linha.funil_id
    importado = Boolean(linha.origem_importacao)
  }

  const funil = await buscarFunil(funilId)
  if (!funil || !podeMexerNoFunil(usuario, funil)) {
    return { ok: false, erro: SEM_ACESSO }
  }

  const data = String(formData.get("data") ?? "").trim()
  if (!dataValida(data)) return { ok: false, erro: "Informe uma data válida." }

  // O que veio do arquivo do Meta é tráfego e continua sendo.
  const fonte = importado
    ? FONTE_TRAFEGO
    : String(formData.get("fonte") ?? "").trim() || FONTE_TRAFEGO
  if (!fontesDoFunil(funil).some((f) => f.id === fonte)) {
    return { ok: false, erro: "Escolha uma fonte de demanda válida." }
  }

  const investimento = moedaDoForm(formData.get("investimento"), "Investimento")
  if ("erro" in investimento) return { ok: false, erro: investimento.erro }
  const lista = normalizarContratos(formData.get("contratos"))
  if ("erro" in lista) return { ok: false, erro: lista.erro }
  const contratos = lista.contratos
  // O faturamento gravado é o que entra no 1º mês: as outras telas somam ele.
  const faturamento =
    Math.round(contratos.reduce((s, c) => s + c.primeira, 0) * 100) / 100

  const perdidos = inteiroDoForm(formData.get("perdidos"))
  if (perdidos === null) return { ok: false, erro: "Perdidos inválido." }

  // Só as etapas que existem no funil são gravadas.
  const valores: Record<string, number> = {}
  for (const etapa of funil.etapas) {
    const n = inteiroDoForm(formData.get(`etapa_${etapa.id}`))
    if (n === null) {
      return { ok: false, erro: `Valor inválido em "${etapa.nome}".` }
    }
    if (n > 0) valores[etapa.id] = n
  }

  if (
    Object.keys(valores).length === 0 &&
    investimento.valor === 0 &&
    contratos.length === 0 &&
    perdidos === 0
  ) {
    return { ok: false, erro: "Preencha pelo menos um número." }
  }

  const campos = {
    data,
    fonte,
    investimento: investimento.valor,
    faturamento,
    contratos,
    perdidos,
    valores,
    observacoes:
      String(formData.get("observacoes") ?? "")
        .trim()
        .slice(0, MAX_OBSERVACOES) || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = lancamentoId
    ? await supabase
        .from("funil_lancamentos")
        .update(campos)
        .eq("id", lancamentoId)
    : await supabase
        .from("funil_lancamentos")
        .insert({ ...campos, funil_id: funil.id, criado_por: usuario.id })
  if (error) {
    // Só linha importada colide: cada data aceita uma importação por funil.
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe uma importação do Meta nessa data." }
    }
    return erroDeGravacao("salvar lancamento", error)
  }
  revalidar()
  return { ok: true }
}

export async function excluirLancamentoAction(
  id: string
): Promise<ResultadoFunil> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  if (typeof id !== "string" || !UUID.test(id)) {
    return { ok: false, erro: SEM_ACESSO }
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { data, error: erroBusca } = await supabase
    .from("funil_lancamentos")
    .select("funil_id")
    .eq("id", id)
    .maybeSingle()
  if (erroBusca) return erroDeGravacao("buscar lancamento", erroBusca)
  // Já não existe: é o resultado que a pessoa queria, sem erro para mostrar.
  if (!data) return { ok: true }
  const funil = await buscarFunil((data as { funil_id: string }).funil_id)
  if (!funil || !podeMexerNoFunil(usuario, funil)) {
    return { ok: false, erro: SEM_ACESSO }
  }
  const { error } = await supabase
    .from("funil_lancamentos")
    .delete()
    .eq("id", id)
  if (error) return erroDeGravacao("excluir lancamento", error)
  revalidar()
  return { ok: true }
}

// ── Importação de arquivo do Meta ───────────────────────────────────────────

export interface ConferenciaImportacao extends ResultadoFunil {
  /** Datas que já têm linha importada: serão atualizadas, sem somar. */
  jaImportadas?: string[]
  /** Datas com lançamento manual com gasto: o investimento pode contar 2x. */
  comInvestimentoManual?: string[]
}

export interface EntradaImportacao {
  funilId: string
  arquivo: string
  campanhas: string[]
  dias: {
    data: string
    investimento: number | null
    valores: Record<string, number>
  }[]
}

const LIMITE_DIAS = 1500

/** Só lê: mostra na revisão o que a importação vai encontrar no funil. */
export async function conferirImportacaoAction(
  funilId: string,
  datas: string[]
): Promise<ConferenciaImportacao> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  const funil = await buscarFunil(funilId)
  if (!funil || !podeMexerNoFunil(usuario, funil)) {
    return { ok: false, erro: SEM_ACESSO }
  }
  if (
    !Array.isArray(datas) ||
    datas.length > LIMITE_DIAS ||
    !datas.every(dataValida)
  ) {
    return { ok: false, erro: "Datas inválidas." }
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { data, error } = await supabase
    .from("funil_lancamentos")
    .select("data, investimento, origem_importacao, fonte")
    .eq("funil_id", funil.id)
    .in("data", datas)
    .limit(LIMITE_DIAS * 4)
  if (error) {
    return erroDeGravacao("conferir importacao", error)
  }
  const linhas = (data ?? []) as {
    data: string
    investimento: number
    origem_importacao: string | null
    fonte: string
  }[]
  return {
    ok: true,
    jaImportadas: linhas.filter((l) => l.origem_importacao).map((l) => l.data),
    comInvestimentoManual: Array.from(
      new Set(
        linhas
          .filter(
            (l) =>
              !l.origem_importacao &&
              l.fonte === FONTE_TRAFEGO &&
              Number(l.investimento) > 0
          )
          .map((l) => l.data)
      )
    ),
  }
}

/**
 * Grava os totais por data em um único upsert. Reimportar a mesma data atualiza
 * a linha em vez de somar. Etapas fora deste arquivo, perdidos e faturamento são
 * mantidos, para não apagar o que foi completado à mão nem o gasto trazido por
 * outro arquivo.
 */
export async function importarLancamentosAction(
  entrada: EntradaImportacao
): Promise<ResultadoFunil & { novas?: number; atualizadas?: number }> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  const funil = await buscarFunil(entrada?.funilId)
  if (!funil || !podeMexerNoFunil(usuario, funil)) {
    return { ok: false, erro: SEM_ACESSO }
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const dias = entrada?.dias
  if (!Array.isArray(dias) || dias.length === 0) {
    return { ok: false, erro: "Nada para importar." }
  }
  if (dias.length > LIMITE_DIAS) {
    return { ok: false, erro: `Limite de ${LIMITE_DIAS} datas por importação.` }
  }

  const idsEtapas = new Set(funil.etapas.map((e) => e.id))
  const vistas = new Set<string>()
  for (const dia of dias) {
    if (!dataValida(dia?.data) || vistas.has(dia.data)) {
      return { ok: false, erro: "O arquivo tem uma data inválida ou repetida." }
    }
    vistas.add(dia.data)
    const inv = dia.investimento
    if (inv !== null && (typeof inv !== "number" || !(inv >= 0) || inv >= 1e12)) {
      return { ok: false, erro: `Investimento inválido em ${dia.data}.` }
    }
    for (const [etapa, n] of Object.entries(dia.valores ?? {})) {
      if (
        !idsEtapas.has(etapa) ||
        !Number.isInteger(n) ||
        n < 0 ||
        n > MAX_VALOR_ETAPA
      ) {
        return { ok: false, erro: `Valor inválido em ${dia.data}.` }
      }
    }
  }

  const { data: existentes, error: erroLeitura } = await supabase
    .from("funil_lancamentos")
    .select("data, investimento, valores, perdidos, faturamento, observacoes")
    .eq("funil_id", funil.id)
    .eq("origem_importacao", "meta")
    .in("data", Array.from(vistas))
    .limit(LIMITE_DIAS)
  if (erroLeitura) {
    return erroDeGravacao("ler importacao", erroLeitura)
  }
  type Existente = {
    data: string
    investimento: number
    valores: Record<string, number>
    perdidos: number
    faturamento: number
    observacoes: string | null
  }
  const porData = new Map(
    ((existentes ?? []) as Existente[]).map((l) => [l.data, l])
  )

  const detalhe = {
    arquivo: String(entrada.arquivo ?? "").slice(0, 200),
    campanhas: (Array.isArray(entrada.campanhas) ? entrada.campanhas : [])
      .slice(0, 100)
      .map((c) => String(c).slice(0, 200)),
  }
  const agora = new Date().toISOString()
  const linhas = dias.map((dia) => {
    const atual = porData.get(dia.data)
    return {
      funil_id: funil.id,
      data: dia.data,
      origem_importacao: "meta",
      fonte: FONTE_TRAFEGO,
      investimento: dia.investimento ?? Number(atual?.investimento ?? 0),
      valores: { ...(atual?.valores ?? {}), ...dia.valores },
      perdidos: atual?.perdidos ?? 0,
      faturamento: Number(atual?.faturamento ?? 0),
      observacoes: atual?.observacoes ?? null,
      detalhe_importacao: detalhe,
      criado_por: usuario.id,
      updated_at: agora,
    }
  })

  const { error } = await supabase
    .from("funil_lancamentos")
    .upsert(linhas, { onConflict: "funil_id,data,origem_importacao" })
  if (error) {
    return erroDeGravacao("importar", error)
  }
  revalidar()
  return {
    ok: true,
    novas: dias.length - porData.size,
    atualizadas: porData.size,
  }
}

/** Desfaz importações: apaga as linhas importadas do funil em um período. */
export async function excluirImportadosAction(
  funilId: string,
  de: string,
  ate: string
): Promise<ResultadoFunil> {
  const usuario = await usuarioDoComercial()
  if (!usuario) return { ok: false, erro: SEM_ACESSO }
  const funil = await buscarFunil(funilId)
  if (!funil || !podeMexerNoFunil(usuario, funil)) {
    return { ok: false, erro: SEM_ACESSO }
  }
  if (!dataValida(de) || !dataValida(ate)) {
    return { ok: false, erro: "Período inválido." }
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }
  const { error } = await supabase
    .from("funil_lancamentos")
    .delete()
    .eq("funil_id", funil.id)
    .eq("origem_importacao", "meta")
    .gte("data", de)
    .lte("data", ate)
  if (error) {
    return erroDeGravacao("excluir importados", error)
  }
  revalidar()
  return { ok: true }
}
