import { listarColaboradores } from "./comissionamento-config"

export interface TimeDoHub {
  total: number
  subLabel: string
}

interface ContagemFuncao {
  gestores: number
  editores: number
  trafego: number
  social: number
  outros: number
}

function categorizar(funcao: string): keyof ContagemFuncao {
  const f = funcao.toLowerCase()
  if (f.includes("gestor") || f.includes("gestão")) return "gestores"
  if (f.includes("editor") || f.includes("edit")) return "editores"
  if (f.includes("tráfego") || f.includes("trafego") || f.includes("ads"))
    return "trafego"
  if (f.includes("social")) return "social"
  return "outros"
}

function montarSubLabel(c: ContagemFuncao): string {
  const partes: string[] = []
  if (c.gestores > 0) {
    partes.push(`${c.gestores} ${c.gestores === 1 ? "gestor" : "gestores"}`)
  }
  if (c.editores > 0) {
    partes.push(`${c.editores} ${c.editores === 1 ? "editor" : "editores"}`)
  }
  if (c.trafego > 0) {
    partes.push(`${c.trafego} tráfego`)
  }
  if (c.social > 0) {
    partes.push(`${c.social} social`)
  }
  if (c.outros > 0) {
    partes.push(`${c.outros} ${c.outros === 1 ? "outro" : "outros"}`)
  }
  if (partes.length === 0) return "colaboradores ativos"
  return partes.join(" · ")
}

export async function getTimeDoHub(): Promise<TimeDoHub> {
  // Pessoas fixas já existentes no sistema:
  // Bruno + Alisson (gestores) + Felipe (tráfego) + Vinicius + Emanuel (editores)
  const fixos: ContagemFuncao = {
    gestores: 2,
    editores: 2,
    trafego: 1,
    social: 0,
    outros: 0,
  }

  const contagem: ContagemFuncao = { ...fixos }
  let total = 5

  try {
    const extras = await listarColaboradores(true)
    for (const c of extras) {
      const categoria = categorizar(c.funcao)
      contagem[categoria]++
      total++
    }
  } catch {
    // Sem conexão com o Supabase: usa apenas os fixos
  }

  return { total, subLabel: montarSubLabel(contagem) }
}
