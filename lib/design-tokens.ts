// Tokens de cor compartilhados entre os cartões de tráfego (MetricasTrafego),
// o Ranking de Campanhas e o Gerenciador de Anúncios — fonte única (DRY).

/** Gradientes + glow dos cartões de métrica, por "família" de cor. */
export const COR_MAP = {
  green: { bg: "linear-gradient(135deg,#34c759,#2aa148)", glow: "rgba(52,199,89,0.35)" },
  blue: { bg: "linear-gradient(135deg,#4062f0,#3550d8)", glow: "rgba(64,98,240,0.35)" },
  purple: { bg: "linear-gradient(135deg,#a855f7,#8b3ee0)", glow: "rgba(168,85,247,0.35)" },
  orange: { bg: "linear-gradient(135deg,#f97316,#e05f10)", glow: "rgba(249,115,22,0.35)" },
} as const

/** Cores sólidas semânticas por métrica (texto/realce no ranking e cards). */
export const COR = {
  conversas: "#34c759", // verde
  leads: "#4062f0", // azul
  compras: "#a855f7", // roxo
  carrinho: "#f97316", // laranja
  gasto: "#f97316", // laranja (valor gasto)
  accent: "#C9953A", // ouro (destaque / posição 1)
  neutro: "var(--text-4)",
} as const
