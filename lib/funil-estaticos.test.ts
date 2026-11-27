import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import {
  avaliarRespostas, calcularFunil, classificarOrigem, custoPor, fbcDeFbclid, filtrarRespostas, mediana, resolverCriativo,
  sanitizarAtribuicao, validarDefinicao, validarEmailLead, validarInstagram, validarNomeLead, validarWhatsappLead, type DefinicaoFunil,
} from "./funil-estaticos-nucleo"
import { SCRIPT_CLIENTE } from "./funil-estaticos-cliente"
import { cabecalhosSeguranca, jsonSeguro, paginaFunil } from "./funil-estaticos-pagina"

// Definição inicial = a mesma semeada pela migration.
const sql = readFileSync(new URL("../supabase/migrations/20261127_funil_estaticos_meta.sql", import.meta.url), "utf8")
const DEF = JSON.parse(sql.split("$json$")[1]) as DefinicaoFunil

test("definição semeada pela migration é válida e tem as 3 perguntas pedidas", () => {
  assert.deepEqual(validarDefinicao(DEF), [])
  assert.equal(DEF.perguntas.length, 3)
  assert.deepEqual(DEF.perguntas.map(p => p.opcoes.length), [5, 5, 4])
  assert.equal(DEF.textos.contato_cta, "Ver horários disponíveis")
})

test("validarDefinicao recusa ids repetidos, HTML e poucas alternativas", () => {
  const ruim = JSON.parse(JSON.stringify(DEF)) as DefinicaoFunil
  ruim.perguntas[1].id = ruim.perguntas[0].id
  ruim.perguntas[2].texto = "<script>x</script>"
  ruim.perguntas[0].opcoes = ruim.perguntas[0].opcoes.slice(0, 1)
  const e = validarDefinicao(ruim)
  assert.ok(e.some(x => x.includes("repetido")))
  assert.ok(e.some(x => x.includes("Pergunta 3")))
  assert.ok(e.some(x => x.includes("2 a 8 alternativas")))
})

test("WhatsApp brasileiro: normaliza para E.164 e recusa inválidos", () => {
  assert.equal(validarWhatsappLead("(45) 99999-1234"), "+5545999991234")
  assert.equal(validarWhatsappLead("+55 45 99999-1234"), "+5545999991234")
  assert.equal(validarWhatsappLead("045 3333-1234"), "+554533331234")
  assert.equal(validarWhatsappLead("45 89999-1234"), null) // celular sem o 9 inicial
  assert.equal(validarWhatsappLead("(00) 99999-1234"), null)
  assert.equal(validarWhatsappLead("12345"), null)
  assert.equal(validarWhatsappLead("45999991234<"), null)
  // A regex do banco aceita tudo o que a validação aceita.
  const banco = /^\+55[1-9][0-9][2-9][0-9]{7,8}$/
  for (const v of ["45999991234", "4533331234", "11987654321"]) assert.ok(banco.test(validarWhatsappLead(v)!))
})

test("nome, e-mail e Instagram", () => {
  assert.equal(validarNomeLead("  João   da  Silva "), "João da Silva")
  assert.equal(validarNomeLead("<b>x</b>"), null)
  assert.equal(validarNomeLead("1"), null)
  assert.equal(validarNomeLead("--"), null)
  assert.equal(validarEmailLead(""), null)
  assert.equal(validarEmailLead("A@B.COM"), "a@b.com")
  assert.equal(validarEmailLead("x@"), false)
  assert.equal(validarInstagram("@corretor.cvel"), "corretor.cvel")
  assert.equal(validarInstagram("https://instagram.com/corretor_x/"), "corretor_x")
  assert.equal(validarInstagram("a b"), false)
})

test("atribuição: preserva IDs como string, ignora macros não substituídas e lixo", () => {
  const a = sanitizarAtribuicao({
    utm_source: "ig", utm_medium: "paid_social", ad_id: "120212345678901234", adset_id: "{{adset.id}}",
    campaign_id: "abc", fbclid: "IwAR0abcDEF_123-xyz", creative_id: "E03", xss: "<script>", placement: "Instagram_Stories",
  })
  assert.equal(a.ad_id, "120212345678901234")
  assert.equal(typeof a.ad_id, "string")
  assert.equal(a.adset_id, undefined)
  assert.equal(a.campaign_id, undefined)
  assert.equal((a as Record<string, string>).xss, undefined)
  assert.equal(a.creative_id, "E03")
  assert.equal(classificarOrigem(a), "meta_pago")
  assert.equal(classificarOrigem({}), "direto")
  assert.equal(classificarOrigem({ utm_source: "google", utm_medium: "cpc" }), "outro_pago")
  assert.equal(classificarOrigem({ referer_host: "instagram.com" }), "organico")
})

test("criativo: ad_id cadastrado vence; depois código manual", () => {
  const cs = [{ id: "c1", codigo: "E01", meta_ad_id: "111111" }, { id: "c2", codigo: "E02", meta_ad_id: null }]
  assert.equal(resolverCriativo({ ad_id: "111111", creative_id: "E02" }, cs), "c1")
  assert.equal(resolverCriativo({ creative_id: "e02" }, cs), "c2")
  assert.equal(resolverCriativo({ utm_content: "111111" }, cs), "c1")
  assert.equal(resolverCriativo({}, cs), null)
})

test("fbc só existe com fbclid real (nunca fabricado)", () => {
  assert.equal(fbcDeFbclid(undefined, 1), null)
  assert.equal(fbcDeFbclid("IwAR0abcDEF_123", 1700000000000), "fb.1.1700000000000.IwAR0abcDEF_123")
})

test("respostas: só opções da versão; interesse e pontuação; sem regra → não avaliado", () => {
  const r = filtrarRespostas(DEF, { perfil: "gestor", interesse: "inexistente", investimento: "anuncios", extra: "x" })
  assert.deepEqual(r, { perfil: "gestor", investimento: "anuncios" })
  const a = avaliarRespostas(DEF, { perfil: "gestor", interesse: "sistema", investimento: "anuncios" }, { ativo: false })
  assert.equal(a.interesse, "sistema")
  assert.equal(a.qualificacao, "nao_avaliado")
  const def2 = JSON.parse(JSON.stringify(DEF)) as DefinicaoFunil
  def2.perguntas[0].opcoes[2].pontos = 5
  assert.equal(avaliarRespostas(def2, { perfil: "gestor" }, { ativo: true, alta: 5, media: 2 }).qualificacao, "alta")
  assert.equal(avaliarRespostas(def2, { perfil: "autonomo" }, { ativo: true, alta: 5, media: 2 }).qualificacao, "baixa")
})

test("métricas: denominadores explícitos, 'sem dados' sem denominador, comparecimento só de reuniões encerradas", () => {
  const base = { criativo_id: null, canal_origem: "meta_pago", aberta_em: "2026-11-01T10:00:00Z", agenda_vista_em: null, horario_selecionado_em: null, abandonada: false, etapa_abandono: null }
  const sessoes = [
    { ...base, id: "s1", iniciada_em: "2026-11-01T10:00:10Z", perguntas_concluidas: 3, contato_em: "2026-11-01T10:01:10Z", agendada_em: "2026-11-01T10:02:10Z", lead_id: "l1", agendamento_id: "a1" },
    { ...base, id: "s2", iniciada_em: "2026-11-01T10:00:10Z", perguntas_concluidas: 1, contato_em: null, agendada_em: null, lead_id: null, agendamento_id: null, abandonada: true, etapa_abandono: "interesse" },
    { ...base, id: "s3", iniciada_em: null, perguntas_concluidas: 0, contato_em: null, agendada_em: null, lead_id: null, agendamento_id: null },
    { ...base, id: "s4", iniciada_em: "2026-11-01T10:00:10Z", perguntas_concluidas: 3, contato_em: "2026-11-01T10:03:10Z", agendada_em: "2026-11-01T10:04:10Z", lead_id: "l2", agendamento_id: "a2" },
  ]
  const leads = [
    { id: "l1", criativo_id: null, qualificacao: "nao_avaliado" as const, status_comercial: "venda_realizada" as const, valor_venda: 3000 },
    { id: "l2", criativo_id: null, qualificacao: "alta" as const, status_comercial: "reuniao_agendada" as const, valor_venda: null },
  ]
  const reunioes = new Map([["a1", { id: "a1", status: "realizada", fim: "2026-11-02T13:00:00Z" }], ["a2", { id: "a2", status: "confirmada", fim: "2099-01-01T00:00:00Z" }]])
  const m = calcularFunil(sessoes, 3, leads, reunioes, new Date("2026-11-10T00:00:00Z"))
  assert.equal(m.contagens.sessoes, 4)
  assert.deepEqual(m.taxas.inicio, { valor: 0.75, num: 3, den: 4 })
  assert.equal(m.taxas.conclusaoPerguntas.num, 2)
  assert.equal(m.taxas.agendamento.valor, 1)
  // a2 ainda não aconteceu: não entra no denominador do comparecimento.
  assert.deepEqual(m.taxas.comparecimento, { valor: 1, num: 1, den: 1 })
  assert.equal(m.contagens.vendas, 1)
  assert.equal(m.contagens.receita, 3000)
  assert.equal(m.abandonoPorEtapa.interesse, 1)
  assert.equal(m.etapas.find(e => e.chave === "p2")!.qtd, 2)
  const vazio = calcularFunil([], 3, [], new Map())
  assert.equal(vazio.taxas.inicio.valor, null)
  assert.equal(custoPor(null, 10), null)
  assert.equal(custoPor(100, 0), null)
  assert.equal(custoPor(100, 4), 25)
  assert.equal(mediana([]), null)
  assert.equal(mediana([3, 1, 2]), 2)
})

test("script do navegador é JS válido, sem template literal e sem segredo", () => {
  assert.doesNotThrow(() => new Function(SCRIPT_CLIENTE))
  assert.ok(!SCRIPT_CLIENTE.includes("SERVICE_ROLE") && !SCRIPT_CLIENTE.includes("access_token") && !SCRIPT_CLIENTE.includes("CAPI_TOKEN"))
  // Schedule só sai depois de bookingId e uma vez por reserva (marca local).
  assert.match(SCRIPT_CLIENTE, /r\.bookingId[\s\S]*funil:sched:/)
  assert.ok(!/localStorage\.setItem\([^)]*(nome|whatsapp)/i.test(SCRIPT_CLIENTE))
})

test("HTML: 1ª pergunta renderizada no servidor, JSON escapado e CSP com hash do script", () => {
  const html = paginaFunil({ slug: "estaticos-meta", nome: "Funil </script><b>", versaoId: "v", def: DEF, api: "/api/public/funil",
    privacidadeUrl: "https://example.com/p", consentimentoModo: "opt_in", pixelId: null, eventosMeta: {}, previa: null })
  assert.ok(html.includes("Como você atua no mercado imobiliário?"))
  assert.equal((html.match(/class="f-opcao"/g) ?? []).length, 5)
  assert.ok(!html.includes("</script><b>"))
  assert.ok(html.includes("fonts.googleapis") === false)
  const hash = createHash("sha256").update(SCRIPT_CLIENTE).digest("base64")
  assert.ok(cabecalhosSeguranca()["content-security-policy"].includes(`sha256-${hash}`))
  assert.ok(html.includes(`<script>${SCRIPT_CLIENTE}</script>`))
  assert.ok(Buffer.byteLength(html) < 40_000, `HTML com ${Buffer.byteLength(html)} bytes`)
  assert.equal(jsonSeguro({ a: "</script>" }), '{"a":"\\u003c/script\\u003e"}')
})
