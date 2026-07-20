"use server"

import { getUsuarioAtual, temPermissao } from "./auth"

// Helpers de coleta de tráfego acionados pelo botão "Atualizar dados".
//
// Chama a Sentinela (Supabase Edge Function que lê o Meta Ads via App
// próprio + token de System User) direto — SEM bridge MCP. O bridge MCP
// (rotina claude.ai) foi usado enquanto o App antigo do Meta estava
// deletado; foi desligado em 2026-07-20 depois de recriar o App +
// System User (ver memória meta-app-setup-gotchas / trafego-mcp-facebook-fallback).
//
// A chamada é SÍNCRONA: a edge function processa todas as empresas ativas
// em tokens_meta pra uma data e já devolve { status, totais } na resposta —
// não precisa de polling.

export interface TotaisSentinela {
  contas_processadas: number
  contas_falhas: number
  investimento_total: number
  leads_totais: number
}

export interface ResultadoSentinelaDia {
  ok: boolean
  totais?: TotaisSentinela
  erro?: string
  /** True quando SENTINELA_SECRET não está configurado no Vercel — a UI
   *  mostra uma mensagem explicando, sem tratar como erro de sistema. */
  semSecret?: boolean
}

/** "Hoje" e "ontem" em BRT (UTC-3, sem DST), formato YYYY-MM-DD — mesmo
 *  padrão usado em lib/data.ts (hojeBRL) e lib/sentinela.ts (proximaExecucao). */
function dataBRT(offsetDias = 0): string {
  const agora = new Date()
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60_000
  const brt = new Date(utc + -3 * 3600_000 + offsetDias * 86_400_000)
  const ano = brt.getFullYear()
  const mes = String(brt.getMonth() + 1).padStart(2, "0")
  const dia = String(brt.getDate()).padStart(2, "0")
  return `${ano}-${mes}-${dia}`
}

async function chamarSentinela(data: string): Promise<ResultadoSentinelaDia> {
  const secret = process.env.SENTINELA_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!secret || !baseUrl) {
    return {
      ok: false,
      semSecret: true,
      erro: "SENTINELA_SECRET (ou a URL do Supabase) não está configurado no Vercel.",
    }
  }

  const url = new URL(`${baseUrl}/functions/v1/sentinela`)
  url.searchParams.set("data", data)

  try {
    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "x-sentinela-secret": secret,
        ...(anonKey
          ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
          : {}),
      },
      cache: "no-store",
    })
    const texto = await resp.text()
    let json: { status?: string; totais?: TotaisSentinela; error?: string } = {}
    try {
      json = JSON.parse(texto)
    } catch {}

    if (!resp.ok) {
      console.error("[sentinela] HTTP", resp.status, texto.slice(0, 300))
      return {
        ok: false,
        erro: json.error ?? `Sentinela respondeu ${resp.status}.`,
      }
    }
    return { ok: true, totais: json.totais }
  } catch (e) {
    console.error("[sentinela] fetch error", e)
    return { ok: false, erro: "Falha ao contatar a Sentinela (rede/timeout)." }
  }
}

function somarTotais(
  a: TotaisSentinela | undefined,
  b: TotaisSentinela | undefined
): TotaisSentinela | undefined {
  if (!a) return b
  if (!b) return a
  return {
    contas_processadas: a.contas_processadas + b.contas_processadas,
    contas_falhas: a.contas_falhas + b.contas_falhas,
    investimento_total: a.investimento_total + b.investimento_total,
    leads_totais: a.leads_totais + b.leads_totais,
  }
}

/**
 * Dispara a Sentinela pra ontem + hoje (padrão do botão "Atualizar dados"
 * do dashboard de Tráfego) — reprocessa todas as empresas ativas em
 * tokens_meta pras duas datas.
 */
export async function dispararSentinelaDia(): Promise<ResultadoSentinelaDia> {
  const usuario = await getUsuarioAtual()
  if (!usuario || !temPermissao(usuario, "dashboard_trafego")) {
    return { ok: false, erro: "Sem permissão." }
  }

  const ontem = await chamarSentinela(dataBRT(-1))
  if (!ontem.ok) return ontem

  const hoje = await chamarSentinela(dataBRT(0))
  if (!hoje.ok) return hoje

  return {
    ok: true,
    totais: somarTotais(ontem.totais, hoje.totais),
  }
}
