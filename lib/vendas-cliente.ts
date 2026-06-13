import { getSupabaseAdmin } from "./supabase"
import { COLUNAS_CLIENTE, type ClienteTrafego } from "./clientes"

// ============================================================
// Vendas informadas pelo CLIENTE (formulário público /vendas/<token>)
//
// Modelo em duas camadas:
//   • vendas_cliente = EVENTO append-only (auditoria: quem/quando/quanto).
//   • dados_diarios_log (modo origem) / dados_diarios_cliente (modo regex)
//     = SNAPSHOT do dia — contratos_real/faturamento_real são incrementados
//     a cada evento, então funil/ROI/histórico existentes refletem a venda
//     sem nenhuma mudança de leitura. O upsert do Sentinela só escreve os
//     campos do Meta e preserva esses dois.
//
// Leituras vivem aqui (módulo neutro, importado por Server Components);
// escritas em lib/vendas-cliente-actions.ts ("use server").
// ============================================================

export interface VendaCliente {
  id: string
  cliente_id: string
  empresa_nome: string
  cliente_nome: string
  data: string
  quantidade: number
  valor: number
  observacoes: string | null
  registrado_por: string
  created_at: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Resolve o cliente dono do token do formulário público. Token fora do
 *  formato uuid nem chega ao banco. Retorna null pra token desconhecido. */
export async function getClientePorVendasToken(
  token: string
): Promise<ClienteTrafego | null> {
  if (!UUID_RE.test(token)) return null
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("cliente_trafego")
    .select(COLUNAS_CLIENTE)
    .eq("vendas_form_token", token)
    .maybeSingle()
  if (error) {
    console.error("[vendas-cliente] getClientePorVendasToken error", error.message)
    return null
  }
  return (data ?? null) as ClienteTrafego | null
}

/** Eventos de venda do cliente no intervalo — alimenta a seção
 *  "Vendas informadas" do dashboard do cliente. */
export async function listarVendasDoCliente(
  clienteId: string,
  inicio: string,
  fim: string
): Promise<VendaCliente[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("vendas_cliente")
    .select(
      "id, cliente_id, empresa_nome, cliente_nome, data, quantidade, valor, observacoes, registrado_por, created_at"
    )
    .eq("cliente_id", clienteId)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[vendas-cliente] listarVendasDoCliente error", error.message)
    return []
  }
  return (data ?? []) as VendaCliente[]
}
