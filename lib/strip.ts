import { listarColaboradores } from "./comissionamento-config"

export interface TimeDoHub {
  total: number
  subLabel: string
}

// Normaliza variações do mesmo papel em uma chave única.
// Editores continuam agrupados (evita poluir com especialidades).
// Tráfego/ads → exibe como "Gestor de tráfego" (nome completo, sem abreviar).
// Demais funções mantêm o nome original em lowercase.
const CHAVE_TRAFEGO = "Gestor de tráfego"

function normalizarFuncao(funcao: string): string {
  const f = (funcao ?? "").toLowerCase().trim()
  if (!f) return "outros"
  // ordem importa: "gestor de tráfego" contém ambos; tráfego vence.
  if (f.includes("tráfego") || f.includes("trafego") || f.includes("ads"))
    return CHAVE_TRAFEGO
  if (f.includes("editor") || f.includes("edit")) return "editor"
  if (f.includes("gestor") || f.includes("gestão") || f.includes("gestao"))
    return "gestor"
  if (f.includes("social")) return "social"
  return f
}

function pluralizar(chave: string, n: number): string {
  if (chave === "editor") return `${n} ${n === 1 ? "editor" : "editores"}`
  if (chave === "gestor") return `${n} ${n === 1 ? "gestor" : "gestores"}`
  if (chave === CHAVE_TRAFEGO) {
    return `${n} ${n === 1 ? "Gestor de tráfego" : "Gestores de tráfego"}`
  }
  if (chave === "social") return `${n} social`
  // função desconhecida: mostra o nome original em lowercase
  return `${n} ${chave}`
}

function montarSubLabel(contagens: Record<string, number>): string {
  const ordem = ["gestor", "editor", CHAVE_TRAFEGO, "social"]
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
