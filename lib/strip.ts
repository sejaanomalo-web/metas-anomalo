import { listarColaboradores } from "./comissionamento-config"

export interface TimeDoHub {
  total: number
  subLabel: string
}

// Normaliza variações do mesmo papel em uma chave única.
// "EDITOR · ESTÁTICOS E CARROSSÉIS", "Editor de Vídeo" etc → "editor"
function normalizarFuncao(funcao: string): string {
  const f = (funcao ?? "").toLowerCase().trim()
  if (!f) return "outros"
  if (f.includes("editor") || f.includes("edit")) return "editor"
  if (f.includes("tráfego") || f.includes("trafego") || f.includes("ads"))
    return "tráfego"
  if (f.includes("gestor") || f.includes("gestão") || f.includes("gestao"))
    return "gestor"
  if (f.includes("social")) return "social"
  return f
}

function pluralizar(chave: string, n: number): string {
  if (chave === "editor") return `${n} ${n === 1 ? "editor" : "editores"}`
  if (chave === "gestor") return `${n} ${n === 1 ? "gestor" : "gestores"}`
  if (chave === "tráfego") return `${n} tráfego`
  if (chave === "social") return `${n} social`
  // função desconhecida: mostra o nome original em lowercase
  return `${n} ${chave}`
}

function montarSubLabel(contagens: Record<string, number>): string {
  const ordem = ["gestor", "editor", "tráfego", "social"]
  const partes: string[] = []
  for (const k of ordem) {
    if ((contagens[k] ?? 0) > 0) partes.push(pluralizar(k, contagens[k]))
  }
  for (const [k, n] of Object.entries(contagens)) {
    if (ordem.includes(k) || n <= 0) continue
    partes.push(pluralizar(k, n))
  }
  return partes.length > 0 ? partes.join(" · ") : "colaboradores ativos"
}

// Fonte única de verdade = tabela public.colaboradores no Supabase.
// Não soma nenhuma lista hardcoded. Se a tabela está vazia, retorna 0.
export async function getTimeDoHub(): Promise<TimeDoHub> {
  try {
    const ativos = await listarColaboradores(true)
    const contagens: Record<string, number> = {}
    for (const c of ativos) {
      const chave = normalizarFuncao(c.funcao)
      contagens[chave] = (contagens[chave] ?? 0) + 1
    }
    return {
      total: ativos.length,
      subLabel: montarSubLabel(contagens),
    }
  } catch {
    return { total: 0, subLabel: "colaboradores ativos" }
  }
}
