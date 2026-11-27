// Comparação de performance de laboratório (mesmas condições para todas as
// variantes): iPhone 13 + UA do Instagram, 4G lento (1,6 Mbps / 150 ms RTT),
// CPU 4x mais lenta, cache limpo a cada rodada. NÃO é medição de produção.
//   node funil-estaticos-perf.mjs "nome=url=seletor-do-1º-toque" ... [--rodadas=7]
// Mede: bytes do HTML, FCP, LCP, CLS e "toque → próxima pintura" de um toque
// REAL (evento confiável do Playwright). Isto não é o INP de campo.
import { chromium, devices } from "playwright"

const args = process.argv.slice(2)
const rodadas = Number((args.find(a => a.startsWith("--rodadas=")) ?? "--rodadas=7").split("=")[1])
const alvos = args.filter(a => !a.startsWith("--")).map(a => { const [nome, url, sel] = a.split("="); return { nome, url: url.replace(/\|/g, "="), sel } })
const browser = await chromium.launch({ channel: "chrome" })
const iphone = { ...devices["iPhone 13"], userAgent: devices["iPhone 13"].userAgent + " Instagram 300.0.0.0" }
const med = v => { const a = [...v].sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2 }

for (const alvo of alvos) {
  const r = { fcp: [], lcp: [], cls: [], toque: [], bytes: 0 }
  for (let i = 0; i < rodadas; i++) {
    const ctx = await browser.newContext(iphone)
    const page = await ctx.newPage()
    await page.route(/facebook/, x => x.abort())
    const cdp = await ctx.newCDPSession(page)
    await cdp.send("Network.enable")
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await page.addInitScript(() => {
      window.__lcp = 0; window.__cls = 0; window.__toque = []
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: "largest-contentful-paint", buffered: true })
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true })
      document.addEventListener("click", e => { const t = e.timeStamp; requestAnimationFrame(() => requestAnimationFrame(() => window.__toque.push(performance.now() - t))) }, true)
    })
    const resp = await page.goto(alvo.url, { waitUntil: "load" })
    r.bytes = Buffer.byteLength(await resp.text())
    await page.waitForTimeout(1200)
    await page.locator(alvo.sel).first().click()
    await page.waitForTimeout(600)
    const m = await page.evaluate(() => ({ fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0, lcp: window.__lcp, cls: window.__cls, toque: window.__toque[0] ?? -1 }))
    r.fcp.push(m.fcp); r.lcp.push(m.lcp); r.cls.push(m.cls); r.toque.push(m.toque)
    await ctx.close()
  }
  const fmt = (v, d = 0) => `mediana ${med(v).toFixed(d)} (min ${Math.min(...v).toFixed(d)}, máx ${Math.max(...v).toFixed(d)})`
  console.log(`\n${alvo.nome}: HTML ${r.bytes} bytes · ${rodadas} rodadas`)
  console.log(`  FCP ms  ${fmt(r.fcp)}`)
  console.log(`  LCP ms  ${fmt(r.lcp)}`)
  console.log(`  CLS     ${fmt(r.cls, 3)}`)
  console.log(`  toque→pintura ms  ${fmt(r.toque)}`)
}
await browser.close()
