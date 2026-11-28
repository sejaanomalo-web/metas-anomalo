// E2E da página pública do Funil Estáticos Meta contra o harness local
// (HTML/JS/CSP reais + API simulada; nada de Supabase, nada de Meta).
//   PIXEL=123456789012345 npx tsx scripts/qa/funil-estaticos-harness.ts            (porta 4321, v2)
//   PORTA=4322 VARIANTE=direto npx tsx scripts/qa/funil-estaticos-harness.ts      (porta 4322, v1)
//   node funil-estaticos-e2e.mjs <pasta-das-capturas>   (precisa do pacote playwright + Chrome)
// Condições: iPhone 13 com UA do navegador do Instagram, "4G lento" (1,6 Mbps,
// 150 ms RTT) e CPU 4x mais lenta. Medições de laboratório, não de produção.
import { chromium, devices } from "playwright"

const BASE = process.env.BASE ?? "http://localhost:4321"
const BASE_DIRETO = process.env.BASE_DIRETO ?? "http://localhost:4322"
const URL = `${BASE}/funil/estaticos-meta?utm_source=ig&utm_medium=paid_social&utm_campaign=120200000000000010&ad_id=120200000000000001&creative_id=E01`
const OUT = process.argv[2] ?? "."
let falhas = 0
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}: ${m}`); if (!c) falhas++ }
const browser = await chromium.launch({ channel: "chrome" })
const iphone = { ...devices["iPhone 13"], userAgent: devices["iPhone 13"].userAgent + " Instagram 300.0.0.0" }

async function abrirLento(ctx, url) {
  const page = await ctx.newPage()
  const erros = []
  page.on("console", m => { if (/Content Security Policy|Refused/i.test(m.text())) erros.push(m.text()) })
  page.on("pageerror", e => erros.push("PAGEERROR " + e.message))
  // O Pixel real nunca é carregado no teste (nem com aceite).
  await page.route(/connect\.facebook\.net|facebook\.com/, r => r.abort())
  const cdp = await ctx.newCDPSession(page)
  await cdp.send("Network.enable")
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0; window.__inp = []
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: "largest-contentful-paint", buffered: true })
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true })
    // Event Timing (base do INP): duração de cada interação real.
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) window.__inp.push(Math.round(e.duration)) }).observe({ type: "event", durationThreshold: 16, buffered: true }) } catch {}
  })
  const t0 = Date.now()
  const resp = await page.goto(url, { waitUntil: "load" })
  return { page, erros, resp, tLoad: Date.now() - t0, cdp }
}
const medirToque = (page, seletor) => page.evaluate(sel => new Promise(res => {
  const b = document.querySelector(sel); const t = performance.now(); b.click()
  requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t)))
}), seletor)
const caixa = (page, sel) => page.locator(sel).boundingBox()

// ============================================================ v2 (apresentação)
const ctx = await browser.newContext(iphone)
const { page, erros, resp, tLoad } = await abrirLento(ctx, URL)
const html = await resp.text()
ok(Buffer.byteLength(html) < 45000, `HTML ${Buffer.byteLength(html)} bytes, tudo inline (sem JS/CSS/fontes externos)`)
await page.waitForTimeout(1500)
const perf = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
  recursos: performance.getEntriesByType("resource").map(r => r.name.replace(location.origin, "")) }))
console.log("PERF v2 (iPhone 13, 4G lento 1,6 Mbps/150 ms, CPU 4x):", JSON.stringify({ load_ms: tLoad, fcp: Math.round(perf.fcp), lcp: Math.round(perf.lcp), cls: perf.cls, recursos: perf.recursos }))
ok(perf.lcp > 0 && perf.lcp < 2500, `LCP ${Math.round(perf.lcp)} ms < 2500`)
ok(perf.cls < 0.1, `CLS ${perf.cls.toFixed(3)} < 0.1`)
await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/01-apresentacao-mobile.png` })

// Etapa 00: elementos, CTA fixo embaixo, margens, sem progresso/voltar.
ok(await page.getByRole("heading", { name: "Mais oportunidades de venda para corretores de imóveis de Cascavel." }).isVisible(), "headline da apresentação visível sem rolar")
ok(await page.locator(".f-benef li").count() === 4 && await page.locator(".f-benef strong", { hasText: "Tráfego pago" }).isVisible(), "4 benefícios, destaque em negrito")
ok(await page.getByText("Marketing & Tecnologia Imobiliária").isVisible(), "texto de identificação")
const vp = page.viewportSize()
const bCta = await caixa(page, "#f-cta-inicio")
ok(bCta && bCta.y + bCta.height <= vp.height && bCta.y + bCta.height > vp.height - 140, `CTA no rodapé da área visível (base em ${Math.round(bCta.y + bCta.height)} de ${vp.height})`)
ok(bCta.height >= 52 && Math.round(bCta.x) >= 20 && Math.round(bCta.x) <= 24 && Math.abs(bCta.x + bCta.width - (vp.width - bCta.x)) < 2, `CTA ${Math.round(bCta.height)} px de altura, largura total com margens de ${Math.round(bCta.x)} px`)
const corCta = await page.$eval("#f-cta-inicio", b => [getComputedStyle(b).backgroundColor, getComputedStyle(b).color])
ok(corCta[0] === "rgb(201, 149, 58)" && corCta[1] === "rgb(20, 20, 20)", `CTA amarelo oficial #C9953A com texto preto (${corCta.join(" / ")})`)
ok(await page.$eval("body", b => getComputedStyle(b).backgroundColor) === "rgb(255, 255, 255)", "fundo branco")
ok(await page.locator("#f-prog").evaluate(e => getComputedStyle(e).visibility) === "hidden" && await page.locator("#f-voltar").isHidden(), "apresentação sem barra de progresso e sem voltar")
ok(await page.getByRole("link", { name: "Política de privacidade" }).first().getAttribute("href") === "https://example.com/privacidade", "rodapé com link da política configurada")
ok((await page.getByText("Suas respostas serão enviadas à ANÔMALO.").count()) === 1, "rodapé: 'Suas respostas serão enviadas à ANÔMALO.'")

// Consentimento: aviso no rodapé (sem pop-up), recusar funciona e não bloqueia nada.
const temConsent = await page.locator("#f-consent").isVisible()
ok(temConsent, "aviso de cookies visível (modo opt-in, Pixel configurado)")
await page.getByRole("button", { name: "Recusar" }).click()
ok(await page.locator("#f-consent").count() === 0 && await page.evaluate(() => localStorage.getItem("funil:consent")) === "false", "Recusar remove o aviso e guarda a escolha")
const bCta2 = await caixa(page, "#f-cta-inicio")
ok(bCta2.y + bCta2.height <= vp.height, "CTA continua visível após a escolha de cookies")

// Clique no CTA: sem navegação, UTMs preservadas, 1ª pergunta.
await page.evaluate(() => { window.__mesmoDocumento = true })
const toqueCta = await medirToque(page, "#f-cta-inicio")
await page.getByRole("heading", { name: "Como você atua no mercado imobiliário?" }).waitFor()
ok(await page.evaluate(() => window.__mesmoDocumento === true) && page.url() === URL, "CTA não recarrega a página e mantém a URL com UTMs/ad_id")
ok(toqueCta < 200, `resposta ao toque no CTA ${Math.round(toqueCta)} ms (próxima pintura, CPU 4x)`)
ok(await page.getByText("Pergunta 1 de 3").isVisible() && await page.locator("#f-prog").evaluate(e => getComputedStyle(e).visibility) === "visible", "PERGUNTA 1 DE 3 + barra de progresso")
await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/02-pergunta1-mobile.png` })

// Cliques rápidos: dois toques seguidos não pulam etapas.
const toqueOpcao = await page.evaluate(() => new Promise(res => {
  const b = document.querySelector(".f-opcao[data-o=gestor]"); const t = performance.now(); b.click(); b.click()
  document.querySelector(".f-opcao[data-o=autonomo]").click()
  requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t)))
}))
await page.waitForTimeout(900)
ok(await page.getByRole("heading", { name: "O que você gostaria de melhorar na sua operação?" }).isVisible(), "cliques rápidos avançam só uma etapa")
ok(toqueOpcao < 200, `resposta ao toque na alternativa ${Math.round(toqueOpcao)} ms`)
ok(await page.getByText("Pergunta 2 de 3").isVisible(), "PERGUNTA 2 DE 3")
// Voltar: preserva a resposta e o Continuar funciona; voltar da 1ª leva à apresentação.
await page.getByRole("button", { name: "← Voltar" }).click()
await page.getByRole("heading", { name: "Como você atua no mercado imobiliário?" }).waitFor()
ok(await page.locator(".f-opcao[data-o=gestor]").getAttribute("aria-checked") === "true", "voltar preserva a resposta (a 1ª escolha vale; cliques extras ignorados)")
ok(await page.locator("#f-continuar").isEnabled(), "Continuar habilitado ao voltar para pergunta respondida")
await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/03-pergunta1-selecionada-mobile.png` })
await page.getByRole("button", { name: "← Voltar" }).click()
await page.getByRole("heading", { name: "Mais oportunidades de venda para corretores de imóveis de Cascavel." }).waitFor()
ok(await page.locator("#f-voltar").isHidden(), "voltar da 1ª pergunta retorna à apresentação")
await page.locator("#f-cta-inicio").click()
await page.getByRole("heading", { name: "Como você atua no mercado imobiliário?" }).waitFor()
await page.locator("#f-continuar").click()
await page.getByRole("heading", { name: "O que você gostaria de melhorar na sua operação?" }).waitFor()
await page.locator(".f-opcao[data-o=sistema]").focus(); await page.keyboard.press("Enter")
await page.getByRole("heading", { name: "Atualmente, como você investe em marketing imobiliário?" }).waitFor()
ok(true, "teclado (Enter) seleciona e avança")
await page.locator(".f-opcao[data-o=anuncios]").click()

// Identificação: rodapé fixo some (teclado não cobre nada), CTA dentro do formulário.
await page.getByRole("heading", { name: "Vamos conhecer você." }).waitFor()
ok(await page.getByText("Informe seus dados para visualizar os horários disponíveis.").isVisible(), "texto complementar da identificação")
ok(await page.locator("#f-pe").isHidden(), "rodapé fixo oculto na identificação (nada cobre os campos com o teclado aberto)")
ok((await page.locator("#f-passo").textContent()) === "Seus dados", "indicador de etapa: Seus dados")
ok(await page.locator("#whatsapp").getAttribute("inputmode") === "tel", "WhatsApp com teclado numérico")
await page.fill("#nome", "João da Silva")
await page.fill("#whatsapp", "45999")
await page.locator("form .f-cta").click()
ok((await page.locator("#whatsapp-erro").textContent()).includes("WhatsApp válido"), "validação do WhatsApp antes de enviar")
await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/04b-identificacao-erro-mobile.png` })
await page.fill("#whatsapp", "")
await page.type("#whatsapp", "45999991234")
ok(await page.inputValue("#whatsapp") === "(45) 99999-1234", `máscara: ${await page.inputValue("#whatsapp")}`)
ok((await page.locator("form .f-cta").textContent()).trim().startsWith("Ver horários disponíveis") && await page.$eval("form .f-cta", b => getComputedStyle(b).textTransform) === "uppercase", "CTA VER HORÁRIOS DISPONÍVEIS →")
await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/04-identificacao-mobile.png` })
await page.locator("form .f-cta").click()

// Agenda.
await page.getByRole("heading", { name: "Escolha o melhor horário para conversarmos." }).waitFor()
await page.locator(".f-slot").first().waitFor()
ok(await page.getByText("Reunião com o time!", { exact: true }).isVisible() && await page.getByText("60 minutos · Horário de Brasília").isVisible() && await page.locator(".f-cal-grade").isVisible(), "agenda: calendário mensal, tipo, duração e fuso")
ok(await page.locator("#f-pe").isHidden(), "sem horário escolhido, sem botão de confirmar")
ok(!/Jo[aã]o|99999/.test(await page.evaluate(() => JSON.stringify(localStorage))), "nome/WhatsApp fora do localStorage")
await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/05-agenda-mobile.png` })
await page.locator(".f-slot").first().click()
const bConf = await caixa(page, "#f-confirmar")
ok(bConf && bConf.y + bConf.height <= vp.height && (await page.locator("#f-confirmar").textContent()).includes("Confirmar agendamento"), "CONFIRMAR AGENDAMENTO → fixo no rodapé, com resumo do horário")
await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/06-agenda-selecionada-mobile.png` })
await page.locator("#f-confirmar").dblclick()
await page.getByText("Esse horário acabou de ser reservado").waitFor()
ok(true, "409: avisa e recarrega horários sem sair da agenda")
await page.locator(".f-slot").nth(1).click()
await page.locator("#f-confirmar").click()
await page.getByRole("heading", { name: "Reunião agendada!" }).waitFor()
ok(await page.getByText("60 minutos").isVisible() && await page.getByText("Horário de Brasília").isVisible() && await page.getByText("Diagnóstico comercial").isVisible(), "confirmação: tipo, duração e fuso")
ok(await page.$eval("#f-barra", b => b.style.transform) === "scaleX(1)", "progresso 100% só na confirmação")
ok(!/Google Meet|e-mail de confirmação|enviamos/i.test(await page.locator("#f-etapa").textContent()), "sem promessa de Meet/e-mail/mensagem automática")
await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/07-confirmacao-mobile.png`, fullPage: true })
await page.reload({ waitUntil: "load" })
await page.getByRole("heading", { name: "Reunião agendada!" }).waitFor({ timeout: 8000 })
ok(true, "recarregar mantém a confirmação")
await page.waitForTimeout(1500)
const inp = await page.evaluate(() => window.__inp)
console.log("Event Timing (durações de interação, ms):", JSON.stringify(inp))

const log = await (await fetch(`${BASE}/__log`)).json()
const ev = log.filter(l => l.acao === "eventos").flatMap(l => l.eventos)
ok(ev.includes("welcome_viewed:apresentacao") && ev.filter(e => e === "welcome_cta_clicked:apresentacao").length === 2, "eventos welcome_viewed e welcome_cta_clicked (2 cliques no CTA = 2 eventos; o servidor grava a 1ª vez)")
ok(ev.filter(e => e.startsWith("funnel_started")).length === 1, "funnel_started uma única vez (mesmo voltando à apresentação)")
ok(["question_answered:perfil", "question_back:interesse", "question_back:perfil", "contact_form_viewed:contato", "booking_page_viewed:agenda", "booking_slot_selected:agenda", "booking_failed:agenda"].every(e => ev.includes(e)), "demais eventos internos registrados")
ok(ev.filter(e => e === "question_answered:perfil").length === 1, "toques extras não geraram resposta duplicada")
const sess = log.filter(l => l.acao === "sessao")
ok(sess[0]?.versaoId === "v2" && sess[0]?.atribuicao?.ad_id === "120200000000000001" && sess[0]?.atribuicao?.utm_source === "ig", "sessão aberta com a versão exibida e a atribuição da URL")
ok(log.find(l => l.acao === "contato")?.consentimento === false, "recusa de cookies enviada ao servidor (CAPI respeita)")
ok(log.filter(l => l.acao === "reservar").length === 2, "duplo clique: 2 tentativas (409 + sucesso), sem duplicar")
ok(erros.length === 0, `sem violações de CSP/erros de JS ${erros.join(" | ")}`)
await ctx.close()

// ============================================================ telas pequenas / fonte ampliada
for (const [nome, opts] of [["320x568", { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["375x667-fonte-125", { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const c = await browser.newContext(opts)
  const p = await c.newPage()
  await p.goto(`${BASE}/funil/estaticos-meta`, { waitUntil: "load" })
  if (nome.includes("fonte")) await p.addStyleTag({ content: "html{font-size:125%}" })
  await p.evaluate(() => localStorage.clear())
  const semScroll = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  const cta = await p.locator("#f-cta-inicio").boundingBox()
  const posicao = await p.$eval("#f-pe", e => getComputedStyle(e).position)
  if (opts.viewport.height <= 640) {
    // Tela baixa: rodapé no fluxo (rolagem natural), nada fica coberto.
    await p.locator("#f-cta-inicio").scrollIntoViewIfNeeded()
    const cta2 = await p.locator("#f-cta-inicio").boundingBox()
    ok(semScroll && posicao === "static" && cta2.y + cta2.height <= opts.viewport.height, `${nome}: sem rolagem horizontal, rodapé no fluxo e CTA alcançável rolando`)
  } else ok(semScroll && cta && cta.y + cta.height <= opts.viewport.height && posicao === "sticky", `${nome}: sem rolagem horizontal e CTA fixo visível`)
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/08-apresentacao-${nome}.png` })
  await c.close()
}

// ============================================================ desktop
const d = await browser.newPage({ viewport: { width: 1366, height: 860 } })
await d.goto(`${BASE}/funil/estaticos-meta`); await d.evaluate(() => localStorage.clear()); await d.reload(); await d.waitForTimeout(300)
await d.screenshot({ path: `${OUT}/09-apresentacao-desktop.png` })
await d.locator("#f-cta-inicio").click(); await d.waitForTimeout(500)
await d.screenshot({ path: `${OUT}/10-pergunta1-desktop.png` })
await d.close()

// ============================================================ v1 (início direto, identidade escura) — regressão
try {
  const c = await browser.newContext(iphone)
  const p = await c.newPage()
  await p.goto(`${BASE_DIRETO}/funil/estaticos-meta`, { waitUntil: "load" })
  ok(await p.getByRole("heading", { name: "Como você atua no mercado imobiliário?" }).isVisible() && await p.locator(".f-opcao").count() === 5, "início direto: 1ª pergunta no HTML (configuração alternativa)")
  ok(await p.$eval("body", b => getComputedStyle(b).backgroundColor) === "rgb(0, 0, 0)", "início direto mantém a identidade escura da v1")
  await p.locator(".f-opcao[data-o=gestor]").click()
  await p.getByRole("heading", { name: "O que você gostaria de melhorar na sua operação?" }).waitFor()
  await p.getByRole("button", { name: "← Voltar" }).click()
  ok(await p.locator(".f-opcao[data-o=gestor]").getAttribute("aria-checked") === "true" && await p.locator("#f-continuar").isEnabled(), "início direto: voltar preserva resposta e Continuar funciona")
  ok(await p.locator("#f-voltar").isHidden(), "início direto: sem voltar na 1ª pergunta")
  await p.waitForTimeout(450); await p.screenshot({ path: `${OUT}/11-inicio-direto-escuro-mobile.png` })
  await c.close()
} catch (e) { ok(false, "harness da variante direta (porta 4322) indisponível: " + e.message) }

await browser.close()
console.log(falhas ? `${falhas} FALHA(S)` : "E2E OK")
process.exit(falhas ? 1 : 0)
