"use server"

import { getUsuarioAtual, temPermissao } from "./auth"
import { getSupabase } from "./supabase"

// Helpers de coleta de tráfego acionados pelo botão "Atualizar dados".
// A Sentinela legada (edge function que lia o app do Meta) foi descontinuada:
// o App foi apagado e a coleta passou a ser 100% via ponte MCP — rotina
// agendada no claude.ai que grava em dados_diarios_log (coleta_status='mcp').
// Aqui ficam só o disparo da rotina MCP + o polling do banco que o botão usa
// pra detectar a chegada do dado novo.

// ============================================================================
// PONTE MCP — disparo da rotina claude.ai (Sentinela MCP)
// ============================================================================
// O app do Meta foi apagado; a coleta agora vem de uma rotina agendada no
// claude.ai que puxa via conector MCP do Facebook. O botão "Atualizar dados"
// também pode disparar essa rotina sob demanda — basta que o usuário gere um
// token de API na página da rotina (claude.ai/code/routines → Editar →
// Add trigger → API → Generate token) e cole no Vercel como ROUTINE_FIRE_TOKEN.
//
// API:
//   POST https://api.anthropic.com/v1/claude_code/routines/{id}/fire
//   Authorization: Bearer <ROUTINE_FIRE_TOKEN>
//   anthropic-beta: experimental-cc-routine-2026-04-01
// A rotina é experimental; pode mudar request/response.

const MCP_ROUTINE_ID = "trig_01M6HhPedJDKwr684uEwYBfz"

export interface ResultadoDisparoMCP {
  ok: boolean
  sessionId?: string
  sessionUrl?: string
  /** Em modo configurado, o tempo médio observado de execução pra UI poder
   *  estimar o progresso na barra (≈ 60s em coleta de 12 contas). */
  duracaoEstimadaSegundos: number
  erro?: string
  /** True quando o usuário ainda não configurou o token no Vercel — a UI
   *  mostra uma mensagem explicando, sem tratar como erro de sistema. */
  semToken?: boolean
}

export async function dispararRotinaMCP(): Promise<ResultadoDisparoMCP> {
  const usuario = await getUsuarioAtual()
  if (!usuario || !temPermissao(usuario, "dashboard_trafego")) {
    return {
      ok: false,
      duracaoEstimadaSegundos: 60,
      erro: "Sem permissão.",
    }
  }

  const token = process.env.ROUTINE_FIRE_TOKEN
  const routineId = process.env.ROUTINE_FIRE_ID || MCP_ROUTINE_ID

  if (!token) {
    return {
      ok: false,
      duracaoEstimadaSegundos: 60,
      semToken: true,
      erro: "MCP precisa do token. Configure ROUTINE_FIRE_TOKEN no Vercel.",
    }
  }

  try {
    const resp = await fetch(
      `https://api.anthropic.com/v1/claude_code/routines/${routineId}/fire`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "experimental-cc-routine-2026-04-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: "Disparo manual via botão do dashboard de Tráfego.",
        }),
        cache: "no-store",
      }
    )
    const texto = await resp.text()
    if (!resp.ok) {
      console.error("[mcp-fire] HTTP", resp.status, texto.slice(0, 300))
      return {
        ok: false,
        duracaoEstimadaSegundos: 60,
        erro: `API claude.ai respondeu ${resp.status}.`,
      }
    }
    let json: { claude_code_session_id?: string; claude_code_session_url?: string } = {}
    try {
      json = JSON.parse(texto)
    } catch {}
    return {
      ok: true,
      duracaoEstimadaSegundos: 60,
      sessionId: json.claude_code_session_id,
      sessionUrl: json.claude_code_session_url,
    }
  } catch (e) {
    console.error("[mcp-fire] fetch error", e)
    return {
      ok: false,
      duracaoEstimadaSegundos: 60,
      erro: "Falha ao contatar a API claude.ai (rede/timeout).",
    }
  }
}

/**
 * Devolve o timestamp da linha MCP mais recente em `dados_diarios_log`.
 * O botão tira um snapshot ANTES de disparar e, depois, faz polling até
 * ver um valor MAIOR — aí sabe que a rotina terminou e os dados chegaram.
 * (Polling em vez de webhook: a rotina não nos avisa do término direto.)
 */
export async function ultimaAtualizacaoMCP(): Promise<{
  ok: boolean
  iso: string | null
}> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, iso: null }
  const { data, error } = await supabase
    .from("dados_diarios_log")
    .select("created_at")
    .eq("coleta_status", "mcp")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error("[mcp-poll] erro", error.message)
    return { ok: false, iso: null }
  }
  return { ok: true, iso: (data?.created_at as string | undefined) ?? null }
}
