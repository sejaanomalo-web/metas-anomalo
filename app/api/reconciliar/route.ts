import { NextResponse } from "next/server"
import { getUsuarioAtual } from "@/lib/auth"
import { getSupabaseAdmin } from "@/lib/supabase"
import { mesValido } from "@/lib/data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface TokenFantasma {
  empresa: string
  ad_account_id: string
  campaign_filter: string | null
  empresa_config_nome: string | null
  empresa_config_ativa: boolean | null
}

interface EmpresaSemTracking {
  nome: string
  slug: string
  db: string
}

interface DadosReaisSlug {
  empresa: string
  mes: string
  ano: number
  investimento_real: number | null
  faturamento_real: number | null
  updated_at: string
}

interface Divergencia {
  empresa: string
  campo: "investimento" | "faturamento"
  total_dados_reais: number
  total_dados_diarios_log: number
  diferenca: number
}

interface ReconciliarResponse {
  mes_atual: string
  ano_atual: number
  tokens_fantasmas: TokenFantasma[]
  empresas_sem_tracking: EmpresaSemTracking[]
  dados_reais_slug: DadosReaisSlug[]
  divergencias: Divergencia[]
}

const MES_NUM_PARA_NOME: Record<number, string> = {
  1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
  5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
  9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
}

function mesAtualBR(): { mes: string; ano: number } {
  const agora = new Date()
  // Aproxima fuso BRT (-3) — suficiente pra resolver dia de virada.
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60000
  const brt = new Date(utc - 3 * 3600000)
  return {
    mes: MES_NUM_PARA_NOME[brt.getMonth() + 1],
    ano: brt.getFullYear(),
  }
}

/**
 * Guardião /api/reconciliar — admin-only. Retorna 4 listas que sinalizam
 * inconsistências entre as fontes de dados do dashboard:
 *
 *   1. tokens_meta ativos sem empresa_config ativa (fantasmas — Sentinela
 *      coleta mas dashboard não exibe → vira gasto órfão)
 *   2. empresas_config ativas sem token Meta ativo (sem tracking)
 *   3. dados_reais com chave em formato snake_case (legado de parseNumero
 *      quebrado — Sentinela grava nome canônico, não slug)
 *   4. divergência mês corrente entre soma de dados_reais e dados_diarios_log
 *      (sinal de write-divergence)
 *
 * Tudo é leitura. Resposta acionável: o admin abre o JSON, confere e
 * decide se reativa empresa, desativa token, ou apaga linha residual.
 */
export async function GET() {
  const usuario = await getUsuarioAtual()
  if (!usuario) {
    return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 })
  }
  if (usuario.papel !== "admin") {
    return NextResponse.json({ erro: "apenas_admin" }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json(
      { erro: "supabase_indisponivel" },
      { status: 500 }
    )
  }

  const { mes, ano } = mesAtualBR()

  // === 1. Tokens fantasmas ===
  const { data: tokens } = await supabase
    .from("tokens_meta")
    .select("empresa, ad_account_id, ativo, campaign_filter")
    .eq("ativo", true)

  const { data: configsAtivas } = await supabase
    .from("empresas_config")
    .select("nome, slug, db, ativa")

  const configByNome = new Map<
    string,
    { nome: string; slug: string; db: string; ativa: boolean }
  >()
  for (const c of (configsAtivas ?? []) as {
    nome: string
    slug: string
    db: string
    ativa: boolean
  }[]) {
    configByNome.set(c.nome, c)
  }

  const tokensFantasmas: TokenFantasma[] = []
  for (const t of (tokens ?? []) as {
    empresa: string
    ad_account_id: string
    campaign_filter: string | null
  }[]) {
    const cfg = configByNome.get(t.empresa)
    if (!cfg || !cfg.ativa) {
      tokensFantasmas.push({
        empresa: t.empresa,
        ad_account_id: t.ad_account_id,
        campaign_filter: t.campaign_filter,
        empresa_config_nome: cfg?.nome ?? null,
        empresa_config_ativa: cfg?.ativa ?? null,
      })
    }
  }

  // === 2. Empresas sem tracking ===
  const empresasComToken = new Set(
    ((tokens ?? []) as { empresa: string }[]).map((t) => t.empresa)
  )
  const empresasSemTracking: EmpresaSemTracking[] = []
  for (const c of (configsAtivas ?? []) as {
    nome: string
    slug: string
    db: string
    ativa: boolean
  }[]) {
    if (!c.ativa) continue
    if (!empresasComToken.has(c.nome)) {
      empresasSemTracking.push({ nome: c.nome, slug: c.slug, db: c.db })
    }
  }

  // === 3. dados_reais com chave em slug (snake_case) ===
  const { data: slugRows } = await supabase
    .from("dados_reais")
    .select("empresa, mes, ano, investimento_real, faturamento_real, updated_at")
    // ~ é regex no PostgREST: snake_case com letras minúsculas, dígitos, underscore.
    .filter("empresa", "match", "^[a-z0-9_]+$")
  const dadosReaisSlug: DadosReaisSlug[] = (slugRows ?? []) as DadosReaisSlug[]

  // === 4. Divergência mês corrente ===
  const divergencias: Divergencia[] = []
  if (mesValido(mes)) {
    const { data: drRows } = await supabase
      .from("dados_reais")
      .select("empresa, investimento_real, faturamento_real")
      .eq("mes", mes)
      .eq("ano", ano)
      .eq("origem", "pago")

    // dados_diarios_log: agregar por empresa no mês corrente.
    const inicioISO = `${ano}-${String(
      Object.entries(MES_NUM_PARA_NOME).find(([, v]) => v === mes)?.[0] ?? "01"
    ).padStart(2, "0")}-01`
    const mesNum = Number(
      Object.entries(MES_NUM_PARA_NOME).find(([, v]) => v === mes)?.[0] ?? 1
    )
    const fimDate = new Date(ano, mesNum, 0)
    const fimISO = `${ano}-${String(mesNum).padStart(2, "0")}-${String(
      fimDate.getDate()
    ).padStart(2, "0")}`
    const { data: ddlRows } = await supabase
      .from("dados_diarios_log")
      .select("empresa, investimento_real, faturamento_real")
      .eq("origem", "pago")
      .gte("data", inicioISO)
      .lte("data", fimISO)

    const drPorEmpresa = new Map<string, { inv: number; fat: number }>()
    for (const r of (drRows ?? []) as {
      empresa: string
      investimento_real: number | null
      faturamento_real: number | null
    }[]) {
      const acc = drPorEmpresa.get(r.empresa) ?? { inv: 0, fat: 0 }
      acc.inv += Number(r.investimento_real ?? 0)
      acc.fat += Number(r.faturamento_real ?? 0)
      drPorEmpresa.set(r.empresa, acc)
    }

    const ddlPorEmpresa = new Map<string, { inv: number; fat: number }>()
    for (const r of (ddlRows ?? []) as {
      empresa: string
      investimento_real: number | null
      faturamento_real: number | null
    }[]) {
      const acc = ddlPorEmpresa.get(r.empresa) ?? { inv: 0, fat: 0 }
      acc.inv += Number(r.investimento_real ?? 0)
      acc.fat += Number(r.faturamento_real ?? 0)
      ddlPorEmpresa.set(r.empresa, acc)
    }

    // União de chaves dos dois universos (dr usa slug ou nome; ddl usa nome).
    const todasEmpresas = new Set<string>([
      ...Array.from(drPorEmpresa.keys()),
      ...Array.from(ddlPorEmpresa.keys()),
    ])
    const EPS = 0.01
    for (const empresa of todasEmpresas) {
      const dr = drPorEmpresa.get(empresa) ?? { inv: 0, fat: 0 }
      const ddl = ddlPorEmpresa.get(empresa) ?? { inv: 0, fat: 0 }
      if (Math.abs(dr.inv - ddl.inv) > EPS) {
        divergencias.push({
          empresa,
          campo: "investimento",
          total_dados_reais: dr.inv,
          total_dados_diarios_log: ddl.inv,
          diferenca: dr.inv - ddl.inv,
        })
      }
      if (Math.abs(dr.fat - ddl.fat) > EPS) {
        divergencias.push({
          empresa,
          campo: "faturamento",
          total_dados_reais: dr.fat,
          total_dados_diarios_log: ddl.fat,
          diferenca: dr.fat - ddl.fat,
        })
      }
    }
  }

  const resp: ReconciliarResponse = {
    mes_atual: mes,
    ano_atual: ano,
    tokens_fantasmas: tokensFantasmas,
    empresas_sem_tracking: empresasSemTracking,
    dados_reais_slug: dadosReaisSlug,
    divergencias,
  }
  return NextResponse.json(resp)
}
