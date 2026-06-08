// =============================================================================
// BUILDERS DE RELATÓRIO WHATSAPP — Anômalo Hub
// =============================================================================
// Geram o TEXTO dos 3 relatórios diários (Tráfego / Comercial / Hub) em 3
// períodos (diário/semanal/mensal). NÃO enviam — envio, tabela de assinaturas
// e cron 21h vêm depois.
//
// Cada builder retorna:
//   • variaveis: string[]   — os valores de {{1}}..{{n}} do template Meta.
//                             REGRA META: cada variável é UMA LINHA só (sem
//                             \n, tab ou 4+ espaços). Listas usam " · ".
//                             A estrutura visual (emojis/quebras) fica no
//                             texto FIXO do template, não nas variáveis.
//   • textoCompleto: string — o relatório por extenso (preview/fallback).
//
// Reaproveita as funções de agregação existentes (não reescreve nenhuma).
// =============================================================================

import {
  getEmpresasTrackeadas,
  getResumoPorIntervaloPorEmpresa,
  getUltimoLogSentinela,
  statusSentinela,
} from "./sentinela"
import { getResumoComercialPorIntervalo } from "./relatorios-comerciais"
import {
  diasNoMes,
  empresas,
  formatBRL,
  formatNumero,
  getResumoGrupo,
  metaAcumuladaAteHoje,
  type Mes,
} from "./data"
import { getDeltasDoPeriodo } from "./dados-diarios"
import { getOverridesTodasEmpresasMes } from "./metas-empresa"
import { sanitizarParaWa } from "./resumos"

export type PeriodoRelatorio = "diario" | "semanal" | "mensal"

export interface RelatorioWhatsApp {
  /** Valores de {{1}}..{{n}} — cada um UMA linha (sem \n/tab/4+ espaços). */
  variaveis: string[]
  /** Relatório montado por extenso, pra debug/preview e fallback. */
  textoCompleto: string
}

// =============================================================================
// HELPERS PUROS — timezone (BRT) e janelas de período
// =============================================================================

const MS_DIA = 86_400_000
const TRACO = "—"

// Mês-número (1..12) -> nome canônico do dashboard (Abril..Dezembro).
const MES_NOME: Record<number, Mes> = {
  4: "Abril",
  5: "Maio",
  6: "Junho",
  7: "Julho",
  8: "Agosto",
  9: "Setembro",
  10: "Outubro",
  11: "Novembro",
  12: "Dezembro",
}

const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
]

/**
 * Data de referência como instante em UTC-meio-dia do dia-calendário BRT.
 * Usar meio-dia evita que aritmética de dias cruze fronteira por causa do
 * offset, e ler campos getUTC* dá o dia certo independente do TZ da máquina.
 *  - `data` informada: usa o dia-calendário (campos UTC) da data passada.
 *  - sem `data`: "hoje" em BRT (UTC-3).
 */
function refDate(data?: Date): Date {
  let y: number
  let mIdx: number
  let d: number
  if (data) {
    y = data.getUTCFullYear()
    mIdx = data.getUTCMonth()
    d = data.getUTCDate()
  } else {
    const brt = new Date(Date.now() - 3 * 3_600_000) // BRT = UTC-3
    y = brt.getUTCFullYear()
    mIdx = brt.getUTCMonth()
    d = brt.getUTCDate()
  }
  return new Date(Date.UTC(y, mIdx, d, 12, 0, 0))
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDias(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_DIA)
}
function fmtData(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}
function fmtDiaMes(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}`
}

interface Janela {
  de: string
  ate: string
  mes: Mes
  ano: number
  diaAtual: number
  diasDoMes: number
  ref: Date
  rotulo: string
  rotuloCurto: string
  anterior: { de: string; ate: string }
}

/**
 * Calcula a janela [de, ate] do período + a janela anterior (pra deltas) +
 * metadados (mês/ano/dia) usados em meta e projeção. Tudo em BRT.
 *   - diario:  de=ate=ref;            anterior = ontem
 *   - semanal: segunda→ref (corrente);anterior = semana -7d
 *   - mensal:  dia 1→ref;             anterior = mês anterior, dia1→mesmo dia
 */
function calcularJanela(periodo: PeriodoRelatorio, data?: Date): Janela {
  const ref = refDate(data)
  const y = ref.getUTCFullYear()
  const mIdx = ref.getUTCMonth()
  const d = ref.getUTCDate()
  const mes = MES_NOME[mIdx + 1] ?? "Abril"
  const diasDoMes = diasNoMes(mes, y)
  const base = { mes, ano: y, diaAtual: d, diasDoMes, ref }

  if (periodo === "diario") {
    const ontem = addDias(ref, -1)
    return {
      ...base,
      de: iso(ref),
      ate: iso(ref),
      rotulo: `${DIAS_SEMANA[ref.getUTCDay()]}, ${fmtData(ref)}`,
      rotuloCurto: fmtData(ref),
      anterior: { de: iso(ontem), ate: iso(ontem) },
    }
  }

  if (periodo === "semanal") {
    // Segunda da semana corrente (ISO: segunda=0 .. domingo=6).
    const seg = addDias(ref, -((ref.getUTCDay() + 6) % 7))
    return {
      ...base,
      de: iso(seg),
      ate: iso(ref),
      rotulo: `Semana de ${fmtData(seg)} a ${fmtData(ref)}`,
      rotuloCurto: `semana de ${fmtDiaMes(seg)}`,
      anterior: { de: iso(addDias(seg, -7)), ate: iso(addDias(ref, -7)) },
    }
  }

  // mensal — dia 1 até ref; anterior = mês passado, dia 1 → mesmo dia (clamp).
  const dia1 = new Date(Date.UTC(y, mIdx, 1, 12))
  const prevMIdx = (mIdx + 11) % 12
  const prevAno = mIdx === 0 ? y - 1 : y
  const prevDias = new Date(Date.UTC(prevAno, prevMIdx + 1, 0)).getUTCDate()
  const prevDia = Math.min(d, prevDias)
  return {
    ...base,
    de: iso(dia1),
    ate: iso(ref),
    rotulo: `${mes}/${y} (até ${fmtData(ref)})`,
    rotuloCurto: `${mes}/${y}`,
    anterior: {
      de: iso(new Date(Date.UTC(prevAno, prevMIdx, 1, 12))),
      ate: iso(new Date(Date.UTC(prevAno, prevMIdx, prevDia, 12))),
    },
  }
}

// --- formatação de variável (linha única, à prova da regra Meta) ---

/** Garante UMA linha: remove \n/\r/tab e colapsa espaços (sem 4+ espaços). */
function sl(s: string): string {
  return s
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
}

/** Junta partes não-vazias com " · " e sanitiza em linha única. */
function lista(...partes: (string | null | undefined | false)[]): string {
  const limpa = partes.filter(
    (p): p is string => typeof p === "string" && p.trim() !== ""
  )
  return sl(limpa.join(" · "))
}

function pct(n: number, casas = 0): string {
  return `${(n * 100).toFixed(casas)}%`
}
function pctOuTraco(v: number | null, casas = 0): string {
  return v != null ? pct(v, casas) : TRACO
}
function brlOuTraco(v: number | null): string {
  return v != null ? formatBRL(v) : TRACO
}
function comSinal(n: number): string {
  return `${n >= 0 ? "+" : "−"}${formatNumero(Math.abs(n))}`
}
function brlComSinal(n: number): string {
  return `${n >= 0 ? "+" : "−"}${formatBRL(Math.abs(n))}`
}

// =============================================================================
// 1. RELATÓRIO TRÁFEGO PAGO  (7 variáveis)
// =============================================================================

export async function montarRelatorioTrafego(
  periodo: PeriodoRelatorio,
  data?: Date
): Promise<RelatorioWhatsApp> {
  const j = calcularJanela(periodo, data)

  // Tudo defensivo: Map pode vir vazio, log pode ser null.
  const [mapa, log, tracked] = await Promise.all([
    getResumoPorIntervaloPorEmpresa(j.de, j.ate, "pago"),
    getUltimoLogSentinela(),
    getEmpresasTrackeadas(),
  ])

  let inv = 0
  let leads = 0
  let impressoes = 0
  let cliques = 0
  let conversas = 0
  let ativas = 0
  const porEmpresa: { nome: string; inv: number }[] = []
  for (const [nome, e] of mapa) {
    inv += e.investimento
    leads += e.leads
    impressoes += e.impressoes
    cliques += e.cliques
    conversas += e.conversas
    if (e.investimento > 0) {
      ativas += 1
      porEmpresa.push({ nome, inv: e.investimento })
    }
  }
  const cpl = leads > 0 ? inv / leads : null
  const ctr = impressoes > 0 ? cliques / impressoes : null
  const totalContas = tracked.length
  const semAtividade = Math.max(0, totalContas - ativas)
  const top3 = porEmpresa.sort((a, b) => b.inv - a.inv).slice(0, 3)

  const stat = statusSentinela(log)
  const anomalias = log?.anomalias_detectadas ?? []
  const criticas = anomalias.filter((a) => a.tipo === "critica")

  const v1 = sl(j.rotulo)
  const v2 = lista(
    formatBRL(inv),
    `${formatNumero(leads)} leads`,
    `CPL ${brlOuTraco(cpl)}`
  )
  const v3 = lista(
    `${formatNumero(impressoes)} impressões`,
    `${formatNumero(cliques)} cliques`,
    `CTR ${pctOuTraco(ctr, 1)}`
  )
  const v4 =
    top3.length > 0
      ? lista(...top3.map((t) => `${t.nome} ${formatBRL(t.inv)}`))
      : "Sem investimento no período"
  const v5 = lista(
    `${formatNumero(totalContas)} contas`,
    `${formatNumero(ativas)} com investimento`,
    `${formatNumero(semAtividade)} sem atividade`
  )
  const v6 = lista(
    stat.rotulo,
    `${formatNumero(anomalias.length)} anomalias (${formatNumero(
      criticas.length
    )} críticas)`
  )
  const v7 =
    criticas.length > 0
      ? lista(
          ...criticas.map(
            (a) =>
              `${a.empresa}: ${a.metrica} ${comSinal(
                Math.round(a.variacao_percentual)
              )}%`
          )
        )
      : "Sem alertas críticos"

  const variaveis = [v1, v2, v3, v4, v5, v6, v7]

  const textoCompleto = sanitizarParaWa(
    [
      `🚦 *TRÁFEGO PAGO · Anômalo Hub*`,
      `📅 ${v1}`,
      ``,
      `💰 *INVESTIMENTO*`,
      v2,
      ``,
      `📊 *ENTREGA*`,
      v3,
      ``,
      `🏆 *TOP 3 INVESTIMENTO*`,
      v4,
      ``,
      `🏢 *COBERTURA*`,
      v5,
      ``,
      `🚨 *SENTINELA*`,
      v6,
      v7,
      ``,
      `_Tráfego não reporta vendas/faturamento — fundo de funil é manual._`,
      `_Anomalias refletem o último log do Sentinela._`,
    ].join("\n")
  )

  return { variaveis, textoCompleto }
}

// =============================================================================
// 2. RELATÓRIO COMERCIAL  (8 variáveis)
// =============================================================================

export async function montarRelatorioComercial(
  periodo: PeriodoRelatorio,
  data?: Date
): Promise<RelatorioWhatsApp> {
  const j = calcularJanela(periodo, data)
  const c = await getResumoComercialPorIntervalo(j.de, j.ate)

  // DADOS VAZIOS: relatorios_comerciais sem nenhuma linha no período.
  // Mostra "—" nos campos e um aviso honesto — NUNCA zeros que parecem reais.
  const vazio = c.registros === 0

  const ticket =
    c.contratos_fechados > 0 ? c.faturamento_gerado / c.contratos_fechados : null
  const convLeadReuniao =
    c.mensagens > 0 ? c.reunioes_realizadas / c.mensagens : null
  const convReuniaoContrato =
    c.reunioes_realizadas > 0
      ? c.contratos_fechados / c.reunioes_realizadas
      : null

  const v1 = sl(j.rotulo)
  const v2 = vazio ? TRACO : formatNumero(c.mensagens)
  const v3 = vazio ? TRACO : formatNumero(c.retorno_mensagens)
  const v4 = vazio ? TRACO : formatNumero(c.qualificados)
  const v5 = vazio
    ? TRACO
    : lista(
        `${formatNumero(c.reunioes_agendadas)} agend`,
        `${formatNumero(c.reunioes_realizadas)} realiz`
      )
  const v6 = vazio ? TRACO : formatNumero(c.contratos_fechados)
  const v7 = vazio ? TRACO : formatBRL(c.faturamento_gerado)
  const v8 = vazio
    ? sl(`⚠️ Sem dados comerciais preenchidos para ${j.rotuloCurto}`)
    : lista(
        `Ticket ${brlOuTraco(ticket)}`,
        `msg→reunião ${pctOuTraco(convLeadReuniao)}`,
        `reunião→contrato ${pctOuTraco(convReuniaoContrato)}`
      )

  const variaveis = [v1, v2, v3, v4, v5, v6, v7, v8]

  const textoCompleto = sanitizarParaWa(
    [
      `🤝 *COMERCIAL · Anômalo Hub*`,
      `📅 ${v1}`,
      ``,
      `📥 *FUNIL DO PERÍODO*`,
      `✉️ Mensagens: ${v2}`,
      `↩️ Retorno: ${v3}`,
      `✅ Qualificados: ${v4}`,
      `📅 Reuniões: ${v5}`,
      `📝 Contratos: ${v6}`,
      `💵 Faturamento: ${v7}`,
      ``,
      vazio ? v8 : `📈 ${v8}`,
    ].join("\n")
  )

  return { variaveis, textoCompleto }
}

// =============================================================================
// 3. RELATÓRIO RESULTADOS HUB  (8 variáveis)
// =============================================================================

export async function montarRelatorioHub(
  periodo: PeriodoRelatorio,
  data?: Date
): Promise<RelatorioWhatsApp> {
  const j = calcularJanela(periodo, data)

  const [atual, anterior, comercial, overrides] = await Promise.all([
    getDeltasDoPeriodo(j.de, j.ate),
    getDeltasDoPeriodo(j.anterior.de, j.anterior.ate),
    getResumoComercialPorIntervalo(j.de, j.ate),
    getOverridesTodasEmpresasMes(j.mes, j.ano),
  ])

  const inv = atual.somaInvestimento
  const fat = atual.somaFaturamento
  const leads = atual.somaLeads
  const cpl = leads > 0 ? inv / leads : null
  // ROI honesto: ≈ −100% enquanto há investimento e nenhum faturamento real.
  const roi = inv > 0 ? (fat - inv) / inv : null

  // LÓGICA CONDICIONAL DE META:
  // metaMes = meta de faturamento do Hub no mês (getResumoGrupo soma os
  // overrides de metas_empresa). SE não há meta cadastrada (ex.: Junho),
  // getResumoGrupo retorna 0 → texto NEUTRO, nunca "0% / R$0" como meta real.
  const metaMes = getResumoGrupo(j.mes, j.ano, empresas, overrides).faturamento
  let v3: string
  if (metaMes <= 0) {
    v3 = sl(`Meta não cadastrada para ${j.mes}`)
  } else {
    const atingido = Math.round((fat / metaMes) * 100)
    const esperado = metaAcumuladaAteHoje(metaMes, j.mes, j.ano, j.ref)
    const projecao = j.diaAtual > 0 ? (fat / j.diaAtual) * j.diasDoMes : 0
    v3 = lista(
      `${atingido}% da meta`,
      `esperado ${formatBRL(esperado)}`,
      `projeção ${formatBRL(projecao)}`
    )
  }

  const dInv = inv - anterior.somaInvestimento
  const dLeads = leads - anterior.somaLeads

  const top3 = Array.from(atual.porEmpresa.values())
    .sort((a, b) => b.investimento - a.investimento)
    .slice(0, 3)
    .filter((e) => e.investimento > 0 || e.faturamento > 0 || e.leads > 0)

  const v1 = sl(j.rotulo)
  const v2 = lista(
    `Investido ${formatBRL(inv)}`,
    `Faturado ${formatBRL(fat)}`,
    `ROI ${pctOuTraco(roi)}`
  )
  const v4 = lista(
    `Leads ${comSinal(dLeads)} (${formatNumero(leads)} vs ${formatNumero(
      anterior.somaLeads
    )})`,
    `Investimento ${brlComSinal(dInv)}`
  )
  const v5 = `${formatNumero(atual.porEmpresa.size)} contas reportaram`
  const v6 =
    top3.length > 0
      ? lista(...top3.map((e) => `${e.empresa} ${formatBRL(e.investimento)}`))
      : "Sem movimento no período"
  const v7 = lista(
    `Tráfego: ${formatBRL(inv)}`,
    `${formatNumero(leads)} leads`,
    `CPL ${brlOuTraco(cpl)}`
  )
  const v8 =
    comercial.registros === 0
      ? "Comercial: sem dados"
      : lista(
          `Comercial: ${formatNumero(comercial.contratos_fechados)} contratos`,
          formatBRL(comercial.faturamento_gerado)
        )

  const variaveis = [v1, v2, v3, v4, v5, v6, v7, v8]

  const textoCompleto = sanitizarParaWa(
    [
      `🛒 *RESULTADOS HUB · Anômalo Hub*`,
      `📅 ${v1}`,
      ``,
      `💰 *NÚMEROS DO PERÍODO*`,
      v2,
      `🎯 ${v3}`,
      ``,
      `📊 *vs PERÍODO ANTERIOR*`,
      v4,
      ``,
      `🏢 ${v5}`,
      `🏆 *Top 3:* ${v6}`,
      ``,
      `🚦 ${v7}`,
      `🤝 ${v8}`,
    ].join("\n")
  )

  return { variaveis, textoCompleto }
}
