// =============================================================================
// Workspace — cores no padrão do Asana. PURO, seguro no browser.
// =============================================================================
//
// A referência visual do módulo é o Asana em dark mode (pasta RefsAsana/).
// Lá, cada projeto tem uma das 16 cores fixas do seletor "Set color & icon",
// e o cartão da tarefa no calendário usa essa cor como FUNDO do pill inteiro
// — não como bolinha decorativa. Este arquivo é a fonte única dessas cores.
//
// O texto do cartão é escolhido por luminância: cartão claro (amarelo, verde-
// claro) recebe texto escuro; cartão escuro recebe texto claro. É o mesmo
// comportamento do Asana e evita pill ilegível quando alguém escolher a cor.

export interface CorAsana {
  nome: string
  /** Fundo do cartão no calendário (tom dark-mode do Asana). */
  hex: string
}

/** As 16 cores do seletor do Asana, na MESMA ordem do popover "Set color". */
export const PALETA_ASANA: CorAsana[] = [
  { nome: "Nenhuma", hex: "#6d6e6f" },
  { nome: "Vermelho", hex: "#d1615f" },
  { nome: "Laranja", hex: "#d17c40" },
  { nome: "Amarelo-laranja", hex: "#cf9338" },
  { nome: "Amarelo", hex: "#c7a53b" },
  { nome: "Verde-amarelo", hex: "#8ea63f" },
  { nome: "Verde", hex: "#5da283" },
  { nome: "Verde-azulado", hex: "#43a5a3" },
  { nome: "Água", hex: "#4aa5c9" },
  { nome: "Azul", hex: "#5a7fd6" },
  { nome: "Índigo", hex: "#8578d8" },
  { nome: "Roxo", hex: "#a170d4" },
  { nome: "Magenta", hex: "#c65ca8" },
  { nome: "Rosa-choque", hex: "#e072a4" },
  { nome: "Rosa", hex: "#d98ca6" },
  { nome: "Cinza", hex: "#8d9096" },
]

/**
 * Nome de cor da API do Asana → hex da paleta. A API usa DOIS vocabulários
 * (o novo "yellow-orange" e o legado "dark-orange"/"light-orange") dependendo
 * do projeto — os dois estão aqui. Cor desconhecida vira null (pill neutro),
 * nunca uma cor inventada.
 */
const COR_ASANA_POR_NOME: Record<string, string> = {
  // vocabulário novo
  "red": "#d1615f",
  "orange": "#d17c40",
  "yellow-orange": "#cf9338",
  "yellow": "#c7a53b",
  "yellow-green": "#8ea63f",
  "green": "#5da283",
  "blue-green": "#43a5a3",
  "aqua": "#4aa5c9",
  "blue": "#5a7fd6",
  "indigo": "#8578d8",
  "purple": "#a170d4",
  "magenta": "#c65ca8",
  "hot-pink": "#e072a4",
  "pink": "#d98ca6",
  "cool-gray": "#8d9096",
  // vocabulário legado
  "dark-red": "#d1615f",
  "dark-orange": "#d17c40",
  "light-orange": "#cf9338",
  "dark-brown": "#c7a53b",
  "light-brown": "#cf9338",
  "light-green": "#8ea63f",
  "dark-green": "#5da283",
  "dark-teal": "#43a5a3",
  "light-teal": "#4aa5c9",
  "dark-blue": "#5a7fd6",
  "light-blue": "#4aa5c9",
  "dark-purple": "#8578d8",
  "light-purple": "#a170d4",
  "dark-pink": "#c65ca8",
  "light-pink": "#e072a4",
  "dark-warm-gray": "#8d9096",
  "light-warm-gray": "#8d9096",
}

/** Cor de projeto do Asana → hex. "none", vazio ou desconhecida → null. */
export function corDoAsana(color: string | null | undefined): string | null {
  if (!color || color === "none") return null
  return COR_ASANA_POR_NOME[color] ?? null
}

/** Luminância relativa (WCAG) de um hex #rrggbb. 0 = preto, 1 = branco. */
function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const canal = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  )
}

/** Texto legível sobre a cor dada — escuro em fundo claro, claro em escuro. */
export function textoSobre(hex: string): string {
  return luminancia(hex) > 0.45 ? "#1e1f21" : "#ffffff"
}

const HEX_VALIDO = /^#[0-9a-fA-F]{6}$/

/**
 * Estilo do cartão de tarefa no calendário, fiel ao Asana:
 * com cor de contexto → pill sólido naquela cor; sem cor → pill neutro
 * (borda, fundo da superfície), como o "Criar Carrosséis" dos prints.
 * Concluída mantém a cor (o ✓ é quem comunica) — o Asana não apaga o cartão.
 */
export function estiloCartao(cor: string | null | undefined): {
  background: string
  color: string
  border: string
} {
  if (cor && HEX_VALIDO.test(cor)) {
    return { background: cor, color: textoSobre(cor), border: "none" }
  }
  return {
    background: "var(--surface-1)",
    color: "var(--text-1)",
    border: "1px solid rgba(255,255,255,0.28)",
  }
}

/**
 * Cor de UMA TAREFA em qualquer visão (calendário, lista, minhas): a cor do
 * CLIENTE vence a de contexto genérico. Sem isso, toda tarefa importada
 * ficava âmbar — o "Calendário de conteúdo" é o primeiro vínculo de quase
 * todas, e a cor do cliente (Lidiane verde, Ivone rosa…) nunca aparecia.
 */
export function corDaTarefa(
  contextos: { tipo: string; cor: string | null }[]
): string | null {
  const cliente = contextos.find((c) => c.tipo === "cliente" && c.cor)
  if (cliente) return cliente.cor
  return contextos.find((c) => c.cor)?.cor ?? null
}

/**
 * Cor de avatar por nome (iniciais), determinística — o Asana faz o mesmo
 * quando o usuário não tem foto: um círculo colorido estável por pessoa.
 */
const CORES_AVATAR = [
  "#f06a6a", "#ec8d71", "#f1bd6c", "#aecf55", "#5da283",
  "#4ecbc4", "#9ee7e3", "#4573d2", "#8d84e8", "#b36bd4",
  "#f9aaef", "#f26fb2", "#fc979a", "#6d6e6f",
]

export function corAvatar(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return CORES_AVATAR[h % CORES_AVATAR.length]
}

/** "Bruno Freitas" → "BF"; "Job" → "JO". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
