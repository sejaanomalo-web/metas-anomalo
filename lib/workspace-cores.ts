// =============================================================================
// Workspace — cores no padrão do Asana. PURO, seguro no browser.
// =============================================================================
//
// A referência visual do módulo é o Asana (pastas RefsAsana/ e RefsClientAsana/
// e o print do cartão vibrante). Cada projeto tem uma das 16 cores fixas do
// seletor "Set color & icon", e o cartão da tarefa no calendário usa essa cor
// como FUNDO do pill inteiro — não como bolinha decorativa. Este arquivo é a
// fonte única dessas cores.
//
// A paleta é a VIBRANTE (pastéis saturados, tipo o print de referência), não a
// versão escurecida do dark mode: sobre o cinza do workspace elas saltam.
// Cores personalizadas também são aceitas, então o texto é calculado pela
// luminância real do fundo em vez de assumir que toda cor será clara.

export interface CorAsana {
  nome: string
  /** Fundo do cartão no calendário. */
  hex: string
}

/** As 16 cores do seletor do Asana, na MESMA ordem do popover "Set color". */
export const PALETA_ASANA: CorAsana[] = [
  { nome: "Nenhuma", hex: "#b6b8bb" },
  { nome: "Vermelho", hex: "#f28b82" },
  { nome: "Laranja", hex: "#f0a06b" },
  { nome: "Amarelo-laranja", hex: "#f5c164" },
  { nome: "Amarelo", hex: "#f2da6e" },
  { nome: "Verde-amarelo", hex: "#c6e585" },
  { nome: "Verde", hex: "#96e0a1" },
  { nome: "Verde-azulado", hex: "#7edcc8" },
  { nome: "Água", hex: "#8ed7ef" },
  { nome: "Azul", hex: "#93b6f5" },
  { nome: "Índigo", hex: "#a8a4f2" },
  { nome: "Roxo", hex: "#c3a2ef" },
  { nome: "Magenta", hex: "#e5a1e4" },
  { nome: "Rosa-choque", hex: "#f4a3dc" },
  { nome: "Rosa", hex: "#f6b2c6" },
  { nome: "Cinza", hex: "#c2c6cc" },
]

/**
 * Paleta ANTIGA (dark-mode escurecido) → paleta vibrante atual. Serve ao
 * script scripts/ws-cores-vibrantes.ts: os contextos já gravados no banco
 * têm os hexes antigos, e trocar só a constante deixaria o banco defasado.
 */
export const MIGRACAO_CORES: Record<string, string> = {
  "#6d6e6f": "#b6b8bb",
  "#d1615f": "#f28b82",
  "#d17c40": "#f0a06b",
  "#cf9338": "#f5c164",
  "#c7a53b": "#f2da6e",
  "#8ea63f": "#c6e585",
  "#5da283": "#96e0a1",
  "#43a5a3": "#7edcc8",
  "#4aa5c9": "#8ed7ef",
  "#5a7fd6": "#93b6f5",
  "#8578d8": "#a8a4f2",
  "#a170d4": "#c3a2ef",
  "#c65ca8": "#e5a1e4",
  "#e072a4": "#f4a3dc",
  "#d98ca6": "#f6b2c6",
  "#8d9096": "#c2c6cc",
}

/**
 * Nome de cor da API do Asana → hex da paleta. A API usa DOIS vocabulários
 * (o novo "yellow-orange" e o legado "dark-orange"/"light-orange") dependendo
 * do projeto — os dois estão aqui. Cor desconhecida vira null (pill neutro),
 * nunca uma cor inventada.
 */
const COR_ASANA_POR_NOME: Record<string, string> = {
  // vocabulário novo
  "red": "#f28b82",
  "orange": "#f0a06b",
  "yellow-orange": "#f5c164",
  "yellow": "#f2da6e",
  "yellow-green": "#c6e585",
  "green": "#96e0a1",
  "blue-green": "#7edcc8",
  "aqua": "#8ed7ef",
  "blue": "#93b6f5",
  "indigo": "#a8a4f2",
  "purple": "#c3a2ef",
  "magenta": "#e5a1e4",
  "hot-pink": "#f4a3dc",
  "pink": "#f6b2c6",
  "cool-gray": "#c2c6cc",
  // vocabulário legado
  "dark-red": "#f28b82",
  "dark-orange": "#f0a06b",
  "light-orange": "#f5c164",
  "dark-brown": "#f2da6e",
  "light-brown": "#f5c164",
  "light-green": "#c6e585",
  "dark-green": "#96e0a1",
  "dark-teal": "#7edcc8",
  "light-teal": "#8ed7ef",
  "dark-blue": "#93b6f5",
  "light-blue": "#8ed7ef",
  "dark-purple": "#a8a4f2",
  "light-purple": "#c3a2ef",
  "dark-pink": "#e5a1e4",
  "light-pink": "#f4a3dc",
  "dark-warm-gray": "#c2c6cc",
  "light-warm-gray": "#c2c6cc",
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

/**
 * Texto legível sobre a cor dada — escuro em fundo claro, claro em escuro.
 *
 * Limiar 0.28 (não 0.45): a paleta vibrante tem luminância entre ~0.39 (o
 * vermelho #f28b82) e ~0.75 (o amarelo). Com o limiar antigo o vermelho e o
 * roxo caíam do lado do BRANCO — texto claro sobre pastel claro, o pior
 * contraste possível. Abaixo de 0.28 sobram só os tons realmente escuros
 * (cinza médio pra baixo), onde o branco é a escolha certa.
 */
export function textoSobre(hex: string): string {
  return luminancia(hex) > 0.28 ? "#1e1f21" : "#ffffff"
}

const HEX_VALIDO = /^#[0-9a-fA-F]{6}$/

/**
 * Estilo do cartão de tarefa no calendário, fiel ao Asana:
 * com cor de contexto → pill sólido naquela cor e texto escolhido pela
 * luminância (escuro em fundo claro, branco em fundo escuro);
 * sem cor → pill neutro (borda, fundo da superfície).
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
