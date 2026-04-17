export type Colaborador = "felipe" | "vinicius" | "emanuel"

export const COLABORADORES: Colaborador[] = ["felipe", "vinicius", "emanuel"]

export const GATILHOS_FELIPE = [
  { chave: "cpl_meta", rotulo: "CPL dentro da meta em todas as contas", valor: 200 },
  { chave: "leads_meta", rotulo: "Meta de leads atingida", valor: 200 },
  { chave: "roas_hato", rotulo: "ROAS Hato acima de 2,5x", valor: 150 },
  { chave: "posts_prazo", rotulo: "100% posts publicados no prazo", valor: 150 },
] as const

export function calcularBonusFelipe(detalhes: Record<string, boolean>): number {
  let total = 0
  for (const g of GATILHOS_FELIPE) {
    if (detalhes[g.chave]) total += g.valor
  }
  return total
}

export function calcularBonusVinicius(entregas: number): number {
  if (entregas < 10) return 0
  if (entregas < 15) return 100
  if (entregas < 20) return 200
  if (entregas < 25) return 350
  if (entregas < 30) return 500
  return 700
}

export function calcularBonusEmanuel(entregas: number): number {
  if (entregas < 5) return 0
  if (entregas < 8) return 100
  if (entregas < 11) return 200
  if (entregas < 15) return 350
  return 500
}

