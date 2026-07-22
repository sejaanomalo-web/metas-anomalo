// =============================================================================
// Workspace — notas: sanitização de HTML. PURO, roda no server e no browser.
// =============================================================================
//
// O editor de notas é um contentEditable que produz HTML simples (negrito,
// itálico, sublinhado, listas, links). O corpo NUNCA entra no banco cru:
// TODA gravação passa por sanitizarHtmlNota, que reconstrói o HTML mantendo
// só a lista fechada de tags abaixo e descartando qualquer atributo — a
// única exceção é href http(s) em <a>. Assim o dangerouslySetInnerHTML da
// renderização só vê HTML que o próprio servidor montou.

const TAGS_PERMITIDAS = new Set([
  "b", "strong", "i", "em", "u", "s", "strike",
  "br", "div", "p", "ul", "ol", "li",
  "h1", "h2", "h3", "blockquote", "span",
])

/** Extrai um href http(s) seguro do corpo de uma tag <a ...>. */
function hrefSeguro(tagBruta: string): string | null {
  const m = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tagBruta)
  const url = (m?.[2] ?? m?.[3] ?? "").trim()
  if (!/^https?:\/\//i.test(url)) return null
  // Aspas e < > quebrariam o atributo reconstruído.
  if (/["'<>]/.test(url)) return null
  return url
}

/**
 * Reconstrói o HTML mantendo apenas tags permitidas SEM atributos
 * (exceto <a href="https://…">). Tags desconhecidas somem e o texto delas
 * fica; comentários e blocos script/style caem por inteiro.
 */
export function sanitizarHtmlNota(html: string, limite = 200_000): string {
  let s = html.slice(0, limite)

  // Blocos perigosos caem com o CONTEÚDO junto.
  s = s.replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, "")
  s = s.replace(/<!--[\s\S]*?-->/g, "")

  return s.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g, (tudo, barra, nomeBruto, resto) => {
    const nome = nomeBruto.toLowerCase()
    if (nome === "a") {
      if (barra) return "</a>"
      const href = hrefSeguro(String(resto))
      // Sem href válido a âncora fica vazia (<a> puro é inerte e casa com o
      // </a> correspondente — trocar de tag desbalancearia o HTML).
      return href
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">`
        : "<a>"
    }
    if (!TAGS_PERMITIDAS.has(nome)) return ""
    return `<${barra}${nome}>`
  })
}
