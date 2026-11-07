import { test } from "node:test"
import assert from "node:assert/strict"
import {
  agrupamentosDisponiveis,
  dataValida,
  evolucaoDoFunil,
  filtrarPorFonte,
  formatarPct,
  gerarBaldes,
  hojeBRT,
  normalizarContratos,
  resolverAgrupamento,
  resumirFunil,
  resumirPorFonte,
} from "./funil-calculo"
import { contratosDoLancamento, totalDoContrato, type EtapaFunil, type LancamentoFunil } from "./funil-tipos"

const ETAPAS: EtapaFunil[] = [
  { id: "a", nome: "Leads" },
  { id: "b", nome: "Responderam" },
  { id: "c", nome: "Reuniões" },
  { id: "d", nome: "Contratos" },
]

function lanc(
  data: string,
  valores: Record<string, number>,
  extra: Partial<LancamentoFunil> = {}
): LancamentoFunil {
  return {
    id: `${data}-${JSON.stringify(valores)}`,
    funil_id: "f",
    data,
    investimento: 0,
    valores,
    perdidos: 0,
    faturamento: 0,
    observacoes: null,
    criado_por: null,
    created_at: "",
    ...extra,
  }
}

test("dataValida recusa data que não existe", () => {
  assert.equal(dataValida("2026-02-28"), true)
  assert.equal(dataValida("2028-02-29"), true)
  assert.equal(dataValida("2026-02-29"), false)
  assert.equal(dataValida("2026-13-01"), false)
  assert.equal(dataValida("06/11/2026"), false)
  assert.equal(dataValida(null), false)
})

test("hojeBRT usa o fuso de São Paulo, não UTC", () => {
  // 01h de 7/nov em UTC ainda é 22h de 6/nov em São Paulo.
  assert.equal(hojeBRT(new Date("2026-11-07T01:00:00Z")), "2026-11-06")
})

test("semana vai de segunda a domingo, inclusive na virada de ano", () => {
  // 06/11/2026 é sexta; 08/11 é domingo.
  assert.deepEqual(
    gerarBaldes("2026-11-02", "2026-11-09", "semana").map((b) => [b.de, b.ate]),
    [["2026-11-02", "2026-11-08"], ["2026-11-09", "2026-11-09"]]
  )
  assert.equal(gerarBaldes("2026-12-28", "2027-01-03", "semana").length, 1)
  assert.equal(gerarBaldes("2026-12-28", "2027-01-03", "semana")[0].rotulo, "28 dez – 03 jan")
})

test("mês bissexto termina no dia certo", () => {
  assert.equal(gerarBaldes("2028-02-10", "2028-03-05", "mes")[0].ate, "2028-02-29")
})

test("baldes semanais são contíguos e recortados no período", () => {
  const b = gerarBaldes("2026-11-01", "2026-11-30", "semana")
  assert.deepEqual(
    b.map((x) => [x.de, x.ate]),
    [
      ["2026-11-01", "2026-11-01"], // 1/nov é domingo: semana recortada
      ["2026-11-02", "2026-11-08"],
      ["2026-11-09", "2026-11-15"],
      ["2026-11-16", "2026-11-22"],
      ["2026-11-23", "2026-11-29"],
      ["2026-11-30", "2026-11-30"],
    ]
  )
  assert.equal(b[1].rotulo, "02 – 08 nov")
  // Fatia de um dia só não repete a data.
  assert.equal(b[0].rotulo, "01 nov")
  assert.equal(b[5].rotulo, "30 nov")
})

test("baldes mensais e diários", () => {
  const m = gerarBaldes("2026-01-01", "2026-12-31", "mes")
  assert.equal(m.length, 12)
  assert.equal(m[1].ate, "2026-02-28")
  assert.equal(m[0].rotulo, "Jan 2026")
  assert.equal(gerarBaldes("2026-11-02", "2026-11-08", "dia").length, 7)
})

test("agrupamento: padrão pelo tamanho e 'por dia' só em período curto", () => {
  const ano = { de: "2026-01-01", ate: "2026-12-31" }
  const mes = { de: "2026-11-01", ate: "2026-11-30" }
  const semana = { de: "2026-11-02", ate: "2026-11-08" }
  assert.equal(resolverAgrupamento(undefined, ano), "mes")
  assert.equal(resolverAgrupamento(undefined, mes), "semana")
  assert.equal(resolverAgrupamento(undefined, semana), "dia")
  assert.equal(resolverAgrupamento("dia", mes), "dia")
  assert.deepEqual(agrupamentosDisponiveis(ano), ["semana", "mes"])
  // Pedido que não cabe, ou lixo, volta para o padrão.
  assert.equal(resolverAgrupamento("dia", ano), "mes")
  assert.equal(resolverAgrupamento("xyz", mes), "semana")
})

test("resumirFunil soma e calcula as conversões entre etapas", () => {
  const r = resumirFunil(ETAPAS, [
    lanc("2026-11-01", { a: 60, b: 30, c: 6, d: 1 }, { investimento: 600 }),
    lanc("2026-11-02", { a: 40, b: 10, c: 4, d: 1 }, {
      investimento: 400,
      perdidos: 3,
      faturamento: 5000,
    }),
  ])
  assert.deepEqual(r.etapas.map((e) => e.valor), [100, 40, 10, 2])
  assert.equal(r.etapas[0].conversaoAnterior, null)
  assert.equal(r.etapas[1].conversaoAnterior, 0.4)
  assert.equal(r.etapas[2].conversaoAnterior, 0.25)
  assert.equal(r.etapas[3].conversaoAnterior, 0.2)
  assert.equal(r.etapas[3].conversaoTopo, 0.02)
  assert.equal(r.investimento, 1000)
  assert.equal(r.etapas[0].custo, 10)
  assert.equal(r.etapas[3].custo, 500)
  assert.equal(r.fechados, 2)
  assert.equal(r.perdidos, 3)
  assert.equal(r.taxaFechamento, 0.4)
  assert.equal(r.retorno, 5)
  assert.equal(r.registros, 2)
})

test("o gargalo é o passo com a menor conversão", () => {
  const r = resumirFunil(ETAPAS, [lanc("2026-11-01", { a: 100, b: 10, c: 8, d: 4 })])
  assert.equal(r.gargalo?.indice, 1)
  assert.equal(r.gargalo?.de, "Leads")
  assert.equal(r.gargalo?.para, "Responderam")
  assert.equal(r.gargalo?.taxa, 0.1)
})

test("gargalo: empate fica com o passo mais ao topo", () => {
  const r = resumirFunil(ETAPAS, [lanc("2026-11-01", { a: 100, b: 50, c: 25, d: 20 })])
  assert.equal(r.gargalo?.indice, 1)
})

test("gargalo: etapa zerada depois de uma com volume é 0%", () => {
  const r = resumirFunil(ETAPAS, [lanc("2026-11-01", { a: 100, b: 50, c: 0, d: 0 })])
  assert.equal(r.gargalo?.indice, 2)
  assert.equal(r.gargalo?.taxa, 0)
  // Sem volume na anterior não há taxa, em vez de divisão por zero.
  assert.equal(r.etapas[3].conversaoAnterior, null)
})

test("gargalo: sem queda não existe, mesmo com conversão acima de 100%", () => {
  const r = resumirFunil(ETAPAS, [lanc("2026-11-01", { a: 10, b: 10, c: 12, d: 12 })])
  assert.equal(r.gargalo, null)
  assert.equal(r.etapas[2].conversaoAnterior, 1.2)
})

test("funil sem lançamentos não gera NaN nem gargalo", () => {
  const r = resumirFunil(ETAPAS, [])
  assert.equal(r.registros, 0)
  assert.equal(r.gargalo, null)
  assert.equal(r.taxaFechamento, null)
  assert.equal(r.retorno, null)
  for (const e of r.etapas) {
    assert.equal(e.valor, 0)
    assert.equal(e.conversaoAnterior, null)
    assert.equal(e.custo, null)
  }
})

test("etapa excluída some da conta e etapa nova começa zerada", () => {
  const r = resumirFunil(
    [{ id: "a", nome: "Leads" }, { id: "novo", nome: "Nova" }],
    [lanc("2026-11-01", { a: 5, antiga: 99 })]
  )
  assert.deepEqual(r.etapas.map((e) => e.valor), [5, 0])
})

test("dado estranho no jsonb não contamina a soma", () => {
  const r = resumirFunil(ETAPAS, [
    lanc("2026-11-01", { a: "7" as unknown as number, b: -3, c: NaN }),
  ])
  assert.deepEqual(r.etapas.map((e) => e.valor), [7, 0, 0, 0])
})

test("numeric como string (formato do PostgREST) soma como número", () => {
  const r = resumirFunil(ETAPAS, [
    lanc("2026-11-01", { a: 1 }, { investimento: "1234.50" as unknown as number }),
    lanc("2026-11-02", { a: 1 }, { investimento: "0.50" as unknown as number }),
  ])
  assert.equal(r.investimento, 1235)
})

test("evolução separa por balde e bate com o total do período", () => {
  const lancamentos = [
    lanc("2026-11-02", { a: 10, b: 5 }),
    lanc("2026-11-08", { a: 10, b: 1 }), // domingo: mesma semana
    lanc("2026-11-09", { a: 30, b: 3 }), // segunda: semana seguinte
  ]
  const baldes = gerarBaldes("2026-11-02", "2026-11-15", "semana")
  const ev = evolucaoDoFunil(ETAPAS, lancamentos, baldes)
  assert.equal(ev.length, 2)
  assert.equal(ev[0].resumo.etapas[0].valor, 20)
  assert.equal(ev[0].resumo.etapas[1].conversaoAnterior, 0.3)
  assert.equal(ev[1].resumo.etapas[0].valor, 30)
  const total = ev.reduce((s, x) => s + x.resumo.etapas[0].valor, 0)
  assert.equal(total, resumirFunil(ETAPAS, lancamentos).etapas[0].valor)
})

test("formatarPct usa vírgula e até 1 casa", () => {
  assert.equal(formatarPct(0.625), "62,5%")
  assert.equal(formatarPct(1), "100%")
  assert.equal(formatarPct(0), "0%")
  assert.equal(formatarPct(1 / 3), "33,3%")
  assert.equal(formatarPct(null), "—")
})

test("fonte: lançamento antigo sem fonte conta como tráfego", () => {
  const l = [
    lanc("2026-11-01", { a: 10 }),
    lanc("2026-11-02", { a: 3 }, { fonte: "indicacao" }),
    lanc("2026-11-03", { a: 5 }, { fonte: "trafego" }),
  ]
  assert.equal(filtrarPorFonte(l, "trafego").length, 2)
  assert.equal(filtrarPorFonte(l, "indicacao").length, 1)
  assert.equal(filtrarPorFonte(l, null).length, 3)
})

test("resumo por fonte: a mesma estrutura de funil, e o total bate", () => {
  const fontes = [
    { id: "trafego", nome: "Tráfego" },
    { id: "indicacao", nome: "Indicação" },
    { id: "prospeccao", nome: "Prospecção fria" },
  ]
  const l = [
    lanc("2026-11-01", { a: 100, d: 1 }, { investimento: 500, fonte: "trafego" }),
    lanc("2026-11-02", { a: 10, d: 5 }, { fonte: "indicacao", faturamento: 900 }),
  ]
  const r = resumirPorFonte(ETAPAS, fontes, l)
  assert.deepEqual(r.map((x) => x.fonte.id), ["trafego", "indicacao", "prospeccao"])
  assert.equal(r[0].resumo.etapas[3].conversaoTopo, 0.01)
  assert.equal(r[0].resumo.etapas[3].custo, 500)
  assert.equal(r[1].resumo.etapas[3].conversaoTopo, 0.5)
  // Indicação sem gasto não inventa custo.
  assert.equal(r[1].resumo.etapas[3].custo, null)
  assert.equal(r[2].resumo.registros, 0)
  const total = resumirFunil(ETAPAS, l)
  assert.equal(
    r.reduce((s, x) => s + x.resumo.etapas[0].valor, 0),
    total.etapas[0].valor
  )
})

test("contratos com 1ª parcela diferente: 1º mês, recorrência e total", () => {
  // Exemplo real: 3.847 na 1ª (produto extra) + 2 × 1.147; 997 × 3; 600 × 3.
  const r = resumirFunil(ETAPAS, [
    lanc("2026-11-03", { a: 5, d: 3 }, {
      investimento: 97,
      faturamento: 5444,
      contratos: [
        { cliente: "A", primeira: 3847, mensal: 1147, meses: 3 },
        { primeira: 997, mensal: 997, meses: 3 },
        { primeira: 600, mensal: 600, meses: 3 },
      ],
    }),
  ])
  assert.equal(r.faturamento, 5444)
  assert.equal(r.recorrencia, 2744)
  assert.equal(r.totalContratado, 6141 + 2991 + 1800)
  assert.equal(r.contratos, 3)
  assert.equal(r.ticketMedio, 10932 / 3)
  assert.equal(r.retorno, 10932 / 97)
  assert.equal(r.retornoPrimeiroMes, 5444 / 97)
})

test("lançamento antigo só com faturamento vale como contrato de 1 mês", () => {
  assert.deepEqual(contratosDoLancamento({ faturamento: 900 }), [
    { primeira: 900, mensal: 0, meses: 1 },
  ])
  assert.deepEqual(contratosDoLancamento({ faturamento: 0, contratos: [] }), [])
  const r = resumirFunil(ETAPAS, [lanc("2026-11-01", { a: 1 }, { faturamento: 900 })])
  assert.equal(r.totalContratado, 900)
  assert.equal(r.recorrencia, 0)
  assert.equal(r.contratos, 1)
  assert.equal(totalDoContrato({ primeira: 3847, mensal: 1147, meses: 3 }), 6141)
})

test("normalizarContratos valida e completa a lista do formulário", () => {
  const ok = normalizarContratos(
    JSON.stringify([
      { cliente: "  Loja X ", primeira: 3847, mensal: 1147, meses: 3 },
      { primeira: 997, mensal: null, meses: 3 }, // demais em branco = igual à 1ª
      { primeira: 500, mensal: 200, meses: 1 }, // 1 mês: não há demais parcelas
      { primeira: null, mensal: null, meses: 0 }, // linha vazia é ignorada
    ])
  )
  assert.ok("contratos" in ok)
  assert.deepEqual(ok.contratos, [
    { cliente: "Loja X", primeira: 3847, mensal: 1147, meses: 3 },
    { primeira: 997, mensal: 997, meses: 3 },
    { primeira: 500, mensal: 0, meses: 1 },
  ])
  assert.deepEqual(normalizarContratos(null), { contratos: [] })
  assert.ok("erro" in normalizarContratos("{x"))
  assert.ok("erro" in normalizarContratos(JSON.stringify({ a: 1 })))
  assert.ok("erro" in normalizarContratos(JSON.stringify([{ primeira: -1, meses: 3 }])))
  assert.ok("erro" in normalizarContratos(JSON.stringify([{ primeira: 10, meses: 0 }])))
  assert.ok("erro" in normalizarContratos(JSON.stringify([{ primeira: 10, meses: 61 }])))
  assert.ok("erro" in normalizarContratos(JSON.stringify([{ primeira: 10, meses: 2.5 }])))
  assert.ok(
    "erro" in normalizarContratos(JSON.stringify(Array(51).fill({ primeira: 1, meses: 1 })))
  )
})
