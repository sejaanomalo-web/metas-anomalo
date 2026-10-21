// =============================================================================
// Reuniões — RepoReunioes sobre o Supabase (service_role). Só servidor.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  AgendamentoGravado,
  LinhaAgendamento,
  RepoReunioes,
  TarefaLida,
  TipoParaProcessar,
} from "./reunioes-processar"
import type { StatusReuniao } from "./reunioes-nucleo"

const COLUNAS_AGEND =
  "id, booking_uid, status, tarefa_id, ultimo_evento_em, inicio, fim, link_reuniao, local_rotulo, " +
  "tipo_id, responsavel_id, participante_nome, participante_email, participante_telefone, descricao_gerada"

const COLUNAS_TIPO = "id, nome, campanha_rotulo, origem_comercial, responsavel_id, contexto_id"

function ehUnico(err: { code?: string; message?: string } | null): boolean {
  return Boolean(err && (err.code === "23505" || /duplicate|unique/i.test(err.message ?? "")))
}

export function repoSupabase(db: SupabaseClient): RepoReunioes {
  return {
    async buscarAgendamento(uid) {
      const { data, error } = await db
        .from("reunioes_agendamentos")
        .select(COLUNAS_AGEND)
        .eq("provedor", "calcom")
        .eq("booking_uid", uid)
        .maybeSingle()
      if (error) throw new Error(`buscarAgendamento: ${error.message}`)
      return (data as unknown as AgendamentoGravado) ?? null
    },

    async inserirAgendamento(linha: LinhaAgendamento) {
      const { error } = await db.from("reunioes_agendamentos").insert({ provedor: "calcom", ...linha })
      if (ehUnico(error)) return "conflito"
      if (error) throw new Error(`inserirAgendamento: ${error.message}`)
      return "ok"
    },

    async atualizarAgendamento(uid, patch, statusEsperado: StatusReuniao) {
      const { data, error } = await db
        .from("reunioes_agendamentos")
        .update(patch)
        .eq("provedor", "calcom")
        .eq("booking_uid", uid)
        .eq("status", statusEsperado)
        .select("id")
      if (error) throw new Error(`atualizarAgendamento: ${error.message}`)
      return (data ?? []).length > 0
    },

    async tipoPorEventType(eventTypeId) {
      const { data } = await db.from("reunioes_tipos").select(COLUNAS_TIPO).eq("calcom_event_type_id", eventTypeId).maybeSingle()
      return (data as TipoParaProcessar | null) ?? null
    },

    async tipoPorId(id) {
      const { data } = await db.from("reunioes_tipos").select(COLUNAS_TIPO).eq("id", id).maybeSingle()
      return (data as TipoParaProcessar | null) ?? null
    },

    async usuarioPorEmail(email) {
      const { data } = await db
        .from("usuarios")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("ativo", true)
        .maybeSingle()
      return (data?.id as string | undefined) ?? null
    },

    async usuarioAtivo(id) {
      const { data } = await db.from("usuarios").select("id").eq("id", id).eq("ativo", true).maybeSingle()
      return Boolean(data)
    },

    async criarTarefa(t) {
      const { data, error } = await db
        .from("ws_tarefas")
        .insert({
          titulo: t.titulo,
          descricao: t.descricao,
          prazo_em: t.prazo_em,
          prazo_hora: t.prazo_hora,
          prioridade: "normal",
          // criado_por nulo = criada pelo sistema (o webhook não tem sessão).
          criado_por: null,
          // Chave estável do booking. O índice único parcial
          // ws_tarefas_source_gid_unico impede a 2ª tarefa do mesmo booking.
          source_gid: t.chave,
        })
        .select("id")
        .single()
      let id = data?.id as string | undefined
      if (!id) {
        if (!ehUnico(error)) throw new Error(`criarTarefa: ${error?.message ?? "sem id"}`)
        const { data: existente } = await db.from("ws_tarefas").select("id").eq("source_gid", t.chave).maybeSingle()
        if (!existente) throw new Error("criarTarefa: colisão sem tarefa existente")
        return existente.id as string
      }

      // Responsável pelo caminho oficial (ws_tarefa_responsaveis); o trigger
      // do banco espelha o principal em ws_tarefas.responsavel_id.
      if (t.responsavelId) {
        await db.from("ws_tarefa_responsaveis").upsert(
          { tarefa_id: id, usuario_id: t.responsavelId, ordem: 0 },
          { onConflict: "tarefa_id,usuario_id", ignoreDuplicates: true }
        )
        await db.from("ws_seguidores").upsert(
          { tarefa_id: id, usuario_id: t.responsavelId },
          { onConflict: "tarefa_id,usuario_id", ignoreDuplicates: true }
        )
      }
      if (t.contextoId) {
        await db.from("ws_tarefa_contextos").upsert(
          { tarefa_id: id, contexto_id: t.contextoId },
          { onConflict: "tarefa_id,contexto_id", ignoreDuplicates: true }
        )
      }
      return id
    },

    async lerTarefa(id) {
      const { data } = await db
        .from("ws_tarefas")
        .select("descricao, arquivada_em, concluida_em, versao")
        .eq("id", id)
        .is("excluida_em", null)
        .maybeSingle()
      return (data as TarefaLida | null) ?? null
    },

    async atualizarTarefa(id, patch) {
      const { error } = await db.from("ws_tarefas").update(patch).eq("id", id)
      if (error) throw new Error(`atualizarTarefa: ${error.message}`)
    },

    async registrarAtividade(tarefaId, evento, mudanca) {
      const { error } = await db.from("ws_atividade").insert({ tarefa_id: tarefaId, ator_id: null, evento, mudanca })
      if (error) console.error("[reunioes] atividade", error.message)
    },

    async ping(tarefaId) {
      await db.from("ws_realtime_ping").insert({ tarefa_id: tarefaId, kind: "tarefa" })
    },

    async notificar(usuarioIds, titulo, mensagem, tarefaId) {
      try {
        // Import sob demanda: notificacoes puxa a camada de auth (React
        // cache), que não existe fora do Next — e o webhook só precisa dela
        // quando há alguém pra avisar.
        const { criarNotificacao } = await import("./notificacoes")
        await criarNotificacao({
          tipo: "ws_tarefa",
          titulo,
          mensagem,
          payload: { tarefa_id: tarefaId, url: `/dashboard/workspace/calendario?tarefa=${tarefaId}` },
          usuarioIds,
        })
      } catch (e) {
        console.error("[reunioes] notificar", e instanceof Error ? e.message : e)
      }
    },

    async log(nivel, acao, mensagem, detalhes) {
      await db.from("reunioes_sync_log").insert({ nivel, acao, mensagem: mensagem.slice(0, 1000), detalhes: detalhes ?? null })
    },
  }
}
