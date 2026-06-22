"use server"

import { getUsuarioAtual, temPermissao } from "./auth"

/**
 * Dispara uma execução do agente Sentinela (edge function do Supabase)
 * sob demanda, a partir do botão "Atualizar dados" do dashboard de
 * Tráfego. UMA chamada processa TODAS as empresas ativas em tokens_meta
 * para a data informada — re-puxa do Meta (fonte da verdade) e regrava
 * dados_diarios_log + logs_sentinela.
 *
 * O botão chama esta action uma vez por dia (hoje, ontem) para mostrar
 * progresso real por etapa e não estourar o timeout do serverless: cada
 * dia é uma invocação independente.
 *
 * Auth: a edge function valida o header `x-sentinela-secret` (o MESMO
 * secret do cron). O gateway do Supabase Functions costuma exigir o
 * apikey/Authorization — mandamos a anon key também. Defina no ambiente:
 *   • SENTINELA_SECRET   (obrigatório — mesmo do cron)
 *   • SENTINELA_URL      (opcional — sobrescreve a URL da função)
 */
export interface ResultadoSentinelaDia {
  ok: boolean
  data: string
  status?: string
  /** Fonte real dos dados nesta atualização: 'sentinela' (app do Meta) ou
   *  'mcp' (coleta na nuvem, quando a Sentinela não processou nada). */
  fonte?: "sentinela" | "mcp"
  contasProcessadas?: number
  contasFalhas?: number
  investimentoTotal?: number
  leadsTotais?: number
  erro?: string
}

function urlSentinela(): string | null {
  const override = process.env.SENTINELA_URL
  if (override && override.trim()) return override.trim()
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base.replace(/\/$/, "")}/functions/v1/sentinela`
}

export async function dispararSentinelaDia(
  dataISO: string
): Promise<ResultadoSentinelaDia> {
  // Gate: só quem enxerga o dashboard de tráfego pode disparar (admin
  // tem bypass via temPermissao). Sem redirect — action devolve erro.
  const usuario = await getUsuarioAtual()
  if (!usuario || !temPermissao(usuario, "dashboard_trafego")) {
    return { ok: false, data: dataISO, erro: "Sem permissão." }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    return { ok: false, data: dataISO, erro: "Data inválida." }
  }

  const url = urlSentinela()
  const secret = process.env.SENTINELA_SECRET
  if (!url) {
    return {
      ok: false,
      data: dataISO,
      erro: "URL do Sentinela ausente (defina SENTINELA_URL ou NEXT_PUBLIC_SUPABASE_URL).",
    }
  }
  if (!secret) {
    return {
      ok: false,
      data: dataISO,
      erro: "SENTINELA_SECRET não configurado no ambiente do app.",
    }
  }

  const headers: Record<string, string> = {
    "x-sentinela-secret": secret,
  }
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (anon) {
    headers["Authorization"] = `Bearer ${anon}`
    headers["apikey"] = anon
  }

  try {
    const resp = await fetch(`${url}?data=${dataISO}`, {
      method: "GET",
      headers,
      cache: "no-store",
    })
    const texto = await resp.text()
    if (!resp.ok) {
      console.error("[sentinela-trigger] HTTP", resp.status, texto.slice(0, 300))
      return {
        ok: false,
        data: dataISO,
        erro: `Sentinela respondeu ${resp.status}.`,
      }
    }
    let json: {
      status?: string
      totais?: {
        contas_processadas?: number
        contas_falhas?: number
        investimento_total?: number
        leads_totais?: number
      }
    } = {}
    try {
      json = JSON.parse(texto)
    } catch {
      // Resposta não-JSON mas 200 — considera ok sem detalhes.
      return { ok: true, data: dataISO }
    }
    const processadas = json.totais?.contas_processadas ?? 0
    const contasFalhas = json.totais?.contas_falhas ?? 0
    // Quando a Sentinela não processa nada (ex.: app do Meta fora), os dados
    // exibidos vêm da ponte MCP (rotina na nuvem) — NÃO é erro. Sinalizamos a
    // fonte pra UI mostrar "Atualizado · MCP" em vez de "· Sentinela".
    const fonte: "sentinela" | "mcp" =
      json.status === "falha" || (processadas === 0 && contasFalhas > 0)
        ? "mcp"
        : "sentinela"
    return {
      ok: true,
      data: dataISO,
      fonte,
      status: json.status,
      contasProcessadas: json.totais?.contas_processadas,
      contasFalhas: json.totais?.contas_falhas,
      investimentoTotal: json.totais?.investimento_total,
      leadsTotais: json.totais?.leads_totais,
    }
  } catch (e) {
    console.error("[sentinela-trigger] fetch error", e)
    return {
      ok: false,
      data: dataISO,
      erro: "Falha ao contatar o Sentinela (rede/timeout).",
    }
  }
}
