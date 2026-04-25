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

export const ANOS_DISPONIVEIS = [2026, 2027, 2028, 2029, 2030] as const
export type Ano = (typeof ANOS_DISPONIVEIS)[number]
export const ANO_PADRAO: Ano = 2026
// Ano que possui dados projetados hardcoded em lib/data.ts
export const ANO_PROJETADO: Ano = 2026

export function anoTemProjecao(ano: number): boolean {
  return ano === ANO_PROJETADO
}

export function anoValido(a: string | undefined | null): Ano {
  if (!a) return ANO_PADRAO
  const n = parseInt(a, 10)
  if (!Number.isFinite(n)) return ANO_PADRAO
  return (ANOS_DISPONIVEIS as readonly number[]).includes(n)
    ? (n as Ano)
    : ANO_PADRAO
}

export function mesValido(m: string | undefined | null): Mes {
  if (m && (MESES as readonly string[]).includes(m)) return m as Mes
  return "Abril"
}

export const ORIGENS_DADOS = ["pago", "organico"] as const
export type OrigemDadosReais = (typeof ORIGENS_DADOS)[number]
export const ORIGEM_PADRAO: OrigemDadosReais = "pago"

export function origemValida(o: string | undefined | null): OrigemDadosReais {
  if (o === "organico") return "organico"
  return ORIGEM_PADRAO
}

// EmpresaSlug e EmpresaDb são identificadores livres (text) desde que empresas
// podem ser adicionadas dinamicamente via UI. TipoFunil continua union literal
// porque é validado em check constraint no Supabase.
export type EmpresaSlug = string
export type EmpresaDb = string

export type TipoFunil = "leads-reunioes-contratos" | "hato" | "aton" | "diego"

// Lista original de slugs/dbs hardcoded — usada como fallback quando o Supabase
// está indisponível.
export const SLUGS_ORIGINAIS = [
  "a2-marketing",
  "f2-sports",
  "f2-moveis",
  "hato",
  "aton",
  "diego-knebel",
] as const

export interface EmpresaMeta {
  id?: string
  slug: EmpresaSlug
  db: EmpresaDb
  nome: string
  tipo: TipoFunil
  subtitulo?: string
  ativa?: boolean
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

// Metas projetadas zeradas — preencha pela UI (DrawerEditarMeta) ou via
// metas_empresa no Supabase. Os arrays seguem exportados com a estrutura
// completa pra que páginas, gráficos e tabelas continuem renderizando.
function linhaPadraoZerada(mes: Mes): LinhaPadrao {
  return {
    mes,
    verba: 0,
    criativos: 0,
    criativos_semana: 0,
    leads: 0,
    reunioes: 0,
    contratos: 0,
    churn: 0,
    clientes: 0,
    ticket: 0,
    faturamento: 0,
  }
}

function linhaHatoZerada(mes: Mes): LinhaHato {
  return {
    mes,
    verba: 0,
    criativos: 0,
    criativos_semana: 0,
    influenciadores: 0,
    vendas_influenciador: 0,
    vendas_direto: 0,
    total_vendas: 0,
    receita: 0,
    custo_influenciadores: 0,
  }
}

function linhaAtonZerada(mes: Mes): LinhaAton {
  return {
    mes,
    verba: 0,
    criativos: 0,
    criativos_semana: 0,
    leads: 0,
    orcamentos: 0,
    vendas: 0,
    ticket: 0,
    faturamento: 0,
  }
}

function linhaDiegoZerada(mes: Mes): LinhaDiego {
  return {
    mes,
    faturamento_diego: 0,
    percentual: 0,
    receita_hub: 0,
  }
}

export const a2Marketing: LinhaPadrao[] = MESES.map(linhaPadraoZerada)
export const f2Sports: LinhaPadrao[] = MESES.map(linhaPadraoZerada)
export const f2Moveis: LinhaPadrao[] = MESES.map(linhaPadraoZerada)
export const hato: LinhaHato[] = MESES.map(linhaHatoZerada)
export const aton: LinhaAton[] = MESES.map(linhaAtonZerada)
export const diego: LinhaDiego[] = MESES.map(linhaDiegoZerada)

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

export function getEmpresa(slug: string): EmpresaMeta | undefined {
  return empresas.find((e) => e.slug === slug)
}

export function getEmpresaPorDb(db: string): EmpresaMeta | undefined {
  return empresas.find((e) => e.db === db)
}

export function getDadosEmpresa(
  slug: EmpresaSlug,
  ano: number = ANO_PROJETADO
): LinhaPadrao[] | LinhaAton[] | LinhaHato[] | LinhaDiego[] {
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
    default:
      // Empresas adicionadas via UI não têm projeções hardcoded — retorna vazio.
      // Valores de meta vêm exclusivamente da tabela metas_empresa (overrides).
      return []
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

/**
 * Versão de getVerbaMes que aceita overrides vindos de metas_empresa.
 * Se houver override para `verba`, ele vence sobre o valor projetado.
 * Funciona para empresas sem hardcoded (slug dinâmico) — nesse caso o base é 0.
 */
export function getVerbaMesComOverride(
  empresa: EmpresaMeta,
  mes: Mes,
  ano: number = ANO_PROJETADO,
  override?: Record<string, number>
): number {
  if (empresa.tipo === "diego") return 0
  const base = getVerbaMes(empresa.slug, mes, ano)
  const ov = override?.verba
  return typeof ov === "number" ? ov : base
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

/**
 * Versão de getFaturamentoMes que aceita overrides vindos de metas_empresa.
 * Cada tipo de funil lê de um campo diferente no override:
 *   - leads-reunioes-contratos / aton → `faturamento`
 *   - hato → `receita`
 *   - diego → `receita_hub`
 * Se houver override para o campo correspondente, ele vence sobre o projetado.
 */
export function getFaturamentoMesComOverride(
  empresa: EmpresaMeta,
  mes: Mes,
  ano: number = ANO_PROJETADO,
  override?: Record<string, number>
): number {
  const base = getFaturamentoMes(empresa.slug, mes, ano)
  if (!override) return base
  if (empresa.tipo === "hato") {
    return typeof override.receita === "number" ? override.receita : base
  }
  if (empresa.tipo === "diego") {
    return typeof override.receita_hub === "number" ? override.receita_hub : base
  }
  return typeof override.faturamento === "number" ? override.faturamento : base
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

/**
 * Resume as metas agregadas do grupo para um mes/ano.
 *
 * Aceita opcionalmente uma lista dinâmica de empresas (vinda de
 * empresas_config no Supabase) e um mapa de overrides por empresa
 * (vindo de metas_empresa). Quando houver override para um campo,
 * ele substitui o valor projetado — isto garante que metas editadas
 * no drawer de cada empresa sejam refletidas no card de "Visão geral
 * do Hub" e nos resumos enviados por automações.
 */
export function getResumoGrupo(
  mes: Mes,
  ano: number = ANO_PROJETADO,
  empresasList: EmpresaMeta[] = empresas,
  overridesPorEmpresa: Map<EmpresaDb, Record<string, number>> = new Map()
): ResumoGrupo {
  let faturamento = 0
  let investimento = 0
  let leads = 0
  let criativos = 0
  let criativosSemana = 0
  let reunioes = 0
  let contratos = 0

  const temProj = anoTemProjecao(ano)

  for (const empresa of empresasList) {
    const ov = overridesPorEmpresa.get(empresa.db)
    // Em anos sem projeção respeitamos apenas overrides — sem base hardcoded.
    const temOv = ov !== undefined
    if (!temProj && !temOv) continue

    if (empresa.tipo === "leads-reunioes-contratos") {
      const base = temProj
        ? (getDadosEmpresa(empresa.slug, ano) as LinhaPadrao[]).find(
            (l) => l.mes === mes
          )
        : undefined
      faturamento += ov?.faturamento ?? base?.faturamento ?? 0
      investimento += ov?.verba ?? base?.verba ?? 0
      leads += ov?.leads ?? base?.leads ?? 0
      reunioes += ov?.reunioes ?? base?.reunioes ?? 0
      contratos += ov?.contratos ?? base?.contratos ?? 0
      criativos += ov?.criativos ?? base?.criativos ?? 0
      criativosSemana += ov?.criativos_semana ?? base?.criativos_semana ?? 0
    } else if (empresa.tipo === "aton") {
      const base = temProj
        ? (getDadosEmpresa(empresa.slug, ano) as LinhaAton[]).find(
            (l) => l.mes === mes
          )
        : undefined
      faturamento += ov?.faturamento ?? base?.faturamento ?? 0
      investimento += ov?.verba ?? base?.verba ?? 0
      leads += ov?.leads ?? base?.leads ?? 0
      reunioes += ov?.orcamentos ?? base?.orcamentos ?? 0
      contratos += ov?.vendas ?? base?.vendas ?? 0
      criativos += ov?.criativos ?? base?.criativos ?? 0
      criativosSemana += ov?.criativos_semana ?? base?.criativos_semana ?? 0
    } else if (empresa.tipo === "hato") {
      const base = temProj
        ? (getDadosEmpresa(empresa.slug, ano) as LinhaHato[]).find(
            (l) => l.mes === mes
          )
        : undefined
      faturamento += ov?.receita ?? base?.receita ?? 0
      investimento += ov?.verba ?? base?.verba ?? 0
      criativos += ov?.criativos ?? base?.criativos ?? 0
      criativosSemana += ov?.criativos_semana ?? base?.criativos_semana ?? 0
      contratos += ov?.total_vendas ?? base?.total_vendas ?? 0
    } else if (empresa.tipo === "diego") {
      const base = temProj
        ? (getDadosEmpresa(empresa.slug, ano) as LinhaDiego[]).find(
            (l) => l.mes === mes
          )
        : undefined
      faturamento += ov?.receita_hub ?? base?.receita_hub ?? 0
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

// Fallback de subtítulos para as 6 empresas originais. Novas empresas
// adicionadas via UI trazem o subtítulo direto do Supabase em empresa.subtitulo.
export const SUBTITULO_EMPRESA: Record<string, string> = {
  "a2-marketing": "Agência de Marketing",
  "f2-sports": "Marketing Esportivo",
  "f2-moveis": "Mobiliário",
  "hato": "Direto + Influenciadores",
  "aton": "Estofados sob Medida",
  "diego-knebel": "Receita Hub",
}

export function subtituloDaEmpresa(empresa: EmpresaMeta): string {
  return empresa.subtitulo ?? SUBTITULO_EMPRESA[empresa.slug] ?? ""
}

const MES_NUM: Record<Mes, number> = {
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

export function diasNoMes(mes: Mes, ano: number = ANO_PADRAO): number {
  return new Date(ano, MES_NUM[mes], 0).getDate()
}

export function metaAcumuladaAteHoje(
  metaMes: number,
  mes: Mes,
  ano: number = ANO_PADRAO,
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

export function corStatusMeta(
  real: number,
  metaTotal: number,
  temReal: boolean,
  mes: Mes,
  ano: number = ANO_PADRAO
): string {
  if (!temReal) return "rgba(255,255,255,0.2)"
  if (metaTotal === 0) return "#ffffff"
  if (real >= metaTotal) return "#4caf50"
  const acumulada = metaAcumuladaAteHoje(metaTotal, mes, ano)
  if (real >= acumulada) return "#C9953A"
  return "#e24b4a"
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
