// Paletas de cores padrão (instâncias/etiquetas) — módulo plano, SEM "use
// server", porque arquivos "use server" só podem exportar funções async
// (constantes quebram o build). Importável tanto pelas actions quanto pelos
// client components.

export const CORES_INSTANCIA = [
  "#C9953A", "#4a90d9", "#8e7cc3", "#4caf50",
  "#e0a458", "#e24b4a", "#16a3a3", "#d46ab8",
]

export const CORES_ETIQUETA = [
  "#8e7cc3", "#4a90d9", "#4caf50", "#e0a458",
  "#e24b4a", "#C9953A", "#16a3a3", "#d46ab8",
]
