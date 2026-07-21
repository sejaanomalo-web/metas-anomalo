"use server"

// =============================================================================
// Workspace — decisões do mapeamento da importação. Admin apenas.
// =============================================================================
//
// Estas actions são o "martelo humano" que o plano exige antes da carga:
// nenhum projeto do Asana vira cliente sozinho, e nenhum usuário do Asana vira
// conta do sistema sozinho. O importador só classifica o que é inequívoco; o
// resto para aqui e espera decisão.
//
// Tudo é reversível: mudar de ideia é rodar a action de novo.

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"

export interface ResultadoMapeamento {
  ok: boolean
  erro?: string
}

const ROTA = "/dashboard/workspace/importar"

/** Mapeamento é ferramenta destrutiva o bastante (arquiva contexto, reatribui
 *  autoria de 1.588 tarefas) pra exigir admin de verdade, não só a permissão
 *  'workspace'. Mesmo critério de requererAdmin no resto do app. */
async function exigirAdmin(): Promise<{ ok: true } | { ok: false; erro: string }> {
  const usuario = await getUsuarioAtual()
  if (!usuario) return { ok: false, erro: "Sessão expirada." }
  if (usuario.papel !== "admin") {
    return { ok: false, erro: "Só um admin pode mexer no mapeamento." }
  }
  return { ok: true }
}

function ehUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

const TIPOS_VALIDOS = [
  "geral", "cliente", "empresa", "interno",
  "calendario_conteudo", "estudos", "arquivos", "aprovados", "desconhecido",
]

/**
 * Define o que um projeto do Asana é: pasta de cliente, contexto interno,
 * área especial, ou lixo pra descartar.
 *
 * cliente e cliente_id andam juntos por CHECK no banco — setar um sem o outro
 * é rejeitado, e isso é proposital: "é cliente" sem dizer qual cliente seria
 * uma pasta órfã.
 */
export async function decidirProjetoAction(
  formData: FormData
): Promise<ResultadoMapeamento> {
  const guard = await exigirAdmin()
  if (!guard.ok) return { ok: false, erro: guard.erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const contextoId = String(formData.get("contexto_id") ?? "").trim()
  if (!ehUuid(contextoId)) return { ok: false, erro: "Contexto inválido." }

  const tipo = String(formData.get("tipo") ?? "").trim()
  if (!TIPOS_VALIDOS.includes(tipo)) return { ok: false, erro: "Tipo inválido." }

  const clienteBruto = String(formData.get("cliente_id") ?? "").trim()
  const clienteId = ehUuid(clienteBruto) ? clienteBruto : null

  if (tipo === "cliente" && !clienteId) {
    return { ok: false, erro: "Escolha qual cliente." }
  }

  const { error } = await db
    .from("ws_contextos")
    .update({
      tipo,
      // Trocar de 'cliente' para outro tipo tem que limpar o vínculo, senão o
      // CHECK rejeita a linha inteira.
      cliente_id: tipo === "cliente" ? clienteId : null,
      arquivado_em: null,
    })
    .eq("id", contextoId)

  if (error) {
    // O índice único parcial (1 contexto ativo por cliente) bate aqui.
    if (error.code === "23505") {
      return { ok: false, erro: "Esse cliente já tem uma pasta. Junte as duas ou escolha outro." }
    }
    console.error("[import] decidirProjeto", error.message)
    return { ok: false, erro: "Não foi possível salvar." }
  }
  revalidatePath(ROTA)
  return { ok: true }
}

/**
 * Descarta um projeto: arquiva o contexto. As tarefas dele NÃO são apagadas —
 * elas continuam existindo e visíveis pelos outros contextos e pelo calendário.
 * Arquivar é sobre a pasta, nunca sobre o conteúdo.
 */
export async function descartarProjetoAction(
  formData: FormData
): Promise<ResultadoMapeamento> {
  const guard = await exigirAdmin()
  if (!guard.ok) return { ok: false, erro: guard.erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const contextoId = String(formData.get("contexto_id") ?? "").trim()
  if (!ehUuid(contextoId)) return { ok: false, erro: "Contexto inválido." }
  const desarquivar = String(formData.get("desarquivar") ?? "") === "1"

  const { error } = await db
    .from("ws_contextos")
    .update({
      arquivado_em: desarquivar ? null : new Date().toISOString(),
      ...(desarquivar ? {} : { cliente_id: null, tipo: "desconhecido" }),
    })
    .eq("id", contextoId)
  if (error) return { ok: false, erro: "Não foi possível arquivar." }
  revalidatePath(ROTA)
  return { ok: true }
}

/**
 * Liga uma identidade do Asana a uma conta do sistema — ou deixa explicitamente
 * como externa.
 *
 * Ligar propaga para as tarefas: responsável, criador, concluidor, seguidores e
 * autor de comentário deixam de apontar pra identidade externa e passam a
 * apontar pra conta real. Sem essa propagação, mapear depois da carga não
 * mudaria nada na tela.
 */
export async function decidirUsuarioAction(
  formData: FormData
): Promise<ResultadoMapeamento> {
  const guard = await exigirAdmin()
  if (!guard.ok) return { ok: false, erro: guard.erro }
  const db = getSupabaseAdmin()
  if (!db) return { ok: false, erro: "Supabase indisponível." }

  const admin = await getUsuarioAtual()
  const identidadeId = String(formData.get("identidade_id") ?? "").trim()
  if (!ehUuid(identidadeId)) return { ok: false, erro: "Identidade inválida." }

  const usuarioBruto = String(formData.get("usuario_id") ?? "").trim()
  const usuarioId = ehUuid(usuarioBruto) ? usuarioBruto : null

  const { error } = await db
    .from("ws_identidades_externas")
    .update({
      usuario_id: usuarioId,
      mapeado_em: usuarioId ? new Date().toISOString() : null,
      mapeado_por: usuarioId ? admin?.id ?? null : null,
    })
    .eq("id", identidadeId)
  if (error) {
    console.error("[import] decidirUsuario", error.message)
    return { ok: false, erro: "Não foi possível salvar." }
  }

  await propagarIdentidade(identidadeId, usuarioId)
  revalidatePath(ROTA)
  return { ok: true }
}

/**
 * Reescreve as referências de uma identidade externa nas tarefas já carregadas.
 * Chamada tanto ao ligar (externa → conta) quanto ao desligar (conta →
 * externa), pra tela nunca ficar contando uma história diferente do banco.
 */
async function propagarIdentidade(
  identidadeId: string,
  usuarioId: string | null
): Promise<void> {
  const db = getSupabaseAdmin()
  if (!db) return

  if (usuarioId) {
    // externa → conta real
    await db.from("ws_tarefas")
      .update({ responsavel_id: usuarioId, responsavel_externo_id: null })
      .eq("responsavel_externo_id", identidadeId)
    await db.from("ws_tarefas")
      .update({ criado_por: usuarioId, criado_por_externo_id: null })
      .eq("criado_por_externo_id", identidadeId)
    await db.from("ws_tarefas")
      .update({ concluida_por: usuarioId, concluida_por_externo_id: null })
      .eq("concluida_por_externo_id", identidadeId)
    await db.from("ws_comentarios")
      .update({ autor_id: usuarioId, autor_externo_id: null })
      .eq("autor_externo_id", identidadeId)

    // Seguidores mudam de tabela: lê os externos, insere nos internos
    // (ignorando duplicata) e só então remove os externos.
    const { data: segs } = await db
      .from("ws_seguidores_externos")
      .select("tarefa_id")
      .eq("identidade_externa_id", identidadeId)
    const linhas = ((segs ?? []) as { tarefa_id: string }[]).map((s) => ({
      tarefa_id: s.tarefa_id,
      usuario_id: usuarioId,
    }))
    if (linhas.length > 0) {
      await db.from("ws_seguidores").upsert(linhas, {
        onConflict: "tarefa_id,usuario_id",
        ignoreDuplicates: true,
      })
      await db.from("ws_seguidores_externos")
        .delete()
        .eq("identidade_externa_id", identidadeId)
    }
  } else {
    // conta → externa (desfazer). Só desfaz o que ESTA identidade tinha
    // reivindicado; não mexe em atribuição feita à mão dentro do sistema.
    const { data: ident } = await db
      .from("ws_identidades_externas")
      .select("usuario_id")
      .eq("id", identidadeId)
      .maybeSingle()
    const anterior = (ident as { usuario_id: string | null } | null)?.usuario_id
    if (!anterior) return
    await db.from("ws_tarefas")
      .update({ responsavel_id: null, responsavel_externo_id: identidadeId })
      .eq("responsavel_id", anterior)
      .not("source_gid", "is", null)
  }
}

/** Contagens da tela: quanto ainda falta decidir. */
export async function contarPendenciasMapeamento(): Promise<{
  projetosPendentes: number
  usuariosPendentes: number
}> {
  const db = getSupabaseAdmin()
  if (!db) return { projetosPendentes: 0, usuariosPendentes: 0 }
  const [{ count: p }, { count: u }] = await Promise.all([
    db.from("ws_contextos").select("*", { count: "exact", head: true })
      .eq("tipo", "desconhecido").is("arquivado_em", null),
    db.from("ws_identidades_externas").select("*", { count: "exact", head: true })
      .is("usuario_id", null),
  ])
  return { projetosPendentes: p ?? 0, usuariosPendentes: u ?? 0 }
}
