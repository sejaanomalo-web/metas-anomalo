"use server"

import { revalidatePath } from "next/cache"
import {
  type DadosReais,
  getSupabase,
  supabaseConfigurado,
} from "./supabase"
import {
  ANO_PADRAO,
  ORIGEM_PADRAO,
  type EmpresaDb,
  type Mes,
  MESES,
  type OrigemDadosReais,
  empresas,
  getEmpresaPorDb,
  origemValida,
} from "./data"

export interface DadosReaisPorOrigem {
  pago: DadosReais | null
  organico: DadosReais | null
}

/**
 * Parser numérico tolerante a formatos PT-BR e US, com rejeição de
 * entradas ambíguas. Retorna `{ value, erro }`:
 *
 *   - vazio (`null`/`""`)                → { value: null, erro: null }
 *   - "222,75"                           → 222.75 (BR vírgula decimal)
 *   - "1.234,56"                         → 1234.56 (BR ponto milhar)
 *   - "1,234.56"                         → 1234.56 (US ponto decimal)
 *   - "22,5" / "22.5" / "1.50"           → decimais óbvios
 *   - "1.234.567"                        → 1234567 (milhares só-ponto)
 *   - "22.275" (sem vírgula, ponto + 3)  → null + erro (AMBÍGUO)
 *
 * Heurística do passo 6: ponto seguido de exatamente 3 dígitos sem
 * vírgula no input é ambíguo (pode ser milhar BR ou decimal extremo).
 * O `replace(/\./g, "")` legado interpretava silenciosamente como
 * milhar, criando entradas fantasma (ex.: "22.275" → 22275 em vez do
 * 22,275 pretendido). Aqui rejeita explicitamente.
 */
export function parseNumeroForm(v: FormDataEntryValue | null): {
  value: number | null
  erro: string | null
} {
  if (v === null) return { value: null, erro: null }
  const raw = String(v).trim()
  if (raw === "") return { value: null, erro: null }
  if (!/^-?[0-9.,]+$/.test(raw)) {
    return { value: null, erro: `Número inválido: "${raw}".` }
  }
  const sinal = raw.startsWith("-") ? -1 : 1
  const corpo = raw.replace(/^-/, "")
  const temVirgula = corpo.includes(",")
  const temPonto = corpo.includes(".")

  const erroAmbiguo = (orig: string) =>
    `Número ambíguo: "${orig}". Para milhar use ponto (1.234) só com 4+ dígitos; para decimal use vírgula (22,275).`

  let normalizado: string

  if (!temVirgula && !temPonto) {
    normalizado = corpo
  } else if (temVirgula && !temPonto) {
    // Só vírgulas.
    const grupos = corpo.split(",")
    if (grupos.length === 2) {
      const [a, b] = grupos
      if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      normalizado = a + "." + b
    } else {
      // Múltiplas vírgulas — só vale como separador de milhar (todos os
      // grupos após o primeiro devem ter 3 dígitos).
      const primeiroOk = /^[0-9]{1,3}$/.test(grupos[0])
      const demaisOk = grupos.slice(1).every((g) => /^[0-9]{3}$/.test(g))
      if (primeiroOk && demaisOk) {
        normalizado = grupos.join("")
      } else {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
    }
  } else if (temPonto && !temVirgula) {
    // Só pontos.
    const grupos = corpo.split(".")
    if (grupos.length === 2) {
      const [a, b] = grupos
      if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      if (b.length <= 2) {
        // Decimal: "22.5" / "22.27" / "1.5".
        normalizado = a + "." + b
      } else if (b.length === 3) {
        // Ambíguo: pode ser milhar (1234) ou decimal extremo (1.234).
        return { value: null, erro: erroAmbiguo(raw) }
      } else {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
    } else {
      // Múltiplos pontos: só vale como milhar.
      const primeiroOk = /^[0-9]{1,3}$/.test(grupos[0])
      const demaisOk = grupos.slice(1).every((g) => /^[0-9]{3}$/.test(g))
      if (primeiroOk && demaisOk) {
        normalizado = grupos.join("")
      } else {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
    }
  } else {
    // Tem vírgula E ponto. O separador à direita é decimal; o à
    // esquerda é milhar (mas precisa ter exatamente 1 do tipo decimal).
    const idxV = corpo.lastIndexOf(",")
    const idxP = corpo.lastIndexOf(".")
    if (idxV > idxP) {
      // BR: pontos = milhar, vírgula = decimal.
      const semPontos = corpo.replace(/\./g, "")
      const partes = semPontos.split(",")
      if (partes.length !== 2) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      const [a, b] = partes
      if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      normalizado = a + "." + b
    } else {
      // US: vírgulas = milhar, ponto = decimal.
      const semVirgulas = corpo.replace(/,/g, "")
      const partes = semVirgulas.split(".")
      if (partes.length !== 2) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      const [a, b] = partes
      if (!/^[0-9]+$/.test(a) || !/^[0-9]+$/.test(b)) {
        return { value: null, erro: `Número inválido: "${raw}".` }
      }
      normalizado = a + "." + b
    }
  }

  const n = Number(normalizado)
  if (!Number.isFinite(n)) {
    return { value: null, erro: `Número inválido: "${raw}".` }
  }
  return { value: sinal * n, erro: null }
}

/** Mantido por callsites legados que só querem o valor (vazio/inválido
 *  → null silencioso). NÃO use em validação de formulário — use
 *  parseNumeroForm para distinguir vazio de inválido/ambíguo. */
function parseNumero(v: FormDataEntryValue | null): number | null {
  return parseNumeroForm(v).value
}

function parseInt0(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim()
  if (s === "") return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function empresaValida(empresa: string): empresa is EmpresaDb {
  // Aceita qualquer identificador válido — empresas criadas via UI não
  // estão na lista hardcoded `empresas`.
  return /^[a-z0-9_-]+$/i.test(empresa) && empresa.length > 0
}

function mesValido(mes: string): mes is Mes {
  return (MESES as readonly string[]).includes(mes)
}

export interface IdentidadeEscrita {
  id: string | null
  nome: string
}

/** Resolve nome canônico da empresa a partir do db slug. Hardcoded
 *  lookup primeiro (O(1)); fallback em empresas_config pra empresas
 *  adicionadas via UI (IBB, Mãe Divina Yoga, etc.). Último fallback:
 *  retorna o próprio slug. */
async function resolverNomeEmpresa(empresaDb: string): Promise<string> {
  const local = getEmpresaPorDb(empresaDb)
  if (local) return local.nome
  const supabase = getSupabase()
  if (supabase) {
    const { data } = await supabase
      .from("empresas_config")
      .select("nome")
      .eq("db", empresaDb)
      .maybeSingle()
    if (data?.nome) return String(data.nome)
  }
  return empresaDb
}

/**
 * Helper único de escrita em dados_reais (estado mensal) +
 * dados_diarios_log (trilha diária). Garante consistência lógica
 * entre os dois universos:
 *
 *   1. Resolve empresa.nome a partir do slug (Sentinela usa o nome
 *      canônico em dados_diarios_log.empresa; aqui também usamos pra
 *      unificar com o agente — antes era slug, gerava 2 universos).
 *   2. Lê o estado anterior em dados_reais (pra _anterior do log).
 *   3. Lê linha existente em dados_diarios_log do mesmo dia.
 *   4. Se NÃO existe → INSERT completo (todos os campos).
 *      Se EXISTE   → UPDATE SELETIVO: só campos manuais e identidade.
 *      investimento_real / leads_real / cpl_real / cpa_real são
 *      PRESERVADOS — Sentinela é fonte da verdade desses. Override
 *      manual desses 3 campos precisa de caminho dedicado (não MVP).
 *   5. Upsert em dados_reais.
 *   6. Rollback do passo 4 se passo 5 falhar (DELETE se era INSERT,
 *      UPDATE de volta pros valores antigos se era UPDATE).
 *
 * UNIQUE (empresa, data, origem) em dados_diarios_log torna o INSERT
 * cego inviável depois que o agente Sentinela já gravou no mesmo dia —
 * por isso o select + INSERT/UPDATE separados.
 *
 * Toda escrita em dados_reais que vier do app deve passar por aqui.
 */
export async function gravarDadosReaisComLog(
  payload: DadosReais,
  identidade: IdentidadeEscrita,
  opcoes: { dataISO?: string } = {}
): Promise<{ ok: boolean; erro?: string; anterior: DadosReais | null }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, erro: "Supabase indisponível.", anterior: null }
  }

  const empresaNome = await resolverNomeEmpresa(payload.empresa)
  const origem = payload.origem ?? ORIGEM_PADRAO
  // dataISO opcional — formulário público permite escolher uma data
  // específica (passado, hoje, futuro). Se omitido, default = hoje BRT.
  // Aceita só formato YYYY-MM-DD; qualquer outra coisa cai pro default.
  const dataISO = /^\d{4}-\d{2}-\d{2}$/.test(opcoes.dataISO ?? "")
    ? (opcoes.dataISO as string)
    : new Date().toISOString().slice(0, 10)

  // 1. Estado anterior de dados_reais (pros campos _anterior do log).
  const { data: anteriorRow } = await supabase
    .from("dados_reais")
    .select("*")
    .eq("empresa", payload.empresa)
    .eq("mes", payload.mes)
    .eq("ano", payload.ano)
    .eq("origem", origem)
    .maybeSingle()
  const anterior = (anteriorRow ?? null) as DadosReais | null

  // 2. Linha existente em dados_diarios_log do mesmo dia (pra UPSERT
  // seletivo). Filtra por empresa.nome (que é o que o Sentinela usa).
  const { data: logExistenteRow } = await supabase
    .from("dados_diarios_log")
    .select(
      "id, preenchedor_id, preenchedor_nome, reunioes_real, contratos_real, faturamento_real, criativos_entregues, clientes_ativos, observacoes, criativos_usados, criativos_detalhe, respostas, publicos_prospectados"
    )
    .eq("empresa", empresaNome)
    .eq("data", dataISO)
    .eq("origem", origem)
    .maybeSingle()
  const logExistente = logExistenteRow as null | {
    id: string
    preenchedor_id: string | null
    preenchedor_nome: string | null
    reunioes_real: number | null
    contratos_real: number | null
    faturamento_real: number | null
    criativos_entregues: number | null
    clientes_ativos: number | null
    observacoes: string | null
    criativos_usados: number | null
    criativos_detalhe: unknown
    respostas: number | null
    publicos_prospectados: unknown
  }

  // Campos que o gestor/SDR controla — entram no UPDATE seletivo. Os
  // campos do Sentinela (investimento_real, leads_real, cpl_real,
  // cpa_real) ficam de fora pra não serem sobrescritos por null.
  const camposManuais = {
    preenchedor_id: identidade.id,
    preenchedor_nome: identidade.nome,
    reunioes_real: payload.reunioes_real,
    contratos_real: payload.contratos_real,
    faturamento_real: payload.faturamento_real,
    criativos_entregues: payload.criativos_entregues,
    clientes_ativos: payload.clientes_ativos,
    observacoes: payload.observacoes,
    criativos_usados: payload.criativos_usados ?? null,
    criativos_detalhe: payload.criativos_detalhe ?? null,
    respostas: payload.respostas ?? null,
    publicos_prospectados: payload.publicos_prospectados ?? null,
  }

  if (logExistente) {
    // UPDATE seletivo. investimento/leads/cpl/cpa do Sentinela ficam.
    const { error } = await supabase
      .from("dados_diarios_log")
      .update(camposManuais)
      .eq("id", logExistente.id)
    if (error) {
      console.error("[dados_diarios_log] update error", error.message)
      return { ok: false, erro: error.message, anterior }
    }
  } else {
    // INSERT completo. Inclui campos do Sentinela vindos do payload
    // (formulário do gestor de tráfego — quando o agente ainda não
    // rodou no dia ou esta empresa não tem token).
    const logCompleto = {
      empresa: empresaNome,
      data: dataISO,
      origem,
      investimento_real: payload.investimento_real,
      leads_real: payload.leads_real,
      cpl_real: payload.cpl_real,
      cpa_real: payload.cpa_real ?? null,
      investimento_anterior: anterior?.investimento_real ?? null,
      leads_anterior: anterior?.leads_real ?? null,
      reunioes_anterior: anterior?.reunioes_real ?? null,
      contratos_anterior: anterior?.contratos_real ?? null,
      faturamento_anterior: anterior?.faturamento_real ?? null,
      criativos_anterior: anterior?.criativos_entregues ?? null,
      cpl_anterior: anterior?.cpl_real ?? null,
      cpa_anterior: anterior?.cpa_real ?? null,
      criativos_usados_anterior: anterior?.criativos_usados ?? null,
      criativos_detalhe_anterior: anterior?.criativos_detalhe ?? null,
      respostas_anterior: anterior?.respostas ?? null,
      publicos_prospectados_anterior:
        anterior?.publicos_prospectados ?? null,
      ...camposManuais,
    }
    const { error } = await supabase
      .from("dados_diarios_log")
      .insert(logCompleto)
    if (error) {
      console.error("[dados_diarios_log] insert error", error.message)
      return { ok: false, erro: error.message, anterior }
    }
  }

  // 3. Upsert em dados_reais.
  const { error: erroUpsert } = await supabase
    .from("dados_reais")
    .upsert(payload, { onConflict: "empresa,mes,ano,origem" })
  if (erroUpsert) {
    console.error("[dados_reais] upsert error", erroUpsert.message)
    // Rollback compensador do log:
    //  • Se era UPDATE → reverte campos manuais ao estado anterior.
    //  • Se era INSERT → deleta a linha recém-criada.
    if (logExistente) {
      await supabase
        .from("dados_diarios_log")
        .update({
          preenchedor_id: logExistente.preenchedor_id,
          preenchedor_nome: logExistente.preenchedor_nome,
          reunioes_real: logExistente.reunioes_real,
          contratos_real: logExistente.contratos_real,
          faturamento_real: logExistente.faturamento_real,
          criativos_entregues: logExistente.criativos_entregues,
          clientes_ativos: logExistente.clientes_ativos,
          observacoes: logExistente.observacoes,
          criativos_usados: logExistente.criativos_usados,
          criativos_detalhe: logExistente.criativos_detalhe,
          respostas: logExistente.respostas,
          publicos_prospectados: logExistente.publicos_prospectados,
        })
        .eq("id", logExistente.id)
    } else {
      await supabase
        .from("dados_diarios_log")
        .delete()
        .eq("empresa", empresaNome)
        .eq("data", dataISO)
        .eq("origem", origem)
        .gte("created_at", new Date(Date.now() - 5000).toISOString())
    }
    return { ok: false, erro: erroUpsert.message, anterior }
  }

  return { ok: true, anterior }
}

/**
 * @deprecated Use `getResumoAnualDaEmpresa` de `lib/sentinela`.
 * dados_reais virou write-only-legacy: leituras devem sair de
 * dados_diarios_log (fonte do Sentinela e do dashboard).
 */
export async function getDadosReais(
  empresa: EmpresaDb,
  ano: number = ANO_PADRAO,
  origem: OrigemDadosReais = ORIGEM_PADRAO
): Promise<DadosReais[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from("dados_reais")
    .select("*")
    .eq("empresa", empresa)
    .eq("ano", ano)
    .eq("origem", origem)
  if (error) {
    console.error("[dados_reais] get error", error.message)
    return []
  }
  return (data ?? []) as DadosReais[]
}

/**
 * @deprecated Use `getResumoMensalDaEmpresa` de `lib/sentinela` (+
 * `resumoComoDadosReais` se precisar do shape DadosReais).
 */
export async function getDadosReaisMes(
  empresa: EmpresaDb,
  mes: Mes,
  ano: number = ANO_PADRAO,
  origem: OrigemDadosReais = ORIGEM_PADRAO
): Promise<DadosReais | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("dados_reais")
    .select("*")
    .eq("empresa", empresa)
    .eq("ano", ano)
    .eq("mes", mes)
    .eq("origem", origem)
    .maybeSingle()
  if (error) {
    console.error("[dados_reais] getMes error", error.message)
    return null
  }
  return (data ?? null) as DadosReais | null
}

/**
 * @deprecated Use `getFaturamentoMensalHubFromLogs` de `lib/sentinela`,
 * que lê de dados_diarios_log (fonte unificada do dashboard) e aceita
 * filtro por empresas ativas.
 *
 * Soma o faturamento_real de todas as empresas (pago + organico) por mês,
 * para o ano informado.
 */
export async function getFaturamentoMensalHub(
  ano: number = ANO_PADRAO
): Promise<{ mes: Mes; real: number | null }[]> {
  const supabase = getSupabase()
  if (!supabase) {
    return MESES.map((mes) => ({ mes, real: null }))
  }
  const { data, error } = await supabase
    .from("dados_reais")
    .select("mes, faturamento_real")
    .eq("ano", ano)
  if (error) {
    console.error("[dados_reais] getFaturamentoMensalHub error", error.message)
    return MESES.map((mes) => ({ mes, real: null }))
  }

  const acc = new Map<Mes, { soma: number; tem: boolean }>()
  for (const row of (data ?? []) as { mes: string; faturamento_real: number | null }[]) {
    if (!mesValido(row.mes)) continue
    const bucket = acc.get(row.mes) ?? { soma: 0, tem: false }
    if (row.faturamento_real !== null && row.faturamento_real !== undefined) {
      bucket.soma += row.faturamento_real
      bucket.tem = true
    }
    acc.set(row.mes, bucket)
  }

  return MESES.map((mes) => {
    const bucket = acc.get(mes)
    return { mes, real: bucket?.tem ? bucket.soma : null }
  })
}

/**
 * @deprecated Use `getResumoMensalPorEmpresa` de `lib/sentinela` para
 * pago e organico em paralelo. dados_reais virou write-only-legacy.
 */
export async function getDadosReaisDoMes(
  mes: Mes,
  ano: number = ANO_PADRAO
): Promise<Map<string, DadosReaisPorOrigem>> {
  const supabase = getSupabase()
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from("dados_reais")
    .select("*")
    .eq("mes", mes)
    .eq("ano", ano)
  if (error) {
    console.error("[dados_reais] getDoMes error", error.message)
    return new Map()
  }
  const map = new Map<string, DadosReaisPorOrigem>()
  for (const d of (data ?? []) as DadosReais[]) {
    const bucket = map.get(d.empresa) ?? { pago: null, organico: null }
    if (d.origem === "organico") {
      bucket.organico = d
    } else {
      bucket.pago = d
    }
    map.set(d.empresa, bucket)
  }
  return map
}

export interface ResultadoSalvar {
  ok: boolean
  erro?: string
}

export async function salvarDadosReaisAction(
  formData: FormData
): Promise<ResultadoSalvar> {
  if (!supabaseConfigurado()) {
    return {
      ok: false,
      erro: "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    }
  }

  const empresa = String(formData.get("empresa") ?? "")
  const mes = String(formData.get("mes") ?? "")
  const ano = parseInt0(formData.get("ano")) ?? ANO_PADRAO
  const origem = origemValida(String(formData.get("origem") ?? ""))

  if (!empresaValida(empresa) || !mesValido(mes)) {
    return { ok: false, erro: "Empresa ou mês inválidos." }
  }

  const leads_real = parseInt0(formData.get("leads_real"))
  const reunioes_real = parseInt0(formData.get("reunioes_real"))
  const contratos_real = parseInt0(formData.get("contratos_real"))
  const fatParsed = parseNumeroForm(formData.get("faturamento_real"))
  if (fatParsed.erro) return { ok: false, erro: `Faturamento: ${fatParsed.erro}` }
  const faturamento_real = fatParsed.value
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null
  const clientes_ativos = parseInt0(formData.get("clientes_ativos"))

  // Campos só-pago — orgânico nunca os aceita, mesmo se vierem no FormData.
  let investimento_real: number | null = null
  if (origem === "pago") {
    const invParsed = parseNumeroForm(formData.get("investimento_real"))
    if (invParsed.erro)
      return { ok: false, erro: `Investimento: ${invParsed.erro}` }
    investimento_real = invParsed.value
  }
  const criativos_entregues =
    origem === "pago" ? parseInt0(formData.get("criativos_entregues")) : null
  const cpl_real =
    origem === "pago" &&
    investimento_real !== null &&
    leads_real !== null &&
    leads_real > 0
      ? Number((investimento_real / leads_real).toFixed(2))
      : null
  // Campos só-orgânico — pago ignora.
  const respostas =
    origem === "organico" ? parseInt0(formData.get("respostas")) : null

  const payload: DadosReais = {
    empresa,
    mes,
    ano,
    origem,
    investimento_real,
    leads_real,
    reunioes_real,
    contratos_real,
    faturamento_real,
    criativos_entregues,
    cpl_real,
    respostas,
    observacoes,
    clientes_ativos,
    updated_at: new Date().toISOString(),
  }

  const resultado = await gravarDadosReaisComLog(payload, {
    id: null,
    nome: "Drawer admin",
  })
  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro }
  }

  // Invalida o cache de rota de TODO o /dashboard de uma vez (layout-scope).
  // Antes só revalidava /dashboard e /dashboard/<slug> APENAS pra empresas
  // hardcoded em lib/data.ts — empresas novas (Nardi, Mãe Divina, etc.)
  // criadas via UI não tinham nem o próprio /dashboard/<slug> invalidado,
  // e a listagem /dashboard/empresas nunca era invalidada pra nenhuma.
  revalidatePath("/dashboard", "layout")

  return { ok: true }
}
