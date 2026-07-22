// =============================================================================
// Workspace — parser de markdown-lite. Função PURA, sem React, sem I/O.
// =============================================================================
//
// POR QUE ISTO EXISTE em vez de um editor rich text:
//
// A auditoria do Asana mostrou o uso real — 48% das tarefas têm descrição e
// 28% têm link (Drive, Docs, Canva, Instagram). Ninguém usa formatação
// complexa. Um editor rich text traria dependência pesada, HTML no banco e a
// obrigação de sanitizar — três problemas para resolver um que não existe.
//
// Aqui a descrição é TEXTO PURO no banco. Este parser transforma o texto numa
// árvore de blocos/trechos, e o componente DescricaoRica renderiza essa árvore
// como nós React. Como nada nunca vira string de HTML, `dangerouslySetInnerHTML`
// não aparece em lugar nenhum e a classe inteira de XSS deixa de existir.
//
// Sintaxe suportada (deliberadamente mínima):
//   **negrito**            `código`
//   - item de lista        * item de lista
//   https://… (autolink)   [rótulo](https://…)
//   @nome (menção)
//
// SEGURANÇA DE LINK: só http:// e https:// viram link. `javascript:`, `data:`
// e qualquer outro esquema NÃO são escapados — são simplesmente descartados,
// e o texto original aparece como texto comum.

export type Trecho =
  | { tipo: "texto"; valor: string }
  | { tipo: "negrito"; valor: string }
  | { tipo: "italico"; valor: string }
  | { tipo: "riscado"; valor: string }
  | { tipo: "codigo"; valor: string }
  | { tipo: "link"; href: string; rotulo: string }
  | { tipo: "mencao"; nome: string }

export type Bloco =
  | { tipo: "paragrafo"; trechos: Trecho[] }
  | { tipo: "lista"; itens: Trecho[][] }

/** Esquemas de URL permitidos. Tudo fora daqui nunca vira href. */
const ESQUEMAS_OK = ["http://", "https://"]

/**
 * Devolve a URL se for segura, senão null. Aceita só http/https, rejeita
 * espaço/controle no meio e limita o tamanho (defesa contra lixo colado).
 */
export function urlSegura(bruta: string): string | null {
  const u = bruta.trim()
  if (u.length === 0 || u.length > 2048) return null
  // Caractere de controle, espaco, aspas, < > e barra invertida nunca
  // aparecem numa URL colada de verdade. Escapes explicitos (\x00-\x1f) e
  // nao bytes literais: byte de controle no fonte e invisivel no editor.
  // eslint-disable-next-line no-control-regex
  if (/[\s\x00-\x1f<>"'\\]/.test(u)) return null
  const lower = u.toLowerCase()
  if (!ESQUEMAS_OK.some((e) => lower.startsWith(e))) return null
  return u
}

// URL solta no texto. Para em espaço e ignora pontuação final grudada
// (o ponto que fecha a frase não faz parte do link).
const RE_URL = /https?:\/\/[^\s<>"')\]]+/gi
// [rótulo](url)
const RE_LINK_MD = /\[([^\]\n]{1,200})\]\(([^)\s]{1,2048})\)/g
const RE_NEGRITO = /\*\*([^*\n]{1,500})\*\*/g
// Italico e riscado existem porque o Asana usa os dois nas descricoes (778
// tarefas tem descricao). Sem eles, a conversao do HTML perderia formatacao
// que o time escreveu de proposito.
const RE_ITALICO = /(?<![*\w])_([^_\n]{1,500})_(?![*\w])/g
const RE_RISCADO = /~([^~\n]{1,500})~/g
const RE_CODIGO = /`([^`\n]{1,500})`/g
// @nome — letras (com acento), números, ponto, hífen, underscore
const RE_MENCAO = /@([\p{L}][\p{L}\p{N}._-]{1,40})/gu

interface Marca {
  inicio: number
  fim: number
  trecho: Trecho
}

/**
 * Uma única passada de marcação por linha: coleta todas as ocorrências de
 * cada padrão, descarta as que se sobrepõem (a primeira ganha) e depois
 * costura texto puro nos buracos. Fazer replace encadeado geraria estados
 * intermediários onde um padrão come o outro (ex: URL dentro de `código`).
 */
function analisarInline(linha: string): Trecho[] {
  const marcas: Marca[] = []

  function coletar(
    re: RegExp,
    montar: (m: RegExpExecArray) => Trecho | null
  ): void {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(linha)) !== null) {
      const trecho = montar(m)
      if (trecho) marcas.push({ inicio: m.index, fim: m.index + m[0].length, trecho })
      if (m[0].length === 0) re.lastIndex++ // guard anti-loop
    }
  }

  // Ordem de coleta = prioridade em caso de sobreposição.
  coletar(RE_CODIGO, (m) => ({ tipo: "codigo", valor: m[1] }))
  coletar(RE_LINK_MD, (m) => {
    const href = urlSegura(m[2])
    // Link markdown com esquema proibido: descarta a MARCA inteira, o texto
    // original sobra como texto comum. Não vira link "quebrado" nem some.
    if (!href) return null
    return { tipo: "link", href, rotulo: m[1] }
  })
  coletar(RE_NEGRITO, (m) => ({ tipo: "negrito", valor: m[1] }))
  coletar(RE_RISCADO, (m) => ({ tipo: "riscado", valor: m[1] }))
  coletar(RE_ITALICO, (m) => ({ tipo: "italico", valor: m[1] }))
  coletar(RE_URL, (m) => {
    const href = urlSegura(m[0])
    if (!href) return null
    return { tipo: "link", href, rotulo: href }
  })
  coletar(RE_MENCAO, (m) => ({ tipo: "mencao", nome: m[1] }))

  marcas.sort((a, b) => a.inicio - b.inicio || b.fim - a.fim)

  const trechos: Trecho[] = []
  let cursor = 0
  for (const marca of marcas) {
    if (marca.inicio < cursor) continue // sobreposta — a anterior venceu
    if (marca.inicio > cursor) {
      trechos.push({ tipo: "texto", valor: linha.slice(cursor, marca.inicio) })
    }
    trechos.push(marca.trecho)
    cursor = marca.fim
  }
  if (cursor < linha.length) {
    trechos.push({ tipo: "texto", valor: linha.slice(cursor) })
  }
  return trechos
}

/** Texto puro → árvore de blocos. Nunca lança; entrada vazia devolve []. */
export function analisarDescricao(texto: string | null | undefined): Bloco[] {
  if (!texto) return []
  const linhas = texto.replace(/\r\n/g, "\n").split("\n")
  const blocos: Bloco[] = []
  let paragrafo: string[] = []
  let lista: Trecho[][] | null = null

  function fecharParagrafo() {
    if (paragrafo.length > 0) {
      blocos.push({ tipo: "paragrafo", trechos: analisarInline(paragrafo.join(" ")) })
      paragrafo = []
    }
  }
  function fecharLista() {
    if (lista && lista.length > 0) blocos.push({ tipo: "lista", itens: lista })
    lista = null
  }

  for (const linha of linhas) {
    const itemLista = /^\s*[-*]\s+(.*)$/.exec(linha)
    if (itemLista) {
      fecharParagrafo()
      if (!lista) lista = []
      lista.push(analisarInline(itemLista[1]))
      continue
    }
    if (linha.trim() === "") {
      fecharParagrafo()
      fecharLista()
      continue
    }
    fecharLista()
    paragrafo.push(linha.trim())
  }
  fecharParagrafo()
  fecharLista()
  return blocos
}

/**
 * Versão só-texto da descrição — para preview de 1 linha na lista e para o
 * trecho de busca. Não inclui marcação.
 */
export function descricaoResumida(
  texto: string | null | undefined,
  max = 120
): string {
  const blocos = analisarDescricao(texto)
  const partes: string[] = []
  for (const b of blocos) {
    const listaTrechos = b.tipo === "paragrafo" ? [b.trechos] : b.itens
    for (const trechos of listaTrechos) {
      for (const t of trechos) {
        partes.push(
          t.tipo === "link" ? t.rotulo : t.tipo === "mencao" ? `@${t.nome}` : t.valor
        )
      }
    }
  }
  const s = partes.join(" ").replace(/\s+/g, " ").trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** Nomes mencionados com @ — usado pra notificar quem foi citado. */
export function extrairMencoes(texto: string | null | undefined): string[] {
  if (!texto) return []
  const out = new Set<string>()
  RE_MENCAO.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_MENCAO.exec(texto)) !== null) out.add(m[1].toLowerCase())
  return [...out]
}
