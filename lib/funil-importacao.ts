import { dataValida } from "./funil-calculo"

/**
 * Leitura de arquivos exportados do Gerenciador de Anúncios do Meta. É pura: não
 * acessa banco nem rede, e roda no navegador. Assim o arquivo não sai do
 * computador e só os totais por data vão para o servidor, o que também deixa de
 * fora nome, e-mail e telefone dos leads.
 *
 * Tipos reconhecidos:
 *   • relatório de campanhas (CSV ou XLSX), em português ou inglês;
 *   • leads de formulário instantâneo (cada linha é um lead), que costuma vir em
 *     UTF-16 e separado por tabulação.
 *
 * Regra herdada da Sentinela: o Meta repete o mesmo evento em colunas diferentes
 * (Resultados, Leads, Conversas). Cada etapa do funil lê UMA coluna, e colunas
 * nunca são somadas entre si.
 */

export type Celula = string | number | boolean | Date | null | undefined

export type TipoArquivo = "campanhas" | "leads"

/** Índice de coluna que representa "contar as linhas" (arquivo de leads). */
export const COLUNA_CONTAGEM = -1

export const LIMITE_DIAS_IMPORTACAO = 1500

// ── Decodificação e CSV ─────────────────────────────────────────────────────

/** Texto do arquivo, conforme o BOM. Sem BOM, UTF-8 e depois Windows-1252. */
export function decodificarTexto(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2))
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2))
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3))
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

function detectarSeparador(linha: string): string {
  const contagem: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
  let entreAspas = false
  for (const c of linha) {
    if (c === '"') entreAspas = !entreAspas
    else if (!entreAspas && c in contagem) contagem[c] += 1
  }
  return Object.entries(contagem).sort((a, b) => b[1] - a[1])[0][0]
}

/** CSV/TSV com aspas, aspas dobradas e quebra de linha dentro de campo. */
export function parseDelimitado(texto: string): string[][] {
  let conteudo = texto.replace(/^﻿/, "")
  let separador: string | null = null
  const diretiva = conteudo.match(/^sep=(.)\r?\n/i)
  if (diretiva) {
    separador = diretiva[1]
    conteudo = conteudo.slice(diretiva[0].length)
  }
  separador ??= detectarSeparador(conteudo.split(/\r?\n/, 1)[0] ?? "")

  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ""
  let entreAspas = false
  const fecharLinha = () => {
    linha.push(campo)
    campo = ""
    if (linha.some((c) => c.trim() !== "")) linhas.push(linha)
    linha = []
  }
  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i]
    if (entreAspas) {
      if (c === '"' && conteudo[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') entreAspas = false
      else campo += c
    } else if (c === '"' && campo === "") entreAspas = true
    else if (c === separador) {
      linha.push(campo)
      campo = ""
    } else if (c === "\n") fecharLinha()
    else if (c !== "\r") campo += c
  }
  if (campo !== "" || linha.length > 0) fecharLinha()
  return linhas
}

// ── Números e datas ─────────────────────────────────────────────────────────

function limparNumero(bruto: string): string {
  return bruto.replace(/[^\d.,-]/g, "")
}

/** Dinheiro: o último separador é o decimal, aceitando "1.234,56" e "1,234.56". */
export function moedaDeCelula(v: Celula): number {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : 0
  if (typeof v !== "string") return 0
  const s = limparNumero(v)
  if (!/\d/.test(s) || s.startsWith("-")) return 0
  const virgula = s.lastIndexOf(",")
  const ponto = s.lastIndexOf(".")
  let normal: string
  if (virgula >= 0 && ponto >= 0) {
    normal =
      virgula > ponto
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "")
  } else if (virgula >= 0) {
    const repetida = s.indexOf(",") !== virgula
    const milhar = s.length - virgula - 1 === 3
    normal = repetida || milhar ? s.replace(/,/g, "") : s.replace(",", ".")
  } else if (s.indexOf(".") !== ponto) {
    normal = s.replace(/\./g, "")
  } else {
    // Ponto único é decimal: é assim que o Meta grava valores sem formatar.
    normal = s
  }
  const n = parseFloat(normal)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

/** Contagem: em número inteiro, "1.234" e "1,234" são milhares. */
export function inteiroDeCelula(v: Celula): number {
  if (typeof v === "number") {
    return Number.isFinite(v) && v > 0 ? Math.round(v) : 0
  }
  if (typeof v !== "string") return 0
  const s = limparNumero(v)
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ""), 10)
  return Math.round(moedaDeCelula(v))
}

const DIA_MS = 86_400_000
/** Dia zero do calendário de datas do Excel. */
const EPOCA_EXCEL = Date.UTC(1899, 11, 30)

/** YYYY-MM-DD ou null. Data ambígua com barra é lida como dia/mês/ano. */
export function dataDeCelula(v: Celula): string | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null
    return new Date(EPOCA_EXCEL + Math.floor(v) * DIA_MS).toISOString().slice(0, 10)
  }
  if (typeof v !== "string") return null
  const s = v.trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = `${iso[1]}-${iso[2]}-${iso[3]}`
    return dataValida(d) ? d : null
  }
  const barra = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (barra) {
    let dia = barra[1]
    let mes = barra[2]
    if (parseInt(mes, 10) > 12) [dia, mes] = [mes, dia]
    const d = `${barra[3]}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`
    return dataValida(d) ? d : null
  }
  return null
}

// ── Reconhecimento das colunas ──────────────────────────────────────────────

/** "Valor usado (BRL)" vira "valor usado". */
export function normalizarCabecalho(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[_\s]+/g, " ")
    .trim()
}

const NOMES = {
  dia: ["dia", "day", "data", "date"],
  inicio: [
    "inicio dos relatorios",
    "inicio do relatorio",
    "reporting starts",
    "inicio",
    "starts",
  ],
  fim: [
    "termino dos relatorios",
    "termino do relatorio",
    "encerramento dos relatorios",
    "fim dos relatorios",
    "reporting ends",
    "termino",
    "ends",
  ],
  campanha: ["nome da campanha", "campaign name", "campanha", "campaign"],
  conjunto: [
    "nome do conjunto de anuncios",
    "ad set name",
    "conjunto de anuncios",
    "adset name",
  ],
  anuncio: ["nome do anuncio", "ad name", "anuncio"],
  gasto: [
    "valor usado",
    "valor gasto",
    "amount spent",
    "valor investido",
    "investimento",
    "gasto",
    "spend",
  ],
  indicador: ["indicador de resultados", "result indicator"],
  criado: ["created time", "created_time", "hora de criacao", "data de criacao"],
}

/**
 * Ordem de preferência da coluna para a 1ª etapa. Começa em Resultados porque é
 * a coluna que a pessoa vê no Gerenciador, inclusive em campanha de mensagem,
 * onde a coluna Leads costuma vir vazia.
 */
const METRICAS_PREFERIDAS = [
  "resultados",
  "results",
  "leads",
  "cadastros",
  "conversas por mensagem iniciadas",
  "messaging conversations started",
]

/** Não é contagem somável. Alcance, por exemplo, nunca pode ser somado por dia. */
const NAO_METRICA =
  /custo|cost|cpm|cpc|ctr|frequencia|frequency|alcance|reach|orcamento|budget|valor|amount|gasto|spend|taxa|rate|roas|retorno|%|indicador|indicator|nome|name|status|veiculacao|delivery|configuracao|setting|inicio|termino|encerramento|starts|ends|moeda|currency|^id$| id$|^dia$|^day$|^data$|^date$/

function acharColuna(normalizados: string[], nomes: string[]): number | null {
  for (const nome of nomes) {
    const i = normalizados.indexOf(nome)
    if (i >= 0) return i
  }
  return null
}

export interface Planilha {
  tipo: TipoArquivo
  cabecalho: string[]
  linhas: Celula[][]
}

export interface ColunaMetrica {
  indice: number
  nome: string
  total: number
}

export interface Mapeamento {
  colData: number | null
  colInicio: number | null
  colFim: number | null
  /** Coluna que nomeia a linha: campanha, senão conjunto, senão anúncio. */
  colCampanha: number | null
  colGasto: number | null
  colIndicador: number | null
  metricas: ColunaMetrica[]
  metricaPadrao: number | null
}

/**
 * Acha a linha de cabeçalho, porque alguns exports trazem título antes dela, e
 * identifica o tipo de arquivo. Erro em português quando não dá para ler.
 */
export function montarPlanilha(
  brutas: Celula[][]
): { planilha: Planilha } | { erro: string } {
  if (brutas.length === 0) return { erro: "O arquivo está vazio." }
  const conhecidos = new Set(
    [
      ...NOMES.dia,
      ...NOMES.inicio,
      ...NOMES.fim,
      ...NOMES.campanha,
      ...NOMES.conjunto,
      ...NOMES.anuncio,
      ...NOMES.gasto,
      ...NOMES.criado,
      ...METRICAS_PREFERIDAS,
    ].map(normalizarCabecalho)
  )
  let melhor = -1
  let melhorPontos = 0
  brutas.slice(0, 15).forEach((linha, i) => {
    const pontos = linha.filter(
      (c) => typeof c === "string" && conhecidos.has(normalizarCabecalho(c))
    ).length
    if (pontos > melhorPontos) {
      melhor = i
      melhorPontos = pontos
    }
  })
  if (melhor < 0) {
    return {
      erro: "Não reconheci as colunas deste arquivo. Use a exportação de dados da tabela do Gerenciador de Anúncios, ou a de leads do formulário.",
    }
  }
  const cabecalho = brutas[melhor].map((c) => String(c ?? "").trim())
  const linhas = brutas.slice(melhor + 1)
  if (linhas.length === 0) return { erro: "O arquivo só tem o cabeçalho, sem dados." }
  const normalizados = cabecalho.map(normalizarCabecalho)
  const temCriado =
    acharColuna(normalizados, NOMES.criado.map(normalizarCabecalho)) !== null
  const temGasto = acharColuna(normalizados, NOMES.gasto) !== null
  return {
    planilha: {
      tipo: temCriado && !temGasto ? "leads" : "campanhas",
      cabecalho,
      linhas,
    },
  }
}

export function sugerirMapeamento(p: Planilha): Mapeamento {
  const n = p.cabecalho.map(normalizarCabecalho)
  const colCriado = acharColuna(n, NOMES.criado.map(normalizarCabecalho))
  const colCampanha =
    acharColuna(n, NOMES.campanha) ??
    acharColuna(n, NOMES.conjunto) ??
    acharColuna(n, NOMES.anuncio)

  if (p.tipo === "leads") {
    return {
      colData: colCriado,
      colInicio: null,
      colFim: null,
      colCampanha,
      colGasto: null,
      colIndicador: null,
      metricas: [
        {
          indice: COLUNA_CONTAGEM,
          nome: "Quantidade de leads no arquivo",
          total: p.linhas.length,
        },
      ],
      metricaPadrao: COLUNA_CONTAGEM,
    }
  }

  const metricas: ColunaMetrica[] = []
  p.cabecalho.forEach((nome, indice) => {
    if (!nome || NAO_METRICA.test(n[indice])) return
    let total = 0
    let numericas = 0
    for (const linha of p.linhas) {
      // Linha de resumo sem nome fica fora do total, como na consolidação.
      if (colCampanha !== null && !textoDe(linha[colCampanha])) continue
      const c = linha[indice]
      const ehNumero =
        typeof c === "number" ||
        (typeof c === "string" && /^[\d.,\s]+$/.test(c.trim()) && /\d/.test(c))
      if (ehNumero) {
        numericas += 1
        total += inteiroDeCelula(c)
      }
    }
    if (numericas > 0) metricas.push({ indice, nome, total })
  })

  const metricaPadrao =
    METRICAS_PREFERIDAS.map((nome) =>
      metricas.find((m) => n[m.indice] === nome && m.total > 0)
    ).find(Boolean)?.indice ?? null

  return {
    colData: acharColuna(n, NOMES.dia),
    colInicio: acharColuna(n, NOMES.inicio),
    colFim: acharColuna(n, NOMES.fim),
    colCampanha,
    colGasto: acharColuna(n, NOMES.gasto),
    colIndicador: acharColuna(n, NOMES.indicador),
    metricas,
    metricaPadrao,
  }
}

// ── Consolidação por data ───────────────────────────────────────────────────

export interface CampanhaArquivo {
  nome: string
  investimento: number
  indicadores: string[]
}

export interface DiaImportado {
  data: string
  /** null = o arquivo não informa, e o investimento já gravado é mantido. */
  investimento: number | null
  /** id da etapa → quantidade */
  valores: Record<string, number>
}

export interface ResultadoConsolidado {
  dias: DiaImportado[]
  /** Linhas puladas: resumo sem nome, ou sem data legível. */
  ignoradas: number
  /** Linhas que cobrem vários dias e entraram na data final. */
  linhasSemDetalheDiario: number
  /** Campanhas selecionadas com tipos de resultado diferentes. */
  indicadoresMisturados: string[]
}

function textoDe(v: Celula): string {
  return v === null || v === undefined ? "" : String(v).trim()
}

export function listarCampanhas(p: Planilha, m: Mapeamento): CampanhaArquivo[] {
  if (m.colCampanha === null) return []
  const mapa = new Map<string, { investimento: number; indicadores: Set<string> }>()
  for (const linha of p.linhas) {
    const nome = textoDe(linha[m.colCampanha])
    if (!nome) continue
    const item = mapa.get(nome) ?? { investimento: 0, indicadores: new Set<string>() }
    if (m.colGasto !== null) item.investimento += moedaDeCelula(linha[m.colGasto])
    const indicador = m.colIndicador !== null ? textoDe(linha[m.colIndicador]) : ""
    if (indicador) item.indicadores.add(indicador)
    mapa.set(nome, item)
  }
  return Array.from(mapa, ([nome, v]) => ({
    nome,
    investimento: Math.round(v.investimento * 100) / 100,
    indicadores: Array.from(v.indicadores),
  })).sort((a, b) => b.investimento - a.investimento || a.nome.localeCompare(b.nome))
}

/**
 * Agrupa o arquivo por data. Linha de resumo do Gerenciador fica de fora, com
 * nome de campanha em branco ou sem data, porque somá-la dobraria o total.
 */
export function consolidarPorData(
  p: Planilha,
  m: Mapeamento,
  opcoes: {
    /** id da etapa → índice da coluna no arquivo */
    metricaPorEtapa: Record<string, number>
    campanhasExcluidas?: ReadonlySet<string>
  }
): ResultadoConsolidado {
  const porData = new Map<string, DiaImportado>()
  let ignoradas = 0
  let semDetalhe = 0
  const indicadores = new Set<string>()
  const etapas = Object.entries(opcoes.metricaPorEtapa)

  for (const linha of p.linhas) {
    const nome = m.colCampanha !== null ? textoDe(linha[m.colCampanha]) : ""
    if (m.colCampanha !== null && !nome) {
      ignoradas += 1
      continue
    }
    if (opcoes.campanhasExcluidas?.has(nome)) continue

    let data = m.colData !== null ? dataDeCelula(linha[m.colData]) : null
    if (!data && m.colData === null) {
      const inicio = m.colInicio !== null ? dataDeCelula(linha[m.colInicio]) : null
      const fim = m.colFim !== null ? dataDeCelula(linha[m.colFim]) : null
      data = fim ?? inicio
      if (inicio && fim && inicio !== fim) semDetalhe += 1
    }
    if (!data) {
      ignoradas += 1
      continue
    }

    const indicador = m.colIndicador !== null ? textoDe(linha[m.colIndicador]) : ""
    if (indicador) indicadores.add(indicador)

    let dia = porData.get(data)
    if (!dia) {
      dia = {
        data,
        investimento: m.colGasto !== null ? 0 : null,
        valores: Object.fromEntries(etapas.map(([id]) => [id, 0])),
      }
      porData.set(data, dia)
    }
    if (m.colGasto !== null) {
      dia.investimento = (dia.investimento ?? 0) + moedaDeCelula(linha[m.colGasto])
    }
    for (const [etapaId, coluna] of etapas) {
      dia.valores[etapaId] +=
        coluna === COLUNA_CONTAGEM ? 1 : inteiroDeCelula(linha[coluna])
    }
  }

  const dias = Array.from(porData.values())
    .map((d) => ({
      ...d,
      investimento:
        d.investimento === null ? null : Math.round(d.investimento * 100) / 100,
    }))
    // Data sem gasto e sem número nenhum não vira lançamento vazio.
    .filter((d) => (d.investimento ?? 0) > 0 || Object.values(d.valores).some((n) => n > 0))
    .sort((a, b) => a.data.localeCompare(b.data))

  return {
    dias,
    ignoradas,
    linhasSemDetalheDiario: semDetalhe,
    indicadoresMisturados: indicadores.size > 1 ? Array.from(indicadores) : [],
  }
}
