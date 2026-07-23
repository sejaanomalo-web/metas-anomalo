// =============================================================================
// Workspace — notas: formatos permitidos e sanitização. PURO (server+browser).
// =============================================================================
//
// O editor é um contentEditable no estilo Notas do iPhone: títulos, subtítulos,
// fonte, tamanho, cor, negrito/itálico/sublinhado/tachado, listas e caixa do
// texto. O corpo NUNCA entra no banco cru: toda gravação passa por
// sanitizarHtmlNota, que reconstrói o HTML mantendo só as tags desta lista e,
// dentro de `style`, só as PROPRIEDADES desta lista com valores que casam
// exatamente os padrões abaixo.
//
// É por isso que a renderização pode usar dangerouslySetInnerHTML: o HTML que
// chega na tela foi montado por este arquivo, não pelo navegador de quem
// escreveu. Nenhum caminho aceita url(), javascript:, expression() ou
// atributo de evento — eles não casam com nenhum padrão e somem.

const TAGS_PERMITIDAS = new Set([
  "b", "strong", "i", "em", "u", "s", "strike",
  "br", "div", "p", "ul", "ol", "li",
  "h1", "h2", "h3", "blockquote", "span",
])

/** Famílias oferecidas no seletor de fonte (rótulo → CSS). */
export const FONTES_NOTA: { nome: string; css: string }[] = [
  { nome: "Padrão do sistema", css: "inherit" },
  { nome: "Sem serifa", css: "'Helvetica Neue', Arial, sans-serif" },
  { nome: "Com serifa", css: "Georgia, 'Times New Roman', serif" },
  { nome: "Monoespaçada", css: "'SF Mono', Menlo, Consolas, monospace" },
  { nome: "Arredondada", css: "'Avenir Next', 'Segoe UI', sans-serif" },
]

/** Tamanhos oferecidos (px). */
export const TAMANHOS_NOTA = [12, 14, 16, 18, 22, 28, 34] as const

/** Cores de texto oferecidas — mesma família visual do resto do Workspace. */
export const CORES_NOTA: { nome: string; hex: string }[] = [
  { nome: "Padrão", hex: "" },
  { nome: "Vermelho", hex: "#f28b82" },
  { nome: "Laranja", hex: "#f0a06b" },
  { nome: "Amarelo", hex: "#f2da6e" },
  { nome: "Verde", hex: "#96e0a1" },
  { nome: "Água", hex: "#8ed7ef" },
  { nome: "Azul", hex: "#93b6f5" },
  { nome: "Roxo", hex: "#c3a2ef" },
  { nome: "Rosa", hex: "#f4a3dc" },
  { nome: "Cinza", hex: "#b6b8bb" },
]

// --- Padrões de valor aceitos por propriedade -------------------------------
const COR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\))$/i
// Só letras, espaço, vírgula, hífen, ponto e aspas: sem parênteses, sem url().
const FAMILIA = /^[a-z0-9 ,'"\-.]+$/i

const ESTILOS_PERMITIDOS: Record<string, RegExp> = {
  "color": COR,
  "background-color": COR,
  "font-size": /^(\d{1,2}|9[0-6])px$/,
  "font-family": FAMILIA,
  "font-weight": /^(normal|bold|[1-9]00)$/i,
  "font-style": /^(normal|italic)$/i,
  "text-decoration": /^(none|underline|line-through|underline line-through)$/i,
  "text-decoration-line": /^(none|underline|line-through|underline line-through)$/i,
  "text-align": /^(left|center|right|justify)$/i,
  "text-transform": /^(none|uppercase|lowercase|capitalize)$/i,
}

/** Reconstrói um `style` só com as declarações aceitas. "" = descartar tudo. */
function sanitizarEstilo(bruto: string): string {
  const manter: string[] = []
  for (const decl of bruto.split(";")) {
    const i = decl.indexOf(":")
    if (i === -1) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const valor = decl.slice(i + 1).trim().replace(/\s*!important$/i, "")
    const padrao = ESTILOS_PERMITIDOS[prop]
    if (!padrao || !padrao.test(valor)) continue
    manter.push(`${prop}: ${valor}`)
  }
  return manter.join("; ")
}

/** Extrai o valor de um atributo da string bruta da tag. */
function atributo(tagBruta: string, nome: string): string | null {
  const re = new RegExp(`${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i")
  const m = re.exec(tagBruta)
  return m?.[2] ?? m?.[3] ?? null
}

/** href http(s) seguro do corpo de uma tag <a ...>. */
function hrefSeguro(tagBruta: string): string | null {
  const url = (atributo(tagBruta, "href") ?? "").trim()
  if (!/^https?:\/\//i.test(url)) return null
  // Aspas e < > quebrariam o atributo reconstruído.
  if (/["'<>]/.test(url)) return null
  return url
}

/**
 * Reconstrói o HTML mantendo apenas tags permitidas, com `style` filtrado
 * declaração a declaração (e href http(s) em <a>). Tag desconhecida some e o
 * texto dela fica; script/style/iframe caem com o conteúdo junto.
 */
export function sanitizarHtmlNota(html: string, limite = 200_000): string {
  let s = html.slice(0, limite)

  // Blocos perigosos caem com o CONTEÚDO junto.
  s = s.replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, "")
  s = s.replace(/<!--[\s\S]*?-->/g, "")

  return s.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g, (_tudo, barra, nomeBruto, resto) => {
    const nome = String(nomeBruto).toLowerCase()
    const corpo = String(resto)

    if (nome === "a") {
      if (barra) return "</a>"
      const href = hrefSeguro(corpo)
      // Sem href válido a âncora fica vazia (inerte, e casa com o </a>).
      return href
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">`
        : "<a>"
    }

    if (!TAGS_PERMITIDAS.has(nome)) return ""
    if (barra) return `</${nome}>`

    const estilo = sanitizarEstilo(atributo(corpo, "style") ?? "")
    return estilo ? `<${nome} style="${estilo}">` : `<${nome}>`
  })
}
