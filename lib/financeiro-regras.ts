/**
 * Regras de negócio do financeiro — funções PURAS, sem banco e sem React.
 *
 * Este arquivo é a fonte única das quatro regras que decidem quanto dinheiro
 * aparece em cada tela:
 *
 *   • em que SITUAÇÃO um lançamento entra (realizado / previsto / total)
 *   • em que MÊS ele cai (competência × vencimento)
 *   • como se SOMA uma lista (e como o saldo é formado)
 *   • quando um recorrente gera lançamento, e em que dia
 *
 * Por que separado de lib/financeiro.ts: aquele arquivo importa o cliente
 * Supabase (server-only) e não pode ser carregado por um componente de
 * cliente nem por um teste de node. Aqui não há import nenhum — roda em
 * qualquer lugar, e é isso que permite que a MESMA função valide um
 * totalizador na tela e um assert no teste.
 *
 * Regra de ouro: um total que não bate com a soma das linhas visíveis é o
 * pior defeito possível numa tela de dinheiro. Por isso toda soma do módulo
 * passa por `somarLancamentos` — nenhuma tela soma por conta própria.
 */

// ============================================================
// Vocabulário
// ============================================================

/** Como o dinheiro é classificado no banco. */
export type TipoLancamento = "receita" | "despesa"

/**
 * Status gravado. Note que NÃO existe 'atrasado': uma conta vencida continua
 * sendo `previsto` e o atraso é DERIVADO da data (ver `estaAtrasado`). Guardar
 * um quarto status exigiria alguém varrendo a tabela todo dia pra mantê-lo
 * verdadeiro — e um status desatualizado mente sobre dinheiro.
 */
export type StatusLancamento = "previsto" | "realizado" | "cancelado"

export type TipoConta = "banco" | "caixa" | "cartao_credito" | "investimento"
export type Periodicidade = "mensal" | "anual" | "semanal"

/**
 * Recorte de soma escolhido pelo usuário na tela de Lançamentos.
 * Não confundir com `StatusLancamento`: 'previsto' aqui é uma SITUAÇÃO que
 * agrupa status, e 'total' não corresponde a status nenhum.
 */
export type SituacaoFinanceira = "realizado" | "previsto" | "total"

export const SITUACOES: readonly SituacaoFinanceira[] = [
  "realizado",
  "previsto",
  "total",
]

/** Forma mínima que as regras precisam enxergar de um lançamento. */
export interface LancamentoParaRegra {
  tipo: TipoLancamento
  status: StatusLancamento
  /** Competência: quando o fato aconteceu. */
  data: string
  /** Quando o dinheiro deve andar. Nulo = usa a competência. */
  data_vencimento?: string | null
  data_pagamento?: string | null
  /** numeric do Postgres chega como string em algumas rotas — sempre normalizar. */
  valor: number | string
}

// ============================================================
// Valores
// ============================================================

/**
 * Converte o `valor` para número. O `numeric(12,2)` do Postgres volta como
 * string ("1900.00") em parte das leituras e como number em outras; somar sem
 * normalizar concatena texto e o total sai absurdo.
 */
export function valorNumerico(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = Number(String(v).trim())
  return Number.isFinite(n) ? n : 0
}

// ============================================================
// R1 — Situação do dinheiro
// ============================================================

/**
 * R1. Um lançamento entra na situação pedida?
 *
 *   realizado = status 'realizado'
 *   previsto  = status 'previsto' (inclui o vencido: conta atrasada continua
 *               sendo dinheiro que vai andar — se sumisse do previsto, o total
 *               cairia sozinho e alguém concluiria que foi paga)
 *   total     = realizado + previsto
 *
 * `cancelado` NUNCA entra em nenhuma das três, nem no total.
 */
export function entraNaSituacao(
  status: StatusLancamento,
  situacao: SituacaoFinanceira
): boolean {
  if (status === "cancelado") return false
  if (situacao === "total") return true
  return status === situacao
}

/**
 * Atraso é derivado, não gravado: previsto cujo vencimento efetivo já passou.
 * `hoje` entra por parâmetro para o teste não depender do relógio.
 */
export function estaAtrasado(l: LancamentoParaRegra, hoje: string): boolean {
  if (l.status !== "previsto") return false
  return vencimentoEfetivo(l) < hoje
}

/** Vencimento para efeito de cobrança: o informado, ou a competência. */
export function vencimentoEfetivo(l: LancamentoParaRegra): string {
  return l.data_vencimento ?? l.data
}

// ============================================================
// R2 — Rótulos que mudam com a situação
// ============================================================

export interface RotulosSituacao {
  entrada: string
  saida: string
  saldo: string
  /** Texto do `title`, explicando o recorte sem abrir documentação. */
  dica: string
}

/** R2. O mesmo número com rótulo errado vira outra informação. */
export function rotulosDaSituacao(s: SituacaoFinanceira): RotulosSituacao {
  switch (s) {
    case "realizado":
      return {
        entrada: "Recebido",
        saida: "Pago",
        saldo: "Saldo realizado",
        dica: "Só o que já entrou ou saiu da conta.",
      }
    case "previsto":
      return {
        entrada: "A receber",
        saida: "A pagar",
        saldo: "Saldo previsto",
        dica: "O que ainda vai andar, incluindo o que já venceu.",
      }
    case "total":
      return {
        entrada: "Receitas",
        saida: "Despesas",
        saldo: "Saldo",
        dica: "Realizado + previsto. Cancelados ficam de fora.",
      }
  }
}

export function rotuloSituacaoCurto(s: SituacaoFinanceira): string {
  return s === "realizado" ? "Realizado" : s === "previsto" ? "Previsto" : "Total"
}

// ============================================================
// R3 — Em que mês o lançamento cai
// ============================================================

/**
 * R3. A data que decide o período: o mês em que o DINHEIRO SE MEXE.
 *
 *   pago     → competência (foi quando o caixa mudou)
 *   em aberto → vencimento; sem vencimento, competência
 *
 * Caso real que a regra resolve: uma venda fechada em setembro para receber em
 * 13/out tem que aparecer em OUTUBRO, não em setembro.
 */
export function dataDoPeriodo(l: LancamentoParaRegra): string {
  if (l.status === "realizado") return l.data
  return l.data_vencimento ?? l.data
}

/** A mesma regra como predicado de recorte. Espelha `RAMOS_PERIODO`. */
export function dentroDoPeriodo(
  l: LancamentoParaRegra,
  de: string,
  ate: string
): boolean {
  const d = dataDoPeriodo(l)
  return d >= de && d <= ate
}

/**
 * Os três ramos do filtro equivalente no banco. Ficam declarados como DADO,
 * e tanto o predicado em memória quanto a string do PostgREST saem daqui —
 * é o que impede os dois de divergirem com o tempo.
 *
 * O terceiro ramo não é redundante: no Postgres `null >= '2026-01-01'` é NULL,
 * não `false`, então um lançamento em aberto SEM vencimento sumiria da lista
 * se só existissem os dois primeiros.
 */
export const RAMOS_PERIODO = [
  { quando: "status=realizado", campoData: "data" },
  { quando: "status≠realizado", campoData: "data_vencimento" },
  { quando: "status≠realizado e vencimento nulo", campoData: "data" },
] as const

/**
 * Filtro PostgREST correspondente a R3, para `.or(...)`.
 * Uma mudança aqui tem que sair junto com `dataDoPeriodo` — por isso os dois
 * moram no mesmo arquivo e o teste compara os dois nos três casos de borda.
 */
export function filtroPeriodoPostgREST(de: string, ate: string): string {
  return [
    `and(status.eq.realizado,data.gte.${de},data.lte.${ate})`,
    `and(status.neq.realizado,data_vencimento.gte.${de},data_vencimento.lte.${ate})`,
    `and(status.neq.realizado,data_vencimento.is.null,data.gte.${de},data.lte.${ate})`,
  ].join(",")
}

/**
 * R6. Eixo de vencimento: recorta e ordena por coalesce(vencimento,
 * competência), pago ou não. Vem de links externos (?eixo=vencimento), onde a
 * pergunta é "o que vence neste dia", e não "de que mês é este dinheiro".
 */
export function dentroDoPeriodoPorVencimento(
  l: LancamentoParaRegra,
  de: string,
  ate: string
): boolean {
  const d = vencimentoEfetivo(l)
  return d >= de && d <= ate
}

export function filtroVencimentoPostgREST(de: string, ate: string): string {
  return [
    `and(data_vencimento.gte.${de},data_vencimento.lte.${ate})`,
    `and(data_vencimento.is.null,data.gte.${de},data.lte.${ate})`,
  ].join(",")
}

export type EixoPeriodo = "competencia" | "vencimento"

/** A data que a lista mostra e pela qual ordena — sempre a que recortou. */
export function dataDoEixo(l: LancamentoParaRegra, eixo: EixoPeriodo): string {
  return eixo === "vencimento" ? vencimentoEfetivo(l) : dataDoPeriodo(l)
}

// ============================================================
// Somas — R1 + R5
// ============================================================

export interface TotaisFinanceiros {
  entradas: number
  saidas: number
  saldo: number
  quantidade: number
}

/**
 * Soma uma lista já recortada, respeitando R1. É a ÚNICA soma do módulo:
 * KPIs, totalizadores da lista e detalhe de conta chamam todos esta função,
 * então o total sempre bate com as linhas visíveis.
 */
export function somarLancamentos(
  lancamentos: readonly LancamentoParaRegra[],
  situacao: SituacaoFinanceira = "total"
): TotaisFinanceiros {
  let entradas = 0
  let saidas = 0
  let quantidade = 0
  for (const l of lancamentos) {
    if (!entraNaSituacao(l.status, situacao)) continue
    quantidade += 1
    const v = valorNumerico(l.valor)
    if (l.tipo === "receita") entradas += v
    else saidas += v
  }
  return { entradas, saidas, saldo: entradas - saidas, quantidade }
}

/**
 * R5. Saldo atual da conta = saldo inicial + receitas pagas − despesas pagas.
 * Só entra lançamento com data de pagamento preenchida: é ela que diz que o
 * dinheiro efetivamente andou naquela conta.
 */
export function saldoDaConta(
  saldoInicial: number | string,
  lancamentosDaConta: readonly LancamentoParaRegra[]
): number {
  let saldo = valorNumerico(saldoInicial)
  for (const l of lancamentosDaConta) {
    if (l.status !== "realizado") continue
    if (!l.data_pagamento) continue
    const v = valorNumerico(l.valor)
    saldo += l.tipo === "receita" ? v : -v
  }
  return saldo
}

// ============================================================
// R11 — Materialização de recorrentes
// ============================================================

/** Último dia do mês (1–12). Ano bissexto sai de graça do Date. */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate()
}

/**
 * R11. Data do lançamento gerado. O dia é grampeado no último do mês: um
 * recorrente "todo dia 31" vence em 28 (ou 29) de fevereiro, não em 3 de março.
 */
export function dataDoRecorrenteNoMes(
  ano: number,
  mes: number,
  diaVencimento: number
): string {
  const dia = Math.min(Math.max(1, diaVencimento), ultimoDiaDoMes(ano, mes))
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

export interface RecorrenteParaRegra {
  ativo: boolean
  periodicidade: Periodicidade
  dia_vencimento: number | null
  inicio: string
  fim: string | null
}

export function primeiroDiaISO(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-01`
}

export function ultimoDiaISO(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(
    ultimoDiaDoMes(ano, mes)
  ).padStart(2, "0")}`
}

/**
 * R11. O recorrente gera lançamento neste mês?
 *
 * Só `mensal` é materializado — anual e semanal existem no cadastro mas não
 * são gerados (limitação conhecida e deliberada, não esquecimento).
 */
export function recorrenteCobreMes(
  rec: RecorrenteParaRegra,
  ano: number,
  mes: number
): boolean {
  if (!rec.ativo) return false
  if (rec.periodicidade !== "mensal") return false
  if (!rec.dia_vencimento) return false
  const inicioMes = primeiroDiaISO(ano, mes)
  const fimMes = ultimoDiaISO(ano, mes)
  if (rec.inicio > fimMes) return false
  if (rec.fim && rec.fim < inicioMes) return false
  return true
}

/**
 * R11. Dada a lista de recorrentes e os lançamentos que JÁ existem no mês,
 * devolve quais precisam ser gerados e em que data.
 *
 * A idempotência mora aqui: rodar duas vezes o mesmo mês devolve lista vazia
 * na segunda, porque o recorrente já aparece em `recorrentesJaGerados`. O
 * índice único no banco é a segunda trava, para o caso de dois cliques
 * simultâneos passarem os dois pela checagem.
 */
export function recorrentesAMaterializar<T extends RecorrenteParaRegra & { id: string }>(
  recorrentes: readonly T[],
  recorrentesJaGerados: readonly string[],
  ano: number,
  mes: number
): { recorrente: T; data: string }[] {
  const jaTem = new Set(recorrentesJaGerados)
  const saida: { recorrente: T; data: string }[] = []
  for (const rec of recorrentes) {
    if (jaTem.has(rec.id)) continue
    if (!recorrenteCobreMes(rec, ano, mes)) continue
    saida.push({
      recorrente: rec,
      data: dataDoRecorrenteNoMes(ano, mes, rec.dia_vencimento as number),
    })
  }
  return saida
}

// ============================================================
// Meses — calendário de verdade, 1 a 12
// ============================================================

/**
 * O resto do sistema usa `Mes` (lib/data.ts), que cobre só Abril–Dezembro:
 * é a janela operacional das metas, e janeiro/fevereiro/março caem em Abril
 * como menor opção disponível.
 *
 * No financeiro isso não serve. O caixa existe nos doze meses, e o fallback
 * silencioso fazia o cron mensal do dia 1º materializar ABRIL quando rodasse
 * em janeiro. Por isso o módulo trabalha internamente com mês numérico e usa
 * `Mes` apenas como rótulo de UI, quando a tela pede.
 */
export const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const

export const NOMES_MES_CURTO = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const

/** Nome do mês (1–12). Fora da faixa devolve string vazia em vez de quebrar. */
export function rotuloMes(mes: number): string {
  return NOMES_MES[mes - 1] ?? ""
}

export function rotuloMesCurto(mes: number): string {
  return NOMES_MES_CURTO[mes - 1] ?? ""
}

/** Ano e mês (1–12) de uma data ISO, sem passar por Date (e sem fuso). */
export function anoMesDeISO(iso: string): { ano: number; mes: number } {
  return {
    ano: Number(iso.slice(0, 4)),
    mes: Number(iso.slice(5, 7)),
  }
}

/** Chave "AAAA-MM" — usada para agrupar séries mensais. */
export function chaveMes(iso: string): string {
  return iso.slice(0, 7)
}

// ============================================================
// Cores das categorias
// ============================================================

/**
 * Paleta das categorias: 12 cores + o bege da marca. Uma categoria sem cor
 * recebe sempre a MESMA cor (hash do id), então ela não muda de cor conforme
 * a tela — o que tornaria o gráfico de pizza ilegível entre uma aba e outra.
 */
export const PALETA_CATEGORIAS = [
  "#C9953A", "#16a34a", "#ef4444", "#3974e6", "#9333ea", "#0fcc7d",
  "#eab308", "#ec4899", "#06b6d4", "#f97316", "#8b5cf6", "#14b8a6",
] as const

export const COR_BEGE = "#d9c9a8"

/** Todas as cores oferecidas no seletor do formulário de categoria. */
export const CORES_DISPONIVEIS = [...PALETA_CATEGORIAS, COR_BEGE]

/** FNV-1a de 32 bits — determinístico e estável entre servidor e cliente. */
function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export function corDeterministica(id: string): string {
  return PALETA_CATEGORIAS[hash32(id) % PALETA_CATEGORIAS.length]
}

/** Cor de exibição: a gravada, ou uma estável derivada do id. */
export function corDaCategoria(
  categoria: { id: string; cor?: string | null } | null | undefined
): string {
  if (!categoria) return "#4c4e54"
  return categoria.cor || corDeterministica(categoria.id)
}

/**
 * Primeira cor da paleta que ninguém está usando — sugestão pra categoria
 * nova. Se todas já foram usadas, volta a circular pela paleta.
 */
export function proximaCorLivre(coresEmUso: readonly (string | null)[]): string {
  const usadas = new Set(
    coresEmUso.filter(Boolean).map((c) => (c as string).toLowerCase())
  )
  for (const cor of PALETA_CATEGORIAS) {
    if (!usadas.has(cor.toLowerCase())) return cor
  }
  return PALETA_CATEGORIAS[usadas.size % PALETA_CATEGORIAS.length]
}

// ============================================================
// Séries por granularidade (detalhe de categoria e de conta)
// ============================================================

export type Granularidade = "ano" | "mes" | "semana" | "dia"

export const GRANULARIDADES: readonly Granularidade[] = ["ano", "mes", "semana", "dia"]

export function rotuloGranularidade(g: Granularidade): string {
  return g === "ano" ? "Ano" : g === "mes" ? "Mês" : g === "semana" ? "Semana" : "Dia"
}

export interface BaldeSerie {
  /** Chave de agrupamento, usada só internamente. */
  chave: string
  rotulo: string
  receitas: number
  despesas: number
  resultado: number
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Segunda-feira da semana de uma data. Semana começando na segunda porque é
 * como se olha semana de trabalho no Brasil — domingo no meio da semana
 * partiria o fim de semana em dois baldes.
 */
export function inicioDaSemanaISO(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const diaSemana = d.getUTCDay() // 0 = domingo
  const recuo = diaSemana === 0 ? 6 : diaSemana - 1
  return somarDias(iso, -recuo)
}

/**
 * Baldes vazios de uma granularidade, terminando em `referencia`. Devolver os
 * baldes vazios (e não só os que têm dado) é o que faz o gráfico mostrar a
 * lacuna: um mês sem nenhuma despesa precisa aparecer como zero, não sumir e
 * dar a impressão de que os meses são contíguos.
 */
export function baldesDaGranularidade(
  g: Granularidade,
  referencia: string
): BaldeSerie[] {
  const vazio = (chave: string, rotulo: string): BaldeSerie => ({
    chave, rotulo, receitas: 0, despesas: 0, resultado: 0,
  })
  const { ano, mes } = anoMesDeISO(referencia)

  if (g === "ano") {
    return Array.from({ length: 5 }, (_, i) => {
      const a = ano - 4 + i
      return vazio(String(a), String(a))
    })
  }
  if (g === "mes") {
    return Array.from({ length: 12 }, (_, i) => {
      // 12 meses terminando no mês de referência, atravessando a virada do ano.
      const total = ano * 12 + (mes - 1) - (11 - i)
      const a = Math.floor(total / 12)
      const m = (total % 12) + 1
      return vazio(
        `${a}-${String(m).padStart(2, "0")}`,
        m === 1 ? `${rotuloMesCurto(m)}/${String(a).slice(2)}` : rotuloMesCurto(m)
      )
    })
  }
  if (g === "semana") {
    const segunda = inicioDaSemanaISO(referencia)
    return Array.from({ length: 12 }, (_, i) => {
      const ini = somarDias(segunda, (i - 11) * 7)
      return vazio(ini, `${ini.slice(8, 10)}/${ini.slice(5, 7)}`)
    })
  }
  // dia: os dias do mês de referência
  const total = ultimoDiaDoMes(ano, mes)
  return Array.from({ length: total }, (_, i) => {
    const dia = String(i + 1).padStart(2, "0")
    return vazio(`${ano}-${String(mes).padStart(2, "0")}-${dia}`, dia)
  })
}

/** Em qual balde uma data cai, dada a granularidade. */
export function chaveDaGranularidade(g: Granularidade, iso: string): string {
  if (g === "ano") return iso.slice(0, 4)
  if (g === "mes") return iso.slice(0, 7)
  if (g === "semana") return inicioDaSemanaISO(iso)
  return iso
}

/**
 * Distribui lançamentos nos baldes, usando a data de R3. Datas fora da janela
 * são descartadas em silêncio — é o comportamento certo: o gráfico mostra a
 * janela pedida, não tudo que existe.
 */
export function montarSerie(
  lancamentos: readonly LancamentoParaRegra[],
  g: Granularidade,
  referencia: string,
  situacao: SituacaoFinanceira = "realizado"
): BaldeSerie[] {
  const baldes = baldesDaGranularidade(g, referencia)
  const porChave = new Map(baldes.map((b) => [b.chave, b]))
  for (const l of lancamentos) {
    if (!entraNaSituacao(l.status, situacao)) continue
    const balde = porChave.get(chaveDaGranularidade(g, dataDoPeriodo(l)))
    if (!balde) continue
    const v = valorNumerico(l.valor)
    if (l.tipo === "receita") balde.receitas += v
    else balde.despesas += v
  }
  for (const b of baldes) b.resultado = b.receitas - b.despesas
  return baldes
}

/** Janela coberta por uma granularidade — vira o recorte da consulta. */
export function janelaDaGranularidade(
  g: Granularidade,
  referencia: string
): { de: string; ate: string } {
  const baldes = baldesDaGranularidade(g, referencia)
  const primeiro = baldes[0].chave
  const ultimo = baldes[baldes.length - 1].chave
  if (g === "ano") return { de: `${primeiro}-01-01`, ate: `${ultimo}-12-31` }
  if (g === "mes") {
    const { ano, mes } = anoMesDeISO(`${ultimo}-01`)
    return { de: `${primeiro}-01`, ate: ultimoDiaISO(ano, mes) }
  }
  if (g === "semana") return { de: primeiro, ate: somarDias(ultimo, 6) }
  return { de: primeiro, ate: ultimo }
}

// ============================================================
// Navegação segura
// ============================================================

/**
 * `?voltar=` só aceita caminho INTERNO. Sem isso, um link montado por
 * terceiro levaria o usuário autenticado pra fora (redirect aberto).
 * `//host` é rejeitado porque o browser o trata como protocolo-relativo.
 */
export function ehCaminhoInternoSeguro(v: string | null | undefined): boolean {
  if (!v) return false
  if (!v.startsWith("/")) return false
  if (v.startsWith("//")) return false
  if (v.includes("\\")) return false
  return true
}

// ============================================================
// Rótulos
// ============================================================

export function tipoContaRotulo(tipo: TipoConta): string {
  switch (tipo) {
    case "banco": return "Banco"
    case "caixa": return "Caixa"
    case "cartao_credito": return "Cartão de crédito"
    case "investimento": return "Investimento"
  }
}

export function statusRotulo(status: StatusLancamento): string {
  switch (status) {
    case "previsto": return "Previsto"
    case "realizado": return "Realizado"
    case "cancelado": return "Cancelado"
  }
}

/** Rótulo da linha considerando o atraso derivado (R1/R2). */
export function statusRotuloComAtraso(
  l: LancamentoParaRegra,
  hoje: string
): string {
  if (estaAtrasado(l, hoje)) return "Atrasado"
  return statusRotulo(l.status)
}

/** Formas de pagamento oferecidas. 'pix' é o padrão do dia a dia daqui. */
export const FORMAS_PAGAMENTO = [
  "pix",
  "dinheiro",
  "cartão de crédito",
  "cartão de débito",
  "boleto",
  "transferência",
  "débito automático",
] as const

export const FORMA_PAGAMENTO_PADRAO = "pix"
