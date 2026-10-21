// =============================================================================
// Guarda: arquivar/excluir tarefa que É uma reunião ativa do Cal.com.
// =============================================================================
//
// Por que existe (2026-10-21): uma reunião foi mandada pra lixeira do
// Workspace achando que isso a cancelava. Não cancela — a reserva continuava
// ativa no Cal.com (horário ocupado, participante esperando). Agora o
// Workspace recusa e aponta o caminho certo: "Cancelar reunião", que cancela
// nos dois sistemas.
//
// Reconhecimento ESTRUTURAL (vínculo em reunioes_agendamentos), nunca pelo
// título. Tarefa comum não tem vínculo → passa direto, comportamento de sempre.

import type { SupabaseClient } from "@supabase/supabase-js"

export const AVISO_TAREFA_REUNIAO =
  "Esta tarefa está vinculada a uma reunião ativa do Cal.com. Excluir ou arquivar só aqui deixaria a reserva " +
  "ativa no Cal.com. Use “Cancelar reunião” no detalhe da tarefa para cancelar nos dois sistemas."

/** true = a tarefa é a reunião ATIVA (solicitada/confirmada) de um booking. */
export async function tarefaEhReuniaoAtiva(db: SupabaseClient, tarefaId: string): Promise<boolean> {
  const { data, error } = await db
    .from("reunioes_agendamentos")
    .select("id")
    .eq("tarefa_id", tarefaId)
    .in("status", ["solicitada", "confirmada"])
    .limit(1)
  if (error) {
    // Sem a migration das Reuniões (ou falha momentânea): não trava a lixeira
    // das tarefas comuns por causa de uma integração opcional.
    console.error("[reunioes] guarda", error.message)
    return false
  }
  return (data ?? []).length > 0
}
