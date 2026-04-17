export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
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

export const ANOS_DISPONIVEIS = [2025, 2026, 2027, 2028] as const
export type Ano = (typeof ANOS_DISPONIVEIS)[number]

export const ANO_PADRAO: Ano = 2026
export const ANO_PROJETADO = 2025

export type EmpresaSlug =
  | "a2-marketing"
  | "f2-sports"
  | "f2-moveis"
  | "hato"
  | "aton"
  | "diego-knebel"

export type EmpresaDb =
  | "a2_marketing"
  | "f2_sports"
  | "f2_moveis"
  | "hato"
  | "aton"
  | "diego"

export type TipoFunil = "leads-reunioes-contratos" | "hato" | "aton" | "diego"

export interface EmpresaMeta {
  slug: EmpresaSlug
  db: EmpresaDb
  nome: string
  tipo: TipoFunil
  inicioEm?: Mes
  cpl?: number
  ticketMedioProjetado?: number
  conversaoLeadReuniao?: number
  conversaoReuniaoFechamento?: number
  conversaoLeadOrcamento?: number
  conversaoOrcamentoVenda?: number
}

export interface LinhaPadrao {
  mes: Mes
  verba: number
  criativos: number
  criativos_semana: number
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
  criativos: number
  criativos_semana: number
  influenciadores: number
  vendas_influenciador: number
  vendas_direto: number
  total_vendas: number
  receita: number
  custo_influenciadores: number
}

export interface LinhaAton {
  mes: Mes
  verba: number
  criativos: number
  criativos_semana: number
  leads: number
  orcamentos: number
  vendas: number
  ticket: number
  faturamento: number
}

export interface LinhaDiego {
  mes: Mes
  faturamento_diego: number
  percentual: number
  receita_hub: number
}

export const a2Marketing: LinhaPadrao[] = [
  { mes: "Abril",    verba: 400,  criativos: 20, criativos_semana: 5, leads: 66,  reunioes: 6,  contratos: 3, churn: 1, clientes: 9,  ticket: 1600, faturamento: 14400 },
  { mes: "Maio",     verba: 500,  criativos: 20, criativos_semana: 5, leads: 83,  reunioes: 8,  contratos: 4, churn: 1, clientes: 12, ticket: 1700, faturamento: 20400 },
  { mes: "Junho",    verba: 600,  criativos: 20, criativos_semana: 5, leads: 100, reunioes: 10, contratos: 5, churn: 1, clientes: 16, ticket: 1800, faturamento: 28800 },
  { mes: "Julho",    verba: 700,  criativos: 20, criativos_semana: 5, leads: 116, reunioes: 11, contratos: 5, churn: 2, clientes: 19, ticket: 1900, faturamento: 36100 },
  { mes: "Agosto",   verba: 800,  criativos: 20, criativos_semana: 5, leads: 133, reunioes: 13, contratos: 6, churn: 2, clientes: 23, ticket: 1900, faturamento: 43700 },
  { mes: "Setembro", verba: 900,  criativos: 20, criativos_semana: 5, leads: 150, reunioes: 15, contratos: 7, churn: 2, clientes: 28, ticket: 2000, faturamento: 56000 },
  { mes: "Outubro",  verba: 1000, criativos: 20, criativos_semana: 5, leads: 166, reunioes: 16, contratos: 7, churn: 2, clientes: 33, ticket: 2000, faturamento: 66000 },
  { mes: "Novembro", verba: 1000, criativos: 20, criativos_semana: 5, leads: 166, reunioes: 16, contratos: 7, churn: 2, clientes: 38, ticket: 2000, faturamento: 76000 },
  { mes: "Dezembro", verba: 1000, criativos: 20, criativos_semana: 5, leads: 166, reunioes: 16, contratos: 6, churn: 2, clientes: 42, ticket: 2000, faturamento: 84000 },
]

export const f2Sports: LinhaPadrao[] = [
  { mes: "Abril",    verba: 200, criativos: 20, criativos_semana: 5, leads: 40, reunioes: 4, contratos: 1, clientes: 2,  ticket: 1200, faturamento: 2400  },
  { mes: "Maio",     verba: 200, criativos: 20, criativos_semana: 5, leads: 40, reunioes: 4, contratos: 1, clientes: 3,  ticket: 1200, faturamento: 3600  },
  { mes: "Junho",    verba: 250, criativos: 20, criativos_semana: 5, leads: 50, reunioes: 5, contratos: 2, clientes: 4,  ticket: 1200, faturamento: 4800  },
  { mes: "Julho",    verba: 250, criativos: 20, criativos_semana: 5, leads: 50, reunioes: 5, contratos: 2, clientes: 5,  ticket: 1200, faturamento: 6000  },
  { mes: "Agosto",   verba: 300, criativos: 20, criativos_semana: 5, leads: 60, reunioes: 6, contratos: 2, clientes: 6,  ticket: 1200, faturamento: 7200  },
  { mes: "Setembro", verba: 300, criativos: 20, criativos_semana: 5, leads: 60, reunioes: 6, contratos: 2, clientes: 7,  ticket: 1200, faturamento: 8400  },
  { mes: "Outubro",  verba: 350, criativos: 20, criativos_semana: 5, leads: 70, reunioes: 7, contratos: 2, clientes: 8,  ticket: 1200, faturamento: 9600  },
  { mes: "Novembro", verba: 350, criativos: 20, criativos_semana: 5, leads: 70, reunioes: 7, contratos: 2, clientes: 9,  ticket: 1200, faturamento: 10800 },
  { mes: "Dezembro", verba: 400, criativos: 20, criativos_semana: 5, leads: 80, reunioes: 8, contratos: 3, clientes: 10, ticket: 1200, faturamento: 12000 },
]

export const f2Moveis: LinhaPadrao[] = [
  { mes: "Julho",    verba: 200, criativos: 20, criativos_semana: 5, leads: 10, reunioes: 1, contratos: 1, clientes: 1, ticket: 2000, faturamento: 2000  },
  { mes: "Agosto",   verba: 250, criativos: 20, criativos_semana: 5, leads: 12, reunioes: 1, contratos: 1, clientes: 2, ticket: 2000, faturamento: 4000  },
  { mes: "Setembro", verba: 300, criativos: 20, criativos_semana: 5, leads: 15, reunioes: 2, contratos: 1, clientes: 3, ticket: 2000, faturamento: 6000  },
  { mes: "Outubro",  verba: 350, criativos: 20, criativos_semana: 5, leads: 17, reunioes: 2, contratos: 2, clientes: 4, ticket: 2000, faturamento: 8000  },
  { mes: "Novembro", verba: 400, criativos: 20, criativos_semana: 5, leads: 20, reunioes: 2, contratos: 2, clientes: 5, ticket: 2000, faturamento: 10000 },
  { mes: "Dezembro", verba: 400, criativos: 20, criativos_semana: 5, leads: 20, reunioes: 2, contratos: 2, clientes: 6, ticket: 2000, faturamento: 12000 },
]

export const hato: LinhaHato[] = [
  { mes: "Abril",    verba: 400,  criativos: 20, criativos_semana: 5, influenciadores: 3,  vendas_influenciador: 15, vendas_direto: 20, total_vendas: 35,  receita: 4515,  custo_influenciadores: 150 },
  { mes: "Maio",     verba: 500,  criativos: 20, criativos_semana: 5, influenciadores: 4,  vendas_influenciador: 20, vendas_direto: 22, total_vendas: 42,  receita: 5418,  custo_influenciadores: 200 },
  { mes: "Junho",    verba: 600,  criativos: 20, criativos_semana: 5, influenciadores: 5,  vendas_influenciador: 25, vendas_direto: 22, total_vendas: 47,  receita: 6063,  custo_influenciadores: 250 },
  { mes: "Julho",    verba: 700,  criativos: 20, criativos_semana: 5, influenciadores: 6,  vendas_influenciador: 30, vendas_direto: 25, total_vendas: 55,  receita: 7095,  custo_influenciadores: 300 },
  { mes: "Agosto",   verba: 800,  criativos: 20, criativos_semana: 5, influenciadores: 8,  vendas_influenciador: 40, vendas_direto: 27, total_vendas: 67,  receita: 8643,  custo_influenciadores: 400 },
  { mes: "Setembro", verba: 900,  criativos: 20, criativos_semana: 5, influenciadores: 10, vendas_influenciador: 50, vendas_direto: 30, total_vendas: 80,  receita: 10320, custo_influenciadores: 500 },
  { mes: "Outubro",  verba: 1000, criativos: 20, criativos_semana: 5, influenciadores: 12, vendas_influenciador: 60, vendas_direto: 35, total_vendas: 95,  receita: 12255, custo_influenciadores: 600 },
  { mes: "Novembro", verba: 1500, criativos: 20, criativos_semana: 5, influenciadores: 15, vendas_influenciador: 75, vendas_direto: 50, total_vendas: 125, receita: 16125, custo_influenciadores: 750 },
  { mes: "Dezembro", verba: 1500, criativos: 20, criativos_semana: 5, influenciadores: 15, vendas_influenciador: 75, vendas_direto: 55, total_vendas: 130, receita: 16770, custo_influenciadores: 750 },
]

export const aton: LinhaAton[] = [
  { mes: "Abril",    verba: 300, criativos: 20, criativos_semana: 5, leads: 20, orcamentos: 5,  vendas: 2, ticket: 4000, faturamento: 8000  },
  { mes: "Maio",     verba: 350, criativos: 20, criativos_semana: 5, leads: 23, orcamentos: 6,  vendas: 3, ticket: 4000, faturamento: 12000 },
  { mes: "Junho",    verba: 400, criativos: 20, criativos_semana: 5, leads: 26, orcamentos: 7,  vendas: 3, ticket: 4200, faturamento: 12600 },
  { mes: "Julho",    verba: 450, criativos: 20, criativos_semana: 5, leads: 30, orcamentos: 8,  vendas: 4, ticket: 4200, faturamento: 16800 },
  { mes: "Agosto",   verba: 500, criativos: 20, criativos_semana: 5, leads: 33, orcamentos: 8,  vendas: 4, ticket: 4500, faturamento: 18000 },
  { mes: "Setembro", verba: 600, criativos: 20, criativos_semana: 5, leads: 40, orcamentos: 10, vendas: 5, ticket: 4500, faturamento: 22500 },
  { mes: "Outubro",  verba: 700, criativos: 20, criativos_semana: 5, leads: 46, orcamentos: 12, vendas: 6, ticket: 4800, faturamento: 28800 },
  { mes: "Novembro", verba: 800, criativos: 20, criativos_semana: 5, leads: 53, orcamentos: 13, vendas: 6, ticket: 4800, faturamento: 28800 },
  { mes: "Dezembro", verba: 900, criativos: 20, criativos_semana: 5, leads: 60, orcamentos: 15, vendas: 7, ticket: 4800, faturamento: 33600 },
]

export const diego: LinhaDiego[] = [
  { mes: "Abril",    faturamento_diego: 25000, percentual: 15, receita_hub: 3750  },
  { mes: "Maio",     faturamento_diego: 28000, percentual: 15, receita_hub: 4200  },
  { mes: "Junho",    faturamento_diego: 33000, percentual: 20, receita_hub: 6600  },
  { mes: "Julho",    faturamento_diego: 37000, percentual: 20, receita_hub: 7400  },
  { mes: "Agosto",   faturamento_diego: 43000, percentual: 25, receita_hub: 10750 },
  { mes: "Setembro", faturamento_diego: 48000, percentual: 25, receita_hub: 12000 },
  { mes: "Outubro",  faturamento_diego: 50000, percentual: 25, receita_hub: 12500 },
  { mes: "Novembro", faturamento_diego: 55000, percentual: 30, receita_hub: 16500 },
  { mes: "Dezembro", faturamento_diego: 45000, percentual: 25, receita_hub: 11250 },
]

export const empresas: EmpresaMeta[] = [
  {
    slug: "a2-marketing",
    db: "a2_marketing",
    nome: "A2 Marketing",
    tipo: "leads-reunioes-contratos",
    cpl: 6,
    conversaoLeadReuniao: 0.1,
    conversaoReuniaoFechamento: 0.65,
  },
  {
    slug: "f2-sports",
    db: "f2_sports",
    nome: "F2 Sports",
    tipo: "leads-reunioes-contratos",
    cpl: 5,
    conversaoLeadReuniao: 0.1,
    conversaoReuniaoFechamento: 0.6,
  },
  {
    slug: "f2-moveis",
    db: "f2_moveis",
    nome: "F2 Móveis",
    tipo: "leads-reunioes-contratos",
    inicioEm: "Julho",
    cpl: 20,
    conversaoLeadReuniao: 0.1,
    conversaoReuniaoFechamento: 0.6,
  },
  { slug: "hato", db: "hato", nome: "Hato", tipo: "hato" },
  {
    slug: "aton",
    db: "aton",
    nome: "Aton Estofados",
    tipo: "aton",
    cpl: 15,
    conversaoLeadOrcamento: 0.25,
    conversaoOrcamentoVenda: 0.5,
  },
  { slug: "diego-knebel", db: "diego", nome: "Diego Knebel", tipo: "diego" },
]

export function anoTemProjecao(ano: number): boolean {
  return ano === ANO_PROJETADO
}

export function getEmpresa(slug: string): EmpresaMeta | undefined {
  return empresas.find((e) => e.slug === slug)
}

export function getEmpresaPorDb(db: string): EmpresaMeta | undefined {
  return empresas.find((e) => e.db === db)
}

export function getDadosEmpresa(
  slug: EmpresaSlug,
  ano: number = ANO_PROJETADO
) {
  if (!anoTemProjecao(ano)) return []
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

export function getVerbaMes(
  slug: EmpresaSlug,
  mes: Mes,
  ano: number = ANO_PROJETADO
): number {
  const empresa = getEmpresa(slug)
  if (!empresa || !anoTemProjecao(ano) || empresa.tipo === "diego") return 0
  const linha = getDadosEmpresa(slug, ano).find((l) => l.mes === mes) as
    | LinhaPadrao
    | LinhaAton
    | LinhaHato
    | undefined
  return linha?.verba ?? 0
}

export function getCriativosMes(
  slug: EmpresaSlug,
  mes: Mes,
  ano: number = ANO_PROJETADO
) {
  const empresa = getEmpresa(slug)
  if (!empresa || !anoTemProjecao(ano) || empresa.tipo === "diego")
    return { mes: 0, semana: 0 }
  const linha = getDadosEmpresa(slug, ano).find((l) => l.mes === mes) as
    | LinhaPadrao
    | LinhaAton
    | LinhaHato
    | undefined
  return { mes: linha?.criativos ?? 0, semana: linha?.criativos_semana ?? 0 }
}

export function getLeadsMes(
  slug: EmpresaSlug,
  mes: Mes,
  ano: number = ANO_PROJETADO
): number {
  const empresa = getEmpresa(slug)
  if (!empresa || !anoTemProjecao(ano)) return 0
  if (empresa.tipo === "leads-reunioes-contratos") {
    return (
      (getDadosEmpresa(slug, ano) as LinhaPadrao[]).find((l) => l.mes === mes)
        ?.leads ?? 0
    )
  }
  if (empresa.tipo === "aton") {
    return (
      (getDadosEmpresa(slug, ano) as LinhaAton[]).find((l) => l.mes === mes)
        ?.leads ?? 0
    )
  }
  return 0
}

export function getFaturamentoMes(
  slug: EmpresaSlug,
  mes: Mes,
  ano: number = ANO_PROJETADO
): number {
  const empresa = getEmpresa(slug)
  if (!empresa || !anoTemProjecao(ano)) return 0
  switch (empresa.tipo) {
    case "leads-reunioes-contratos":
      return (
        (getDadosEmpresa(slug, ano) as LinhaPadrao[]).find(
          (l) => l.mes === mes
        )?.faturamento ?? 0
      )
    case "aton":
      return (
        (getDadosEmpresa(slug, ano) as LinhaAton[]).find((l) => l.mes === mes)
          ?.faturamento ?? 0
      )
    case "hato":
      return (
        (getDadosEmpresa(slug, ano) as LinhaHato[]).find((l) => l.mes === mes)
          ?.receita ?? 0
      )
    case "diego":
      return (
        (getDadosEmpresa(slug, ano) as LinhaDiego[]).find((l) => l.mes === mes)
          ?.receita_hub ?? 0
      )
  }
}

export function getFaturamentoDezembro(
  slug: EmpresaSlug,
  ano: number = ANO_PROJETADO
): number {
  return getFaturamentoMes(slug, "Dezembro", ano)
}

export interface ResumoGrupo {
  faturamento: number
  investimento: number
  leads: number
  criativos: number
  criativosSemana: number
  reunioes: number
  contratos: number
}

export function getResumoGrupo(
  mes: Mes,
  ano: number = ANO_PROJETADO
): ResumoGrupo {
  let faturamento = 0
  let investimento = 0
  let leads = 0
  let criativos = 0
  let criativosSemana = 0
  let reunioes = 0
  let contratos = 0

  if (!anoTemProjecao(ano)) {
    return {
      faturamento,
      investimento,
      leads,
      criativos,
      criativosSemana,
      reunioes,
      contratos,
    }
  }

  for (const empresa of empresas) {
    faturamento += getFaturamentoMes(empresa.slug, mes, ano)

    if (empresa.tipo === "leads-reunioes-contratos") {
      const linha = (getDadosEmpresa(empresa.slug, ano) as LinhaPadrao[]).find(
        (l) => l.mes === mes
      )
      if (linha) {
        investimento += linha.verba
        leads += linha.leads
        reunioes += linha.reunioes
        contratos += linha.contratos
        criativos += linha.criativos
        criativosSemana += linha.criativos_semana
      }
    } else if (empresa.tipo === "aton") {
      const linha = (getDadosEmpresa(empresa.slug, ano) as LinhaAton[]).find(
        (l) => l.mes === mes
      )
      if (linha) {
        investimento += linha.verba
        leads += linha.leads
        reunioes += linha.orcamentos
        contratos += linha.vendas
        criativos += linha.criativos
        criativosSemana += linha.criativos_semana
      }
    } else if (empresa.tipo === "hato") {
      const linha = (getDadosEmpresa(empresa.slug, ano) as LinhaHato[]).find(
        (l) => l.mes === mes
      )
      if (linha) {
        investimento += linha.verba
        criativos += linha.criativos
        criativosSemana += linha.criativos_semana
        contratos += linha.total_vendas
      }
    }
  }

  return {
    faturamento,
    investimento,
    leads,
    criativos,
    criativosSemana,
    reunioes,
    contratos,
  }
}

export interface EtapaFunil {
  chave: string
  rotulo: string
  valor: number
  tipo: "moeda" | "numero"
  subtitulo?: string
}

export function getFunilCompleto(
  slug: EmpresaSlug,
  mes: Mes,
  ano: number = ANO_PROJETADO
): EtapaFunil[] {
  const empresa = getEmpresa(slug)
  if (!empresa || !anoTemProjecao(ano)) return []

  if (empresa.tipo === "leads-reunioes-contratos") {
    const linha = (getDadosEmpresa(slug, ano) as LinhaPadrao[]).find(
      (l) => l.mes === mes
    )
    if (!linha) return []
    return [
      { chave: "investimento", rotulo: "Investimento", valor: linha.verba, tipo: "moeda" },
      {
        chave: "criativos",
        rotulo: "Criativos",
        valor: linha.criativos,
        tipo: "numero",
        subtitulo: `${linha.criativos_semana} por semana`,
      },
      { chave: "leads", rotulo: "Leads", valor: linha.leads, tipo: "numero" },
      { chave: "reunioes", rotulo: "Reuniões", valor: linha.reunioes, tipo: "numero" },
      { chave: "contratos", rotulo: "Contratos", valor: linha.contratos, tipo: "numero" },
      { chave: "faturamento", rotulo: "Faturamento", valor: linha.faturamento, tipo: "moeda" },
    ]
  }

  if (empresa.tipo === "aton") {
    const linha = (getDadosEmpresa(slug, ano) as LinhaAton[]).find(
      (l) => l.mes === mes
    )
    if (!linha) return []
    return [
      { chave: "investimento", rotulo: "Investimento", valor: linha.verba, tipo: "moeda" },
      {
        chave: "criativos",
        rotulo: "Criativos",
        valor: linha.criativos,
        tipo: "numero",
        subtitulo: `${linha.criativos_semana} por semana`,
      },
      { chave: "leads", rotulo: "Leads", valor: linha.leads, tipo: "numero" },
      { chave: "reunioes", rotulo: "Orçamentos", valor: linha.orcamentos, tipo: "numero" },
      { chave: "contratos", rotulo: "Vendas", valor: linha.vendas, tipo: "numero" },
      { chave: "faturamento", rotulo: "Faturamento", valor: linha.faturamento, tipo: "moeda" },
    ]
  }

  if (empresa.tipo === "hato") {
    const linha = (getDadosEmpresa(slug, ano) as LinhaHato[]).find(
      (l) => l.mes === mes
    )
    if (!linha) return []
    return [
      { chave: "investimento", rotulo: "Investimento", valor: linha.verba, tipo: "moeda" },
      {
        chave: "criativos",
        rotulo: "Criativos",
        valor: linha.criativos,
        tipo: "numero",
        subtitulo: `${linha.criativos_semana} por semana`,
      },
      { chave: "leads", rotulo: "Influenciadores", valor: linha.influenciadores, tipo: "numero" },
      { chave: "reunioes", rotulo: "Vendas Influ.", valor: linha.vendas_influenciador, tipo: "numero" },
      { chave: "contratos", rotulo: "Total Vendas", valor: linha.total_vendas, tipo: "numero" },
      { chave: "faturamento", rotulo: "Receita", valor: linha.receita, tipo: "moeda" },
    ]
  }

  if (empresa.tipo === "diego") {
    const linha = (getDadosEmpresa(slug, ano) as LinhaDiego[]).find(
      (l) => l.mes === mes
    )
    if (!linha) return []
    return [
      { chave: "faturamento_diego", rotulo: "Faturamento Diego", valor: linha.faturamento_diego, tipo: "moeda" },
      { chave: "percentual", rotulo: "Percentual", valor: linha.percentual, tipo: "numero", subtitulo: "%" },
      { chave: "faturamento", rotulo: "Receita Hub", valor: linha.receita_hub, tipo: "moeda" },
    ]
  }

  return []
}

export const SUBTITULO_EMPRESA: Record<EmpresaSlug, string> = {
  "a2-marketing": "Agência de Marketing",
  "f2-sports": "Marketing Esportivo",
  "f2-moveis": "Mobiliário",
  "hato": "Direto + Influenciadores",
  "aton": "Estofados sob Medida",
  "diego-knebel": "Receita Hub",
}

const MES_NUM: Record<Mes, number> = {
  Janeiro: 1,
  Fevereiro: 2,
  "Março": 3,
  Abril: 4,
  Maio: 5,
  Junho: 6,
  Julho: 7,
  Agosto: 8,
  Setembro: 9,
  Outubro: 10,
  Novembro: 11,
  Dezembro: 12,
}

export function diasNoMes(mes: Mes, ano: number): number {
  return new Date(ano, MES_NUM[mes], 0).getDate()
}

export function metaAcumuladaAteHoje(
  metaMes: number,
  mes: Mes,
  ano: number,
  hoje: Date = new Date()
): number {
  const totalDias = diasNoMes(mes, ano)
  const diaria = metaMes / totalDias
  const mesNum = MES_NUM[mes]
  const hojeAno = hoje.getFullYear()
  const hojeMes = hoje.getMonth() + 1
  const hojeDia = hoje.getDate()

  if (ano < hojeAno || (ano === hojeAno && mesNum < hojeMes)) {
    return metaMes
  }
  if (ano === hojeAno && mesNum === hojeMes) {
    return Math.min(metaMes, diaria * hojeDia)
  }
  return 0
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

export function anoValido(a: string | undefined): Ano {
  if (!a) return ANO_PADRAO
  const n = parseInt(a, 10)
  if (!Number.isFinite(n)) return ANO_PADRAO
  return (ANOS_DISPONIVEIS as readonly number[]).includes(n)
    ? (n as Ano)
    : ANO_PADRAO
}

export function mesValido(m: string | undefined): Mes {
  if (m && (MESES as readonly string[]).includes(m)) return m as Mes
  return "Abril"
}
