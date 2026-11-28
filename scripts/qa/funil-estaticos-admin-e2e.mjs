// Teste de navegador do EDITOR do painel (componentes reais; ações simuladas).
//   node scripts/qa/funil-estaticos-admin-harness.mjs   (porta 4330)
//   node funil-estaticos-admin-e2e.mjs <pasta-das-capturas>   (precisa de playwright + Chrome)
import { chromium } from "playwright"

const BASE = process.env.BASE ?? "http://localhost:4330/"
const OUT = process.argv[2] ?? "."
let falhas = 0
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}: ${m}`); if (!c) falhas++ }
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const erros = []
page.on("pageerror", e => erros.push(e.message))
const rede = []
page.on("request", r => { if (/\/api\//.test(r.url())) rede.push(r.url()) })
await page.goto(BASE, { waitUntil: "load" })
const editor = page.locator("#editor")
const previa = page.frameLocator('iframe[title="Pré-visualização do funil"]')
const acoes = () => page.evaluate(() => window.__acoes ?? [])

// 1) Tela inicial ligada por padrão (v2) e a prévia é a página real.
const chkAp = editor.getByLabel("Mostrar a tela inicial de apresentação", { exact: true })
ok(await chkAp.isChecked(), "Tela inicial de apresentação: ativada na versão publicada")
await previa.getByRole("heading", { name: "Mais oportunidades de venda para corretores de imóveis de Cascavel." }).waitFor({ timeout: 5000 })
ok(true, "prévia mobile renderiza a Etapa 00 (mesmo HTML da página pública)")
ok(await page.locator('iframe[title="Pré-visualização do funil"]').getAttribute("width") === "390", "prévia mobile com 390 px")
await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/20-editor-previa-mobile.png`, fullPage: false })

// 2) Editar headline reflete na prévia.
const headline = editor.getByRole("textbox", { name: "Headline", exact: true })
await headline.fill("Mais clientes para corretores de Cascavel.")
await previa.getByRole("heading", { name: "Mais clientes para corretores de Cascavel." }).waitFor({ timeout: 5000 })
ok(true, "editar a headline atualiza a prévia")

// 3) Benefícios: adicionar, ordenar, remover.
await editor.getByRole("button", { name: "+ Benefício" }).click()
await page.waitForTimeout(600)
ok(await previa.locator(".f-benef li").count() === 5, "adicionar benefício (5 na prévia)")
await editor.getByRole("button", { name: "Mover benefício para cima" }).nth(4).click()
await page.waitForTimeout(600)
ok((await previa.locator(".f-benef li").nth(3).textContent()).includes("Novo benefício"), "mover benefício para cima muda a ordem na prévia")
await editor.getByRole("button", { name: "Remover benefício" }).nth(3).click()
await page.waitForTimeout(600)
ok(await previa.locator(".f-benef li").count() === 4, "remover benefício")
await editor.getByLabel("Emoji do benefício 1").fill("🏠")
await page.waitForTimeout(600)
ok((await previa.locator(".f-emoji").first().textContent()) === "🏠", "emoji do benefício editável")

// 4) Validação: headline vazia com a tela ligada bloqueia salvar.
await headline.fill("")
await page.waitForTimeout(200)
ok(await editor.getByText(/headline obrigatório/).isVisible() && await editor.getByRole("button", { name: "Salvar rascunho" }).isDisabled(), "headline vazia: erro visível e 'Salvar rascunho' desabilitado")
ok(await page.getByText("Corrija os erros acima para atualizar a pré-visualização.").isVisible(), "prévia avisa que está desatualizada enquanto há erro")
await headline.fill("Mais oportunidades de venda para corretores de imóveis de Cascavel.")

// 5) Desligar a tela inicial → abre direto na 1ª pergunta.
await chkAp.uncheck()
await previa.getByRole("heading", { name: "Como você atua no mercado imobiliário?" }).waitFor({ timeout: 5000 })
ok(await previa.locator(".f-h1").count() === 0, "tela inicial desativada: prévia abre direto na 1ª pergunta (configuração alternativa)")
await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/21-editor-sem-apresentacao.png` })
await chkAp.check()
await previa.locator(".f-h1").waitFor({ timeout: 5000 })

// 6) Identidade visual.
await editor.getByRole("combobox", { name: "Identidade visual da página" }).selectOption("escuro")
await page.waitForTimeout(700)
ok(await previa.locator("body").evaluate(b => getComputedStyle(b).backgroundColor) === "rgb(0, 0, 0)", "identidade 'Escura (versão anterior)' aplicada na prévia")
await editor.getByRole("combobox", { name: "Identidade visual da página" }).selectOption("claro")
await page.waitForTimeout(700)
ok(await previa.locator("body").evaluate(b => getComputedStyle(b).backgroundColor) === "rgb(255, 255, 255)", "identidade branca (padrão)")

// 7) Fluxo completo dentro da prévia (sem rede): CTA → perguntas → contato → agenda de exemplo → confirmação.
await previa.locator("#f-cta-inicio").click()
await previa.getByText("Pergunta 1 de 3").waitFor()
await previa.locator(".f-opcao").first().click(); await page.waitForTimeout(500)
await previa.locator(".f-opcao").first().click(); await page.waitForTimeout(500)
await previa.locator(".f-opcao").first().click(); await page.waitForTimeout(500)
await previa.locator("#nome").fill("Teste Prévia"); await previa.locator("#whatsapp").fill("45999990000")
await previa.locator("form .f-cta").click()
await previa.locator(".f-slot").first().waitFor({ timeout: 5000 })
ok(await previa.getByText("Reunião com o time!", { exact: true }).isVisible() && await previa.getByText("60 minutos · Horário de Brasília").isVisible(), "prévia: agenda com horários de EXEMPLO identificados")
await previa.locator(".f-slot").first().click()
await previa.locator("#f-confirmar").click()
await previa.getByRole("heading", { name: "Reunião agendada!" }).waitFor({ timeout: 5000 })
ok(await previa.getByText("Versão de teste: nenhum horário real foi reservado.").isVisible(), "prévia: confirmação avisa que nada real foi reservado")
ok(rede.length === 0, `prévia não fez nenhuma chamada de API (${rede.length})`)

// 8) Desktop.
await editor.getByRole("button", { name: "Desktop" }).click()
await page.waitForTimeout(700)
ok(await page.locator('iframe[title="Pré-visualização do funil"]').getAttribute("width") === "1100", "prévia desktop com 1100 px")
await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/22-editor-previa-desktop.png` })

// 9) Salvar rascunho envia a definição com a tela inicial (integrada ao versionamento).
await editor.getByRole("button", { name: "Salvar rascunho" }).click()
await page.waitForTimeout(300)
const salvo = (await acoes()).find(a => a.nome === "salvarRascunhoAction")
const defSalva = salvo ? JSON.parse(salvo.args[0].definicao) : null
ok(defSalva?.apresentacao?.ativo === true && defSalva.apresentacao.beneficios[0].emoji === "🏠" && defSalva.visual === "claro" && defSalva.perguntas.length === 3, "salvar rascunho leva apresentação + perguntas na MESMA definição versionada")
ok(await editor.getByText("Histórico de versões").isVisible() && await editor.getByText(/v1 · arquivada/).isVisible(), "histórico de versões exibido")

// 10) Diagnóstico da CAPI pede o modo explícito; criativos e URL.
const popup = page.waitForEvent("popup").catch(() => null)
await page.locator("#diag").getByRole("button").click()
await popup
await page.waitForTimeout(300)
ok((await acoes()).some(a => a.nome === "gerarLinkPreviaAction" && a.args[2] === "diagnostico_capi"), "botão de diagnóstico gera link com modo 'diagnostico_capi' (separado da versão de teste)")
ok(await page.locator("#criativos").getByText("E12", { exact: true }).isVisible() && await page.locator("#criativos").getByText("Marketing imobiliário de alto padrão").isVisible(), "12 criativos listados (E01–E12)")
ok(await page.locator("#criativos input[name=codigo]").inputValue() === "E13", "próximo código sugerido: E13 (sem limite fixo de 12)")
ok(await page.locator("#url").getByText(/hoje 12 criativos/).isVisible(), "gerador de URL: mesma URL para os 12 criativos")
await page.locator("#criativos").scrollIntoViewIfNeeded(); await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/23-tracking-criativos.png` })
ok(erros.length === 0, `sem erros de JS no painel ${erros.join(" | ")}`)
await browser.close()
console.log(falhas ? `${falhas} FALHA(S)` : "PAINEL OK")
process.exit(falhas ? 1 : 0)
