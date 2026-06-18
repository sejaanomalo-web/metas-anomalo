import type { Periodo } from "./periodo"

/**
 * Helpers para PRESERVAR o período global (?modo=&de=&ate= / ?mes=&ano=)
 * ao construir links de navegação. Antes, navs e abas reconstruíam só
 * `?mes=X&ano=Y` a partir do mês representativo — o que silenciosamente
 * derrubava os modos "Dia" e "Intervalo" ao trocar de aba. Estes dois
 * helpers centralizam a regra para que o período sobreviva a QUALQUER
 * navegação do sistema.
 *
 * São client-safe: importam só o TIPO Periodo (apagado em build), então
 * podem ser usados tanto em Server Components quanto em "use client".
 */

/** Mesma validação de isoValido em parsePeriodo (YYYY-MM-DD). */
const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Query string canônica (sem '?') de um Periodo já parseado.
 * Modo "mes" → `mes=&ano=` (URLs limpas, comportamento legado).
 * Modo "dia"/"intervalo" → `modo=&de=&ate=`.
 *
 * Use em Server Components que já têm `periodo = parsePeriodo(searchParams)`.
 */
export function periodoQS(periodo: Periodo): string {
  const p = new URLSearchParams()
  if (periodo.modo === "mes") {
    p.set("mes", periodo.mes)
    p.set("ano", String(periodo.ano))
  } else {
    p.set("modo", periodo.modo)
    p.set("de", periodo.de)
    if (periodo.modo === "intervalo") p.set("ate", periodo.ate)
  }
  return p.toString()
}

/** Igual a periodoQS, mas devolvendo `?...` (vazio se não houver período). */
export function periodoHrefSuffix(periodo: Periodo): string {
  const qs = periodoQS(periodo)
  return qs ? `?${qs}` : ""
}

/**
 * Extrai SÓ os params de período do URL atual (client) e devolve como
 * query string (sem '?'). Espelha a lógica do parsePeriodo: em modo
 * dia/intervalo carrega modo/de/ate; senão carrega mes/ano (com fallback
 * para os valores correntes da página). Usado pelos navs "use client"
 * (FinanceiroNav, TabsMetas, TabsTrafego) via useSearchParams().
 */
export function periodoQSFromParams(
  sp: { get(k: string): string | null } | null | undefined,
  fallback?: { mes?: string; ano?: number | string }
): string {
  const modo = sp?.get("modo")
  const de = sp?.get("de")
  const ate = sp?.get("ate")
  const deOk = !!de && ISO_DATA.test(de)
  const ateOk = !!ate && ISO_DATA.test(ate)
  const p = new URLSearchParams()

  // Espelha parsePeriodo: 'dia' exige `de` válido; 'intervalo' exige `de` E
  // `ate` válidos. Datas ausentes/malformadas caem no ramo mes/ano — assim o
  // link nunca diverge do período que a página de destino realmente renderiza.
  if (modo === "dia" && deOk) {
    p.set("modo", "dia")
    p.set("de", de as string)
    return p.toString()
  }
  if (modo === "intervalo" && deOk && ateOk) {
    p.set("modo", "intervalo")
    p.set("de", de as string)
    p.set("ate", ate as string)
    return p.toString()
  }

  const mes = sp?.get("mes") ?? (fallback?.mes ? String(fallback.mes) : null)
  const ano =
    sp?.get("ano") ?? (fallback?.ano != null ? String(fallback.ano) : null)
  if (mes) p.set("mes", mes)
  if (ano) p.set("ano", ano)
  return p.toString()
}
