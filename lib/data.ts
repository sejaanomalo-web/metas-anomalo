export const MESES = [
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const

export type Mes = (typeof MESES)[number]

export type EmpresaSlug =
  | "a2-marketing"
  | "f2-sports"
  | "f2-moveis"
  | "hato"
  | "aton"
  | "diego-knebel"

export type TipoFunil = "leads-reunioes-contratos" | "hato" | "aton" | "diego"

export interface EmpresaMeta {
  slug: EmpresaSlug
  nome: string
  tipo: TipoFunil
  inicioEm?: Mes
  cpl?: number
  conversaoLeadReuniao?: number
  conversaoReuniaoFechamento?: number
  conversaoLeadOrcamento?: number
  conversaoOrcamentoVenda?: number
}

export interface LinhaPadrao {
  mes: Mes
  verba: number
  leads: number
  reunioes: number
  contratos: number
  churn?: number
  clientes: number
  ticket: number
  faturamento: number
}

export interface LinhaHato {
  mes: Mes
  verba: number
  influenciadores: number
  vendasInfluenciador: number
  vendasDireto: number
  totalVendas: number
  receita: number
  custoInfluenciadores: number
}

export interface LinhaAton {
  mes: Mes
  verba: number
  leads: number
  orcamentos: number
  vendas: number
  ticket: number
  faturamento: number
}

export interface LinhaDiego {
  mes: Mes
  faturamentoDiego: number
  percentual: number
  receitaHub: number
}

export const a2Marketing: LinhaPadrao[] = [
  { mes: "Abril",    verba: 400,  leads: 66,  reunioes: 6,  contratos: 3, churn: 1, clientes: 9,  ticket: 1600, faturamento: 14400 },
  { mes: "Maio",     verba: 500,  leads: 83,  reunioes: 8,  contratos: 4, churn: 1, clientes: 12, ticket: 1700, faturamento: 20400 },
  { mes: "Junho",    verba: 600,  leads: 100, reunioes: 10, contratos: 5, churn: 1, clientes: 16, ticket: 1800, faturamento: 28800 },
  { mes: "Julho",    verba: 700,  leads: 116, reunioes: 11, contratos: 5, churn: 2, clientes: 19, ticket: 1900, faturamento: 36100 },
  { mes: "Agosto",   verba: 800,  leads: 133, reunioes: 13, contratos: 6, churn: 2, clientes: 23, ticket: 1900, faturamento: 43700 },
  { mes: "Setembro", verba: 900,  leads: 150, reunioes: 15, contratos: 7, churn: 2, clientes: 28, ticket: 2000, faturamento: 56000 },
  { mes: "Outubro",  verba: 1000, leads: 166, reunioes: 16, contratos: 7, churn: 2, clientes: 33, ticket: 2000, faturamento: 66000 },
  { mes: "Novembro", verba: 1000, leads: 166, reunioes: 16, contratos: 7, churn: 2, clientes: 38, ticket: 2000, faturamento: 76000 },
  { mes: "Dezembro", verba: 1000, leads: 166, reunioes: 16, contratos: 6, churn: 2, clientes: 42, ticket: 2000, faturamento: 84000 },
]

export const f2Sports: LinhaPadrao[] = [
  { mes: "Abril",    verba: 200, leads: 40, reunioes: 4, contratos: 1, clientes: 2,  ticket: 1200, faturamento: 2400  },
  { mes: "Maio",     verba: 200, leads: 40, reunioes: 4, contratos: 1, clientes: 3,  ticket: 1200, faturamento: 3600  },
  { mes: "Junho",    verba: 250, leads: 50, reunioes: 5, contratos: 2, clientes: 4,  ticket: 1200, faturamento: 4800  },
  { mes: "Julho",    verba: 250, leads: 50, reunioes: 5, contratos: 2, clientes: 5,  ticket: 1200, faturamento: 6000  },
  { mes: "Agosto",   verba: 300, leads: 60, reunioes: 6, contratos: 2, clientes: 6,  ticket: 1200, faturamento: 7200  },
  { mes: "Setembro", verba: 300, leads: 60, reunioes: 6, contratos: 2, clientes: 7,  ticket: 1200, faturamento: 8400  },
  { mes: "Outubro",  verba: 350, leads: 70, reunioes: 7, contratos: 2, clientes: 8,  ticket: 1200, faturamento: 9600  },
  { mes: "Novembro", verba: 350, leads: 70, reunioes: 7, contratos: 2, clientes: 9,  ticket: 1200, faturamento: 10800 },
  { mes: "Dezembro", verba: 400, leads: 80, reunioes: 8, contratos: 3, clientes: 10, ticket: 1200, faturamento: 12000 },
]

export const f2Moveis: LinhaPadrao[] = [
  { mes: "Julho",    verba: 200, leads: 10, reunioes: 1, contratos: 1, clientes: 1, ticket: 2000, faturamento: 2000  },
  { mes: "Agosto",   verba: 250, leads: 12, reunioes: 1, contratos: 1, clientes: 2, ticket: 2000, faturamento: 4000  },
  { mes: "Setembro", verba: 300, leads: 15, reunioes: 2, contratos: 1, clientes: 3, ticket: 2000, faturamento: 6000  },
  { mes: "Outubro",  verba: 350, leads: 17, reunioes: 2, contratos: 2, clientes: 4, ticket: 2000, faturamento: 8000  },
  { mes: "Novembro", verba: 400, leads: 20, reunioes: 2, contratos: 2, clientes: 5, ticket: 2000, faturamento: 10000 },
  { mes: "Dezembro", verba: 400, leads: 20, reunioes: 2, contratos: 2, clientes: 6, ticket: 2000, faturamento: 12000 },
]

export const hato: LinhaHato[] = [
  { mes: "Abril",    verba: 400,  influenciadores: 3,  vendasInfluenciador: 15, vendasDireto: 20, totalVendas: 35,  receita: 4515,  custoInfluenciadores: 150 },
  { mes: "Maio",     verba: 500,  influenciadores: 4,  vendasInfluenciador: 20, vendasDireto: 22, totalVendas: 42,  receita: 5418,  custoInfluenciadores: 200 },
  { mes: "Junho",    verba: 600,  influenciadores: 5,  vendasInfluenciador: 25, vendasDireto: 22, totalVendas: 47,  receita: 6063,  custoInfluenciadores: 250 },
  { mes: "Julho",    verba: 700,  influenciadores: 6,  vendasInfluenciador: 30, vendasDireto: 25, totalVendas: 55,  receita: 7095,  custoInfluenciadores: 300 },
  { mes: "Agosto",   verba: 800,  influenciadores: 8,  vendasInfluenciador: 40, vendasDireto: 27, totalVendas: 67,  receita: 8643,  custoInfluenciadores: 400 },
  { mes: "Setembro", verba: 900,  influenciadores: 10, vendasInfluenciador: 50, vendasDireto: 30, totalVendas: 80,  receita: 10320, custoInfluenciadores: 500 },
  { mes: "Outubro",  verba: 1000, influenciadores: 12, vendasInfluenciador: 60, vendasDireto: 35, totalVendas: 95,  receita: 12255, custoInfluenciadores: 600 },
  { mes: "Novembro", verba: 1500, influenciadores: 15, vendasInfluenciador: 75, vendasDireto: 50, totalVendas: 125, receita: 16125, custoInfluenciadores: 750 },
  { mes: "Dezembro", verba: 1500, influenciadores: 15, vendasInfluenciador: 75, vendasDireto: 55, totalVendas: 130, receita: 16770, custoInfluenciadores: 750 },
]

export const aton: LinhaAton[] = [
  { mes: "Abril",    verba: 300, leads: 20, orcamentos: 5,  vendas: 2, ticket: 4000, faturamento: 8000  },
  { mes: "Maio",     verba: 350, leads: 23, orcamentos: 6,  vendas: 3, ticket: 4000, faturamento: 12000 },
  { mes: "Junho",    verba: 400, leads: 26, orcamentos: 7,  vendas: 3, ticket: 4200, faturamento: 12600 },
  { mes: "Julho",    verba: 450, leads: 30, orcamentos: 8,  vendas: 4, ticket: 4200, faturamento: 16800 },
  { mes: "Agosto",   verba: 500, leads: 33, orcamentos: 8,  vendas: 4, ticket: 4500, faturamento: 18000 },
  { mes: "Setembro", verba: 600, leads: 40, orcamentos: 10, vendas: 5, ticket: 4500, faturamento: 22500 },
  { mes: "Outubro",  verba: 700, leads: 46, orcamentos: 12, vendas: 6, ticket: 4800, faturamento: 28800 },
  { mes: "Novembro", verba: 800, leads: 53, orcamentos: 13, vendas: 6, ticket: 4800, faturamento: 28800 },
  { mes: "Dezembro", verba: 900, leads: 60, orcamentos: 15, vendas: 7, ticket: 4800, faturamento: 33600 },
]

export const diego: LinhaDiego[] = [
  { mes: "Abril",    faturamentoDiego: 25000, percentual: 15, receitaHub: 3750  },
  { mes: "Maio",     faturamentoDiego: 28000, percentual: 15, receitaHub: 4200  },
  { mes: "Junho",    faturamentoDiego: 33000, percentual: 20, receitaHub: 6600  },
  { mes: "Julho",    faturamentoDiego: 37000, percentual: 20, receitaHub: 7400  },
  { mes: "Agosto",   faturamentoDiego: 43000, percentual: 25, receitaHub: 10750 },
  { mes: "Setembro", faturamentoDiego: 48000, percentual: 25, receitaHub: 12000 },
  { mes: "Outubro",  faturamentoDiego: 50000, percentual: 25, receitaHub: 12500 },
  { mes: "Novembro", faturamentoDiego: 55000, percentual: 30, receitaHub: 16500 },
  { mes: "Dezembro", faturamentoDiego: 45000, percentual: 25, receitaHub: 11250 },
]

export const empresas: EmpresaMeta[] = [
  {
    slug: "a2-marketing",
    nome: "A2 Marketing",
    tipo: "leads-reunioes-contratos",
    cpl: 6,
    conversaoLeadReuniao: 0.1,
    conversaoReuniaoFechamento: 0.65,
  },
  {
    slug: "f2-sports",
    nome: "F2 Sports",
    tipo: "leads-reunioes-contratos",
    cpl: 5,
    conversaoLeadReuniao: 0.1,
    conversaoReuniaoFechamento: 0.6,
  },
  {
    slug: "f2-moveis",
    nome: "F2 Móveis",
    tipo: "leads-reunioes-contratos",
    inicioEm: "Julho",
    cpl: 20,
    conversaoLeadReuniao: 0.1,
    conversaoReuniaoFechamento: 0.6,
  },
  { slug: "hato", nome: "Hato", tipo: "hato" },
  {
    slug: "aton",
    nome: "Aton Estofados",
    tipo: "aton",
    cpl: 15,
    conversaoLeadOrcamento: 0.25,
    conversaoOrcamentoVenda: 0.5,
  },
  { slug: "diego-knebel", nome: "Diego Knebel", tipo: "diego" },
]

export function getEmpresa(slug: string): EmpresaMeta | undefined {
  return empresas.find((e) => e.slug === slug)
}

export function getDadosEmpresa(slug: EmpresaSlug) {
  switch (slug) {
    case "a2-marketing":
      return a2Marketing
    case "f2-sports":
      return f2Sports
    case "f2-moveis":
      return f2Moveis
    case "hato":
      return hato
    case "aton":
      return aton
    case "diego-knebel":
      return diego
  }
}

export function getLinhaMes<T extends { mes: string }>(
  dados: T[],
  mes: Mes
): T | undefined {
  return dados.find((l) => l.mes === mes)
}

export interface FunilResumo {
  rotulos: [string, string, string]
  valores: [number, number, number]
  faturamento: number
}

export function getFunilResumo(slug: EmpresaSlug, mes: Mes): FunilResumo | null {
  const empresa = getEmpresa(slug)
  if (!empresa) return null

  switch (empresa.tipo) {
    case "leads-reunioes-contratos": {
      const dados = getDadosEmpresa(slug) as LinhaPadrao[]
      const linha = getLinhaMes(dados, mes)
      if (!linha) return null
      return {
        rotulos: ["Leads", "Reuniões", "Contratos"],
        valores: [linha.leads, linha.reunioes, linha.contratos],
        faturamento: linha.faturamento,
      }
    }
    case "aton": {
      const dados = getDadosEmpresa(slug) as LinhaAton[]
      const linha = getLinhaMes(dados, mes)
      if (!linha) return null
      return {
        rotulos: ["Leads", "Orçamentos", "Vendas"],
        valores: [linha.leads, linha.orcamentos, linha.vendas],
        faturamento: linha.faturamento,
      }
    }
    case "hato": {
      const dados = getDadosEmpresa(slug) as LinhaHato[]
      const linha = getLinhaMes(dados, mes)
      if (!linha) return null
      return {
        rotulos: ["Influenciadores", "Vendas Influ.", "Total Vendas"],
        valores: [linha.influenciadores, linha.vendasInfluenciador, linha.totalVendas],
        faturamento: linha.receita,
      }
    }
    case "diego": {
      const dados = getDadosEmpresa(slug) as LinhaDiego[]
      const linha = getLinhaMes(dados, mes)
      if (!linha) return null
      return {
        rotulos: ["Faturamento Diego", "Percentual %", "Receita Hub"],
        valores: [linha.faturamentoDiego, linha.percentual, linha.receitaHub],
        faturamento: linha.receitaHub,
      }
    }
  }
}

export function getFaturamentoMes(slug: EmpresaSlug, mes: Mes): number {
  const empresa = getEmpresa(slug)
  if (!empresa) return 0
  switch (empresa.tipo) {
    case "leads-reunioes-contratos": {
      return (
        (getDadosEmpresa(slug) as LinhaPadrao[]).find((l) => l.mes === mes)
          ?.faturamento ?? 0
      )
    }
    case "aton":
      return (
        (getDadosEmpresa(slug) as LinhaAton[]).find((l) => l.mes === mes)
          ?.faturamento ?? 0
      )
    case "hato":
      return (
        (getDadosEmpresa(slug) as LinhaHato[]).find((l) => l.mes === mes)
          ?.receita ?? 0
      )
    case "diego":
      return (
        (getDadosEmpresa(slug) as LinhaDiego[]).find((l) => l.mes === mes)
          ?.receitaHub ?? 0
      )
  }
}

export function getFaturamentoDezembro(slug: EmpresaSlug): number {
  return getFaturamentoMes(slug, "Dezembro")
}

export function getResumoGrupo(mes: Mes) {
  let faturamento = 0
  let leads = 0
  let reunioes = 0
  let contratos = 0

  for (const empresa of empresas) {
    faturamento += getFaturamentoMes(empresa.slug, mes)

    if (empresa.tipo === "leads-reunioes-contratos") {
      const linha = (getDadosEmpresa(empresa.slug) as LinhaPadrao[]).find(
        (l) => l.mes === mes
      )
      if (linha) {
        leads += linha.leads
        reunioes += linha.reunioes
        contratos += linha.contratos
      }
    } else if (empresa.tipo === "aton") {
      const linha = (getDadosEmpresa(empresa.slug) as LinhaAton[]).find(
        (l) => l.mes === mes
      )
      if (linha) {
        leads += linha.leads
        reunioes += linha.orcamentos
        contratos += linha.vendas
      }
    }
  }

  return { faturamento, leads, reunioes, contratos }
}

export function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  })
}

export function formatNumero(valor: number): string {
  return valor.toLocaleString("pt-BR")
}
