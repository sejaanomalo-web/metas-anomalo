"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"
import { listarEtapas, sincronizarEtiquetaDaEtapa } from "./crm-etapas"

export interface ResultadoMoverLead {
  ok: boolean
  erro?: string
}

/**
 * Move um lead pra outra etapa/posição do Kanban. `nova_ordem` já vem
 * calculada pelo client (ponto médio entre os vizinhos no drop — ver
 * components/crm/Kanban.tsx) pra não renumerar a coluna inteira a cada
 * arrasto, conforme o desenho original de `ordem_na_etapa`.
 *
 * Etapas terminais (tipo 'ganho'/'perdido') também fecham o status do lead
 * automaticamente — evita um lead "aberto" preso numa coluna de fechamento.
 */
export async function moverLeadAction(
  formData: FormData
): Promise<ResultadoMoverLead> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const leadId = String(formData.get("lead_id") ?? "").trim()
  const etapaId = String(formData.get("etapa_id") ?? "").trim()
  const novaOrdem = Number(formData.get("nova_ordem") ?? "")
  if (!leadId || !etapaId || !Number.isFinite(novaOrdem)) {
    return { ok: false, erro: "Parâmetros inválidos." }
  }

  const { data: etapa } = await db
    .from("crm_etapas")
    .select("id, tipo, usuario_id")
    .eq("id", etapaId)
    .maybeSingle()
  if (!etapa) return { ok: false, erro: "Etapa não encontrada." }
  // Etapa custom de OUTRO usuário: não deixa mover pra lá (etapas padrão têm
  // usuario_id null e continuam abertas a todos).
  if (etapa.usuario_id && etapa.usuario_id !== usuario.id) {
    return { ok: false, erro: "Etapa não pertence a você." }
  }

  const patch: Record<string, unknown> = {
    etapa_id: etapaId,
    ordem_na_etapa: novaOrdem,
    updated_at: new Date().toISOString(),
  }
  if (etapa.tipo === "ganho") patch.status = "ganho"
  else if (etapa.tipo === "perdido") patch.status = "perdido"
  else patch.status = "aberto"

  const { error } = await db
    .from("crm_leads")
    .update(patch)
    .eq("id", leadId)
    .eq("usuario_id", usuario.id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

export interface ResultadoEtapa {
  ok: boolean
  erro?: string
  id?: string
}

function corValida(bruto: string | null): string | null {
  if (!bruto) return null
  return /^#[0-9a-fA-F]{6}$/.test(bruto) ? bruto : null
}

/** Cria uma etapa CUSTOM do usuário logado (coluna nova no Kanban, visível só
 *  pra ele) — vai pro fim da ordem atual. */
export async function criarEtapaAction(
  formData: FormData
): Promise<ResultadoEtapa> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const nome = String(formData.get("nome") ?? "").trim().slice(0, 60)
  const cor = corValida(String(formData.get("cor") ?? "")) ?? "#C9953A"
  if (!nome) return { ok: false, erro: "Nome da etapa obrigatório." }

  // Nome único entre as etapas visíveis ao usuário — evita duas colunas com
  // o mesmo nome, o que colidiria na etiqueta espelhada (única por
  // usuario_id+nome, ver sincronizarEtiquetaDaEtapa).
  const visiveis = await listarEtapas()
  const colisao = visiveis.find((e) => e.nome.toLowerCase() === nome.toLowerCase())
  if (colisao) return { ok: false, erro: `Já existe uma etapa "${nome}".` }

  const { data: ultima } = await db
    .from("crm_etapas")
    .select("ordem")
    .eq("ativo", true)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle()
  const proximaOrdem = ((ultima?.ordem as number) ?? 0) + 1

  const { data, error } = await db
    .from("crm_etapas")
    .insert({
      nome,
      cor,
      ordem: proximaOrdem,
      tipo: "aberta",
      ativo: true,
      usuario_id: usuario.id,
    })
    .select("id")
    .single()
  if (error) return { ok: false, erro: error.message }

  const etapaId = data?.id as string
  await sincronizarEtiquetaDaEtapa(db, usuario.id, { id: etapaId, nome, cor })

  revalidatePath("/dashboard/crm")
  return { ok: true, id: etapaId }
}

/** Renomeia/recolore uma etapa — padrão (compartilhada) ou própria. O nome
 *  novo propaga pra etiqueta espelhada de TODO usuário que a enxerga (a
 *  etapa é uma só; a etiqueta é 1 cópia por usuário). */
export async function editarEtapaAction(
  formData: FormData
): Promise<ResultadoEtapa> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 60)
  const cor = corValida(String(formData.get("cor") ?? ""))
  if (!id) return { ok: false, erro: "ID inválido." }
  if (!nome) return { ok: false, erro: "Nome da etapa obrigatório." }

  const { data: etapa } = await db
    .from("crm_etapas")
    .select("id, usuario_id")
    .eq("id", id)
    .maybeSingle()
  if (!etapa) return { ok: false, erro: "Etapa não encontrada." }
  if (etapa.usuario_id && etapa.usuario_id !== usuario.id) {
    return { ok: false, erro: "Essa etapa não é sua." }
  }

  const visiveis = await listarEtapas()
  const colisao = visiveis.find(
    (e) => e.id !== id && e.nome.toLowerCase() === nome.toLowerCase()
  )
  if (colisao) return { ok: false, erro: `Já existe uma etapa "${nome}".` }

  const patch: Record<string, unknown> = { nome }
  if (cor) patch.cor = cor

  const { error } = await db.from("crm_etapas").update(patch).eq("id", id)
  if (error) return { ok: false, erro: error.message }

  const patchEtiqueta: Record<string, unknown> = { nome }
  if (cor) patchEtiqueta.cor = cor
  const { error: erroEtiqueta } = await db
    .from("crm_etiquetas")
    .update(patchEtiqueta)
    .eq("etapa_id", id)
  if (erroEtiqueta) {
    // A etapa já foi renomeada (statement acima) — isso só pode falhar por
    // colisão de nome na etiqueta espelhada de outro usuário (unique por
    // usuario_id+nome), que não dá pra prever aqui (não enxergamos etapas
    // privadas de outros usuários). Reporta em vez de mentir "ok" com o
    // espelho dessincronizado.
    return {
      ok: false,
      erro: `Etapa renomeada, mas a etiqueta de algum usuário colidiu com outro nome já existente: ${erroEtiqueta.message}`,
    }
  }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

/** Move uma etapa um passo pra esquerda/direita na ordem do Kanban, trocando
 *  a `ordem` com a vizinha (visível ao usuário — nunca vê etapa própria de
 *  outro usuário, então a troca é sempre seguro). */
export async function moverEtapaAction(
  formData: FormData
): Promise<ResultadoEtapa> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  const direcao = String(formData.get("direcao") ?? "")
  if (!id) return { ok: false, erro: "ID inválido." }
  if (direcao !== "esquerda" && direcao !== "direita") {
    return { ok: false, erro: "Direção inválida." }
  }

  const visiveis = await listarEtapas()
  const idx = visiveis.findIndex((e) => e.id === id)
  if (idx === -1) return { ok: false, erro: "Etapa não encontrada." }
  const idxVizinha = direcao === "esquerda" ? idx - 1 : idx + 1
  if (idxVizinha < 0 || idxVizinha >= visiveis.length) {
    return { ok: true } // já está na ponta — no-op silencioso
  }

  const atual = visiveis[idx]
  const vizinha = visiveis[idxVizinha]

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    db.from("crm_etapas").update({ ordem: vizinha.ordem }).eq("id", atual.id),
    db.from("crm_etapas").update({ ordem: atual.ordem }).eq("id", vizinha.id),
  ])
  if (e1 || e2) return { ok: false, erro: (e1 ?? e2)?.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

/** Remove uma etapa — padrão (compartilhada, afeta todo mundo) ou própria.
 *  Leads que estavam nela voltam pra "sem etapa" (etapa_id null) em vez de
 *  sumir; etiquetas espelhadas somem junto (ON DELETE CASCADE). */
export async function excluirEtapaAction(
  formData: FormData
): Promise<ResultadoEtapa> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "ID inválido." }

  const { data: etapa } = await db
    .from("crm_etapas")
    .select("id, usuario_id")
    .eq("id", id)
    .maybeSingle()
  if (!etapa) return { ok: false, erro: "Etapa não encontrada." }
  if (etapa.usuario_id && etapa.usuario_id !== usuario.id) {
    return { ok: false, erro: "Essa etapa não é sua." }
  }

  // Etapa padrão (usuario_id null) é compartilhada — leads de QUALQUER dono
  // podem estar nela, então o reset não filtra por usuario_id. Etapa própria
  // só tem leads do próprio dono (moverLeadAction já garante isso).
  if (etapa.usuario_id) {
    await db
      .from("crm_leads")
      .update({ etapa_id: null })
      .eq("etapa_id", id)
      .eq("usuario_id", usuario.id)
  } else {
    await db.from("crm_leads").update({ etapa_id: null }).eq("etapa_id", id)
  }

  const { error } = await db.from("crm_etapas").delete().eq("id", id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/dashboard/crm")
  return { ok: true }
}
