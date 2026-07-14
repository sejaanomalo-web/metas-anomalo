// =============================================================================
// Proteção anti-bloqueio do WhatsApp — trava de segurança no ENVIO.
// =============================================================================
// Motivação (incidente real): disparar muitas mensagens quase idênticas
// ("Bom dia, tudo bem?") pra dezenas de leads frios em poucos minutos, de um
// número recém-religado, fez o WhatsApp bloquear o número por 5h. O envio via
// Evolution é WhatsApp NÃO-oficial (Baileys) — o WhatsApp pune padrão de spam
// rápido, e o número é o ativo mais caro de perder.
//
// Esta checagem roda ANTES de chamar a Evolution e é PER-INSTÂNCIA (por
// número): com vários usuários e vários WhatsApp conectados, cada número é
// limitado de forma independente. Toda a análise sai de crm_mensagens (que já
// registra cada envio) — sem tabela/infra nova, só um índice pra ficar rápido.
//
// Fail-open: se a leitura do histórico falhar, NÃO bloqueia (melhor deixar
// passar um envio do que travar o CRM) — o risco de ban vem do PADRÃO de uso,
// não de um envio isolado que escapou.

import type { SupabaseClient } from "@supabase/supabase-js"

export interface ResultadoLimite {
  ok: boolean
  /** motivo pro usuário, quando bloqueado. */
  erro?: string
}

// Limites conservadores por número. Pensados pra um time de vendas humano
// (uma pessoa conversando), não pra disparo em massa — que é justamente o que
// causa bloqueio. Ajustável aqui num ponto só; no futuro dá pra virar config
// por instância no banco.
export const LIMITES_ENVIO = {
  /** intervalo mínimo entre dois envios consecutivos do mesmo número. */
  intervaloMinSegundos: 3,
  /** teto de mensagens por minuto por número. */
  porMinuto: 10,
  /** teto de mensagens por hora por número (regime normal). */
  porHora: 150,
  /** número conectado há menos disso está em "aquecimento" (mais vulnerável a
   *  ban) e usa um teto/hora reduzido. */
  warmupHoras: 72,
  porHoraWarmup: 40,
  /** detecção da MESMA mensagem pra muitos contatos distintos — o gatilho nº1
   *  de bloqueio. Janela de análise + máximo de contatos distintos. */
  repetidaJanelaMinutos: 15,
  repetidaMaxContatos: 6,
} as const

interface LinhaRecente {
  lead_id: string
  conteudo: string | null
  wa_timestamp: string | null
}

function normalizarTexto(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ")
}

function msDe(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0
}

/**
 * Decide se ESTE envio pode sair agora, sem arriscar um bloqueio do WhatsApp.
 * Roda 4 checagens (da mais barata pra mais específica) sobre os envios
 * recentes DESTE número:
 *   1. intervalo mínimo desde o último envio;
 *   2. teto por minuto;
 *   3. teto por hora (menor durante o aquecimento do número);
 *   4. mesma mensagem repetida pra muitos contatos distintos (o maior risco).
 * Uma única leitura de crm_mensagens (janela de 1h) alimenta todas.
 *
 * `texto` null (ex: áudio) pula só a checagem 4; os tetos de volume valem
 * pra qualquer tipo.
 */
export async function verificarLimiteEnvio(
  db: SupabaseClient,
  params: {
    instanciaId: string
    leadId: string
    texto: string | null
    conectadoEm: string | null
  }
): Promise<ResultadoLimite> {
  const agora = Date.now()
  const umaHoraAtras = new Date(agora - 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from("crm_mensagens")
    .select("lead_id, conteudo, wa_timestamp")
    .eq("instancia_id", params.instanciaId)
    .eq("direcao", "out")
    .gte("wa_timestamp", umaHoraAtras)
    .order("wa_timestamp", { ascending: false })
    .limit(500)

  if (error) {
    console.error("[anti-ban] falha ao ler histórico (fail-open)", error.message)
    return { ok: true }
  }

  const recentes = (data ?? []) as LinhaRecente[]

  // 1) Intervalo mínimo desde o último envio.
  const ultimo = recentes[0]
  if (ultimo) {
    const desdeSeg = (agora - msDe(ultimo.wa_timestamp)) / 1000
    if (desdeSeg < LIMITES_ENVIO.intervaloMinSegundos) {
      const faltam = Math.max(1, Math.ceil(LIMITES_ENVIO.intervaloMinSegundos - desdeSeg))
      return {
        ok: false,
        erro: `Muito rápido — espere ${faltam}s antes de enviar de novo (proteção contra bloqueio do WhatsApp).`,
      }
    }
  }

  // 2) Teto por minuto.
  const umMinAtras = agora - 60 * 1000
  const noMinuto = recentes.filter((m) => msDe(m.wa_timestamp) >= umMinAtras).length
  if (noMinuto >= LIMITES_ENVIO.porMinuto) {
    return {
      ok: false,
      erro: `Limite de ${LIMITES_ENVIO.porMinuto} mensagens por minuto atingido neste número. Espere um pouco para não arriscar um bloqueio do WhatsApp.`,
    }
  }

  // 3) Teto por hora (com aquecimento pra número recém-conectado).
  const emWarmup = params.conectadoEm
    ? agora - new Date(params.conectadoEm).getTime() < LIMITES_ENVIO.warmupHoras * 3600 * 1000
    : false
  const limiteHora = emWarmup ? LIMITES_ENVIO.porHoraWarmup : LIMITES_ENVIO.porHora
  if (recentes.length >= limiteHora) {
    const extra = emWarmup
      ? " Esse número foi conectado há pouco (fase de aquecimento), então o limite é menor nos primeiros dias."
      : ""
    return {
      ok: false,
      erro: `Limite de ${limiteHora} mensagens por hora atingido neste número.${extra} Espere para não arriscar um bloqueio.`,
    }
  }

  // 4) Mesma mensagem pra muitos contatos distintos — o gatilho nº1 de ban.
  if (params.texto) {
    const alvo = normalizarTexto(params.texto)
    if (alvo) {
      const janela = agora - LIMITES_ENVIO.repetidaJanelaMinutos * 60 * 1000
      const contatos = new Set<string>()
      for (const m of recentes) {
        if (msDe(m.wa_timestamp) < janela) continue
        if (m.lead_id === params.leadId) continue // reenvio pro MESMO contato não conta
        if (m.conteudo && normalizarTexto(m.conteudo) === alvo) contatos.add(m.lead_id)
      }
      if (contatos.size >= LIMITES_ENVIO.repetidaMaxContatos) {
        return {
          ok: false,
          erro: `Essa mesma mensagem já foi enviada para ${contatos.size} contatos agora há pouco. Texto idêntico em massa é o que mais causa bloqueio no WhatsApp — personalize (nome, contexto do imóvel) antes de continuar.`,
        }
      }
    }
  }

  return { ok: true }
}
