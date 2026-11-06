import { test } from "node:test"
import assert from "node:assert/strict"
import {
  COLUNA_CONTAGEM,
  consolidarPorData,
  dataDeCelula,
  decodificarTexto,
  inteiroDeCelula,
  listarCampanhas,
  moedaDeCelula,
  montarPlanilha,
  parseDelimitado,
  sugerirMapeamento,
  type Celula,
  type Planilha,
} from "./funil-importacao"

function planilhaDe(brutas: Celula[][]): Planilha {
  const r = montarPlanilha(brutas)
  assert.ok("planilha" in r, "esperava ler a planilha")
  return r.planilha
}

const CSV_PT = [
  "Dia,Nome da campanha,Veiculação da campanha,Alcance,Impressões,Resultados,Indicador de resultados,Custo por resultados,Valor usado (BRL),Início dos relatórios,Término dos relatórios",
  "2026-11-03,[MKT] Leads,active,1000,2000,10,actions:lead,5.00,50.50,2026-11-01,2026-11-30",
  "2026-11-03,[SIS] Sistema,active,500,900,4,actions:lead,10.00,40.00,2026-11-01,2026-11-30",
  "2026-11-04,[MKT] Leads,active,1000,2000,6,actions:lead,5.00,30.25,2026-11-01,2026-11-30",
].join("\n")

test("decodifica UTF-8 com BOM, UTF-16 e Windows-1252", () => {
  const utf8 = new TextEncoder().encode("﻿Início")
  assert.equal(decodificarTexto(utf8), "Início")
  const utf16 = new Uint8Array([0xff, 0xfe, 0x49, 0, 0xed, 0])
  assert.equal(decodificarTexto(utf16), "Ií")
  assert.equal(decodificarTexto(new Uint8Array([0x49, 0xed])), "Ií")
})

test("CSV: aspas, vírgula e quebra de linha dentro do campo", () => {
  const r = parseDelimitado('a,b\n"x, y","l1\nl2"\n"com ""aspas""",z\n\n')
  assert.deepEqual(r, [["a", "b"], ["x, y", "l1\nl2"], ['com "aspas"', "z"]])
})

test("detecta ponto e vírgula, tabulação e a diretiva sep=", () => {
  assert.deepEqual(parseDelimitado("a;b\n1;2"), [["a", "b"], ["1", "2"]])
  assert.deepEqual(parseDelimitado("a\tb\tc,d\n1\t2\t3,4"), [["a", "b", "c,d"], ["1", "2", "3,4"]])
  assert.deepEqual(parseDelimitado("sep=;\r\na;b\r\n1;2\r\n"), [["a", "b"], ["1", "2"]])
})

test("moeda nos formatos brasileiro, americano e cru do Meta", () => {
  assert.equal(moedaDeCelula("1.234,56"), 1234.56)
  assert.equal(moedaDeCelula("1,234.56"), 1234.56)
  assert.equal(moedaDeCelula("R$ 1.234,56"), 1234.56)
  assert.equal(moedaDeCelula("222,75"), 222.75)
  assert.equal(moedaDeCelula("50.50"), 50.5)
  assert.equal(moedaDeCelula("1234.567"), 1234.57) // ponto único é decimal
  assert.equal(moedaDeCelula("1.234.567"), 1234567)
  assert.equal(moedaDeCelula(99.9), 99.9)
  for (const vazio of ["", "-", null, undefined, "-5"]) {
    assert.equal(moedaDeCelula(vazio), 0)
  }
})

test("inteiro entende separador de milhar", () => {
  assert.equal(inteiroDeCelula("1.234"), 1234)
  assert.equal(inteiroDeCelula("1,234"), 1234)
  assert.equal(inteiroDeCelula("12"), 12)
  assert.equal(inteiroDeCelula(7), 7)
  assert.equal(inteiroDeCelula(""), 0)
  assert.equal(inteiroDeCelula("-"), 0)
})

test("datas em ISO, com hora, com barra, Date e serial do Excel", () => {
  assert.equal(dataDeCelula("2026-11-03"), "2026-11-03")
  assert.equal(dataDeCelula("2026-11-03T12:30:00-03:00"), "2026-11-03")
  assert.equal(dataDeCelula("03/11/2026"), "2026-11-03")
  assert.equal(dataDeCelula("11/25/2026"), "2026-11-25") // mês > 12: inverte
  assert.equal(dataDeCelula(new Date(Date.UTC(2026, 10, 3))), "2026-11-03")
  assert.equal(dataDeCelula(46329), "2026-11-03")
  assert.equal(dataDeCelula("31/02/2026"), null)
  assert.equal(dataDeCelula("Total"), null)
  assert.equal(dataDeCelula(5), null)
})

test("relatório em português: reconhece as colunas e soma por data", () => {
  const p = planilhaDe(parseDelimitado(CSV_PT))
  assert.equal(p.tipo, "campanhas")
  const m = sugerirMapeamento(p)
  assert.equal(p.cabecalho[m.colData!], "Dia")
  assert.equal(p.cabecalho[m.colCampanha!], "Nome da campanha")
  assert.equal(p.cabecalho[m.colGasto!], "Valor usado (BRL)")
  assert.equal(p.cabecalho[m.metricaPadrao!], "Resultados")
  const r = consolidarPorData(p, m, { metricaPorEtapa: { etapa1: m.metricaPadrao! } })
  assert.deepEqual(r.dias, [
    { data: "2026-11-03", investimento: 90.5, valores: { etapa1: 14 } },
    { data: "2026-11-04", investimento: 30.25, valores: { etapa1: 6 } },
  ])
  assert.equal(r.ignoradas, 0)
  assert.equal(r.linhasSemDetalheDiario, 0)
})

test("relatório em inglês tem o mesmo resultado", () => {
  const p = planilhaDe(
    parseDelimitado(
      "Day,Campaign name,Results,Result indicator,Amount spent (BRL),Reporting starts,Reporting ends\n2026-11-03,A,3,actions:lead,12.5,2026-11-01,2026-11-30"
    )
  )
  const m = sugerirMapeamento(p)
  const r = consolidarPorData(p, m, { metricaPorEtapa: { e: m.metricaPadrao! } })
  assert.deepEqual(r.dias, [{ data: "2026-11-03", investimento: 12.5, valores: { e: 3 } }])
})

test("alcance, custos e taxas não viram métrica somável", () => {
  const p = planilhaDe(parseDelimitado(CSV_PT))
  const nomes = sugerirMapeamento(p).metricas.map((x) => x.nome)
  assert.deepEqual(nomes, ["Impressões", "Resultados"])
})

test("preferência: Resultados, e cai em Leads quando Resultados está zerado", () => {
  const comZero = planilhaDe(
    parseDelimitado("Dia,Nome da campanha,Resultados,Leads,Valor usado (BRL)\n2026-11-03,A,0,5,1")
  )
  const m = sugerirMapeamento(comZero)
  assert.equal(comZero.cabecalho[m.metricaPadrao!], "Leads")
})

test("colunas nunca são somadas entre si: cada etapa lê a sua", () => {
  const p = planilhaDe(
    parseDelimitado(
      "Dia,Nome da campanha,Leads,Conversas por mensagem iniciadas,Valor usado (BRL)\n2026-11-03,A,8,8,10"
    )
  )
  const m = sugerirMapeamento(p)
  const r = consolidarPorData(p, m, {
    metricaPorEtapa: { topo: p.cabecalho.indexOf("Leads") },
  })
  assert.equal(r.dias[0].valores.topo, 8)
})

test("linha de resumo do Gerenciador não dobra o total", () => {
  const p = planilhaDe(
    parseDelimitado(
      'Dia,Nome da campanha,Resultados,Valor usado (BRL)\n,,20,121\n2026-11-03,A,14,90.5\n2026-11-04,A,6,30.5'
    )
  )
  const m = sugerirMapeamento(p)
  // O total mostrado na escolha da coluna também não conta o resumo.
  assert.equal(m.metricas.find((x) => x.nome === "Resultados")?.total, 20)
  const r = consolidarPorData(p, m, { metricaPorEtapa: { e: m.metricaPadrao! } })
  assert.equal(r.ignoradas, 1)
  assert.equal(r.dias.reduce((s, d) => s + d.valores.e, 0), 20)
  assert.equal(r.dias.reduce((s, d) => s + (d.investimento ?? 0), 0), 121)
})

test("arquivo sem coluna Dia: usa o término e avisa", () => {
  const p = planilhaDe(
    parseDelimitado(
      "Início dos relatórios,Término dos relatórios,Nome da campanha,Resultados,Valor usado (BRL)\n2026-11-01,2026-11-30,A,20,100\n2026-11-05,2026-11-05,B,1,5"
    )
  )
  const m = sugerirMapeamento(p)
  assert.equal(m.colData, null)
  const r = consolidarPorData(p, m, { metricaPorEtapa: { e: m.metricaPadrao! } })
  assert.equal(r.linhasSemDetalheDiario, 1)
  assert.deepEqual(r.dias.map((d) => d.data), ["2026-11-05", "2026-11-30"])
})

test("excluir campanha tira o gasto e os resultados dela", () => {
  const p = planilhaDe(parseDelimitado(CSV_PT))
  const m = sugerirMapeamento(p)
  const r = consolidarPorData(p, m, {
    metricaPorEtapa: { e: m.metricaPadrao! },
    campanhasExcluidas: new Set(["[SIS] Sistema"]),
  })
  assert.deepEqual(r.dias[0], { data: "2026-11-03", investimento: 50.5, valores: { e: 10 } })
})

test("lista as campanhas, da que mais gastou para a que menos gastou", () => {
  const p = planilhaDe(parseDelimitado(CSV_PT))
  const c = listarCampanhas(p, sugerirMapeamento(p))
  assert.deepEqual(c.map((x) => [x.nome, x.investimento]), [
    ["[MKT] Leads", 80.75],
    ["[SIS] Sistema", 40],
  ])
})

test("avisa quando as campanhas têm tipos de resultado diferentes", () => {
  const p = planilhaDe(
    parseDelimitado(
      "Dia,Nome da campanha,Resultados,Indicador de resultados,Valor usado (BRL)\n2026-11-03,A,1,actions:lead,1\n2026-11-03,B,1,actions:link_click,1"
    )
  )
  const m = sugerirMapeamento(p)
  const todas = consolidarPorData(p, m, { metricaPorEtapa: { e: m.metricaPadrao! } })
  assert.equal(todas.indicadoresMisturados.length, 2)
  const so = consolidarPorData(p, m, {
    metricaPorEtapa: { e: m.metricaPadrao! },
    campanhasExcluidas: new Set(["B"]),
  })
  assert.equal(so.indicadoresMisturados.length, 0)
})

test("arquivo de leads em UTF-16: conta por data e por campanha", () => {
  const texto =
    "id\tcreated_time\tad_name\tcampaign_name\tform_name\tfull_name\temail\n" +
    "l:1\t2026-11-03T10:00:00-03:00\tAd\tA\tF\tFulana\tf@x.test\n" +
    "l:2\t2026-11-03T11:00:00-03:00\tAd\tA\tF\tBeltrana\tb@x.test\n" +
    "l:3\t2026-11-04T11:00:00-03:00\tAd\tB\tF\tCicrana\tc@x.test\n"
  const bytes = new Uint8Array(2 + texto.length * 2)
  bytes.set([0xff, 0xfe])
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    bytes[2 + i * 2] = c & 0xff
    bytes[3 + i * 2] = c >> 8
  }
  const p = planilhaDe(parseDelimitado(decodificarTexto(bytes)))
  assert.equal(p.tipo, "leads")
  const m = sugerirMapeamento(p)
  assert.equal(m.metricaPadrao, COLUNA_CONTAGEM)
  assert.equal(m.colGasto, null)
  const r = consolidarPorData(p, m, { metricaPorEtapa: { e: COLUNA_CONTAGEM } })
  // investimento null: o gasto já gravado na data é mantido.
  assert.deepEqual(r.dias, [
    { data: "2026-11-03", investimento: null, valores: { e: 2 } },
    { data: "2026-11-04", investimento: null, valores: { e: 1 } },
  ])
  // Nada identificável sai da consolidação.
  assert.doesNotMatch(JSON.stringify(r), /Fulana|x\.test/)
})

test("planilha do Excel: células Date, número e título antes do cabeçalho", () => {
  const p = planilhaDe([
    ["Relatório de campanhas", null, null, null],
    ["Dia", "Nome da campanha", "Resultados", "Valor usado (BRL)"],
    [new Date(Date.UTC(2026, 10, 3)), "A", 5, 10.5],
    [46330, "A", 2, 4],
  ])
  const m = sugerirMapeamento(p)
  const r = consolidarPorData(p, m, { metricaPorEtapa: { e: m.metricaPadrao! } })
  assert.deepEqual(r.dias, [
    { data: "2026-11-03", investimento: 10.5, valores: { e: 5 } },
    { data: "2026-11-04", investimento: 4, valores: { e: 2 } },
  ])
})

test("recusa arquivo vazio ou sem colunas reconhecíveis", () => {
  assert.ok("erro" in montarPlanilha([]))
  assert.ok("erro" in montarPlanilha([["foo", "bar"], ["1", "2"]]))
  assert.ok("erro" in montarPlanilha([["Dia", "Resultados"]]))
})

test("dia sem gasto e sem números não vira lançamento vazio", () => {
  const p = planilhaDe(
    parseDelimitado("Dia,Nome da campanha,Resultados,Valor usado (BRL)\n2026-11-03,A,0,0\n2026-11-04,A,1,1")
  )
  const m = sugerirMapeamento(p)
  const r = consolidarPorData(p, m, { metricaPorEtapa: { e: m.metricaPadrao! } })
  assert.deepEqual(r.dias.map((d) => d.data), ["2026-11-04"])
})
