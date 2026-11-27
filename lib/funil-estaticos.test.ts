import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import {
  APRESENTACAO_PADRAO, avaliarRespostas, calcularFunil, etapaInicial, classificarOrigem, custoPor, fbcDeFbclid, filtrarRespostas, mediana, resolverCriativo,
  sanitizarAtribuicao, validarDefinicao, validarEmailLead, validarInstagram, validarNomeLead, validarWhatsappLead, type DefinicaoFunil,
} from "./funil-estaticos-nucleo"
import { SCRIPT_CLIENTE } from "./funil-estaticos-cliente"
import { jsonSeguro, paginaFunil } from "./funil-estaticos-pagina"
import { cabecalhosSeguranca } from "./funil-estaticos-seguranca"
import { lerTokenPrevia, tokenPrevia } from "./funil-estaticos"

process.env.FUNIL_HASH_SECRET ||= "segredo-de-teste-local"

// Definição inicial = a mesma semeada pela migration.
const sql = readFileSync(new URL("../supabase/migrations/20261127_funil_estaticos_meta.sql", import.meta.url), "utf8")
const DEF = JSON.parse(sql.split("$json$")[1]) as DefinicaoFunil
// v2 (20261128) = v1 + identidade branca + Etapa 00 + 2 textos novos.
const sql2 = readFileSync(new URL("../supabase/migrations/20261128_funil_apresentacao_teste.sql", import.meta.url), "utf8")
const DEF2: DefinicaoFunil = { ...DEF, visual: "claro", apresentacao: JSON.parse(sql2.split("$json$")[1]),
  textos: { ...DEF.textos, contato_subtitulo: "Informe seus dados para visualizar os horários disponíveis.", agenda_cta: "Confirmar agendamento" } }

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

test("v2 da migration: mesmas perguntas da v1, apresentação padrão, identidade branca", () => {
  assert.deepEqual(validarDefinicao(DEF2), [])
  assert.deepEqual(DEF2.perguntas, DEF.perguntas)
  assert.deepEqual(DEF2.apresentacao, APRESENTACAO_PADRAO)
  assert.equal(etapaInicial(DEF2), "apresentacao")
  assert.equal(etapaInicial(DEF), "perfil")
  // 12 criativos E01–E12 semeados, sem ID de anúncio inventado.
  const codigos = [...sql2.matchAll(/\('(E\d{2})', '([^']+)'\)/g)].map(m => m[1])
  assert.deepEqual(codigos, Array.from({ length: 12 }, (_, i) => `E${String(i + 1).padStart(2, "0")}`))
  assert.ok(!/meta_ad_id/.test(sql2.slice(sql2.indexOf("-- 3) Criativos"), sql2.indexOf("-- 4)"))))
})

test("apresentação: validação de textos, benefícios e desativação", () => {
  const d = JSON.parse(JSON.stringify(DEF2)) as DefinicaoFunil
  d.apresentacao!.headline = ""
  d.apresentacao!.beneficios.push(...Array.from({ length: 3 }, () => ({ emoji: "🎯", destaque: "x", texto: "" })))
  d.apresentacao!.cta = "<b>"
  const e = validarDefinicao(d)
  assert.ok(e.some(x => x.includes("headline")))
  assert.ok(e.some(x => x.includes("0 a 6 benefícios")))
  assert.ok(e.some(x => x.includes("texto do botão")))
  // Desativada: textos incompletos podem ficar guardados.
  const off = JSON.parse(JSON.stringify(DEF2)) as DefinicaoFunil
  off.apresentacao!.ativo = false; off.apresentacao!.headline = ""; off.apresentacao!.cta = ""
  assert.deepEqual(validarDefinicao(off), [])
  assert.equal(etapaInicial(off), "perfil")
  const visual = JSON.parse(JSON.stringify(DEF2)); visual.visual = "neon"
  assert.ok(validarDefinicao(visual).some(x => x.includes("Identidade visual")))
})

test("HTML v2: Etapa 00 no servidor (headline, benefícios, CTA, privacidade), sem pergunta e branca", () => {
  const html = paginaFunil({ slug: "estaticos-meta", nome: "Funil", versaoId: "v", def: DEF2, api: "/api/public/funil",
    privacidadeUrl: "https://example.com/p?a=1&b=2", consentimentoModo: "opt_in", pixelId: "123456", eventosMeta: {}, previa: null })
  assert.ok(html.includes("Mais oportunidades de venda para corretores de imóveis de Cascavel."))
  assert.ok(html.includes("<strong>Tráfego pago</strong> para seus imóveis"))
  assert.ok(html.includes("Marketing &amp; Tecnologia Imobiliária"))
  assert.ok(html.includes('id="f-cta-inicio">Quero conhecer as soluções'))
  assert.ok(html.includes("Suas respostas serão enviadas à ANÔMALO."))
  assert.ok(html.includes('href="https://example.com/p?a=1&amp;b=2"'))
  assert.ok(!html.includes('class="f-opcao"'))
  assert.ok(html.includes('class="t-claro"') && html.includes("logo-anomalo-escuro-96.png"))
  assert.ok(html.includes('id="f-consent"') && html.includes("Recusar"))
  assert.ok(html.includes('class="f-prog is-oculta"'))
  assert.ok(Buffer.byteLength(html) < 45_000, `HTML com ${Buffer.byteLength(html)} bytes`)
  // Pré-visualização do painel nunca carrega Pixel nem aviso de cookies.
  const demo = paginaFunil({ slug: "estaticos-meta", nome: "Funil", versaoId: "v", def: DEF2, api: "/x", privacidadeUrl: null,
    consentimentoModo: "opt_in", pixelId: "123456", eventosMeta: {}, previa: null, demo: true })
  assert.ok(!demo.includes('id="f-consent"') && demo.includes('"pixelId":null') && demo.includes('"demo":true'))
})

test("links de teste: modo funcional x diagnóstico da CAPI, assinados e com validade", () => {
  const f = "11111111-1111-4111-8111-111111111111", v = "22222222-2222-4222-8222-222222222222"
  assert.deepEqual(lerTokenPrevia(f, tokenPrevia(f, v)), { versaoId: v, modo: "funcional" })
  const d = tokenPrevia(f, v, "diagnostico_capi")
  assert.deepEqual(lerTokenPrevia(f, d), { versaoId: v, modo: "diagnostico_capi" })
  // Trocar o modo invalida a assinatura (um link funcional não vira diagnóstico).
  assert.equal(lerTokenPrevia(f, tokenPrevia(f, v).replace(".f.", ".d.")), null)
  assert.equal(lerTokenPrevia("33333333-3333-4333-8333-333333333333", d), null)
  assert.equal(lerTokenPrevia(f, tokenPrevia(f, v, "funcional", Date.now() - 8 * 86400_000)), null)
})

test("métricas da Etapa 00: início e abandono inicial só sobre quem viu a apresentação", () => {
  const b = { criativo_id: null, canal_origem: "meta_pago", aberta_em: "2026-11-01T10:00:00Z", perguntas_concluidas: 0, contato_em: null,
    agenda_vista_em: null, horario_selecionado_em: null, agendada_em: null, abandonada: false, etapa_abandono: null, lead_id: null, agendamento_id: null, iniciada_em: null }
  const v = "2026-11-01T10:00:01Z"
  const sessoes = [
    { ...b, id: "a", apresentacao_vista_em: v, cta_inicial_em: v, iniciada_em: v, perguntas_concluidas: 1 },
    { ...b, id: "b", apresentacao_vista_em: v, cta_inicial_em: v, abandonada: true, etapa_abandono: "perfil" },
    { ...b, id: "c", apresentacao_vista_em: v, abandonada: true, etapa_abandono: "apresentacao" },
    { ...b, id: "d", apresentacao_vista_em: v }, // ainda ativa: fora do denominador do abandono
    { ...b, id: "e", iniciada_em: v }, // versão direta: não entra nas taxas da apresentação
  ]
  const m = calcularFunil(sessoes, 3, [], new Map())
  assert.deepEqual(m.taxas.inicioAposApresentacao, { valor: 0.25, num: 1, den: 4 })
  assert.deepEqual(m.taxas.cliqueInicial, { valor: 0.5, num: 2, den: 4 })
  assert.deepEqual(m.taxas.abandonoInicial, { valor: 2 / 3, num: 2, den: 3 })
  assert.equal(m.etapas.find(e => e.chave === "apresentacao")!.qtd, 4)
  assert.equal(m.etapas.find(e => e.chave === "cta_inicial")!.qtd, 2)
  assert.deepEqual(m.taxas.inicio, { valor: 0.4, num: 2, den: 5 })
  // Sem nenhuma sessão com apresentação, as etapas extras não aparecem.
  assert.equal(calcularFunil([{ ...b, id: "x" }], 3, [], new Map()).etapas.some(e => e.chave === "apresentacao"), false)
  assert.equal(calcularFunil([], 3, [], new Map()).taxas.abandonoInicial.valor, null)
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
  assert.ok(Buffer.byteLength(html) < 45_000, `HTML com ${Buffer.byteLength(html)} bytes`)
  assert.equal(jsonSeguro({ a: "</script>" }), '{"a":"\\u003c/script\\u003e"}')
})
