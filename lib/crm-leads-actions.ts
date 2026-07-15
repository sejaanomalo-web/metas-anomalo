"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"
import {
  buscarPerfilContatoEvolution,
  verificarNumeroWhatsappEvolution,
} from "./evolution"
import { buscarEtapasAutomaticas, sincronizarEtiquetaComEtapa } from "./crm-etapas"
import type { CampoPersonalizado, ReuniaoNota } from "./crm-leads"
import { normalizarTelefone } from "./crm-telefone"

export interface ResultadoLead {
  ok: boolean
  erro?: string
}

function emailValido(bruto: string): string | null {
  const limpo = bruto.trim()
  if (!limpo) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo) ? limpo : null
}

// Tags permitidas nas notas do contato — só o suficiente pro editor de
// formatação básica (negrito/itálico/sublinhado/lista). Tudo mais (script,
// style, atributos como onclick/style/href) é removido: o HTML vem do
// contentEditable do navegador, então precisa ser tratado como input não
// confiável antes de ir pro banco.
const TAGS_PERMITIDAS_NOTAS = new Set([
  "b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div", "span",
])

// Casa uma tag inteira (com atributos) tratando valores entre aspas como
// átomos — assim um atributo tipo title="a>b" não corta o match no '>' de
// dentro da aspa (armadilha comum de sanitizador ingênuo baseado em regex).
const TAG_COM_ATRIBUTOS =
  /<\/?([a-zA-Z0-9]+)(?:\s+[a-zA-Z0-9:_-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*\s*\/?>/g

function sanitizarHtmlContato(bruto: string): string {
  let limpo = bruto.replace(/<!--[\s\S]*?-->/g, "")
  // Blocos perigosos somem inteiros (tag + conteúdo) antes de tudo — o resto
  // vira texto puro pela troca de tags abaixo, então script/style nunca
  // chegam a executar nem a poluir a nota com CSS/JS cru.
  limpo = limpo.replace(
    /<(script|style|iframe|object|embed|link|meta|form|svg)[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  )
  limpo = limpo.replace(TAG_COM_ATRIBUTOS, (tagCompleta, nomeTag) => {
    const nome = String(nomeTag).toLowerCase()
    if (!TAGS_PERMITIDAS_NOTAS.has(nome)) return ""
    const fechamento = tagCompleta.startsWith("</") ? "/" : ""
    return `<${fechamento}${nome}>`
  })
  return limpo.slice(0, 20_000)
}

/** Normaliza uma reunião (data YYYY-MM-DD + anotação). Descarta linhas sem
 *  data nem anotação. Data inválida vira "" (a UI valida antes; o servidor só
 *  não confia). Até 200 reuniões por lead — teto defensivo. */
function normalizarReunioes(bruto: string): ReuniaoNota[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(bruto || "[]")
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed
    .map((r): ReuniaoNota => {
      const item = (r ?? {}) as Record<string, unknown>
      const id =
        String(item.id ?? "").slice(0, 60) ||
        `reuniao_${Math.random().toString(36).slice(2)}`
      const dataBruta = String(item.data ?? "").trim().slice(0, 10)
      const data = /^\d{4}-\d{2}-\d{2}$/.test(dataBruta) ? dataBruta : ""
      return {
        id,
        data,
        anotacao: String(item.anotacao ?? "").trim().slice(0, 5000),
      }
    })
    .filter((r) => r.data || r.anotacao)
    .slice(0, 200)
}

/** Normaliza um link de rede social — aceita URL ou @handle e devolve texto
 *  curto (a UI transforma em link clicável). null quando vazio. */
function normalizarRedeSocial(bruto: string): string | null {
  const limpo = bruto.trim().slice(0, 300)
  return limpo || null
}

function normalizarCamposPersonalizados(bruto: string): CampoPersonalizado[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(bruto || "[]")
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed
    .map((c): CampoPersonalizado => {
      const item = (c ?? {}) as Record<string, unknown>
      const id = String(item.id ?? "").slice(0, 60) || `campo_${Math.random().toString(36).slice(2)}`
      return {
        id,
        nome: String(item.nome ?? "").trim().slice(0, 40),
        valor: String(item.valor ?? "").trim().slice(0, 500),
      }
    })
    .filter((c) => c.nome)
    .slice(0, 20)
}

/**
 * Define/edita o nome do lead à mão (ex: contato que chegou só como número).
 * Marca nome_manual=true pra o sync automático (CONTACTS_UPSERT/pushName) não
 * sobrescrever depois. Só o dono do lead pode renomear.
 */
export async function renomearLeadAction(
  leadId: string,
  nome: string
): Promise<ResultadoLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const nomeLimpo = nome.trim().slice(0, 80)
  if (!nomeLimpo) return { ok: false, erro: "Nome vazio." }

  const { error } = await db
    .from("crm_leads")
    .update({
      nome: nomeLimpo,
      nome_manual: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

const THROTTLE_AUTO_SYNC_MS = 6 * 60 * 60 * 1000 // 6h

/**
 * Puxa nome/recado/foto do contato direto do WhatsApp (via Evolution
 * fetchProfile) e atualiza o lead. Respeita nome_manual: se o usuário já
 * nomeou à mão, o nome dele é mantido — só recado/foto são atualizados.
 *
 * `forcar=false` (padrão, usado pelo auto-sync silencioso ao abrir a
 * conversa) pula a chamada à Evolution se já tentou nos últimos 6h e não
 * achou nada — evita martelar a API a cada abertura de conversa sem
 * informação disponível. O botão manual sempre passa forcar=true.
 */
export async function sincronizarContatoAction(
  leadId: string,
  opts?: { forcar?: boolean }
): Promise<ResultadoLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const { data: lead } = await db
    .from("crm_leads")
    .select("id, empresa_slug, telefone_e164, nome_manual, nome, foto_url, perfil_sync_tentado_em")
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (!lead) return { ok: false, erro: "Lead não encontrado." }
  if (!lead.telefone_e164) return { ok: false, erro: "Lead sem telefone." }

  if (!opts?.forcar && lead.perfil_sync_tentado_em) {
    const desdeMs = Date.now() - new Date(lead.perfil_sync_tentado_em as string).getTime()
    const faltaInfo = !lead.nome || !lead.foto_url
    if (faltaInfo && desdeMs < THROTTLE_AUTO_SYNC_MS) {
      return { ok: false, erro: "sincronizado_recentemente" }
    }
  }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("instance_name")
    .eq("empresa_slug", lead.empresa_slug)
    .eq("usuario_id", usuario.id)
    .eq("ativo", true)
    .eq("status_conexao", "conectado")
    .limit(1)
    .maybeSingle()
  if (!inst) {
    return { ok: false, erro: "Nenhuma instância conectada para buscar o contato." }
  }

  const perfil = await buscarPerfilContatoEvolution(
    inst.instance_name as string,
    lead.telefone_e164 as string
  )

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    perfil_sync_tentado_em: new Date().toISOString(),
  }
  // Só sobrescreve o nome se NÃO for manual (o nome digitado pelo usuário ganha).
  if (perfil.nome && !lead.nome_manual) patch.nome = perfil.nome
  if (perfil.sobre) patch.sobre = perfil.sobre
  if (perfil.foto) patch.foto_url = perfil.foto

  const { error } = await db
    .from("crm_leads")
    .update(patch)
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  const achouAlgo = Boolean(perfil.nome || perfil.sobre || perfil.foto)
  if (!achouAlgo) return { ok: false, erro: "Nada novo encontrado para este contato." }
  return { ok: true }
}

/**
 * Cria um contato/lead MANUAL (fora do fluxo normal de mensagem recebida).
 * O registro existe no CRM imediatamente; só passa a existir como conversa
 * de verdade no WhatsApp do celular quando a PRIMEIRA mensagem é enviada
 * (é assim que o WhatsApp funciona — não dá pra "criar uma conversa vazia"
 * remotamente, só mandando uma mensagem de fato). Confere best-effort se o
 * número existe no WhatsApp antes de salvar (não bloqueia se a checagem
 * falhar, só avisa).
 */
export async function criarLeadManualAction(
  formData: FormData
): Promise<ResultadoLead & { id?: string; aviso?: string }> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const instanciaId = String(formData.get("instancia_id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 80)
  const telefone = normalizarTelefone(String(formData.get("telefone") ?? ""))
  const email = emailValido(String(formData.get("email") ?? ""))
  if (!instanciaId) return { ok: false, erro: "Selecione o número/empresa." }
  if (!nome) return { ok: false, erro: "Nome obrigatório." }
  if (!telefone) return { ok: false, erro: "Telefone inválido." }

  const { data: inst } = await db
    .from("crm_instancias")
    .select("id, instance_name, empresa_slug")
    .eq("id", instanciaId)
    .eq("usuario_id", usuario.id)
    .eq("ativo", true)
    .maybeSingle()
  if (!inst) return { ok: false, erro: "Número/empresa não encontrado." }

  const { data: emp } = await db
    .from("empresas_config")
    .select("nome")
    .eq("slug", inst.empresa_slug as string)
    .maybeSingle()
  const empresaNome = (emp?.nome as string) ?? (inst.empresa_slug as string)

  // Etapa inicial: "Novo Contato" pelo nome (as duas transições automáticas
  // do funil usam nome, não ordem — ver lib/crm-etapas.ts). Se o usuário
  // renomeou/excluiu essa etapa padrão, cai pra primeira etapa VISÍVEL a ele
  // (padrão + próprias) por ordem — sem o filtro de usuario_id, uma etapa
  // PRIVADA de outro usuário (reordenada pra ordem baixa) podia vazar como
  // etapa_id de um lead que nem é dele.
  const { novoContato } = await buscarEtapasAutomaticas(db, usuario.id)
  let etapaInicial: { id: string; nome: string; cor: string | null } | null = novoContato
  if (!etapaInicial) {
    const { data: etapasVisiveis } = await db
      .from("crm_etapas")
      .select("id, nome, cor")
      .eq("ativo", true)
      .or(`usuario_id.is.null,usuario_id.eq.${usuario.id}`)
      .order("ordem", { ascending: true })
      .limit(1)
    const primeira = etapasVisiveis?.[0]
    etapaInicial = primeira
      ? { id: primeira.id as string, nome: primeira.nome as string, cor: (primeira.cor as string) ?? null }
      : null
  }

  const { data: novo, error } = await db
    .from("crm_leads")
    .insert({
      empresa_slug: inst.empresa_slug as string,
      empresa_nome: empresaNome,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      telefone_e164: telefone,
      nome,
      nome_manual: true,
      email,
      origem: "manual",
      etapa_id: etapaInicial?.id ?? null,
      status: "aberto",
      ultima_interacao_em: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (error) {
    if (error.code === "23505") {
      // Não revela SE o telefone já existe de outro usuário nessa empresa
      // (empresa_slug+telefone é único no banco inteiro, não por usuário) —
      // só confirma quando é um contato do PRÓPRIO usuário, senão vira um
      // jeito de descobrir contato alheio testando números.
      const { data: conflito } = await db
        .from("crm_leads")
        .select("id, usuario_id")
        .eq("empresa_slug", inst.empresa_slug as string)
        .eq("telefone_e164", telefone)
        .maybeSingle()
      if (conflito?.usuario_id === usuario.id) {
        return {
          ok: false,
          erro: "Você já tem um contato com esse telefone.",
        }
      }
      return { ok: false, erro: "Não foi possível criar o contato." }
    }
    return { ok: false, erro: error.message }
  }

  if (etapaInicial) {
    await sincronizarEtiquetaComEtapa(db, usuario.id, novo.id as string, etapaInicial)
  }

  const existeWhatsapp = await verificarNumeroWhatsappEvolution(
    inst.instance_name as string,
    telefone
  )

  revalidatePath("/dashboard/crm")
  return {
    ok: true,
    id: novo?.id as string,
    aviso:
      existeWhatsapp === false
        ? "Esse número não parece estar no WhatsApp — confira antes de enviar."
        : undefined,
  }
}

/** Edita nome/email do contato — dado que só existe no CRM (WhatsApp não
 *  expõe nenhuma forma de um dispositivo vinculado alterar o nome salvo no
 *  celular ou o perfil de outra pessoa; só o vocabulário interno do CRM
 *  muda). Nome marca nome_manual=true, igual renomearLeadAction. */
export async function editarLeadAction(
  formData: FormData
): Promise<ResultadoLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 80)
  const emailBruto = String(formData.get("email") ?? "").trim()
  if (!leadId) return { ok: false, erro: "Lead inválido." }
  if (!nome) return { ok: false, erro: "Nome obrigatório." }
  if (emailBruto && !emailValido(emailBruto)) {
    return { ok: false, erro: "E-mail inválido." }
  }

  const { data: atualizado, error } = await db
    .from("crm_leads")
    .update({
      nome,
      nome_manual: true,
      email: emailBruto ? emailValido(emailBruto) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .select("id")
    .maybeSingle()
  if (error) return { ok: false, erro: error.message }
  if (!atualizado) return { ok: false, erro: "Lead não encontrado." }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

/**
 * Salva a ficha de informações do contato: e-mail, notas com formatação básica
 * (HTML sanitizado no servidor — vem do contentEditable do navegador, então é
 * input não confiável), campos personalizados livres, redes sociais
 * (Instagram/Facebook) e o histórico de reuniões (data + anotação).
 *
 * O `nome` é OPCIONAL aqui: a ficha embutida em Conversas (FichaContato) edita
 * o nome no próprio cabeçalho (via renomearLeadAction) e NÃO manda `nome`, pra
 * não marcar nome_manual à toa e travar o sync automático de um nome que veio
 * do WhatsApp. Já o popup do Kanban (InformacoesContato standalone) manda
 * `nome` — aí ele é obrigatório e marca nome_manual=true, igual antes.
 *
 * Telefone NÃO é editável aqui: é o vínculo com o WhatsApp, mudar exigiria
 * trocar a conversa inteira de identidade.
 */
export async function editarInformacoesContatoAction(
  formData: FormData
): Promise<ResultadoLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  const emailBruto = String(formData.get("email") ?? "").trim()
  const notasBruto = String(formData.get("notas_html") ?? "")
  const camposBruto = String(formData.get("campos_personalizados") ?? "[]")
  const reunioesBruto = String(formData.get("reunioes") ?? "[]")
  const instagramBruto = String(formData.get("instagram") ?? "")
  const facebookBruto = String(formData.get("facebook") ?? "")
  if (!leadId) return { ok: false, erro: "Lead inválido." }
  if (emailBruto && !emailValido(emailBruto)) {
    return { ok: false, erro: "E-mail inválido." }
  }

  // nome ausente (null) = não mexe no nome; presente e vazio = erro.
  const nomeRaw = formData.get("nome")
  const temNome = nomeRaw !== null
  const nome = String(nomeRaw ?? "").trim().slice(0, 80)
  if (temNome && !nome) return { ok: false, erro: "Nome obrigatório." }

  const campos = normalizarCamposPersonalizados(camposBruto)
  if (campos === null) return { ok: false, erro: "Campos personalizados inválidos." }
  const reunioes = normalizarReunioes(reunioesBruto)
  if (reunioes === null) return { ok: false, erro: "Reuniões inválidas." }

  const patch: Record<string, unknown> = {
    email: emailBruto ? emailValido(emailBruto) : null,
    notas_html: sanitizarHtmlContato(notasBruto),
    campos_personalizados: campos,
    reunioes,
    instagram: normalizarRedeSocial(instagramBruto),
    facebook: normalizarRedeSocial(facebookBruto),
    updated_at: new Date().toISOString(),
  }
  if (temNome) {
    patch.nome = nome
    patch.nome_manual = true
  }

  const { data: atualizado, error } = await db
    .from("crm_leads")
    .update(patch)
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .select("id")
    .maybeSingle()
  if (error) return { ok: false, erro: error.message }
  if (!atualizado) return { ok: false, erro: "Lead não encontrado." }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

/**
 * Exclui um contato/lead DE VEZ do CRM — mensagens, atividades e etiquetas
 * atribuídas somem junto (ON DELETE CASCADE). Fase 8: NÃO mexe mais no WhatsApp
 * (o CRM virou viewer, não edita nada no celular) — a exclusão é só do lado do
 * CRM. A conversa no WhatsApp do celular continua intacta.
 */
export async function excluirLeadAction(
  formData: FormData
): Promise<ResultadoLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  if (!leadId) return { ok: false, erro: "Lead inválido." }

  const { error } = await db
    .from("crm_leads")
    .delete()
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

/** Tira um lead do arquivo (ex: a conversa foi apagada sem querer no celular
 *  — CHATS_DELETE arquivou automaticamente, ver lib/crm-inbound.ts — e o
 *  usuário quer ver de novo no inbox normal). Não mexe no WhatsApp: só o
 *  lado do CRM volta a mostrar o que já estava lá. */
export async function desarquivarLeadAction(
  formData: FormData
): Promise<ResultadoLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  if (!leadId) return { ok: false, erro: "Lead inválido." }

  const { data: atualizado, error } = await db
    .from("crm_leads")
    .update({ arquivado: false, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .select("id")
    .maybeSingle()
  if (error) return { ok: false, erro: error.message }
  if (!atualizado) return { ok: false, erro: "Lead não encontrado." }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}
