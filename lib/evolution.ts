// =============================================================================
// Cliente da Evolution API (WhatsApp via QR) — VIEWER do CRM.
// =============================================================================
// A partir da Fase 8 o CRM NAO envia nem recebe mensagem pela Evolution (era o
// principal vetor de banimento do numero). Este cliente cobre so o que faz a
// Evolution ser um "viewer": sincronizar nome/recado/foto do contato, conferir
// se um numero existe no WhatsApp, e administrar a instancia (QR/conexao).
// NUNCA propaga excecao; cada chamada retorna { ok, ... } ou null. NAMESPACE
// separado do Meta (META_WHATSAPP_*): o CRM usa EVOLUTION_*.
//
//   EVOLUTION_API_URL  - base da instalacao Evolution (sem NEXT_PUBLIC, secreta)
//   EVOLUTION_API_KEY  - apikey global (header 'apikey')
// =============================================================================

export interface ResultadoEvolution {
  ok: boolean
  /** key.id da mensagem na Evolution quando ok. */
  messageId?: string
  /** mensagem de erro quando falha. */
  erro?: string
  /** status HTTP da resposta da Evolution, quando houve. */
  status?: number
}

/**
 * Extrai a mensagem de erro mais útil possível do corpo de uma resposta de
 * falha da Evolution. O 400 dela costuma trazer o detalhe REAL em
 * `response.message` (array de strings, ex: ["number 045... is not a valid
 * whatsapp"]) — antes só líamos `message`/`error` e acabávamos exibindo o
 * genérico "Bad Request", que não dizia nada ao usuário. Tenta, em ordem:
 * response.message[] → message → error → "HTTP <status>".
 */
function erroDaRespostaEvolution(json: unknown, status: number): string {
  const obj = (json ?? {}) as Record<string, any>
  const respMsg = obj.response?.message ?? obj.message
  if (Array.isArray(respMsg) && respMsg.length > 0) {
    return respMsg.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join("; ")
  }
  if (typeof respMsg === "string" && respMsg.trim()) return respMsg
  if (typeof obj.error === "string" && obj.error.trim()) return obj.error
  return `HTTP ${status}`
}

export interface PerfilContatoEvolution {
  nome: string | null
  sobre: string | null
  foto: string | null
}

/**
 * Busca o perfil de um contato no WhatsApp (nome salvo/pushname, recado/status
 * e foto) por uma instancia. Best-effort: retorna todos os campos null em
 * qualquer falha. Endpoint: /chat/fetchProfile/{instance}.
 */
export async function buscarPerfilContatoEvolution(
  instanceName: string,
  telefoneE164: string
): Promise<PerfilContatoEvolution> {
  const vazio: PerfilContatoEvolution = { nome: null, sobre: null, foto: null }
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) return vazio

  const url = `${base.replace(/\/$/, "")}/chat/fetchProfile/${encodeURIComponent(
    instanceName
  )}`
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: telefoneE164 }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    })
    if (!resp.ok) return vazio
    const json = (await resp.json().catch(() => null)) as Record<string, any> | null
    if (!json) return vazio
    // A forma varia entre builds: name/pushName/verifiedName; status pode vir
    // string ou objeto { status }. picture/profilePictureUrl pra foto.
    const nome =
      json.name ?? json.pushName ?? json.verifiedName ?? json.wpp_name ?? null
    const statusBruto = json.status
    const sobre =
      typeof statusBruto === "string"
        ? statusBruto
        : (statusBruto?.status as string) ?? json.about ?? null
    const fotoBruta = json.picture ?? json.profilePictureUrl ?? json.profilePicUrl ?? null
    return {
      nome: typeof nome === "string" && nome.trim() ? nome.trim() : null,
      sobre: typeof sobre === "string" && sobre.trim() ? sobre.trim() : null,
      foto:
        typeof fotoBruta === "string" && fotoBruta.startsWith("http")
          ? fotoBruta
          : null,
    }
  } catch {
    return vazio
  }
}

/**
 * Confere se um numero existe no WhatsApp antes de criar um contato manual
 * no CRM — evita salvar leads com numero errado/inexistente. Best-effort:
 * null quando nao da pra determinar (instancia offline, API fora, formato
 * de resposta inesperado) — quem chama trata null como "nao bloqueia,
 * so nao confirma". Endpoint: /chat/whatsappNumbers/{instance}.
 */
export async function verificarNumeroWhatsappEvolution(
  instanceName: string,
  telefoneE164: string
): Promise<boolean | null> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) return null

  const url = `${base.replace(/\/$/, "")}/chat/whatsappNumbers/${encodeURIComponent(
    instanceName
  )}`
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: [telefoneE164] }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    if (!resp.ok) return null
    const json: unknown = await resp.json().catch(() => null)
    // A resposta e uma lista (as vezes envelopada em {contacts:[...]} ou
    // {response:{contacts:[...]}}) de objetos com `exists`/`jid` (formato
    // Baileys onWhatsApp) — varia entre builds, entao checa alguns formatos.
    const lista: any[] = Array.isArray(json)
      ? json
      : (json as any)?.contacts ?? (json as any)?.response?.contacts ?? []
    if (!Array.isArray(lista) || lista.length === 0) return null
    const item = lista[0] as Record<string, any>
    if (typeof item.exists === "boolean") return item.exists
    if (typeof item.jid === "string") return item.jid.length > 0
    return null
  } catch {
    return null
  }
}

export interface ResultadoInstanciaEvolution {
  ok: boolean
  erro?: string
  status?: number
}

async function extrairErroResposta(resp: Response): Promise<string> {
  const json: unknown = await resp.json().catch(() => null)
  return erroDaRespostaEvolution(json, resp.status)
}

/**
 * Cria uma instancia nova na Evolution API. A resposta do create já costuma
 * trazer o QR junto (mesmo formato do connect, ver conectarInstanciaEvolution)
 * — lê direto daqui pra já cair conectando sem precisar de um segundo clique
 * em "Gerar QR". O evento QRCODE_UPDATED do webhook (lib/crm-inbound.ts)
 * segue valendo como atualização em segundo plano.
 */
export async function criarInstanciaEvolution(
  instanceName: string
): Promise<ConexaoEvolution> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) {
    console.error("[evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente")
    return { ok: false, erro: "credenciais_ausentes" }
  }

  const url = `${base.replace(/\/$/, "")}/instance/create`

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    const json: unknown = await resp.json().catch(() => null)
    if (!resp.ok) {
      const obj = (json ?? {}) as Record<string, unknown>
      const msg =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        `HTTP ${resp.status}`
      console.error(
        `[evolution] falha instance/create (${instanceName}): ${resp.status} ${JSON.stringify(json)}`
      )
      return { ok: false, erro: String(msg), status: resp.status }
    }
    // O QR do create vem aninhado em { qrcode: {...} } na maioria dos builds
    // (diferente do connect, que às vezes vem achatado) — checa os dois.
    const obj = (json ?? {}) as Record<string, any>
    const qrObj = (obj.qrcode ?? obj) as Record<string, any>
    const qrBase64 = typeof qrObj.base64 === "string" ? qrObj.base64 : undefined
    return { ok: true, status: resp.status, qrBase64 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(
      `[evolution] erro de rede instance/create (${instanceName}): ${msg}`
    )
    return { ok: false, erro: msg }
  }
}

export interface ConexaoEvolution extends ResultadoInstanciaEvolution {
  /** Data URL (data:image/png;base64,...) do QR — vem no próprio corpo da
   *  resposta do connect quando `numeroE164` NÃO é passado. */
  qrBase64?: string
  /** Código de pareamento (o usuário digita no WhatsApp em vez de escanear)
   *  — vem no corpo da resposta quando `numeroE164` É passado. */
  pairingCode?: string
}

/**
 * Dispara/renova a geracao do QR (ou, se `numeroE164` for passado, do CÓDIGO
 * DE PAREAMENTO — login digitando o código no WhatsApp em vez de escanear)
 * de uma instancia ja criada.
 *
 * O evento QRCODE_UPDATED do webhook (lib/crm-inbound.ts) segue valendo como
 * atualização em segundo plano (ex: o QR expira e a Evolution manda um novo
 * sozinha), mas NÃO é mais a única fonte: a própria resposta deste GET já
 * costuma trazer o QR/código no corpo — antes essa função só conferia
 * resp.ok e descartava o corpo, then dependia 100% do webhook chegar a
 * tempo (e ele podia nunca chegar: webhook mal configurado na VPS, ou o
 * Realtime do Supabase silenciosamente desligado no client). Ler direto
 * daqui faz o botão funcionar mesmo se esse segundo canal falhar.
 */
export async function conectarInstanciaEvolution(
  instanceName: string,
  numeroE164?: string
): Promise<ConexaoEvolution> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) {
    console.error("[evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente")
    return { ok: false, erro: "credenciais_ausentes" }
  }

  const query = numeroE164 ? `?number=${encodeURIComponent(numeroE164)}` : ""
  const url = `${base.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(
    instanceName
  )}${query}`

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { apikey },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    const json: unknown = await resp.json().catch(() => null)
    if (!resp.ok) {
      const obj = (json ?? {}) as Record<string, unknown>
      const msg =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        `HTTP ${resp.status}`
      console.error(
        `[evolution] falha instance/connect (${instanceName}): ${resp.status} ${JSON.stringify(json)}`
      )
      return { ok: false, erro: String(msg), status: resp.status }
    }

    // Formato varia entre builds da Evolution: às vezes "achatado" (base64/
    // pairingCode direto na raiz), às vezes aninhado em { qrcode: {...} } —
    // mesma tolerância de extrairQrBase64 em lib/crm-inbound.ts.
    const obj = (json ?? {}) as Record<string, any>
    const qrObj = (obj.qrcode ?? obj) as Record<string, any>
    const qrBase64 = typeof qrObj.base64 === "string" ? qrObj.base64 : undefined
    const pairingCode =
      typeof qrObj.pairingCode === "string" ? qrObj.pairingCode : undefined

    return { ok: true, status: resp.status, qrBase64, pairingCode }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(
      `[evolution] erro de rede instance/connect (${instanceName}): ${msg}`
    )
    return { ok: false, erro: msg }
  }
}

/**
 * Exclui uma instancia na Evolution (desloga o WhatsApp e apaga a sessao).
 * Tenta logout antes do delete (algumas builds exigem). Best-effort no logout;
 * o resultado reportado e o do delete. Idempotente: 404 (ja nao existe) conta
 * como sucesso, pra permitir limpar linhas orfas no nosso banco.
 */
export async function excluirInstanciaEvolution(
  instanceName: string
): Promise<ResultadoInstanciaEvolution> {
  const base = process.env.EVOLUTION_API_URL
  const apikey = process.env.EVOLUTION_API_KEY
  if (!base || !apikey) {
    console.error("[evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente")
    return { ok: false, erro: "credenciais_ausentes" }
  }
  const raiz = base.replace(/\/$/, "")

  // 1) Logout (best-effort — ignora falha/404).
  try {
    await fetch(`${raiz}/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: { apikey },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
  } catch {
    /* ignora — segue pro delete */
  }

  // 2) Delete (resultado reportado).
  try {
    const resp = await fetch(
      `${raiz}/instance/delete/${encodeURIComponent(instanceName)}`,
      {
        method: "DELETE",
        headers: { apikey },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      }
    )
    if (!resp.ok && resp.status !== 404) {
      const msg = await extrairErroResposta(resp)
      console.error(
        `[evolution] falha instance/delete (${instanceName}): ${resp.status} ${msg}`
      )
      return { ok: false, erro: msg, status: resp.status }
    }
    return { ok: true, status: resp.status }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(
      `[evolution] erro de rede instance/delete (${instanceName}): ${msg}`
    )
    return { ok: false, erro: msg }
  }
}
