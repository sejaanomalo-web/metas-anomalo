"use server"

// =============================================================================
// Escritas do módulo de leads (cadastro de formulários + rotação de token).
// =============================================================================
// Separado de lib/leads.ts pelo mesmo motivo de clientes-actions.ts: arquivo
// "use server" só pode exportar funções async, então leituras síncronas e
// tipos não cabem aqui.
//
// TODA action começa por requererPermissao("leads") — que redireciona quem não
// tem acesso. Não confiar no fato de o botão não aparecer: server action é um
// endpoint HTTP e pode ser chamada direto.
// =============================================================================

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { requererPermissao } from "./auth"
import { adotarOrfaos } from "./leads-ingestao"

export interface ResultadoLeads {
  ok: boolean
  erro?: string
  id?: string
}

function revalidarSuperficies() {
  revalidatePath("/dashboard/leads")
  revalidatePath("/dashboard", "layout")
}

function texto(fd: FormData, chave: string): string {
  return String(fd.get(chave) ?? "").trim()
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O form_id da Meta é uma string numérica longa. Validar aqui evita cadastrar
 *  um link inteiro colado por engano (erro comum: colar a URL do formulário). */
function formIdValido(v: string): boolean {
  return /^\d{6,}$/.test(v)
}

// -----------------------------------------------------------------------------
// Mapeamento formulário → cliente
// -----------------------------------------------------------------------------

export async function criarMapeamentoAction(
  formData: FormData
): Promise<ResultadoLeads> {
  await requererPermissao("leads")
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const cliente_id = texto(formData, "cliente_id")
  const form_id = texto(formData, "form_id")
  const rotulo = texto(formData, "rotulo")
  const page_id = texto(formData, "page_id")
  const page_access_token = texto(formData, "page_access_token")

  if (!UUID_RE.test(cliente_id)) return { ok: false, erro: "Cliente inválido." }
  if (!formIdValido(form_id)) {
    return {
      ok: false,
      erro: "ID do formulário inválido — cole só o número (ex: 1234567890123456).",
    }
  }
  if (rotulo === "") return { ok: false, erro: "Informe um nome para o formulário." }

  const { data, error } = await db
    .from("leads_form_mapping")
    .insert({
      cliente_id,
      form_id,
      rotulo,
      page_id: page_id === "" ? null : page_id,
      page_access_token: page_access_token === "" ? null : page_access_token,
      ativo: true,
    })
    .select("id")
    .single()

  if (error) {
    // 23505 = unique violation. O índice único é em form_id, então a mensagem
    // pode ser específica: este formulário já pertence a algum cliente.
    if (error.code === "23505") {
      return {
        ok: false,
        erro: "Este formulário já está cadastrado para algum cliente.",
      }
    }
    console.error("[leads-actions] criarMapeamento error", error.message)
    return { ok: false, erro: "Não foi possível cadastrar o formulário." }
  }

  // Leads deste formulário que já haviam chegado antes do cadastro estavam
  // órfãos (cliente_id null). Agora que o dono é conhecido, passam a aparecer
  // pro cliente. Sem isto, a deduplicação por leadgen_id os deixaria órfãos
  // para sempre — nem a reconciliação os resgataria.
  await adotarOrfaos(
    form_id,
    cliente_id,
    page_access_token === "" ? null : page_access_token
  )

  revalidarSuperficies()
  return { ok: true, id: data.id as string }
}

export async function atualizarMapeamentoAction(
  formData: FormData
): Promise<ResultadoLeads> {
  await requererPermissao("leads")
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = texto(formData, "id")
  const rotulo = texto(formData, "rotulo")
  const page_id = texto(formData, "page_id")
  const page_access_token = texto(formData, "page_access_token")
  const ativo = formData.get("ativo") === "on" || formData.get("ativo") === "true"

  if (!UUID_RE.test(id)) return { ok: false, erro: "Registro inválido." }
  if (rotulo === "") return { ok: false, erro: "Informe um nome para o formulário." }

  const patch: Record<string, unknown> = {
    rotulo,
    page_id: page_id === "" ? null : page_id,
    ativo,
  }
  // Token em branco = "não mexer". Sem isso, abrir o formulário de edição e
  // salvar sem redigitar o token o APAGARIA — e a coleta daquele formulário
  // pararia silenciosamente.
  if (page_access_token !== "") patch.page_access_token = page_access_token

  const { data: atualizado, error } = await db
    .from("leads_form_mapping")
    .update(patch)
    .eq("id", id)
    .select("form_id, cliente_id")
    .single()

  if (error) {
    console.error("[leads-actions] atualizarMapeamento error", error.message)
    return { ok: false, erro: "Não foi possível salvar as alterações." }
  }

  // Token informado agora: recupera os leads que entraram vazios enquanto o
  // formulário estava cadastrado SEM credencial pra consultar a Meta. A
  // reconciliação não faria isso — a linha já existe e a gravação é
  // idempotente por leadgen_id.
  if (page_access_token !== "" && atualizado) {
    await adotarOrfaos(
      atualizado.form_id as string,
      atualizado.cliente_id as string,
      page_access_token
    )
  }

  revalidarSuperficies()
  return { ok: true, id }
}

export async function excluirMapeamentoAction(
  formData: FormData
): Promise<ResultadoLeads> {
  await requererPermissao("leads")
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = texto(formData, "id")
  if (!UUID_RE.test(id)) return { ok: false, erro: "Registro inválido." }

  const { error } = await db.from("leads_form_mapping").delete().eq("id", id)
  if (error) {
    console.error("[leads-actions] excluirMapeamento error", error.message)
    return { ok: false, erro: "Não foi possível excluir." }
  }

  // Os leads NÃO são apagados junto — leads_log.cliente_id é uma FK própria e
  // continua apontando pro cliente. Descadastrar o formulário só interrompe a
  // entrada de novos leads; o histórico do cliente permanece intacto.
  revalidarSuperficies()
  return { ok: true, id }
}

// -----------------------------------------------------------------------------
// Token do dashboard
// -----------------------------------------------------------------------------

/**
 * Gera um novo token pro dashboard do cliente. Usar quando o link vazar.
 *
 * INVALIDA o link antigo na hora — quem tiver a URL velha passa a ver "link
 * inválido". É por isso que a UI confirma antes.
 */
export async function rotacionarTokenLeadsAction(
  formData: FormData
): Promise<ResultadoLeads> {
  await requererPermissao("leads")
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const cliente_id = texto(formData, "cliente_id")
  if (!UUID_RE.test(cliente_id)) return { ok: false, erro: "Cliente inválido." }

  // randomUUID do Node gera uuid v4 igual ao gen_random_uuid() do Postgres.
  const novo = crypto.randomUUID()

  const { error } = await db
    .from("cliente_trafego")
    .update({ leads_dash_token: novo })
    .eq("id", cliente_id)

  if (error) {
    console.error("[leads-actions] rotacionarToken error", error.message)
    return { ok: false, erro: "Não foi possível gerar um novo link." }
  }

  revalidarSuperficies()
  return { ok: true, id: novo }
}
