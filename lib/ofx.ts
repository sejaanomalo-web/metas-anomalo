/**
 * Leitor de extrato OFX — puro, sem banco e sem rede.
 *
 * OFX é um formato velho e mal comportado: cada banco exporta de um jeito
 * ligeiramente diferente, e as diferenças que importam aqui são as que fazem
 * uma transação cair no DIA ERRADO ou com o NOME ILEGÍVEL. Cada regra abaixo
 * existe por causa de um arquivo real que quebrou de um jeito específico.
 *
 * Nada do que este arquivo devolve vira lançamento sozinho: a importação é em
 * dois tempos, e entre ler e confirmar existe uma tela de conferência.
 */

export interface TransacaoOFX {
  /** Identificador que o banco dá à transação — a chave de deduplicação. */
  fitid: string
  /** AAAA-MM-DD, já no fuso de São Paulo. */
  data: string
  /** HH:MM, ou null quando o arquivo não informou hora. */
  hora: string | null
  /** Com sinal, exatamente como veio do banco. */
  valor: number
  tipo: "receita" | "despesa"
  descricao: string
  /** TRNTYPE do arquivo (DEBIT, CREDIT, PIX…), quando houver. */
  trntype: string | null
}

export interface ExtratoOFX {
  banco_id: string | null
  conta_externa: string | null
  periodo_de: string | null
  periodo_ate: string | null
  saldo_final: number | null
  transacoes: TransacaoOFX[]
  /** FITIDs que vieram repetidos DENTRO do próprio arquivo. */
  duplicadasNoArquivo: number
}

export class ErroOFX extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = "ErroOFX"
  }
}

/** Arquivos maiores que isso quase sempre são exportação errada (o ano todo
 *  em vez do mês). Recusar cedo evita uma tela de revisão inutilizável. */
export const MAX_LINHAS = 2000

// ============================================================
// Decodificação
// ============================================================

/**
 * Descobre a codificação pelo cabeçalho e decodifica o corpo.
 *
 * O cabeçalho é sempre ASCII, então pode ser lido como latin1 sem risco. Ele
 * é que diz em que codificação está o RESTO. Decodificar tudo como UTF-8 de
 * saída transforma "TRANSFERÊNCIA" em "TRANSFERÃNCIA" nos arquivos
 * windows-1252, que são a maioria dos bancos brasileiros.
 */
export function decodificarOFX(bytes: Uint8Array): string {
  const cabecalho = new TextDecoder("latin1").decode(bytes.slice(0, 1024))

  const charset = /CHARSET:\s*([^\r\n]+)/i.exec(cabecalho)?.[1]?.trim()
  const encoding = /ENCODING:\s*([^\r\n]+)/i.exec(cabecalho)?.[1]?.trim()

  const querUtf8 =
    /UTF-?8/i.test(encoding ?? "") ||
    /UTF-?8/i.test(charset ?? "") ||
    charset === "NONE"

  const rotulo = querUtf8 ? "utf-8" : "windows-1252"
  try {
    return new TextDecoder(rotulo).decode(bytes)
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

// ============================================================
// Tags
// ============================================================

/**
 * Valor de uma tag, aceitando as duas formas que aparecem na prática:
 *
 *   <NAME>Padaria</NAME>   (XML, OFX 2.x)
 *   <NAME>Padaria          (SGML, OFX 1.x — sem fechamento)
 *
 * Na forma SGML o valor termina na próxima tag ou na quebra de linha. Um
 * parser que exigisse fechamento simplesmente não leria metade dos bancos.
 */
export function lerTag(bloco: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)(?:</${tag}>|(?=<)|$)`, "i")
  const m = re.exec(bloco)
  if (!m) return null
  const valor = m[1].replace(/\r/g, "").trim()
  return valor === "" ? null : valor
}

// ============================================================
// Datas
// ============================================================

/** Fuso de São Paulo, em horas. O Brasil não tem mais horário de verão. */
const OFFSET_SP = -3

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * Converte DTPOSTED para data e hora em São Paulo.
 *
 * Formatos aceitos: AAAAMMDD, AAAAMMDDHHMMSS, com ou sem `.000`, com ou sem
 * sufixo de fuso `[-3:BRT]` / `[0:GMT]`.
 *
 * A regra crítica: SEM sufixo de fuso, o horário JÁ É local. Tratar como UTC
 * (o erro fácil) empurraria toda transação feita depois das 21h para o dia
 * seguinte — e um extrato com as compras da noite no dia errado é um extrato
 * que não bate com o app do banco.
 *
 * COM sufixo, converte de verdade: `[0:GMT]` às 01:00 vira 22:00 do dia
 * anterior em São Paulo.
 */
export function parseDataOFX(bruto: string): { data: string; hora: string | null } | null {
  const limpo = bruto.trim()
  const m = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/.exec(limpo)
  if (!m) return null

  const ano = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null

  const temHora = m[4] !== undefined
  const hh = Number(m[4] ?? 0)
  const mm = Number(m[5] ?? 0)
  const ss = Number(m[6] ?? 0)

  const fuso = /\[([+-]?\d+(?:\.\d+)?):[^\]]*\]/.exec(limpo)

  if (!fuso) {
    return {
      data: `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`,
      hora: temHora ? `${doisDigitos(hh)}:${doisDigitos(mm)}` : null,
    }
  }

  const offsetArquivo = Number(fuso[1])
  const ms =
    Date.UTC(ano, mes - 1, dia, hh, mm, ss) -
    offsetArquivo * 3600000 +
    OFFSET_SP * 3600000
  const d = new Date(ms)
  return {
    data: `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`,
    hora: temHora
      ? `${doisDigitos(d.getUTCHours())}:${doisDigitos(d.getUTCMinutes())}`
      : null,
  }
}

// ============================================================
// Descrição
// ============================================================

/**
 * Descrição = NAME · MEMO.
 *
 * Os dois campos costumam se completar ("PIX RECEBIDO" + "JOAO DA SILVA"),
 * mas vários bancos repetem o mesmo texto nos dois. Concatenar sem conferir
 * produziria "PIX RECEBIDO · PIX RECEBIDO" em metade das linhas.
 *
 * O separador " · " também é a fronteira que a regra aprendida usa depois:
 * ela guarda só o que vem ANTES dele, que é a parte estável (a contraparte),
 * enquanto o MEMO costuma variar a cada transação.
 */
export function montarDescricao(name: string | null, memo: string | null): string {
  const a = (name ?? "").replace(/\s+/g, " ").trim()
  const b = (memo ?? "").replace(/\s+/g, " ").trim()
  if (!a) return b
  if (!b) return a
  if (a.toLowerCase() === b.toLowerCase()) return a
  return `${a} · ${b}`
}

// ============================================================
// Parser
// ============================================================

export function parseOFX(bytes: Uint8Array): ExtratoOFX {
  const texto = decodificarOFX(bytes)

  if (!/<OFX>/i.test(texto)) {
    throw new ErroOFX(
      "Este arquivo não parece um extrato OFX. No app do banco, procure " +
        "Exportar/Extrato e escolha o formato OFX (não PDF, não CSV)."
    )
  }

  const linhas = texto.split(/\r?\n/).length
  if (linhas > MAX_LINHAS) {
    throw new ErroOFX(
      `Arquivo muito grande (${linhas} linhas, limite ${MAX_LINHAS}). ` +
        "Exporte um período menor — um mês por vez."
    )
  }

  if (!/<STMTTRN>/i.test(texto)) {
    throw new ErroOFX(
      "O arquivo é OFX mas não tem nenhuma transação. Confira o período " +
        "escolhido na exportação do banco."
    )
  }

  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
  const transacoes: TransacaoOFX[] = []
  const vistos = new Set<string>()
  let duplicadasNoArquivo = 0

  for (const bloco of blocos) {
    const fitid = lerTag(bloco, "FITID")
    const dtposted = lerTag(bloco, "DTPOSTED")
    const trnamt = lerTag(bloco, "TRNAMT")
    if (!fitid || !dtposted || !trnamt) continue

    const quando = parseDataOFX(dtposted)
    if (!quando) continue

    // Alguns bancos usam vírgula decimal mesmo em OFX.
    const valor = Number(trnamt.replace(/\s/g, "").replace(",", "."))
    if (!Number.isFinite(valor)) continue

    // FITID repetido dentro do próprio arquivo: o banco às vezes exporta a
    // mesma transação em dois blocos. Fica uma só.
    if (vistos.has(fitid)) {
      duplicadasNoArquivo += 1
      continue
    }
    vistos.add(fitid)

    transacoes.push({
      fitid,
      data: quando.data,
      hora: quando.hora,
      valor,
      // O sinal do TRNAMT é a única fonte confiável do tipo: o TRNTYPE varia
      // demais entre bancos (DEBIT, PIX, XFER, OTHER…).
      tipo: valor >= 0 ? "receita" : "despesa",
      descricao: montarDescricao(lerTag(bloco, "NAME"), lerTag(bloco, "MEMO")),
      trntype: lerTag(bloco, "TRNTYPE"),
    })
  }

  if (transacoes.length === 0) {
    throw new ErroOFX(
      "Nenhuma transação pôde ser lida do arquivo. Ele pode estar truncado " +
        "ou num formato que este leitor ainda não cobre."
    )
  }

  const datas = transacoes.map((t) => t.data).sort()
  const saldoBruto = lerTag(texto, "BALAMT")

  return {
    banco_id: lerTag(texto, "BANKID"),
    conta_externa: lerTag(texto, "ACCTID"),
    periodo_de: parseDataOFX(lerTag(texto, "DTSTART") ?? "")?.data ?? datas[0] ?? null,
    periodo_ate:
      parseDataOFX(lerTag(texto, "DTEND") ?? "")?.data ??
      datas[datas.length - 1] ??
      null,
    saldo_final: saldoBruto ? Number(saldoBruto.replace(",", ".")) : null,
    transacoes,
    duplicadasNoArquivo,
  }
}

// ============================================================
// Regras aprendidas
// ============================================================

/**
 * Parte da descrição que vira padrão de regra: o trecho antes de " · ",
 * em minúsculas.
 *
 * Só a primeira parte porque é a estável. "PIX ENVIADO · 12/03 REF 8812"
 * muda a cada transação; "pix enviado" se repete e é o que permite a próxima
 * importação já chegar classificada.
 *
 * Padrões com menos de 4 caracteres são descartados: um padrão curto demais
 * casa com quase tudo e passaria a classificar errado o extrato inteiro.
 */
export function padraoDaDescricao(descricao: string): string | null {
  const parte = descricao.split(" · ")[0] ?? ""
  const padrao = parte.trim().toLowerCase()
  if (padrao.length < 4) return null
  return padrao
}
