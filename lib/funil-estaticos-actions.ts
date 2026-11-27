"use server"

// Ações administrativas do Funil Estáticos Meta. Todas exigem admin do
// Workspace (mesma regra das integrações de Reuniões) e validam no servidor.
import { revalidatePath } from "next/cache"
import { getUsuarioAtual } from "./auth"
import { ehAdminNoModulo } from "./acesso-admin"
import { getSupabaseAdmin } from "./supabase"
import { despacharConversoes, limparCacheFunil, tokenPrevia } from "./funil-estaticos"
import { QUALIFICACOES, STATUS_COMERCIAL, validarDefinicao, type DefinicaoFunil } from "./funil-estaticos-nucleo"
import type { ResultadoReunioes } from "./reunioes-actions"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const R = (ok: boolean, msg: string): ResultadoReunioes => (ok ? { ok, mensagem: msg } : { ok, erro: msg })

async function admin() {
  const u = await getUsuarioAtual()
  if (!u || !ehAdminNoModulo(u, "workspace")) return null
  const db = getSupabaseAdmin()
  return db ? { u, db } : null
}
function rev(slug: string) { limparCacheFunil(); revalidatePath(`/dashboard/workspace/funis/${slug}`) }
async function funilDoForm(db: NonNullable<ReturnType<typeof getSupabaseAdmin>>, fd: FormData) {
  const id = String(fd.get("funil_id") ?? "")
  if (!UUID.test(id)) return null
  const { data } = await db.from("funil_config").select("id, slug, ativo, privacidade_url, slugs_anteriores, canal_chave, versao_publicada_id").eq("id", id).maybeSingle()
  return data
}

export async function salvarConfigFunilAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Só administradores do Workspace alteram o funil.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  const priv = String(fd.get("privacidade_url") ?? "").trim() || null
  if (priv && !/^https:\/\/[^\s<>"]{4,300}$/.test(priv)) return R(false, "Política de privacidade: use uma URL https válida.")
  const pixel = String(fd.get("pixel_id") ?? "").trim() || null
  if (pixel && !/^[0-9]{5,20}$/.test(pixel)) return R(false, "ID do conjunto de dados (Pixel) deve ter só números.")
  const testCode = String(fd.get("meta_test_event_code") ?? "").trim() || null
  if (testCode && !/^[A-Za-z0-9]{3,40}$/.test(testCode)) return R(false, "Código de teste inválido.")
  const num = (k: string, min: number, max: number, padrao: number) => { const v = Number(fd.get(k)); return Number.isInteger(v) && v >= min && v <= max ? v : padrao }
  const ativo = fd.get("ativo") === "1"
  if (ativo && !priv) return R(false, "Publicação real exige a URL da política de privacidade (LGPD).")
  let slug = String(fd.get("slug") ?? f.slug).trim().toLowerCase()
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return R(false, "Slug inválido (use letras minúsculas, números e hífen).")
  const anteriores = new Set<string>(f.slugs_anteriores ?? [])
  if (slug !== f.slug) {
    if (fd.get("confirmar_slug") !== "1") return R(false, "Confirme a troca do endereço: o link antigo continuará redirecionando, mas confira os anúncios.")
    anteriores.add(f.slug); anteriores.delete(slug)
  }
  const crmDono = String(fd.get("crm_usuario_id") ?? "")
  const crmEmpresa = String(fd.get("crm_empresa_slug") ?? "").trim() || null
  const qual = { ativo: fd.get("qual_ativo") === "1", alta: num("qual_alta", -80, 80, 6), media: num("qual_media", -80, 80, 3) }
  if (qual.media > qual.alta) return R(false, "Na qualificação, o mínimo de 'média' não pode passar o de 'alta'.")
  const { error } = await a.db.from("funil_config").update({
    nome: String(fd.get("nome") ?? "").trim().slice(0, 80) || "Funil Estáticos Meta",
    slug, slugs_anteriores: Array.from(anteriores), ativo, privacidade_url: priv,
    consentimento_modo: fd.get("consentimento_modo") === "informativo" ? "informativo" : "opt_in",
    pixel_id: pixel, capi_ativo: fd.get("capi_ativo") === "1", meta_test_event_code: testCode,
    eventos_meta: { PageView: fd.get("ev_pageview") === "1", Lead: fd.get("ev_lead") === "1", Schedule: fd.get("ev_schedule") === "1" },
    abandono_minutos: num("abandono_minutos", 5, 1440, 30),
    followup_ativo: fd.get("followup_ativo") === "1", followup_minutos: num("followup_minutos", 10, 10080, 60),
    notificar_novo_lead: fd.get("notificar_novo_lead") === "1",
    crm_usuario_id: UUID.test(crmDono) ? crmDono : null, crm_empresa_slug: UUID.test(crmDono) ? crmEmpresa : null,
    qualificacao: qual, retencao_dias: num("retencao_dias", 90, 3650, 730),
    atualizado_por: a.u.id, updated_at: new Date().toISOString(),
  }).eq("id", f.id)
  if (error) return R(false, error.code === "23505" ? "Esse endereço já está em uso." : "Não foi possível salvar.")
  rev(f.slug); if (slug !== f.slug) rev(slug)
  return R(true, ativo ? "Configuração salva. Funil publicado." : "Configuração salva. Funil inativo (a URL mostra a mensagem de indisponível).")
}

export async function salvarRascunhoAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Só administradores alteram o formulário.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  let def: DefinicaoFunil
  try { def = JSON.parse(String(fd.get("definicao") ?? "")) } catch { return R(false, "Definição inválida.") }
  const erros = validarDefinicao(def)
  if (erros.length) return { ok: false, erro: "Corrija antes de salvar:", itens: erros.slice(0, 12).map(e => ({ rotulo: e, ok: false })) }
  const { data: rasc } = await a.db.from("funil_versoes").select("id").eq("funil_id", f.id).eq("status", "rascunho").maybeSingle()
  if (rasc) {
    const { error } = await a.db.from("funil_versoes").update({ definicao: def, criado_por: a.u.id, criado_em: new Date().toISOString() }).eq("id", rasc.id)
    if (error) return R(false, "Não foi possível salvar o rascunho.")
  } else {
    const { data: ult } = await a.db.from("funil_versoes").select("numero").eq("funil_id", f.id).order("numero", { ascending: false }).limit(1)
    const { error } = await a.db.from("funil_versoes").insert({ funil_id: f.id, numero: (ult?.[0]?.numero ?? 0) + 1, status: "rascunho", definicao: def, criado_por: a.u.id })
    if (error) return R(false, "Não foi possível criar o rascunho.")
  }
  rev(f.slug)
  return R(true, "Rascunho salvo. Use 'Ver versão de teste' para conferir e depois publique.")
}

export async function publicarRascunhoAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Só administradores publicam o formulário.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  const { data: rasc } = await a.db.from("funil_versoes").select("id, definicao").eq("funil_id", f.id).eq("status", "rascunho").maybeSingle()
  if (!rasc) return R(false, "Não há rascunho para publicar.")
  const erros = validarDefinicao(rasc.definicao)
  if (erros.length) return { ok: false, erro: "O rascunho tem problemas:", itens: erros.slice(0, 12).map(e => ({ rotulo: e, ok: false })) }
  // Versões antigas ficam guardadas: respostas antigas continuam interpretáveis.
  if (f.versao_publicada_id) await a.db.from("funil_versoes").update({ status: "arquivada" }).eq("id", f.versao_publicada_id)
  const { error } = await a.db.from("funil_versoes").update({ status: "publicada", publicada_em: new Date().toISOString() }).eq("id", rasc.id)
  if (error) return R(false, "Falha ao publicar.")
  await a.db.from("funil_config").update({ versao_publicada_id: rasc.id, updated_at: new Date().toISOString() }).eq("id", f.id)
  rev(f.slug)
  return R(true, "Nova versão publicada. Visitantes que já estavam no meio do formulário começam de novo na versão nova.")
}

export async function descartarRascunhoAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Sem permissão.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  // Rascunho sem sessão pode ser apagado; com sessões (de teste) fica arquivado.
  const { data: rasc } = await a.db.from("funil_versoes").select("id").eq("funil_id", f.id).eq("status", "rascunho").maybeSingle()
  if (!rasc) return R(false, "Não há rascunho.")
  const { count } = await a.db.from("funil_sessoes").select("id", { count: "exact", head: true }).eq("versao_id", rasc.id)
  if (count) await a.db.from("funil_versoes").update({ status: "arquivada" }).eq("id", rasc.id)
  else await a.db.from("funil_versoes").delete().eq("id", rasc.id)
  rev(f.slug)
  return R(true, "Rascunho descartado.")
}

export async function gerarLinkPreviaAction(funilId: string, versaoId: string): Promise<{ ok: boolean; token?: string; erro?: string }> {
  const a = await admin(); if (!a) return { ok: false, erro: "Sem permissão." }
  if (!UUID.test(funilId) || !UUID.test(versaoId)) return { ok: false, erro: "Versão inválida." }
  const { data } = await a.db.from("funil_versoes").select("id").eq("id", versaoId).eq("funil_id", funilId).maybeSingle()
  if (!data) return { ok: false, erro: "Versão não encontrada." }
  return { ok: true, token: tokenPrevia(funilId, versaoId) }
}

export async function salvarCanalFunilAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Só administradores alteram a agenda.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  const tipoId = String(fd.get("tipo_id") ?? ""), dispId = String(fd.get("disponibilidade_id") ?? "")
  if (!UUID.test(tipoId) || !UUID.test(dispId)) return R(false, "Selecione o tipo de reunião e a agenda nativa.")
  const [t, d] = await Promise.all([
    a.db.from("reunioes_tipos").select("id, responsavel_id, ativo").eq("id", tipoId).maybeSingle(),
    a.db.from("reunioes_disponibilidades").select("id, responsavel_id, fuso, calcom_schedule_id, modo_nativo").eq("id", dispId).maybeSingle(),
  ])
  if (!t.data?.ativo || !d.data?.modo_nativo || d.data.fuso !== "America/Sao_Paulo" || d.data.calcom_schedule_id !== null)
    return R(false, "Use um tipo ativo e uma agenda NATIVA (não publicada no Cal.com) em America/Sao_Paulo.")
  const resp = d.data.responsavel_id ?? t.data.responsavel_id
  if (!resp || (d.data.responsavel_id && t.data.responsavel_id && d.data.responsavel_id !== t.data.responsavel_id))
    return R(false, "Tipo e agenda precisam do MESMO responsável.")
  const ativar = fd.get("ativo") === "1"
  if (ativar && fd.get("exclusividade_verificada") !== "1") return R(false, "Confirme que nenhuma conta Cal.com oferece essas mesmas janelas antes de ativar.")
  const { error } = await a.db.from("reunioes_canais_nativos").upsert({
    chave: f.canal_chave, tipo_id: tipoId, disponibilidade_id: dispId, ativo: ativar,
    exclusividade_verificada_em: ativar ? new Date().toISOString() : null, exclusividade_verificada_por: ativar ? a.u.id : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "chave" })
  if (error) return R(false, "Não foi possível salvar. A agenda precisa ser exclusiva do modo nativo.")
  rev(f.slug); revalidatePath("/dashboard/workspace/reunioes")
  return R(true, ativar ? "Agenda do funil ativa." : "Agenda do funil desativada (o lead continua sendo salvo).")
}

export async function salvarCriativoAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Sem permissão.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  const id = String(fd.get("id") ?? "")
  const codigo = String(fd.get("codigo") ?? "").trim().toUpperCase()
  const nome = String(fd.get("nome") ?? "").trim()
  const ad = String(fd.get("meta_ad_id") ?? "").trim() || null
  const mini = String(fd.get("miniatura_url") ?? "").trim() || null
  const inicio = String(fd.get("inicio_em") ?? "").trim() || null
  const status = String(fd.get("status") ?? "ativo")
  if (!/^[A-Z0-9_-]{1,20}$/.test(codigo)) return R(false, "Código: use letras/números, ex.: E01.")
  if (!nome || nome.length > 120) return R(false, "Nome obrigatório.")
  if (ad && !/^[0-9]{5,25}$/.test(ad)) return R(false, "ID do anúncio: só números (copie do Gerenciador).")
  if (mini && !/^https:\/\/[^\s<>"]{4,500}$/.test(mini)) return R(false, "Miniatura: URL https.")
  if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return R(false, "Data de início inválida.")
  if (!["ativo", "pausado", "encerrado"].includes(status)) return R(false, "Status inválido.")
  const linha = { funil_id: f.id, codigo, nome, hipotese: String(fd.get("hipotese") ?? "").trim().slice(0, 1000) || null, meta_ad_id: ad, miniatura_url: mini, inicio_em: inicio, status, updated_at: new Date().toISOString() }
  const { error } = UUID.test(id)
    ? await a.db.from("funil_criativos").update(linha).eq("id", id).eq("funil_id", f.id)
    : await a.db.from("funil_criativos").insert(linha)
  if (error) return R(false, error.code === "23505" ? "Código ou ID de anúncio já cadastrado." : "Não foi possível salvar.")
  rev(f.slug)
  return R(true, "Criativo salvo. Novas sessões com esse ad_id/código passam a ser atribuídas a ele.")
}

export async function excluirCriativoAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Sem permissão.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  const id = String(fd.get("id") ?? "")
  if (!UUID.test(id)) return R(false, "Criativo inválido.")
  const { count } = await a.db.from("funil_sessoes").select("id", { count: "exact", head: true }).eq("criativo_id", id)
  if (count) return R(false, "Esse criativo já tem sessões. Marque como 'encerrado' em vez de excluir (preserva o histórico).")
  await a.db.from("funil_criativos").delete().eq("id", id).eq("funil_id", f.id)
  rev(f.slug)
  return R(true, "Criativo excluído.")
}

export async function salvarInvestimentoAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Sem permissão.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  const data = String(fd.get("data") ?? "")
  const cid = String(fd.get("criativo_id") ?? "")
  const n = (k: string) => { const v = String(fd.get(k) ?? "").replace(/\./g, "").replace(",", "."); return v === "" ? null : Number(v) }
  const inv = n("investimento")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return R(false, "Data inválida.")
  if (inv === null || !Number.isFinite(inv) || inv < 0) return R(false, "Investimento inválido.")
  const ints = ["impressoes", "alcance", "cliques_link"].map(k => [k, n(k)] as const)
  if (ints.some(([, v]) => v !== null && (!Number.isInteger(v) || v < 0))) return R(false, "Impressões, alcance e cliques: inteiros ≥ 0.")
  const { error } = await a.db.from("funil_investimentos").upsert({
    funil_id: f.id, criativo_id: UUID.test(cid) ? cid : null, data, investimento: inv,
    ...Object.fromEntries(ints), observacao: String(fd.get("observacao") ?? "").slice(0, 300) || null, criado_por: a.u.id,
  }, { onConflict: "funil_id,criativo_id,data" })
  if (error) return R(false, "Não foi possível salvar o investimento.")
  rev(f.slug)
  return R(true, "Investimento salvo (fonte: manual).")
}

export async function atualizarLeadFunilAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Sem permissão.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  const id = String(fd.get("lead_id") ?? "")
  if (!UUID.test(id)) return R(false, "Lead inválido.")
  const { data: l } = await a.db.from("funil_leads").select("qualificacao, status_comercial, valor_venda").eq("id", id).eq("funil_id", f.id).maybeSingle()
  if (!l) return R(false, "Lead não encontrado.")
  const q = String(fd.get("qualificacao") ?? l.qualificacao)
  const st = String(fd.get("status_comercial") ?? l.status_comercial)
  const vBruto = String(fd.get("valor_venda") ?? "").replace(/\./g, "").replace(",", ".")
  const valor = vBruto === "" ? null : Number(vBruto)
  if (!QUALIFICACOES.includes(q as never) || !STATUS_COMERCIAL.includes(st as never)) return R(false, "Valores inválidos.")
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return R(false, "Valor de venda inválido.")
  const hist: { lead_id: string; campo: string; de: string | null; para: string | null; ator_id: string }[] = []
  if (q !== l.qualificacao) hist.push({ lead_id: id, campo: "qualificacao", de: l.qualificacao, para: q, ator_id: a.u.id })
  if (st !== l.status_comercial) hist.push({ lead_id: id, campo: "status_comercial", de: l.status_comercial, para: st, ator_id: a.u.id })
  if (valor !== (l.valor_venda === null ? null : Number(l.valor_venda))) hist.push({ lead_id: id, campo: "valor_venda", de: l.valor_venda?.toString() ?? null, para: valor?.toString() ?? null, ator_id: a.u.id })
  if (!hist.length) return R(true, "Nada mudou.")
  const { error } = await a.db.from("funil_leads").update({
    qualificacao: q, qualificacao_manual: q !== l.qualificacao ? true : undefined, status_comercial: st, valor_venda: valor, atualizado_em: new Date().toISOString(),
  }).eq("id", id)
  if (error) return R(false, "Não foi possível atualizar.")
  await a.db.from("funil_leads_historico").insert(hist)
  rev(f.slug)
  return R(true, "Lead atualizado e registrado no histórico.")
}

export async function reprocessarConversoesAction(fd: FormData): Promise<ResultadoReunioes> {
  const a = await admin(); if (!a) return R(false, "Sem permissão.")
  const f = await funilDoForm(a.db, fd); if (!f) return R(false, "Funil não encontrado.")
  // Recoloca itens com erro na fila (mesmo event_id — a Meta deduplica).
  await a.db.from("funil_conversoes").update({ status: "pendente", proxima_tentativa_em: new Date().toISOString(), tentativas: 0 })
    .eq("funil_id", f.id).eq("status", "erro")
  const r = await despacharConversoes({ limite: 25 })
  rev(f.slug)
  return R(true, `Fila processada: ${r.enviados} enviados, ${r.erros} com erro, ${r.ignorados} ignorados.`)
}
