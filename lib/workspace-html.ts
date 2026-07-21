// =============================================================================
// Asana HTML → markdown-lite. Função PURA, sem DOM, sem dependência.
// =============================================================================
//
// 778 tarefas têm descrição, 507 delas com link. O Asana devolve `html_notes`
// num subconjunto bem estreito de HTML (é o que o editor deles produz):
//   <body> <strong> <em> <u> <s> <code> <a href> <ul> <ol> <li> <br> <h1..h2>
//
// O destino é o markdown-lite de lib/workspace-markdown.ts, que vira nós React
// sem nunca passar por innerHTML. Ou seja: o HTML do Asana morre aqui. Nada de
// tag chega ao banco como marcação ativa.
//
// O HTML original continua guardado em ws_tarefas.descricao_html_original —
// se esta conversão perder algo, o dado bruto está lá para auditoria.
//
// POR QUE NÃO USAR REGEX SOLTA: `<a href="x">texto</a>` precisa casar abertura
// com fechamento e escapar o conteúdo. Um tokenizador de ~80 linhas resolve
// isso de forma previsível; regex encadeada quebra no primeiro `<` dentro de
// texto e produz saída silenciosamente errada.

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  atilde: "ã", otilde: "õ", ccedil: "ç", agrave: "à",
  acirc: "â", ecirc: "ê", ocirc: "ô", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"',
}

export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (todo, corpo: string) => {
    if (corpo.startsWith("#x") || corpo.startsWith("#X")) {
      const n = parseInt(corpo.slice(2), 16)
      return Number.isFinite(n) ? String.fromCodePoint(n) : todo
    }
    if (corpo.startsWith("#")) {
      const n = parseInt(corpo.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : todo
    }
    return ENTIDADES[corpo.toLowerCase()] ?? todo
  })
}

interface Token {
  tipo: "texto" | "abre" | "fecha"
  nome?: string
  atributos?: Record<string, string>
  valor?: string
}

function tokenizar(html: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < html.length) {
    const abre = html.indexOf("<", i)
    if (abre < 0) {
      if (i < html.length) tokens.push({ tipo: "texto", valor: html.slice(i) })
      break
    }
    if (abre > i) tokens.push({ tipo: "texto", valor: html.slice(i, abre) })

    const fecha = html.indexOf(">", abre)
    if (fecha < 0) {
      // '<' solto no texto — trata como texto e segue, sem engolir o resto.
      tokens.push({ tipo: "texto", valor: html.slice(abre) })
      break
    }
    const interno = html.slice(abre + 1, fecha).trim()
    i = fecha + 1

    if (interno.startsWith("/")) {
      tokens.push({ tipo: "fecha", nome: interno.slice(1).trim().toLowerCase() })
      continue
    }
    const espaco = interno.search(/\s/)
    const nome = (espaco < 0 ? interno : interno.slice(0, espaco))
      .replace(/\/$/, "")
      .toLowerCase()
    const atributos: Record<string, string> = {}
    if (espaco > 0) {
      const resto = interno.slice(espaco)
      for (const m of resto.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
        atributos[m[1].toLowerCase()] = m[2]
      }
    }
    tokens.push({ tipo: "abre", nome, atributos })
  }
  return tokens
}

/** Escapa os marcadores do markdown-lite que existam no texto original, pra
 *  um `**` digitado por alguém não virar negrito falso na volta. */
function escaparMarcadores(s: string): string {
  return s.replace(/([*_~`])/g, "\\$1")
}

const ESQUEMAS_OK = ["http://", "https://"]

function hrefSeguro(u: string | undefined): string | null {
  if (!u) return null
  const limpo = decodificarEntidades(u).trim()
  if (!limpo || limpo.length > 2048) return null
  if (/[\s<>"'\\]/.test(limpo)) return null
  return ESQUEMAS_OK.some((e) => limpo.toLowerCase().startsWith(e)) ? limpo : null
}

export interface ResultadoConversao {
  /** markdown-lite pronto pra ws_tarefas.descricao */
  texto: string
  /** URLs encontradas, na ordem — alimenta ws_links_externos */
  links: string[]
  /** Tags que o conversor não conhecia. Vira aviso no relatório. */
  tagsIgnoradas: string[]
}

/**
 * Converte `html_notes` do Asana. Se o HTML vier vazio, cai pro `notes` (texto
 * puro) — algumas tarefas antigas só têm ele.
 */
export function converterHtmlAsana(
  htmlNotes: string | null | undefined,
  notes: string | null | undefined
): ResultadoConversao {
  const html = (htmlNotes ?? "").trim()
  if (!html) {
    const texto = (notes ?? "").trim()
    return { texto, links: extrairUrls(texto), tagsIgnoradas: [] }
  }

  const tokens = tokenizar(html)
  const links: string[] = []
  const tagsIgnoradas = new Set<string>()
  let saida = ""
  let hrefAtual: string | null = null
  let textoDoLink = ""
  let dentroDeLink = false
  const pilhaLista: ("ul" | "ol")[] = []
  let indiceOrdenada = 0

  const CONHECIDAS = new Set([
    "body", "strong", "b", "em", "i", "u", "s", "del", "strike", "code", "pre",
    "a", "ul", "ol", "li", "br", "p", "div", "h1", "h2", "h3", "span",
  ])

  for (const t of tokens) {
    if (t.tipo === "texto") {
      const txt = escaparMarcadores(decodificarEntidades(t.valor ?? ""))
      if (dentroDeLink) textoDoLink += txt
      else saida += txt
      continue
    }

    const nome = t.nome ?? ""
    if (!CONHECIDAS.has(nome)) {
      tagsIgnoradas.add(nome)
      continue
    }

    if (t.tipo === "abre") {
      switch (nome) {
        case "strong": case "b": saida += "**"; break
        case "em": case "i": saida += "_"; break
        case "s": case "del": case "strike": saida += "~"; break
        case "code": saida += "`"; break
        case "br": saida += "\n"; break
        case "p": case "div": case "h1": case "h2": case "h3":
          if (saida && !saida.endsWith("\n\n")) saida += "\n\n"
          break
        case "ul": pilhaLista.push("ul"); saida += "\n"; break
        case "ol": pilhaLista.push("ol"); indiceOrdenada = 0; saida += "\n"; break
        case "li":
          // A lista do markdown-lite é sempre com hífen. Numeração do <ol> vira
          // prefixo textual pra não perder a ordem que o autor escreveu.
          if (pilhaLista[pilhaLista.length - 1] === "ol") {
            indiceOrdenada++
            saida += `\n- ${indiceOrdenada}. `
          } else {
            saida += "\n- "
          }
          break
        case "a": {
          hrefAtual = hrefSeguro(t.atributos?.href)
          dentroDeLink = true
          textoDoLink = ""
          break
        }
      }
      continue
    }

    // fecha
    switch (nome) {
      case "strong": case "b": saida += "**"; break
      case "em": case "i": saida += "_"; break
      case "s": case "del": case "strike": saida += "~"; break
      case "code": saida += "`"; break
      case "ul": case "ol": pilhaLista.pop(); saida += "\n"; break
      case "p": case "div": case "h1": case "h2": case "h3": saida += "\n"; break
      case "a": {
        const rotulo = textoDoLink.trim()
        if (hrefAtual) {
          links.push(hrefAtual)
          // Quando o texto do link é a própria URL, deixa solto — o parser
          // autolinka e o resultado fica mais limpo que [url](url).
          saida += rotulo && rotulo !== hrefAtual
            ? `[${rotulo.replace(/[[\]]/g, "")}](${hrefAtual})`
            : hrefAtual
        } else {
          // href bloqueado (javascript:, data:, relativo): o TEXTO sobrevive,
          // o link não. Perder o texto seria perder conteúdo do usuário.
          saida += rotulo
        }
        dentroDeLink = false
        hrefAtual = null
        textoDoLink = ""
        break
      }
    }
  }

  const texto = saida
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return { texto, links, tagsIgnoradas: [...tagsIgnoradas] }
}

/** URLs soltas num texto puro (para o caminho sem HTML). */
export function extrairUrls(texto: string): string[] {
  const out: string[] = []
  for (const m of texto.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const u = hrefSeguro(m[0])
    if (u) out.push(u)
  }
  return out
}

/** Normaliza uma URL para deduplicação: minúsculas no host, sem fragmento,
 *  sem barra final. Query string é preservada — em link do Drive ela É o id. */
export function normalizarUrl(u: string): string {
  try {
    const url = new URL(u)
    url.hash = ""
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    let s = url.toString()
    if (s.endsWith("/") && url.pathname !== "/") s = s.slice(0, -1)
    return s
  } catch {
    return u
  }
}
