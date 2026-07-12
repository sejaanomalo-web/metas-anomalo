"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"
import {
  buscarPerfilContatoEvolution,
  verificarNumeroWhatsappEvolution,
  arquivarChatEvolution,
} from "./evolution"

export interface ResultadoLead {
  ok: boolean
  erro?: string
}

/** Digitos puros; numero brasileiro sem DDI (10/11 digitos — fixo ou celular
 *  com o 9) ganha o 55 na frente, pro mesmo padrao dos leads que chegam pelo
 *  WhatsApp (telefoneDoJid em lib/crm-inbound.ts). */
function normalizarTelefone(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "")
  if (digitos.length < 8) return null
  if (digitos.length <= 11) return `55${digitos}`
  return digitos
}

function emailValido(bruto: string): string | null {
  const limpo = bruto.trim()
  if (!limpo) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo) ? limpo : null
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

  // Primeira etapa VISÍVEL a este usuário (padrão + próprias) — sem o filtro
  // de usuario_id, uma etapa PRIVADA de outro usuário (que ele reordenou pra
  // ordem baixa) podia vazar como etapa_id de um lead que nem é dele.
  const { data: etapasVisiveis } = await db
    .from("crm_etapas")
    .select("id")
    .eq("ativo", true)
    .or(`usuario_id.is.null,usuario_id.eq.${usuario.id}`)
    .order("ordem", { ascending: true })
    .limit(1)
  const primeiraEtapaId = (etapasVisiveis?.[0]?.id as string) ?? null

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
      etapa_id: primeiraEtapaId,
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
 * Exclui um contato/lead DE VEZ — mensagens, atividades e etiquetas
 * atribuídas somem junto (ON DELETE CASCADE). Opcionalmente arquiva a
 * conversa no WhatsApp do celular também (a coisa mais próxima de "excluir"
 * que a API expõe — não existe "apagar contato" remotamente). Arquivar é
 * best-effort: se falhar, a exclusão no CRM segue normalmente.
 */
export async function excluirLeadAction(
  formData: FormData
): Promise<ResultadoLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  const arquivarNoWhatsapp = String(formData.get("arquivar_no_whatsapp") ?? "") === "true"
  if (!leadId) return { ok: false, erro: "Lead inválido." }

  const { data: lead } = await db
    .from("crm_leads")
    .select("id, empresa_slug, telefone_e164")
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
    .maybeSingle()
  if (!lead) return { ok: false, erro: "Lead não encontrado." }

  if (arquivarNoWhatsapp && lead.telefone_e164) {
    const { data: ultimaMsg } = await db
      .from("crm_mensagens")
      .select("wa_message_id, from_me")
      .eq("lead_id", leadId)
      .not("wa_message_id", "is", null)
      .order("wa_timestamp", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    const { data: inst } = await db
      .from("crm_instancias")
      .select("instance_name")
      .eq("empresa_slug", lead.empresa_slug as string)
      .eq("usuario_id", usuario.id)
      .eq("ativo", true)
      .eq("status_conexao", "conectado")
      .limit(1)
      .maybeSingle()
    if (ultimaMsg?.wa_message_id && inst) {
      const r = await arquivarChatEvolution(
        inst.instance_name as string,
        lead.telefone_e164 as string,
        { waMessageId: ultimaMsg.wa_message_id as string, fromMe: Boolean(ultimaMsg.from_me) }
      )
      if (!r.ok) {
        console.error("[crm_leads] falha ao arquivar chat na Evolution", r.erro)
      }
    }
  }

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
