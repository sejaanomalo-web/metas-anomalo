"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "./supabase"
import { getUsuarioAtual } from "./auth"
import { clienteDisplayName, type ClienteTrafego } from "./clientes"
import { getClientePorVendasToken, type VendaCliente } from "./vendas-cliente"
import { criarNotificacao } from "./notificacoes"
import { parseNumeroForm } from "./parse-numero"

export interface ResultadoVenda {
  ok: boolean
  erro?: string
}

/** Aparece na coluna "Fonte" do histórico diário quando a venda cria a
 *  linha do dia (dia sem execução do Sentinela ainda). */
const PREENCHEDOR_VENDAS = "Formulário de vendas (cliente)"

const MAX_QUANTIDADE = 999
const MAX_VALOR = 50_000_000
const MAX_OBSERVACOES = 600

/** Data atual em BRT (UTC-3 sem DST) no formato YYYY-MM-DD. */
function hojeBRT(): string {
  const agora = new Date()
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000
  return new Date(utcMs - 3 * 60 * 60_000).toISOString().slice(0, 10)
}

function formatarDataBR(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

type ClienteAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>

/**
 * Soma `base + delta` com piso 0. Em compensação (delta negativo) o piso pode
 * "comer" parte da subtração se a base já estiver menor que |delta| — situação
 * que indica divergência entre o snapshot e a soma dos eventos (ex.: a linha do
 * dia foi editada à mão em Configurações). Em vez de descartar em silêncio,
 * loga um aviso pra ficar auditável; o valor segue travado em 0.
 */
function clampSoma(
  base: number | null | undefined,
  delta: number,
  campo: string,
  ctx: string
): number {
  const bruto = Number(base ?? 0) + delta
  if (bruto < 0) {
    console.warn(
      `[vendas-cliente] ${campo} ficaria negativo em ${ctx} ` +
        `(base=${Number(base ?? 0)}, delta=${delta}); travado em 0 — ` +
        `snapshot pode divergir da soma dos eventos de vendas_cliente.`
    )
  }
  return Math.max(0, bruto)
}

/**
 * Aplica o delta em UMA tabela de snapshot de forma resiliente a corrida:
 * SELECT → UPDATE (se a linha existe) ou INSERT (se não). Se o INSERT colidir
 * com a UNIQUE(empresa[/cliente],data,origem) — outra submissão ou o upsert do
 * Sentinela criou a linha entre o SELECT e o INSERT — relê e faz UPDATE em vez
 * de falhar, pra que uma venda legítima NUNCA seja descartada por concorrência.
 */
async function aplicarDelta(
  supabase: ClienteAdmin,
  tabela: "dados_diarios_log" | "dados_diarios_cliente",
  filtros: Record<string, string>,
  novaLinha: Record<string, unknown>,
  deltaQuantidade: number,
  deltaValor: number,
  ctx: string
): Promise<ResultadoVenda> {
  async function selecionar() {
    let q = supabase
      .from(tabela)
      .select("id, contratos_real, faturamento_real")
    for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v)
    return q.maybeSingle()
  }

  async function atualizar(row: {
    id: string
    contratos_real: number | null
    faturamento_real: number | null
  }): Promise<ResultadoVenda> {
    const { error } = await supabase
      .from(tabela)
      .update({
        contratos_real: clampSoma(
          row.contratos_real,
          deltaQuantidade,
          "contratos_real",
          ctx
        ),
        faturamento_real: clampSoma(
          row.faturamento_real,
          deltaValor,
          "faturamento_real",
          ctx
        ),
      })
      .eq("id", row.id)
    return error ? { ok: false, erro: error.message } : { ok: true }
  }

  const { data: row, error: erroSel } = await selecionar()
  if (erroSel) return { ok: false, erro: erroSel.message }
  if (row) return atualizar(row)

  // Linha do dia ainda não existe → INSERT (delta negativo sem linha vira 0).
  const { error: erroIns } = await supabase.from(tabela).insert({
    ...novaLinha,
    contratos_real: clampSoma(0, deltaQuantidade, "contratos_real", ctx),
    faturamento_real: clampSoma(0, deltaValor, "faturamento_real", ctx),
  })
  if (!erroIns) return { ok: true }

  // Corrida na criação da linha (UNIQUE violada): relê e soma no UPDATE.
  if ((erroIns as { code?: string }).code === "23505") {
    const { data: row2, error: erroSel2 } = await selecionar()
    if (erroSel2) return { ok: false, erro: erroSel2.message }
    if (row2) return atualizar(row2)
  }
  return { ok: false, erro: erroIns.message }
}

/**
 * Soma `quantidade`/`valor` no SNAPSHOT do dia do cliente (delta pode ser
 * negativo, na exclusão — resultado nunca desce de 0):
 *   • modo origem → dados_diarios_log[empresa=empresa_origem_nome]
 *   • modo regex  → dados_diarios_cliente[empresa_nome, cliente_nome]
 *   • placeholder → no-op (só o evento em vendas_cliente registra)
 * Toca APENAS contratos_real/faturamento_real — campos do Sentinela ficam
 * intactos, e o upsert do Sentinela também não escreve esses dois.
 */
async function somarNoSnapshotDia(
  cliente: ClienteTrafego,
  dataISO: string,
  deltaQuantidade: number,
  deltaValor: number
): Promise<ResultadoVenda> {
  if (deltaQuantidade === 0 && deltaValor === 0) return { ok: true }
  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  if (cliente.empresa_origem_nome) {
    return aplicarDelta(
      supabase,
      "dados_diarios_log",
      { empresa: cliente.empresa_origem_nome, data: dataISO, origem: "pago" },
      {
        empresa: cliente.empresa_origem_nome,
        data: dataISO,
        origem: "pago",
        preenchedor_nome: PREENCHEDOR_VENDAS,
      },
      deltaQuantidade,
      deltaValor,
      `${cliente.empresa_origem_nome} ${dataISO}`
    )
  }

  if (cliente.campaign_filter) {
    return aplicarDelta(
      supabase,
      "dados_diarios_cliente",
      {
        empresa_nome: cliente.empresa_nome,
        cliente_nome: cliente.nome,
        data: dataISO,
        origem: "pago",
      },
      {
        empresa_nome: cliente.empresa_nome,
        cliente_nome: cliente.nome,
        data: dataISO,
        origem: "pago",
      },
      deltaQuantidade,
      deltaValor,
      `${cliente.empresa_nome}/${cliente.nome} ${dataISO}`
    )
  }

  // Placeholder (sem modo configurado): nada pra incrementar.
  return { ok: true }
}

/**
 * Action PÚBLICA do formulário /vendas/<token>. Sem auth — a segurança é o
 * token (uuid aleatório, 1 por cliente). Tudo revalidado no servidor:
 * token, data, limites de quantidade/valor.
 *
 * quantidade=0 → "não tivemos vendas": registra só o evento de confirmação
 * (auditável e notificado), sem tocar o snapshot do dia.
 */
export async function registrarVendaClienteAction(
  formData: FormData
): Promise<ResultadoVenda> {
  const token = String(formData.get("token") ?? "").trim()
  const cliente = await getClientePorVendasToken(token)
  // Alinha com a página /vendas/[token] (que só renderiza o form se ativo):
  // fecha a janela de um POST direto contra um cliente já desativado.
  if (!cliente || !cliente.ativo) {
    return { ok: false, erro: "Link inválido ou desativado." }
  }

  const dataISO = String(formData.get("data") ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    return { ok: false, erro: "Data inválida." }
  }
  const hoje = hojeBRT()
  if (dataISO > hoje) {
    return { ok: false, erro: "A data não pode estar no futuro." }
  }
  if (dataISO < "2025-01-01") {
    return { ok: false, erro: "Data muito antiga — confira o ano." }
  }

  const qtdRaw = String(formData.get("quantidade") ?? "").trim()
  const quantidade = qtdRaw === "" ? NaN : parseInt(qtdRaw, 10)
  if (!Number.isFinite(quantidade) || quantidade < 0) {
    return { ok: false, erro: "Informe a quantidade de vendas." }
  }
  if (quantidade > MAX_QUANTIDADE) {
    return { ok: false, erro: `Quantidade máxima: ${MAX_QUANTIDADE}.` }
  }

  const valorParsed = parseNumeroForm(formData.get("valor"))
  if (valorParsed.erro) {
    return { ok: false, erro: `Valor: ${valorParsed.erro}` }
  }
  const valor = valorParsed.value ?? 0
  if (valor < 0 || valor > MAX_VALOR) {
    return { ok: false, erro: "Valor fora do intervalo aceito." }
  }

  const observacoes =
    String(formData.get("observacoes") ?? "")
      .trim()
      .slice(0, MAX_OBSERVACOES) || null

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  // 1. Evento append-only (fonte de auditoria).
  const { data: evento, error: erroEvento } = await supabase
    .from("vendas_cliente")
    .insert({
      cliente_id: cliente.id,
      empresa_nome: cliente.empresa_nome,
      cliente_nome: cliente.nome,
      data: dataISO,
      quantidade,
      valor,
      observacoes,
      registrado_por: "formulario_cliente",
    })
    .select("id")
    .single()
  if (erroEvento || !evento) {
    console.error("[vendas-cliente] insert evento error", erroEvento?.message)
    return { ok: false, erro: "Não consegui salvar. Tente novamente." }
  }

  // 2. Incrementa o snapshot do dia. Falhou → desfaz o evento (consistência).
  const snapshot = await somarNoSnapshotDia(cliente, dataISO, quantidade, valor)
  if (!snapshot.ok) {
    await supabase.from("vendas_cliente").delete().eq("id", evento.id)
    console.error("[vendas-cliente] snapshot error", snapshot.erro)
    return { ok: false, erro: "Não consegui salvar. Tente novamente." }
  }

  // 3. Notifica o time (tipo nova_venda já existe nas preferências/push).
  const nome = clienteDisplayName(cliente)
  const dataBR = formatarDataBR(dataISO)
  const valorBR = valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
  await criarNotificacao({
    tipo: "nova_venda",
    empresa: cliente.empresa_nome,
    titulo:
      quantidade > 0 ? `💰 Venda · ${nome}` : `Sem vendas · ${nome}`,
    mensagem:
      quantidade > 0
        ? `${nome} informou ${quantidade} venda${quantidade > 1 ? "s" : ""}${
            valor > 0 ? ` (${valorBR})` : ""
          } em ${dataBR}.`
        : `${nome} confirmou que não houve vendas em ${dataBR}.`,
    payload: {
      cliente: cliente.nome,
      empresa: cliente.empresa_nome,
      data: dataISO,
      quantidade,
      valor,
    },
  })

  revalidatePath("/dashboard", "layout")
  return { ok: true }
}

/**
 * Exclusão de um evento (correção de lançamento errado) — SÓ admin.
 * Compensa o snapshot do dia subtraindo o que o evento tinha somado.
 */
export async function excluirVendaClienteAction(
  formData: FormData
): Promise<ResultadoVenda> {
  const usuario = await getUsuarioAtual()
  if (!usuario || usuario.papel !== "admin") {
    return { ok: false, erro: "Apenas admins podem remover registros." }
  }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, erro: "Registro inválido." }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { ok: false, erro: "Supabase indisponível." }

  const { data: eventoRow, error: erroSel } = await supabase
    .from("vendas_cliente")
    .select(
      "id, cliente_id, empresa_nome, cliente_nome, data, quantidade, valor, observacoes, registrado_por, created_at"
    )
    .eq("id", id)
    .maybeSingle()
  if (erroSel || !eventoRow) {
    return { ok: false, erro: "Registro não encontrado." }
  }
  const evento = eventoRow as VendaCliente

  const { data: clienteRow } = await supabase
    .from("cliente_trafego")
    .select("id, empresa_nome, nome, empresa_origem_nome, campaign_filter")
    .eq("id", evento.cliente_id)
    .maybeSingle()

  const { error: erroDelete } = await supabase
    .from("vendas_cliente")
    .delete()
    .eq("id", evento.id)
  if (erroDelete) return { ok: false, erro: erroDelete.message }

  if (clienteRow) {
    const compensa = await somarNoSnapshotDia(
      clienteRow as ClienteTrafego,
      evento.data,
      -Number(evento.quantidade ?? 0),
      -Number(evento.valor ?? 0)
    )
    if (!compensa.ok) {
      // Restaura o evento pra não perder o registro de auditoria.
      await supabase.from("vendas_cliente").insert(evento)
      return { ok: false, erro: "Falha ao ajustar o dia. Nada foi removido." }
    }
  }

  revalidatePath("/dashboard", "layout")
  return { ok: true }
}
