/**
 * QA isolado dos funis comerciais, no mesmo molde de fluidez.mjs: copia as
 * fontes sem .env/.git, usa banco HTTP em memória e Chrome descartável. Nunca
 * acessa o Supabase real. Usa usuários e sessões assinadas de verdade para
 * exercitar o isolamento entre pessoas, incluindo chamada direta de action.
 *
 * PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node scripts/qa/comercial-funis.mjs
 * QA_SCREENSHOTS=/pasta salva as capturas de tela.
 */
import { createServer } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import { cp, mkdtemp, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const source = process.cwd()
const root = await mkdtemp(path.join(tmpdir(), 'anomalo-funis-'))
const ignored = new Set(['node_modules', '.next', '.git', '.vercel', '.agents', '.codex', 'RefsAsana', 'RefsClientAsana'])
await cp(source, root, { recursive: true, filter: (file) => {
  const parts = path.relative(source, file).split(path.sep)
  return !parts.some((p) => ignored.has(p) || p.startsWith('.env'))
}})
await symlink(path.join(source, 'node_modules'), path.join(root, 'node_modules'), 'dir')

const ADMIN = '00000000-0000-4000-8000-00000000000a'
const BIA = '00000000-0000-4000-8000-00000000000b'
const CAIO = '00000000-0000-4000-8000-00000000000c'
const DANI = '00000000-0000-4000-8000-00000000000d'
const usuario = (id, nome, papel, permissoes) => ({ id, nome, email: `${nome}@example.test`, ativo: true, papel, permissoes, visao: null, visao_permissoes: null })
const FUNIL_CAIO = '00000000-0000-4000-8000-0000000000c1'
const LANC_CAIO = '00000000-0000-4000-8000-0000000000c2'
const agora = new Date().toISOString()
const tables = {
  usuarios: [
    usuario(ADMIN, 'Ana Admin', 'admin', {}),
    usuario(BIA, 'Bia Comercial', 'comercial', { dashboard_comercial: true }),
    usuario(CAIO, 'Caio Comercial', 'comercial', { dashboard_comercial: true }),
    usuario(DANI, 'Dani Trafego', 'gestor_trafego', { dashboard_trafego: true }),
  ],
  funis_comerciais: [{ id: FUNIL_CAIO, usuario_id: CAIO, nome: 'Funil secreto do Caio', descricao: null,
    etapas: [{ id: 'c-a', nome: 'Topo Caio' }, { id: 'c-b', nome: 'Fundo Caio' }], created_at: agora, updated_at: agora }],
  funil_lancamentos: [{ id: LANC_CAIO, funil_id: FUNIL_CAIO, data: '2026-11-04', investimento: 777, valores: { 'c-a': 70, 'c-b': 7 }, perdidos: 1, faturamento: 900, observacoes: null, criado_por: CAIO, created_at: agora, updated_at: agora }],
  relatorios_comerciais: [{ id: randomUUID(), empresa: 'Legado SA', colaborador_id: BIA, colaborador_nome: 'Bia Comercial', data: '2026-11-02', origem: 'organico', ligacoes: 0, mensagens: 321, retorno_mensagens: 0, qualificados: 0, reunioes_agendadas: 0, reunioes_realizadas: 0, no_shows: 0, propostas_enviadas: 0, contratos_fechados: 0, faturamento_gerado: 0, observacoes: null }],
}
let tabelasAusentes = false
let importacaoAusente = false
let fontesAusentes = false
let contratosAusentes = false
const TABELAS_FUNIS = new Set(['funis_comerciais', 'funil_lancamentos'])
const escritas = []

function responderErro(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const table = url.pathname.split('/').pop()
  if (tabelasAusentes && TABELAS_FUNIS.has(table)) {
    return responderErro(res, 404, { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` })
  }
  if (importacaoAusente && table === 'funil_lancamentos' && url.search.includes('origem_importacao')) {
    return responderErro(res, 400, { code: '42703', message: 'column origem_importacao does not exist' })
  }
  if (contratosAusentes && table === 'funil_lancamentos' && ['POST', 'PATCH'].includes(req.method)) {
    return responderErro(res, 400, { code: 'PGRST204', message: "Could not find the 'contratos' column of 'funil_lancamentos' in the schema cache" })
  }
  if (fontesAusentes && TABELAS_FUNIS.has(table)) {
    const corpo = ['POST', 'PATCH'].includes(req.method)
    if (url.search.includes('fonte') || corpo) {
      return responderErro(res, 400, { code: 'PGRST204', message: "Could not find the 'fonte' column" })
    }
  }
  const reservado = ['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']
  const matches = (row) => [...url.searchParams].every(([key, expr]) => {
    if (reservado.includes(key)) return true
    const value = row[key]
    if (expr.startsWith('eq.')) return String(value) === expr.slice(3)
    if (expr.startsWith('in.(')) return expr.slice(4, -1).split(',').map((s) => s.replaceAll('"', '')).includes(String(value))
    if (expr.startsWith('gte.')) return value != null && String(value) >= expr.slice(4)
    if (expr.startsWith('lte.')) return value != null && String(value) <= expr.slice(4)
    return true
  })
  let rows = (tables[table] ?? []).filter(matches)
  if (!['GET', 'HEAD'].includes(req.method)) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const data = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
    escritas.push({ table, method: req.method, query: url.search, data })
    const nomeRepetido = (candidato, ignorarId) => (tables.funis_comerciais ?? []).some((f) =>
      f.id !== ignorarId && f.usuario_id === candidato.usuario_id &&
      f.nome.trim().toLowerCase() === candidato.nome.trim().toLowerCase())
    if (req.method === 'POST' && url.searchParams.has('on_conflict')) {
      const chaves = url.searchParams.get('on_conflict').split(',')
      rows = (Array.isArray(data) ? data : [data]).map((r) => {
        const atual = (tables[table] ?? []).find((x) => chaves.every((k) => x[k] != null && x[k] === r[k]))
        if (atual) return Object.assign(atual, r)
        const novo = { id: randomUUID(), created_at: new Date().toISOString(), ...r }
        ;(tables[table] ??= []).push(novo)
        return novo
      })
    } else if (req.method === 'POST') {
      const padrao = table === 'funil_lancamentos' ? { fonte: 'trafego' } : {}
      const novos = (Array.isArray(data) ? data : [data]).map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...padrao, ...r }))
      if (table === 'funis_comerciais' && novos.some((n) => nomeRepetido(n))) {
        return responderErro(res, 409, { code: '23505', message: 'duplicate key' })
      }
      ;(tables[table] ??= []).push(...novos)
      rows = novos
    } else if (req.method === 'PATCH') {
      if (table === 'funis_comerciais' && data.nome && rows.some((r) => nomeRepetido({ ...r, ...data }, r.id))) {
        return responderErro(res, 409, { code: '23505', message: 'duplicate key' })
      }
      rows.forEach((r) => Object.assign(r, data))
    } else if (req.method === 'DELETE') {
      const removidos = new Set(rows.map((r) => r.id))
      tables[table] = (tables[table] ?? []).filter((r) => !removidos.has(r.id))
      if (table === 'funis_comerciais') { // CASCADE
        tables.funil_lancamentos = tables.funil_lancamentos.filter((l) => !removidos.has(l.funil_id))
      }
    }
  }
  const ordem = url.searchParams.get('order')
  if (ordem) {
    const chaves = ordem.split(',').map((o) => o.split('.'))
    rows = [...rows].sort((a, b) => {
      for (const [campo, dir] of chaves) {
        const c = String(a[campo] ?? '').localeCompare(String(b[campo] ?? ''))
        if (c) return dir === 'desc' ? -c : c
      }
      return 0
    })
  }
  const total = rows.length
  const offset = Number(url.searchParams.get('offset') || 0)
  const limit = Number(url.searchParams.get('limit') || total)
  rows = rows.slice(offset, offset + limit)
  const single = req.headers.accept?.includes('application/vnd.pgrst.object+json')
  res.writeHead(200, { 'content-type': 'application/json', 'content-range': `${offset}-${Math.max(offset, offset + rows.length - 1)}/${total}` })
  res.end(req.method === 'HEAD' ? '' : JSON.stringify(single ? rows[0] ?? null : rows))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const dbPort = server.address().port

const portaLivre = createServer()
await new Promise((resolve) => portaLivre.listen(0, '127.0.0.1', resolve))
const port = portaLivre.address().port
await new Promise((resolve) => portaLivre.close(resolve))

const secret = randomUUID()
const qaEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', SESSION_SECRET: secret,
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${dbPort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-only', SUPABASE_SERVICE_ROLE_KEY: 'qa-only' }
const nextBin = path.join(source, 'node_modules/next/dist/bin/next')
let log = ''
console.log('BUILD', root)
const build = spawn(process.execPath, [nextBin, 'build'], { cwd: root, env: qaEnv, stdio: ['ignore', 'pipe', 'pipe'] })
build.stdout.on('data', (b) => { log += b })
build.stderr.on('data', (b) => { log += b })
const buildCode = await new Promise((resolve) => build.on('exit', resolve))
if (buildCode !== 0) {
  console.error(log.slice(-4000))
  server.closeAllConnections(); server.close()
  throw new Error(`Build falhou (${buildCode})`)
}
console.log('ok  next build passou')

const child = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: qaEnv, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.on('data', (b) => { log += b })
child.stderr.on('data', (b) => { log += b })
const base = `http://127.0.0.1:${port}`
const COMERCIAL = '/dashboard/comercial'
const NOV = 'mes=Novembro&ano=2026'
const shots = process.env.QA_SCREENSHOTS
if (shots) await mkdir(shots, { recursive: true })

let browser
const falhasPagina = []
let passos = 0
const ok = (msg) => { passos += 1; console.log('ok ', msg) }

try {
  for (let i = 0; i < 180; i++) {
    try { if ((await fetch(base + '/login')).ok) break } catch {}
    if (i === 179) throw new Error('Servidor não iniciou')
    await new Promise((r) => setTimeout(r, 500))
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
  const cookieDe = (id) => [{ name: 'anomalo_session', value: `${id}.${createHmac('sha256', secret).update(id).digest('hex')}`, url: base }]

  async function abrirSessao(id, viewport = { width: 1440, height: 1000 }) {
    const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
    await ctx.addCookies(cookieDe(id))
    await ctx.route('**/*', (route) => {
      const u = new URL(route.request().url())
      if (u.hostname === '127.0.0.1' || u.protocol === 'data:') return route.continue()
      return route.abort()
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => falhasPagina.push(e.message))
    page.on('response', (r) => { if (r.status() >= 500) falhasPagina.push(`HTTP ${r.status()} ${r.url()}`) })
    return { ctx, page }
  }
  async function ir(page, url) {
    const r = await page.goto(base + url, { waitUntil: 'networkidle', timeout: 90000 })
    assert.ok(r.status() < 400, `${url}: HTTP ${r.status()}`)
    assert.equal(await page.getByRole('heading', { name: /Não foi possível carregar esta página|Algo quebrou aqui/ }).count(), 0, `Boundary de erro em ${url}`)
    await abrirSecoes(page)
  }
  /** Evolução e Lançamentos começam recolhidas: abre as que estiverem fechadas. */
  async function abrirSecoes(page) {
    const fechadas = page.locator('main button[aria-expanded="false"]')
    for (let i = await fechadas.count(); i > 0; i--) {
      await fechadas.first().click()
    }
  }
  const texto = (page) => page.locator('main').innerText()
  const valorEtapa = (page, nome) => page.locator(`[data-etapa="${nome}"]`).innerText()
  const passo = (page, nome) => page.locator(`[data-passo="${nome}"]`).innerText()
  const dialogo = (page) => page.getByRole('dialog')
  const fechou = (page) => dialogo(page).waitFor({ state: 'detached', timeout: 20000 })
  const campo = (page, nome) => dialogo(page).getByLabel(nome, { exact: true })

  async function lancar(page, numeros, extras = {}) {
    await page.getByRole('button', { name: '+ Lançar números' }).click()
    if (extras.fonte) await dialogo(page).getByRole('radio', { name: extras.fonte, exact: true }).check()
    await campo(page, 'Data').fill(extras.data)
    if (extras.investimento) await campo(page, extras.fonte && extras.fonte !== 'Tráfego' ? 'Custo desta fonte (opcional)' : 'Valor investido no tráfego').fill(extras.investimento)
    for (const [nome, v] of Object.entries(numeros)) await campo(page, nome).fill(String(v))
    if (extras.perdidos) await campo(page, 'Contratos perdidos').fill(String(extras.perdidos))
    // Faturamento simples = um contrato de 1 mês com esse valor.
    const contratos = extras.contratos ?? (extras.faturamento ? [{ primeira: extras.faturamento, meses: '1' }] : [])
    for (const [i, c] of contratos.entries()) {
      await dialogo(page).getByRole('button', { name: '+ Adicionar contrato' }).click()
      const bloco = dialogo(page).locator(`[data-contrato="${i + 1}"]`)
      if (c.cliente) await bloco.getByLabel(/cliente/).fill(c.cliente)
      await bloco.getByLabel('1ª parcela').fill(c.primeira)
      if (c.mensal) await bloco.getByLabel('Demais parcelas').fill(c.mensal)
      if (c.meses) await bloco.getByLabel('Meses').fill(c.meses)
    }
    await dialogo(page).getByRole('button', { name: 'Lançar', exact: true }).click()
    await fechou(page)
    await page.waitForLoadState('networkidle')
    await abrirSecoes(page)
  }
  const funisDe = (id) => tables.funis_comerciais.filter((f) => f.usuario_id === id)

  /**
   * Confere o layout pela geometria: nada se sobrepõe, nada estoura a tela e
   * nenhum botão corta o próprio texto. É o que pega margem negativa e quebra
   * de linha ruim, que os testes de conteúdo não enxergam.
   */
  async function conferirLayout(page, contexto) {
    const problemas = await page.evaluate(() => {
      const achados = []
      const estouro = document.documentElement.scrollWidth - window.innerWidth
      if (estouro > 0) achados.push(`estouro horizontal de ${estouro}px`)
      const visivel = (el) => {
        const r = el.getBoundingClientRect()
        const c = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'
      }
      const nome = (el) => `${el.tagName.toLowerCase()}"${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`
      // Faixa que rola de lado de propósito não conta como estouro.
      const temRolagemPropria = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) return true
        }
        return false
      }
      const itens = [...document.querySelectorAll('main button, main a, main h1, main h2, main h3, main p, main select, main input, main td, main th, main dt, main dd')].filter(visivel)
      for (let i = 0; i < itens.length; i++) {
        const a = itens[i]
        const ra = a.getBoundingClientRect()
        if (ra.right > window.innerWidth + 1 && !temRolagemPropria(a)) achados.push(`${nome(a)} sai pela direita`)
        if (a.tagName === 'BUTTON' && a.scrollWidth > a.clientWidth + 1 && !a.closest('[class*="chips"]')) achados.push(`${nome(a)} corta o texto`)
        for (let j = i + 1; j < itens.length; j++) {
          const b = itens[j]
          if (a.contains(b) || b.contains(a)) continue
          const rb = b.getBoundingClientRect()
          const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
          const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
          if (x > 2 && y > 2) achados.push(`${nome(a)} sobrepõe ${nome(b)}`)
        }
      }
      // Menu e sino são fixos: com a página no topo, nada pode ficar sob eles.
      for (const seletor of ['.app-mobile-trigger', '.sino-trigger']) {
        const flutuante = document.querySelector(seletor)
        if (!flutuante || !visivel(flutuante)) continue
        const f = flutuante.getBoundingClientRect()
        for (const el of [...document.querySelectorAll('main .hero-banner, main .glass, main button, main h1, main h2, main p')].filter(visivel)) {
          const r = el.getBoundingClientRect()
          const x = Math.min(f.right, r.right) - Math.max(f.left, r.left)
          const y = Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top)
          if (x > 0 && y > 0) achados.push(`${seletor} cobre ${nome(el)}`)
        }
      }
      return achados
    })
    assert.deepEqual(problemas, [], `Layout quebrado: ${contexto}`)
  }

  /** Mesma tela em desktop, tablet, celular e celular pequeno. */
  async function conferirLarguras(page, url, contexto) {
    const original = page.viewportSize()
    for (const width of [1440, 1100, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await ir(page, url)
      await conferirLayout(page, `${contexto} em ${width}px`)
    }
    await page.setViewportSize(original)
  }

  function arquivoCsv(nome, conteudo) {
    return { name: nome, mimeType: 'text/csv', buffer: Buffer.from(conteudo) }
  }
  async function enviarArquivo(page, arquivo) {
    await page.getByRole('button', { name: 'Importar do Meta' }).click()
    await dialogo(page).getByLabel('Arquivo exportado (.csv ou .xlsx)').setInputFiles(arquivo)
  }

  // ── Bia: interface própria, sem nada do Caio ─────────────────────────────
  const bia = await abrirSessao(BIA)
  await ir(bia.page, `${COMERCIAL}?${NOV}`)
  let t = await texto(bia.page)
  assert.match(t, /Você ainda não tem funis/)
  assert.doesNotMatch(t, /Caio/)
  assert.equal(await bia.page.getByRole('link', { name: 'Histórico' }).count(), 0)
  assert.equal(await bia.page.getByText('Ver funis de').count(), 0)
  ok('comercial abre a própria interface vazia, sem abas de admin nem dados de outros')

  await bia.page.getByRole('button', { name: '+ Novo funil' }).click()
  await campo(bia.page, 'Nome do funil').fill('Funil de marketing')
  assert.equal(await dialogo(bia.page).locator('ol > li').count(), 6)
  await dialogo(bia.page).getByRole('button', { name: 'Criar funil' }).click()
  await fechou(bia.page)
  await bia.page.waitForURL(/funil=/)
  await bia.page.getByRole('button', { name: '+ Lançar números' }).waitFor()
  const mkt = funisDe(BIA)[0]
  assert.equal(mkt.etapas.length, 6)
  assert.deepEqual(mkt.etapas.map((e) => e.nome), ['Leads gerados', 'Responderam', 'Reuniões agendadas', 'Reuniões realizadas', 'Propostas enviadas', 'Contratos fechados'])
  ok('cria funil com as etapas padrão e o seleciona')

  // Lançamento vazio e dinheiro.
  await bia.page.getByRole('button', { name: '+ Lançar números' }).click()
  assert.ok(await campo(bia.page, 'Data').inputValue())
  await dialogo(bia.page).getByRole('button', { name: 'Lançar', exact: true }).click()
  await dialogo(bia.page).getByRole('alert').waitFor()
  assert.match(await dialogo(bia.page).getByRole('alert').innerText(), /pelo menos um número/)
  await campo(bia.page, 'Data').fill('')
  await campo(bia.page, 'Leads gerados').fill('5')
  const antesSemData = tables.funil_lancamentos.length
  await dialogo(bia.page).getByRole('button', { name: 'Lançar', exact: true }).click()
  await bia.page.waitForTimeout(400)
  assert.equal(tables.funil_lancamentos.length, antesSemData)
  assert.equal(await dialogo(bia.page).count(), 1)
  await bia.page.keyboard.press('Escape')
  await fechou(bia.page)
  ok('recusa lançamento vazio e sem data; Esc fecha o diálogo')

  await lancar(bia.page, { 'Leads gerados': 100, Responderam: 50, 'Reuniões agendadas': 10, 'Reuniões realizadas': 8, 'Propostas enviadas': 4, 'Contratos fechados': 2 },
    { data: '2026-11-03', investimento: '100000', perdidos: 3, faturamento: '500000' })
  const l1 = tables.funil_lancamentos.find((l) => l.funil_id === mkt.id)
  assert.equal(l1.data, '2026-11-03')
  assert.equal(Number(l1.investimento), 1000)
  assert.equal(Number(l1.faturamento), 5000)
  assert.equal(l1.perdidos, 3)
  assert.equal(l1.criado_por, BIA)
  assert.equal(l1.valores[mkt.etapas[0].id], 100)
  ok('grava data, investimento, etapas, perdidos e faturamento')

  await ir(bia.page, `${COMERCIAL}?${NOV}`)
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /100/)
  assert.match(await passo(bia.page, 'Responderam'), /50% avançaram/)
  assert.match(await passo(bia.page, 'Reuniões agendadas'), /20% avançaram/)
  assert.match(await passo(bia.page, 'Reuniões agendadas'), /Maior gargalo/)
  assert.match(await passo(bia.page, 'Reuniões realizadas'), /80% avançaram/)
  assert.doesNotMatch(await passo(bia.page, 'Responderam'), /Maior gargalo/)
  t = await texto(bia.page)
  assert.match(t, /Maior gargalo: de Responderam para Reuniões agendadas, só 20% avançaram/)
  assert.match(t, /Custo por Leads gerados\s+R\$\s*10/)
  assert.match(t, /Custo por Contratos fechados\s+R\$\s*500/)
  assert.match(t, /5x/)
  assert.doesNotMatch(t, /Taxa de fechamento|Contratos perdidos/)
  assert.match(await valorEtapa(bia.page, 'Contratos fechados'), /2% do topo/)
  const largura = (nome) => bia.page.locator(`[data-etapa="${nome}"]`).evaluate((el) => el.getBoundingClientRect().width)
  assert.ok(await largura('Leads gerados') > await largura('Responderam'))
  assert.ok(await largura('Responderam') > await largura('Contratos fechados'))
  ok('camadas afunilam e mostram %, gargalo, custos, retorno e taxa de fechamento corretos')

  // Evolução e Lançamentos: recolhidas por padrão, com resumo, e a escolha fica salva.
  await bia.page.evaluate(() => localStorage.clear())
  await bia.page.goto(base + `${COMERCIAL}?${NOV}`, { waitUntil: 'networkidle' })
  const botaoEvolucao = bia.page.getByRole('button', { name: /Evolução no período/ })
  const botaoLancamentos = bia.page.getByRole('button', { name: /Lançamentos/ })
  assert.equal(await botaoEvolucao.getAttribute('aria-expanded'), 'false')
  assert.equal(await botaoLancamentos.getAttribute('aria-expanded'), 'false')
  assert.match(await botaoEvolucao.innerText(), /6 semanas · 1 com lançamentos/)
  assert.match(await botaoLancamentos.innerText(), /1 lançamento · R\$\s*1\.000 investidos/)
  assert.equal(await bia.page.locator('[data-evolucao]').count(), 0)
  assert.equal(await bia.page.locator('[data-lancamento]').count(), 0)
  if (shots) await bia.page.screenshot({ path: `${shots}/15-recolhidas-desktop.png`, fullPage: true })
  await botaoEvolucao.click()
  await bia.page.locator('[data-evolucao]').waitFor()
  assert.equal(await botaoEvolucao.getAttribute('aria-expanded'), 'true')
  assert.match(await botaoEvolucao.innerText(), /Compare dia a dia/)
  await bia.page.reload({ waitUntil: 'networkidle' })
  await bia.page.locator('[data-evolucao]').waitFor()
  assert.equal(await botaoLancamentos.getAttribute('aria-expanded'), 'false')
  await botaoEvolucao.click()
  assert.equal(await bia.page.locator('[data-evolucao]').count(), 0)
  await botaoLancamentos.focus()
  await bia.page.keyboard.press('Enter')
  await bia.page.locator('[data-lancamento]').first().waitFor()
  await bia.page.keyboard.press('Space')
  assert.equal(await bia.page.locator('[data-lancamento]').count(), 0)
  if (shots) {
    await bia.page.setViewportSize({ width: 390, height: 844 })
    await bia.page.reload({ waitUntil: 'networkidle' })
    await bia.page.screenshot({ path: `${shots}/16-recolhidas-celular.png`, fullPage: true })
    await bia.page.setViewportSize({ width: 1440, height: 1000 })
  }
  ok('Evolução e Lançamentos recolhidas com resumo; abrem pela setinha ou teclado e lembram a escolha')
  if (shots) await bia.page.screenshot({ path: `${shots}/1-funil-desktop.png`, fullPage: true })

  // Filtros de data.
  await lancar(bia.page, { 'Leads gerados': 40, Responderam: 30 }, { data: '2026-11-10', investimento: '50000' })
  await lancar(bia.page, { 'Leads gerados': 7 }, { data: '2026-03-15' })
  await ir(bia.page, `${COMERCIAL}?${NOV}`)
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /140/)
  ok('o mês soma só os lançamentos do mês')

  // Filtro enxuto: só Mês, Dia e Intervalo, o mesmo seletor do Caixa.
  const modos = bia.page.locator('main .hero-banner button')
  assert.deepEqual(await modos.allInnerTexts(), ['Mês', 'Dia', 'Intervalo'])
  assert.equal(await bia.page.getByRole('button', { name: 'Semana', exact: true }).count(), 0)
  assert.equal(await bia.page.getByRole('button', { name: 'Ano', exact: true }).count(), 0)
  ok('filtro de período enxuto: Mês, Dia e Intervalo')

  // Trocar o mês pelo seletor mantém o funil na URL.
  await bia.page.locator('main .hero-banner select').first().selectOption('Março')
  await bia.page.getByRole('heading', { name: /Março 2026/ }).waitFor()
  await bia.page.waitForLoadState('networkidle')
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /\b7\b/)
  ok('trocar o mês pelo seletor funciona e mantém o funil')

  await ir(bia.page, `${COMERCIAL}?modo=dia&de=2026-11-03`)
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /100/)
  await ir(bia.page, `${COMERCIAL}?modo=dia&de=2026-11-04`)
  assert.match(await texto(bia.page), /Nenhum lançamento neste período/)
  ok('Dia filtra um dia exato, e dia vazio não quebra')

  await ir(bia.page, `${COMERCIAL}?modo=intervalo&de=2026-01-01&ate=2026-12-31`)
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /147/)
  assert.equal(await bia.page.locator('[data-evolucao] tbody tr').count(), 12)
  assert.equal(await bia.page.getByRole('button', { name: 'Por dia' }).count(), 0)
  ok('Intervalo de um ano soma tudo, abre por mês e não oferece "por dia"')

  await ir(bia.page, `${COMERCIAL}?modo=intervalo&de=2026-03-01&ate=2026-11-05`)
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /107/)
  await bia.page.locator('main .hero-banner input[type="date"]').nth(1).fill('2026-11-30')
  await bia.page.waitForURL(/ate=2026-11-30/)
  await bia.page.waitForLoadState('networkidle')
  await bia.page.locator('[data-etapa="Leads gerados"]', { hasText: '147' }).waitFor()
  ok('Intervalo funciona pela URL e pelos campos de data')

  // Semana a semana.
  await ir(bia.page, `${COMERCIAL}?${NOV}`)
  const linhas = bia.page.locator('[data-evolucao] tbody tr')
  assert.equal(await linhas.count(), 6)
  assert.match(await bia.page.locator('[data-evolucao] tbody tr', { hasText: '02 – 08 nov' }).innerText(), /100[\s\S]*50[\s\S]*50%/)
  assert.match(await bia.page.locator('[data-evolucao] tbody tr', { hasText: '09 – 15 nov' }).innerText(), /40[\s\S]*30[\s\S]*75%/)
  await bia.page.getByRole('button', { name: 'Por dia' }).click()
  await bia.page.waitForURL(/agrupar=dia/)
  assert.equal(await linhas.count(), 30)
  ok('evolução semana a semana com %, e troca para por dia')

  // Editar e excluir lançamento.
  await ir(bia.page, `${COMERCIAL}?${NOV}`)
  await bia.page.getByRole('button', { name: 'Editar lançamento de 10 nov 2026' }).click()
  assert.equal(await campo(bia.page, 'Leads gerados').inputValue(), '40')
  assert.equal(await campo(bia.page, 'Data').inputValue(), '2026-11-10')
  await campo(bia.page, 'Leads gerados').fill('60')
  await dialogo(bia.page).getByRole('button', { name: 'Salvar', exact: true }).click()
  await fechou(bia.page)
  await bia.page.waitForLoadState('networkidle')
  await bia.page.locator('[data-etapa="Leads gerados"]', { hasText: '160' }).waitFor()
  ok('edita lançamento e o funil recalcula')

  await bia.page.getByRole('button', { name: 'Editar lançamento de 10 nov 2026' }).click()
  await campo(bia.page, 'Data').fill('2026-12-01')
  await dialogo(bia.page).getByRole('button', { name: 'Salvar', exact: true }).click()
  await fechou(bia.page)
  await bia.page.locator('[data-etapa="Leads gerados"]', { hasText: '100' }).waitFor()
  await ir(bia.page, `${COMERCIAL}?mes=Dezembro&ano=2026`)
  await bia.page.getByRole('button', { name: 'Excluir lançamento de 01 dez 2026' }).click()
  await dialogo(bia.page).getByRole('button', { name: 'Excluir lançamento' }).click()
  await fechou(bia.page)
  await bia.page.getByText('Nenhum lançamento neste período').waitFor()
  assert.equal(tables.funil_lancamentos.filter((l) => l.funil_id === mkt.id).length, 2)
  ok('mudar a data muda o período do lançamento; excluir remove')

  // Editar funil: renomear, reordenar, adicionar e remover.
  await ir(bia.page, `${COMERCIAL}?${NOV}`)
  const idsAntes = mkt.etapas.map((e) => e.id)
  await bia.page.getByRole('button', { name: 'Editar funil' }).click()
  await dialogo(bia.page).getByLabel('Nome da etapa 1').fill('Leads do Meta')
  await dialogo(bia.page).getByRole('button', { name: 'Remover Propostas enviadas' }).click()
  await dialogo(bia.page).getByText('deixam de aparecer no funil').waitFor()
  await dialogo(bia.page).getByRole('button', { name: 'Subir Reuniões realizadas' }).click()
  await dialogo(bia.page).getByRole('button', { name: '+ Adicionar etapa' }).click()
  await dialogo(bia.page).getByLabel('Nome da etapa 6').fill('Leads do Meta')
  await dialogo(bia.page).getByRole('button', { name: 'Salvar funil' }).click()
  await dialogo(bia.page).getByRole('alert').waitFor()
  assert.match(await dialogo(bia.page).getByRole('alert').innerText(), /repetida/)
  await dialogo(bia.page).getByLabel('Nome da etapa 6').fill('Onboarding')
  await dialogo(bia.page).getByRole('button', { name: 'Salvar funil' }).click()
  await fechou(bia.page)
  await bia.page.locator('[data-etapa="Leads do Meta"]', { hasText: '100' }).waitFor()
  const depois = funisDe(BIA)[0].etapas
  assert.deepEqual(depois.map((e) => e.nome), ['Leads do Meta', 'Responderam', 'Reuniões realizadas', 'Reuniões agendadas', 'Contratos fechados', 'Onboarding'])
  assert.equal(depois[0].id, idsAntes[0])
  assert.equal(depois[2].id, idsAntes[3])
  assert.ok(!idsAntes.includes(depois[5].id))
  assert.match(await valorEtapa(bia.page, 'Reuniões realizadas'), /8/)
  assert.match(await valorEtapa(bia.page, 'Onboarding'), /\b0\b/)
  assert.equal(await bia.page.locator('[data-etapa="Propostas enviadas"]').count(), 0)
  ok('renomear e reordenar preservam os números; etapa nova começa zerada; nome repetido é recusado')

  // Segundo funil, com números separados.
  await bia.page.getByRole('button', { name: '+ Novo funil' }).click()
  await campo(bia.page, 'Nome do funil').fill('  funil DE marketing ')
  await dialogo(bia.page).getByRole('button', { name: 'Criar funil' }).click()
  await dialogo(bia.page).getByRole('alert').waitFor()
  assert.match(await dialogo(bia.page).getByRole('alert').innerText(), /Já existe um funil/)
  await campo(bia.page, 'Nome do funil').fill('Só o sistema')
  while (await dialogo(bia.page).locator('ol > li').count() > 2) {
    await dialogo(bia.page).getByRole('button', { name: /^Remover (?!fonte)/ }).first().click()
  }
  assert.equal(await dialogo(bia.page).getByRole('button', { name: /^Remover (?!fonte)/ }).first().isDisabled(), true)
  await dialogo(bia.page).getByRole('button', { name: 'Criar funil' }).click()
  await fechou(bia.page)
  await bia.page.waitForLoadState('networkidle')
  await bia.page.getByRole('button', { name: 'Só o sistema', pressed: true }).waitFor()
  assert.match(await texto(bia.page), /Nenhum lançamento neste período/)
  await bia.page.getByRole('button', { name: 'Funil de marketing' }).click()
  await bia.page.locator('[data-etapa="Leads do Meta"]', { hasText: '100' }).waitFor()
  ok('funis separados: nome repetido recusado, mínimo de 2 etapas e números que não se misturam')

  // Layout com descrição: o caso do print em que o texto cobria os botões.
  await bia.page.getByRole('button', { name: '+ Novo funil' }).click()
  await campo(bia.page, 'Nome do funil').fill('Campanha com um nome bem comprido para testar a quebra de linha')
  await campo(bia.page, 'Descrição (opcional)').fill('Processo comercial para fechamento de planos de Marketing, com texto longo o bastante para quebrar em mais de uma linha no celular.')
  await dialogo(bia.page).getByRole('button', { name: 'Criar funil' }).click()
  await fechou(bia.page)
  await bia.page.waitForURL(/funil=/)
  const funilLongo = funisDe(BIA).find((f) => f.nome.startsWith('Campanha com um nome'))
  await bia.page.waitForLoadState('networkidle')
  const URL_LONGO = `${COMERCIAL}?${NOV}&funil=${funilLongo.id}`
  await conferirLarguras(bia.page, URL_LONGO, 'funil vazio com descrição')
  await conferirLarguras(bia.page, `${COMERCIAL}?${NOV}&funil=${mkt.id}`, 'funil com números')
  await conferirLarguras(bia.page, `${COMERCIAL}?modo=intervalo&de=2026-03-01&ate=2026-11-30&funil=${mkt.id}`, 'intervalo')
  await conferirLarguras(bia.page, `${COMERCIAL}?mes=Janeiro&ano=2025&funil=${mkt.id}`, 'período sem hoje')
  ok('layout sem sobreposição nem estouro em 1440, 820, 390 e 320px, com descrição longa')
  if (shots) {
    await bia.page.setViewportSize({ width: 1440, height: 1000 })
    await ir(bia.page, URL_LONGO)
    await bia.page.screenshot({ path: `${shots}/5-vazio-desktop.png`, fullPage: true })
    await bia.page.setViewportSize({ width: 390, height: 844 })
    await ir(bia.page, URL_LONGO)
    await bia.page.screenshot({ path: `${shots}/6-vazio-celular.png`, fullPage: true })
    await ir(bia.page, `${COMERCIAL}?${NOV}&funil=${mkt.id}`)
    await bia.page.screenshot({ path: `${shots}/7-numeros-celular.png`, fullPage: true })
    await bia.page.setViewportSize({ width: 1440, height: 1000 })
  }

  // Fontes de demanda: mesmo funil, sem ir ao servidor para alternar.
  const fontesFunil = funisDe(BIA).find((f) => f.nome === 'Só o sistema')
  await ir(bia.page, `${COMERCIAL}?${NOV}&funil=${fontesFunil.id}`)
  const [topoNome, fundoNome] = fontesFunil.etapas.map((e) => e.nome)
  assert.deepEqual(fontesFunil.fontes.map((f) => f.id), ['trafego', 'indicacao', 'prospeccao'])
  await lancar(bia.page, { [topoNome]: 100, [fundoNome]: 2 }, { data: '2026-11-03', investimento: '100000', faturamento: '200000' })
  await lancar(bia.page, { [topoNome]: 10, [fundoNome]: 5 }, { data: '2026-11-04', fonte: 'Indicação', faturamento: '900000', perdidos: 1 })
  await lancar(bia.page, { [topoNome]: 50, [fundoNome]: 1 }, { data: '2026-11-05', fonte: 'Prospecção fria' })
  const lancsFontes = tables.funil_lancamentos.filter((l) => l.funil_id === fontesFunil.id)
  assert.deepEqual(lancsFontes.map((l) => l.fonte).sort(), ['indicacao', 'prospeccao', 'trafego'])
  ok('lançar registra a fonte escolhida')

  await bia.page.locator(`[data-etapa="${topoNome}"]`, { hasText: '160' }).waitFor()
  const seletorFontes = bia.page.getByRole('group', { name: 'Filtrar por fonte' })
  assert.match(await seletorFontes.getByRole('button', { name: /Todas as fontes/, pressed: true }).innerText(), /160/)
  assert.match(await seletorFontes.getByRole('button', { name: /Indicação/ }).innerText(), /10/)
  t = await texto(bia.page)
  assert.match(t, /Comparação entre fontes/)
  assert.match(await bia.page.locator('tbody tr', { hasText: 'Indicação' }).first().innerText(), /10[\s\S]*5[\s\S]*50%/)
  ok('a visão geral soma as fontes e compara lado a lado, no mesmo funil')

  // Trocar de fonte não pode gerar nenhuma requisição: é o que torna instantâneo.
  const requisicoes = []
  // Só conta dado do próprio app: navegação e fetch de RSC ou de action.
  const espiaRede = (r) => {
    const u = new URL(r.url())
    if (u.hostname === '127.0.0.1' && ['document', 'fetch', 'xhr'].includes(r.resourceType())) requisicoes.push(r.url())
  }
  bia.page.on('request', espiaRede)
  await seletorFontes.getByRole('button', { name: /Indicação/ }).click()
  await bia.page.locator(`[data-etapa="${topoNome}"]`, { hasText: '10' }).waitFor({ timeout: 300 })
  await bia.page.waitForURL(/fonte=indicacao/, { timeout: 300 })
  t = await texto(bia.page)
  assert.match(await passo(bia.page, fundoNome), /50% avançaram/)
  assert.match(t, /Funil · Indicação/)
  assert.match(t, /Nenhum|Custo por/)
  assert.doesNotMatch(t, /Comparação entre fontes/)
  assert.match(t, /Investido\s+R\$\s*0/)
  assert.match(t, /Entrada no 1º mês\s+R\$\s*9\.000/)
  assert.equal(await bia.page.locator('[data-lancamento]').count(), 1)
  await seletorFontes.getByRole('button', { name: /Tráfego/ }).click()
  await bia.page.locator(`[data-etapa="${topoNome}"]`, { hasText: '100' }).waitFor({ timeout: 300 })
  assert.match(await passo(bia.page, fundoNome), /2% avançaram/)
  assert.match(await texto(bia.page), /Investido no tráfego\s+R\$\s*1\.000/)
  assert.match(await texto(bia.page), /Custo por .*\s+R\$\s*500/)
  await seletorFontes.getByRole('button', { name: /Prospecção fria/ }).click()
  await bia.page.locator(`[data-etapa="${topoNome}"]`, { hasText: '50' }).waitFor({ timeout: 300 })
  await bia.page.getByRole('button', { name: 'Por semana' }).click()
  await bia.page.waitForURL(/agrupar=semana/, { timeout: 300 })
  await bia.page.waitForTimeout(150)
  bia.page.off('request', espiaRede)
  assert.deepEqual(requisicoes, [], 'trocar fonte ou agrupamento não pode ir ao servidor')
  ok('alternar fonte recalcula funil, %, gargalo e custos na hora, com 0 requisições')

  // A fonte sobrevive a recarregar e a trocar o período, e pré-seleciona o lançamento.
  await bia.page.reload({ waitUntil: 'networkidle' })
  await seletorFontes.getByRole('button', { name: /Prospecção fria/, pressed: true }).waitFor()
  await bia.page.getByRole('button', { name: '+ Lançar números' }).click()
  assert.equal(await dialogo(bia.page).getByRole('radio', { name: 'Prospecção fria', exact: true }).isChecked(), true)
  assert.equal(await campo(bia.page, 'Custo desta fonte (opcional)').count(), 1)
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)
  await bia.page.locator('main .hero-banner select').first().selectOption('Outubro')
  await bia.page.getByRole('heading', { name: /Outubro 2026/ }).waitFor()
  await bia.page.waitForLoadState('networkidle')
  assert.match(bia.page.url(), /fonte=prospeccao/)
  assert.match(await texto(bia.page), /Sem números de Prospecção fria neste período/)
  await ir(bia.page, `${COMERCIAL}?${NOV}&funil=${fontesFunil.id}&fonte=inexistente`)
  await seletorFontes.getByRole('button', { name: /Todas as fontes/, pressed: true }).waitFor()
  ok('a fonte sobrevive a recarregar e a trocar o período; fonte inválida cai em Todas')

  // Mudar a fonte de um lançamento já feito.
  await bia.page.getByRole('button', { name: 'Editar lançamento de 05 nov 2026' }).click()
  await dialogo(bia.page).getByRole('radio', { name: 'Indicação', exact: true }).check()
  await dialogo(bia.page).getByRole('button', { name: 'Salvar', exact: true }).click()
  await fechou(bia.page)
  await seletorFontes.getByRole('button', { name: /Indicação/ }).locator('strong', { hasText: '60' }).waitFor()
  ok('editar um lançamento muda a fonte dele')

  // Editar as fontes do funil: renomear, adicionar e remover.
  await bia.page.getByRole('button', { name: 'Editar funil' }).click()
  const dlgFonte = dialogo(bia.page)
  assert.equal(await dlgFonte.getByRole('button', { name: 'Remover fonte Tráfego' }).isDisabled(), true)
  await dlgFonte.getByLabel('Nome da fonte 2').fill('Indicação de cliente')
  await dlgFonte.getByRole('button', { name: '+ Adicionar fonte' }).click()
  await dlgFonte.getByLabel('Nome da fonte 4').fill('Eventos')
  await dlgFonte.getByRole('button', { name: 'Remover fonte Indicação de cliente' }).click()
  await dlgFonte.getByRole('button', { name: 'Salvar funil' }).click()
  await dlgFonte.getByRole('alert').waitFor()
  assert.match(await dlgFonte.getByRole('alert').innerText(), /tem lançamentos/)
  assert.equal(fontesFunil.fontes.length, 3, 'fonte com lançamento não pode sair')
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)

  await bia.page.getByRole('button', { name: 'Editar funil' }).click()
  await dlgFonte.getByLabel('Nome da fonte 2').fill('Indicação de cliente')
  await dlgFonte.getByRole('button', { name: 'Remover fonte Prospecção fria' }).click()
  await dlgFonte.getByRole('button', { name: '+ Adicionar fonte' }).click()
  await dlgFonte.getByLabel('Nome da fonte 3').fill('Eventos')
  await dlgFonte.getByRole('button', { name: 'Salvar funil' }).click()
  await fechou(bia.page)
  await seletorFontes.getByRole('button', { name: /Eventos/ }).waitFor()
  assert.deepEqual(fontesFunil.fontes.map((f) => f.nome), ['Tráfego', 'Indicação de cliente', 'Eventos'])
  assert.equal(fontesFunil.fontes[1].id, 'indicacao', 'renomear mantém o vínculo com os lançamentos')
  await seletorFontes.getByRole('button', { name: /Indicação de cliente/ }).locator('strong', { hasText: '60' }).waitFor()
  ok('fontes editáveis: renomear mantém os números, Tráfego é fixa e fonte em uso não sai')

  // Layout com o seletor de fontes em todas as larguras.
  await conferirLarguras(bia.page, `${COMERCIAL}?${NOV}&funil=${fontesFunil.id}`, 'funil com fontes')
  await conferirLarguras(bia.page, `${COMERCIAL}?${NOV}&funil=${fontesFunil.id}&fonte=trafego`, 'uma fonte aberta')
  ok('seletor de fontes e comparação sem sobreposição nem estouro nas 5 larguras')
  if (shots) {
    await bia.page.setViewportSize({ width: 1440, height: 1000 })
    await ir(bia.page, `${COMERCIAL}?${NOV}&funil=${fontesFunil.id}`)
    await bia.page.screenshot({ path: `${shots}/10-fontes-desktop.png`, fullPage: true })
    await bia.page.setViewportSize({ width: 390, height: 844 })
    await ir(bia.page, `${COMERCIAL}?${NOV}&funil=${fontesFunil.id}`)
    await bia.page.screenshot({ path: `${shots}/11-fontes-celular.png`, fullPage: true })
    await bia.page.screenshot({ path: `${shots}/12-topo-celular.png` })
    await bia.page.evaluate(() => window.scrollTo(0, 57))
    await bia.page.screenshot({ path: `${shots}/13-rolado-celular.png` })
    await bia.page.getByRole('button', { name: '+ Lançar números' }).click()
    await bia.page.screenshot({ path: `${shots}/14-lancar-celular.png` })
    await bia.page.keyboard.press('Escape'); await fechou(bia.page)
    await bia.page.setViewportSize({ width: 1440, height: 1000 })
  }

  // Sem a migration de fontes, salvar explica o que falta em vez de quebrar.
  fontesAusentes = true
  await bia.page.getByRole('button', { name: '+ Lançar números' }).click()
  await campo(bia.page, topoNome).fill('1')
  await dialogo(bia.page).getByRole('button', { name: 'Lançar', exact: true }).click()
  await dialogo(bia.page).getByText(/20261108_funis_fontes_demanda/).waitFor()
  fontesAusentes = false
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)
  ok('sem a migration de fontes, gravar explica o que falta')

  // Contratos com parcelas: 1ª parcela diferente das demais (produto extra).
  const DEZ = 'mes=Dezembro&ano=2026'
  await ir(bia.page, `${COMERCIAL}?${DEZ}&funil=${fontesFunil.id}`)
  await bia.page.getByRole('button', { name: '+ Lançar números' }).click()
  await campo(bia.page, 'Data').fill('2026-12-02')
  await campo(bia.page, 'Valor investido no tráfego').fill('9700')
  await campo(bia.page, topoNome).fill('5')
  await campo(bia.page, fundoNome).fill('3')
  const adicionar = dialogo(bia.page).getByRole('button', { name: '+ Adicionar contrato' })
  const contratosDoTeste = [
    { cliente: 'Loja Centro', primeira: '384700', mensal: '114700' },
    { primeira: '99700' },
    { primeira: '60000' },
    { primeira: '' }, // linha deixada em branco: ignorada
  ]
  for (const [i, c] of contratosDoTeste.entries()) {
    await adicionar.click()
    const bloco = dialogo(bia.page).locator(`[data-contrato="${i + 1}"]`)
    assert.equal(await bloco.getByLabel('Meses').inputValue(), '3', 'contrato começa com 3 meses')
    if (c.cliente) await bloco.getByLabel(/cliente/).fill(c.cliente)
    if (c.primeira) await bloco.getByLabel('1ª parcela').fill(c.primeira)
    if (c.mensal) await bloco.getByLabel('Demais parcelas').fill(c.mensal)
  }
  assert.match(await dialogo(bia.page).locator('[data-contrato="1"]').innerText(), /Total do contrato: R\$\s*6\.141[\s\S]*3\.847[\s\S]*2 ×[\s\S]*1\.147/)
  assert.match(await dialogo(bia.page).locator('[data-contratos-resumo]').innerText(), /3 contratos · 1º mês R\$\s*5\.444 · total R\$\s*10\.932/)
  // Remover tira só o contrato escolhido.
  await dialogo(bia.page).getByRole('button', { name: 'Remover contrato 4' }).click()
  assert.equal(await dialogo(bia.page).locator('[data-contrato]').count(), 3)
  if (shots) await dialogo(bia.page).screenshot({ path: `${shots}/15-contratos-dialogo.png` })

  contratosAusentes = true
  await dialogo(bia.page).getByRole('button', { name: 'Lançar', exact: true }).click()
  await dialogo(bia.page).getByText(/20261109_funil_lancamentos_contratos/).waitFor()
  contratosAusentes = false
  await dialogo(bia.page).getByRole('button', { name: 'Lançar', exact: true }).click()
  await fechou(bia.page)
  await bia.page.waitForLoadState('networkidle')
  const comContratos = tables.funil_lancamentos.find((l) => l.funil_id === fontesFunil.id && l.data === '2026-12-02')
  assert.deepEqual(comContratos.contratos, [
    { cliente: 'Loja Centro', primeira: 3847, mensal: 1147, meses: 3 },
    { primeira: 997, mensal: 997, meses: 3 },
    { primeira: 600, mensal: 600, meses: 3 },
  ])
  assert.equal(Number(comContratos.faturamento), 5444)
  await bia.page.locator(`[data-etapa="${topoNome}"]`, { hasText: '5' }).waitFor()
  await bia.page.locator('[data-lancamento="2026-12-02"]').waitFor()
  t = await texto(bia.page)
  assert.match(t, /Entrada no 1º mês\s+R\$\s*5\.444/)
  assert.match(t, /Recorrência mensal\s+R\$\s*2\.744/)
  assert.match(t, /Total contratado\s+R\$\s*10\.932/)
  assert.match(t, /Ticket médio do contrato\s+R\$\s*3\.644/)
  assert.match(t, /Retorno do total contratado\s+113x/)
  assert.match(t, /56x o investido/)
  assert.match(await bia.page.locator('[data-lancamento="2026-12-02"]').innerText(), /3 contratos: R\$\s*10\.932/)
  ok('contratos: 1ª parcela diferente, demais parcelas e meses; 1º mês, recorrência, total e retorno')

  // Editar mantém a lista e permite mudar a duração.
  await bia.page.getByRole('button', { name: 'Editar lançamento de 02 dez 2026' }).click()
  assert.equal(await dialogo(bia.page).locator('[data-contrato]').count(), 3)
  assert.equal(await dialogo(bia.page).locator('[data-contrato="1"]').getByLabel(/cliente/).inputValue(), 'Loja Centro')
  await dialogo(bia.page).locator('[data-contrato="3"]').getByLabel('Meses').fill('6')
  await dialogo(bia.page).getByRole('button', { name: 'Salvar', exact: true }).click()
  await fechou(bia.page)
  await bia.page.getByText(/Total contratado\s*R\$\s*12\.732/).waitFor()
  assert.equal(tables.funil_lancamentos.find((l) => l.id === comContratos.id).contratos[2].meses, 6)
  ok('editar lançamento mantém os contratos e recalcula o total')

  await conferirLarguras(bia.page, `${COMERCIAL}?${DEZ}&funil=${fontesFunil.id}`, 'contratos')
  for (const largura of [390, 320]) {
    await bia.page.setViewportSize({ width: largura, height: 800 })
    await bia.page.getByRole('button', { name: 'Editar lançamento de 02 dez 2026' }).click()
    const caixa = await dialogo(bia.page).locator('[data-contrato="1"]').boundingBox()
    assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= largura, `contrato fora da tela em ${largura}px`)
    const estouroDialogo = await dialogo(bia.page).evaluate((el) => el.scrollWidth - el.clientWidth)
    assert.ok(estouroDialogo <= 0, `diálogo com estouro horizontal em ${largura}px`)
    if (shots && largura === 390) await bia.page.screenshot({ path: `${shots}/16-contratos-celular.png` })
    await bia.page.keyboard.press('Escape'); await fechou(bia.page)
  }
  await bia.page.setViewportSize({ width: 1440, height: 1000 })
  // Os 4 cartões de resultado: uma linha no desktop, 2 + 2 no celular.
  for (const [largura, colunas] of [[1440, 4], [1100, 4], [820, 4], [390, 2], [320, 2]]) {
    await bia.page.setViewportSize({ width: largura, height: 900 })
    const tops = await bia.page.locator('[data-resultados] > *').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    assert.equal(tops.length, 4)
    assert.equal(new Set(tops).size, 4 / colunas, `${largura}px: esperava ${colunas} por linha, linhas em ${tops}`)
  }
  await bia.page.setViewportSize({ width: 1440, height: 1000 })
  ok('contratos cabem no celular; resultados em 4 colunas no desktop e 2 + 2 no celular')

  // Importação: relatório de campanhas com dia, duas campanhas e linha de resumo.
  const CSV_META = '\uFEFF' + [
    'Dia,Nome da campanha,Alcance,Impressões,Resultados,Indicador de resultados,Custo por resultados,Valor usado (BRL),Início dos relatórios,Término dos relatórios',
    ',,9000,20000,41,,,1041.00,2026-10-01,2026-10-31',
    '2026-10-05,[MKT] Leads,1000,2000,20,actions:lead,5.00,100.50,2026-10-01,2026-10-31',
    '2026-10-05,[SIS] Sistema,800,1500,5,actions:lead,9.00,45.00,2026-10-01,2026-10-31',
    '2026-10-12,[MKT] Leads,1200,2500,16,actions:lead,6.00,96.00,2026-10-01,2026-10-31',
  ].join('\n')
  const importarEm = funilLongo
  await ir(bia.page, URL_LONGO)
  await enviarArquivo(bia.page, arquivoCsv('meta-outubro.csv', CSV_META))
  const dlg = dialogo(bia.page)
  await dlg.getByText('Relatório de campanhas').waitFor()
  const primeiraEtapa = importarEm.etapas[0]
  assert.match(await dlg.getByLabel(primeiraEtapa.nome, { exact: true }).locator('option:checked').innerText(), /^Resultados/)
  assert.equal(await dlg.getByLabel('Valor investido').locator('option:checked').innerText(), 'Valor usado (BRL)')
  assert.equal(await dlg.getByLabel('Data', { exact: true }).locator('option:checked').innerText(), 'Dia')
  assert.match(await dlg.getByLabel(primeiraEtapa.nome, { exact: true }).locator('option:checked').innerText(), /Resultados \(41\)/)
  const opcoes = await dlg.getByLabel(primeiraEtapa.nome, { exact: true }).locator('option').allInnerTexts()
  assert.ok(!opcoes.some((o) => /Alcance|Custo/.test(o)), 'Alcance e custo não podem ser opção')
  let textoDlg = await dlg.innerText()
  assert.match(textoDlg, /1 linha\(s\) ficaram de fora/)
  assert.match(textoDlg, /R\$\s*241,50|R\$\s*241,5/)
  if (shots) await bia.page.screenshot({ path: `${shots}/8-importar-desktop.png` })
  const antesDeImportar = tables.funil_lancamentos.length
  await dlg.getByLabel(/\[SIS\] Sistema/).uncheck()
  await dlg.getByText(/Campanhas deste funil \(1 de 2\)/).waitFor()
  textoDlg = await dlg.innerText()
  assert.match(textoDlg, /R\$\s*196,5/)
  assert.equal(tables.funil_lancamentos.length, antesDeImportar, 'ler o arquivo não pode gravar')
  ok('importação: reconhece as colunas, ignora o resumo, não oferece Alcance e só lê sem gravar')

  await dlg.getByRole('button', { name: 'Importar 2 data(s)' }).click()
  await fechou(bia.page)
  await bia.page.waitForURL(/modo=intervalo.*de=2026-10-05/)
  await bia.page.getByRole('heading', { name: /05 out – 12 out/ }).waitFor()
  await bia.page.locator(`[data-etapa="${primeiraEtapa.nome}"]`, { hasText: '36' }).waitFor()
  const importadas = () => tables.funil_lancamentos.filter((l) => l.funil_id === importarEm.id && l.origem_importacao === 'meta')
  assert.equal(importadas().length, 2)
  assert.ok(importadas().every((l) => l.fonte === 'trafego'))
  assert.equal(importadas().find((l) => l.data === '2026-10-05').investimento, 100.5)
  assert.deepEqual(importadas()[0].detalhe_importacao, { arquivo: 'meta-outubro.csv', campanhas: ['[MKT] Leads'] })
  assert.match(await texto(bia.page), /Importado do Meta/)
  assert.match(await texto(bia.page), /Investido\s+R\$\s*196/)
  ok('importa os totais por data, leva para o período importado e marca a origem')

  // Completar à mão e reimportar: não soma e não apaga o que foi completado.
  await bia.page.getByRole('button', { name: 'Editar lançamento de 05 out 2026' }).click()
  assert.equal(await dialogo(bia.page).getByRole('radio').count(), 0, 'importado fica em tráfego')
  await dialogo(bia.page).getByText(/Veio do arquivo do Meta/).waitFor()
  await campo(bia.page, importarEm.etapas[1].nome).fill('9')
  await campo(bia.page, 'Contratos perdidos').fill('1')
  await dialogo(bia.page).getByRole('button', { name: 'Salvar', exact: true }).click()
  await fechou(bia.page)
  await bia.page.locator(`[data-etapa="${importarEm.etapas[1].nome}"]`, { hasText: '9' }).waitFor()
  await enviarArquivo(bia.page, arquivoCsv('meta-outubro.csv', CSV_META))
  await dlg.getByText(/2 data\(s\) já foram importadas e\s+serão atualizadas/).waitFor({ timeout: 20000 })
  await dlg.getByLabel(/\[SIS\] Sistema/).uncheck()
  await dlg.getByRole('button', { name: 'Importar 2 data(s)' }).click()
  await fechou(bia.page)
  await bia.page.waitForLoadState('networkidle')
  assert.equal(importadas().length, 2, 'reimportar não pode duplicar')
  const reimportada = importadas().find((l) => l.data === '2026-10-05')
  assert.equal(reimportada.valores[primeiraEtapa.id], 20)
  assert.equal(reimportada.valores[importarEm.etapas[1].id], 9)
  assert.equal(reimportada.perdidos, 1)
  assert.equal(reimportada.investimento, 100.5)
  ok('reimportar atualiza sem somar e preserva o que foi completado à mão')

  // Aviso de gasto em dobro com lançamento manual na mesma data.
  await ir(bia.page, `${COMERCIAL}?modo=intervalo&de=2026-10-01&ate=2026-10-31&funil=${importarEm.id}`)
  await lancar(bia.page, { [primeiraEtapa.nome]: 1 }, { data: '2026-10-20', investimento: '1000' })
  await enviarArquivo(bia.page, arquivoCsv('m.csv', 'Dia,Nome da campanha,Resultados,Valor usado (BRL)\n2026-10-20,A,1,10'))
  await dlg.getByText(/investimento lançado à mão/).waitFor({ timeout: 20000 })
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)
  ok('avisa quando o gasto pode contar em dobro com lançamento manual')

  // XLSX de verdade, lido pela biblioteca no navegador (com Web Worker).
  const { zipSync, strToU8 } = await import('fflate')
  const celula = (ref, v) => typeof v === 'number'
    ? `<c r="${ref}"><v>${v}</v></c>`
    : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`
  const linhasXlsx = [
    ['Day', 'Campaign name', 'Results', 'Result indicator', 'Amount spent (BRL)'],
    ['2026-09-01', 'XLSX Camp', 7, 'actions:lead', 70.25],
    ['2026-09-02', 'XLSX Camp', 3, 'actions:lead', 30],
  ]
  const folha = linhasXlsx.map((l, i) => `<row r="${i + 1}">${l.map((v, c) => celula(`${'ABCDE'[c]}${i + 1}`, v)).join('')}</row>`).join('')
  const xlsx = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Raw Data Report" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${folha}</sheetData></worksheet>`),
  })
  await enviarArquivo(bia.page, { name: 'meta-setembro.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(xlsx) })
  await dlg.getByText(/Relatório de campanhas: 2 linhas/).waitFor({ timeout: 20000 })
  await dlg.getByRole('button', { name: 'Importar 2 data(s)' }).click()
  await fechou(bia.page)
  await bia.page.getByRole('heading', { name: /01 set – 02 set/ }).waitFor()
  await bia.page.locator(`[data-etapa="${primeiraEtapa.nome}"]`, { hasText: '10' }).waitFor()
  assert.equal(importadas().find((l) => l.data === '2026-09-01').investimento, 70.25)
  ok('lê um .xlsx real no navegador')

  // Leads em UTF-16 com tabulação: não pode levar dado pessoal para o servidor.
  const tsv = 'id\tcreated_time\tcampaign_name\tfull_name\temail\nl:1\t2026-10-05T10:00:00-03:00\t[MKT] Leads\tFulana Teste\tfulana@x.test\nl:2\t2026-10-05T11:00:00-03:00\t[MKT] Leads\tBeltrana Teste\tbeltrana@x.test\n'
  const corposDeRede = []
  const escutaRede = (req) => { if (req.method() === 'POST') corposDeRede.push(req.postData() ?? '') }
  bia.page.on('request', escutaRede)
  await enviarArquivo(bia.page, { name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tsv, 'utf16le')]) })
  await dlg.getByText(/Arquivo de leads: 2 leads/).waitFor({ timeout: 20000 })
  assert.equal(await dlg.getByLabel('Valor investido').count(), 0)
  await dlg.getByRole('button', { name: 'Importar 1 data(s)' }).click()
  await fechou(bia.page)
  await bia.page.waitForLoadState('networkidle')
  bia.page.off('request', escutaRede)
  const dosLeads = importadas().find((l) => l.data === '2026-10-05')
  assert.equal(dosLeads.valores[primeiraEtapa.id], 2)
  assert.equal(dosLeads.investimento, 100.5, 'arquivo de leads não pode zerar o gasto')
  assert.ok(corposDeRede.length > 0)
  assert.doesNotMatch(corposDeRede.join('') + JSON.stringify(tables.funil_lancamentos), /Fulana|Beltrana|x\.test/)
  ok('arquivo de leads em UTF-16: conta por data, mantém o gasto e não envia dado pessoal')

  // Arquivo inválido, e o estado sem a migration nova.
  await enviarArquivo(bia.page, arquivoCsv('qualquer.csv', 'foo,bar\n1,2'))
  await dlg.getByRole('alert').waitFor()
  assert.match(await dlg.getByRole('alert').innerText(), /Não reconheci as colunas/)
  importacaoAusente = true
  await dlg.getByLabel('Arquivo exportado (.csv ou .xlsx)').setInputFiles(arquivoCsv('m.csv', 'Dia,Nome da campanha,Resultados,Valor usado (BRL)\n2026-08-01,A,1,10'))
  await dlg.getByText(/20261107_funil_lancamentos_importacao/).waitFor({ timeout: 20000 })
  importacaoAusente = false
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)
  ok('arquivo inválido e migration pendente explicam o problema, sem gravar')

  // Layout com a importação aberta, no celular.
  await bia.page.setViewportSize({ width: 390, height: 844 })
  await ir(bia.page, URL_LONGO)
  await enviarArquivo(bia.page, arquivoCsv('meta-outubro.csv', CSV_META))
  await dlg.getByText('Relatório de campanhas').waitFor()
  const caixaImportar = await dlg.boundingBox()
  assert.ok(caixaImportar.x >= 0 && caixaImportar.x + caixaImportar.width <= 390)
  const estouroDialogo = await dlg.evaluate((el) => el.scrollWidth - el.clientWidth)
  assert.ok(estouroDialogo <= 0, `Diálogo estoura ${estouroDialogo}px`)
  if (shots) await bia.page.screenshot({ path: `${shots}/9-importar-celular.png` })
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)
  await bia.page.setViewportSize({ width: 1440, height: 1000 })
  ok('importação cabe na tela do celular')

  // Sessão trocada na importação: a tela é da Bia, o cookie é do Caio.
  const escritasAntesImport = escritas.length
  await ir(bia.page, URL_LONGO)
  await enviarArquivo(bia.page, arquivoCsv('invasao.csv', 'Dia,Nome da campanha,Resultados,Valor usado (BRL)\n2026-07-01,A,1,10'))
  await dlg.getByText(/Relatório de campanhas/).waitFor()
  await bia.ctx.clearCookies(); await bia.ctx.addCookies(cookieDe(CAIO))
  await dlg.getByRole('button', { name: 'Importar 1 data(s)' }).click()
  await dlg.getByRole('alert').waitFor()
  assert.match(await dlg.getByRole('alert').innerText(), /não tem acesso/)
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)
  await bia.ctx.clearCookies(); await bia.ctx.addCookies(cookieDe(BIA))
  assert.equal(escritas.length, escritasAntesImport)
  ok('importar no funil de outra pessoa é recusado pelo servidor')

  // Desfazer em lote só leva os importados.
  await ir(bia.page, `${COMERCIAL}?modo=intervalo&de=2026-10-01&ate=2026-10-31&funil=${importarEm.id}`)
  await bia.page.getByRole('button', { name: /Excluir importados do período \(2\)/ }).click()
  await dlg.getByRole('button', { name: 'Excluir importados' }).click()
  await fechou(bia.page)
  await bia.page.waitForLoadState('networkidle')
  const doFunil = tables.funil_lancamentos.filter((l) => l.funil_id === importarEm.id)
  assert.equal(doFunil.filter((l) => l.data.startsWith('2026-10') && l.origem_importacao).length, 0)
  assert.equal(doFunil.filter((l) => l.data === '2026-10-20' && !l.origem_importacao).length, 1, 'manual fica')
  assert.equal(doFunil.filter((l) => l.data.startsWith('2026-09')).length, 2, 'fora do período fica')
  ok('excluir importados remove só os do período e mantém os manuais')

  // Isolamento pela URL.
  await ir(bia.page, `${COMERCIAL}?${NOV}&usuario=${CAIO}&funil=${FUNIL_CAIO}`)
  t = await texto(bia.page)
  assert.doesNotMatch(t, /Caio|secreto/)
  assert.match(t, /Minha interface/)
  await ir(bia.page, '/dashboard/comercial/time')
  assert.doesNotMatch(new URL(bia.page.url()).pathname, /time/)
  await ir(bia.page, '/dashboard/comercial/historico')
  assert.doesNotMatch(new URL(bia.page.url()).pathname, /historico/)
  await ir(bia.page, '/dashboard/comercial/historico/time')
  assert.doesNotMatch(new URL(bia.page.url()).pathname, /historico/)
  ok('comercial não abre funil alheio pela URL nem as telas de admin')

  const dani = await abrirSessao(DANI)
  await ir(dani.page, `${COMERCIAL}?${NOV}`)
  assert.notEqual(new URL(dani.page.url()).pathname, COMERCIAL)
  await dani.ctx.close()
  ok('quem não tem permissão do Comercial é redirecionado')

  // Actions chamadas com a sessão trocada: a tela é da Bia, o cookie é do Caio.
  // O servidor precisa recusar pelo dono gravado no banco, sem confiar na tela.
  const funilBia = funisDe(BIA).find((f) => f.nome === 'Funil de marketing')
  const lancBia = tables.funil_lancamentos.find((l) => l.funil_id === funilBia.id && l.data === '2026-11-03')
  await ir(bia.page, `${COMERCIAL}?${NOV}&funil=${funilBia.id}`)
  const trocarParaCaio = async () => { await bia.ctx.clearCookies(); await bia.ctx.addCookies(cookieDe(CAIO)) }
  const voltarParaBia = async () => { await bia.ctx.clearCookies(); await bia.ctx.addCookies(cookieDe(BIA)) }
  const escritasAntes = escritas.length

  await bia.page.getByRole('button', { name: '+ Lançar números' }).click()
  await campo(bia.page, 'Leads do Meta').fill('999')
  await trocarParaCaio()
  await dialogo(bia.page).getByRole('button', { name: 'Lançar', exact: true }).click()
  await dialogo(bia.page).getByRole('alert').waitFor()
  assert.match(await dialogo(bia.page).getByRole('alert').innerText(), /não tem acesso/)
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)

  await voltarParaBia()
  await bia.page.getByRole('button', { name: 'Editar lançamento de 03 nov 2026' }).click()
  await campo(bia.page, 'Leads do Meta').fill('999')
  await trocarParaCaio()
  await dialogo(bia.page).getByRole('button', { name: 'Salvar', exact: true }).click()
  await dialogo(bia.page).getByRole('alert').waitFor()
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)

  await voltarParaBia()
  await bia.page.getByRole('button', { name: 'Excluir lançamento de 03 nov 2026' }).click()
  await trocarParaCaio()
  await dialogo(bia.page).getByRole('button', { name: 'Excluir lançamento' }).click()
  await dialogo(bia.page).getByRole('alert').waitFor()
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)

  await voltarParaBia()
  await bia.page.getByRole('button', { name: 'Editar funil' }).click()
  await campo(bia.page, 'Nome do funil').fill('Sequestrado')
  await trocarParaCaio()
  await dialogo(bia.page).getByRole('button', { name: 'Salvar funil' }).click()
  await dialogo(bia.page).getByRole('alert').waitFor()
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)

  await voltarParaBia()
  await bia.page.getByRole('button', { name: 'Excluir funil' }).click()
  await dialogo(bia.page).getByLabel('Digite Excluir para confirmar').fill('Excluir')
  await trocarParaCaio()
  await dialogo(bia.page).getByRole('button', { name: 'Excluir funil' }).click()
  await dialogo(bia.page).getByRole('alert').waitFor()
  await bia.page.keyboard.press('Escape'); await fechou(bia.page)
  await voltarParaBia()

  assert.equal(escritas.length, escritasAntes, 'nenhuma escrita pode ter passado')
  assert.equal(funilBia.nome, 'Funil de marketing')
  assert.equal(lancBia.valores[funilBia.etapas[0].id], 100)
  ok('5 actions com sessão de outro comercial: todas recusadas pelo servidor, 0 escritas')

  // Admin.
  const ana = await abrirSessao(ADMIN)
  await ir(ana.page, `${COMERCIAL}?${NOV}`)
  assert.match(await texto(ana.page), /Você ainda não tem funis/)
  await ana.page.getByLabel('Ver funis de').selectOption(BIA)
  await ana.page.getByRole('button', { name: 'Funil de marketing' }).waitFor()
  await ana.page.waitForLoadState('networkidle')
  assert.match(await texto(ana.page), /Bia Comercial/)
  assert.match(await valorEtapa(ana.page, 'Leads do Meta'), /100/)
  ok('admin escolhe de quem ver a interface')

  await ana.page.getByRole('button', { name: '+ Novo funil' }).click()
  await campo(ana.page, 'Nome do funil').fill('Criado pela Ana')
  await dialogo(ana.page).getByRole('button', { name: 'Criar funil' }).click()
  await fechou(ana.page)
  await ana.page.getByRole('button', { name: 'Criado pela Ana', pressed: true }).waitFor()
  assert.ok(funisDe(BIA).some((f) => f.nome === 'Criado pela Ana'))
  assert.match(ana.page.url(), new RegExp(`usuario=${BIA}`))
  ok('funil criado pelo admin vai para a pessoa que está aberta')

  await ana.page.getByRole('link', { name: 'Time' }).click()
  await ana.page.waitForURL(/comercial\/time/)
  await ana.page.locator('[data-pessoa="Caio Comercial"]').waitFor()
  t = await texto(ana.page)
  assert.match(t, /Bia Comercial/)
  assert.match(t, /Caio Comercial/)
  assert.match(t, /Ana Admin/)
  assert.doesNotMatch(t, /Dani/)
  assert.match(await ana.page.locator('[data-pessoa="Caio Comercial"]').innerText(), /Funil secreto do Caio[\s\S]*777/)
  assert.match(await ana.page.locator('[data-pessoa="Bia Comercial"]').innerText(), /Funil de marketing[\s\S]*R\$\s*1\.000/)
  assert.match(t, /Investido pelo time\s+R\$\s*2\.777/)
  const porFonteTime = await ana.page.locator('[data-por-fonte]').innerText()
  assert.match(porFonteTime, /Tráfego\s+R\$\s*2\.777/)
  assert.match(porFonteTime, /Indicação de cliente\s+R\$\s*0/)
  if (shots) await ana.page.screenshot({ path: `${shots}/2-time.png`, fullPage: true })
  await conferirLarguras(ana.page, `${COMERCIAL}/time?${NOV}`, 'Time')
  await conferirLarguras(ana.page, `/dashboard/financeiro?${NOV}`, 'Caixa')
  ok('Time mostra o total por fonte; Time e Caixa livres do menu e do sino nas 5 larguras')
  await ir(ana.page, `${COMERCIAL}/time?${NOV}`)
  await ana.page.getByRole('link', { name: 'Funil secreto do Caio' }).click()
  await ana.page.locator('[data-etapa="Topo Caio"]', { hasText: '70' }).waitFor()
  await abrirSecoes(ana.page)
  ok('Time mostra todos com acesso, totais corretos e abre o funil da pessoa')

  await ana.page.getByRole('button', { name: 'Editar lançamento de 04 nov 2026' }).click()
  await campo(ana.page, 'Topo Caio').fill('80')
  await dialogo(ana.page).getByRole('button', { name: 'Salvar', exact: true }).click()
  await fechou(ana.page)
  await ana.page.locator('[data-etapa="Topo Caio"]', { hasText: '80' }).waitFor()
  const caioEditado = tables.funil_lancamentos.find((l) => l.id === LANC_CAIO)
  assert.deepEqual(caioEditado.contratos, [{ primeira: 900, mensal: 0, meses: 1 }], 'faturamento antigo vira contrato de 1 mês')
  assert.equal(Number(caioEditado.faturamento), 900)
  ok('admin edita lançamento de outra pessoa')

  await ir(ana.page, `${COMERCIAL}/historico?mes=Novembro&ano=2026`)
  assert.match(await texto(ana.page), /Histórico/)
  assert.match(await texto(ana.page), /321/)
  await ana.page.getByRole('link', { name: 'Time' }).click()
  await ana.page.waitForURL(/historico\/time/)
  await ana.page.getByRole('heading', { name: /Histórico do time/ }).waitFor()
  assert.match(await texto(ana.page), /Histórico do time/)
  ok('Histórico mostra os dados antigos de relatorios_comerciais')

  // Excluir funil com lançamentos.
  await ir(bia.page, `${COMERCIAL}?${NOV}&funil=${funilBia.id}`)
  await bia.page.getByRole('button', { name: 'Excluir funil' }).click()
  const botaoExcluir = dialogo(bia.page).getByRole('button', { name: 'Excluir funil' })
  assert.equal(await botaoExcluir.isDisabled(), true)
  assert.match(await dialogo(bia.page).innerText(), /Os 2 lançamento/)
  await dialogo(bia.page).getByLabel('Digite Excluir para confirmar').fill('excluir')
  assert.equal(await botaoExcluir.isDisabled(), true)
  await dialogo(bia.page).getByLabel('Digite Excluir para confirmar').fill('Excluir')
  await botaoExcluir.click()
  await fechou(bia.page)
  await bia.page.waitForLoadState('networkidle')
  await bia.page.getByRole('button', { name: 'Só o sistema', pressed: true }).waitFor()
  assert.doesNotMatch(bia.page.url(), new RegExp(funilBia.id))
  assert.equal(tables.funil_lancamentos.filter((l) => l.funil_id === funilBia.id).length, 0)
  assert.equal(tables.funil_lancamentos.filter((l) => l.funil_id === FUNIL_CAIO).length, 1)
  ok('excluir funil pede confirmação, apaga só os lançamentos dele e cai no próximo funil')

  // Celular.
  const celular = await abrirSessao(CAIO, { width: 390, height: 844 })
  await ir(celular.page, `${COMERCIAL}?${NOV}`)
  const estouro = await celular.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert.ok(estouro <= 0, `Estouro horizontal de ${estouro}px no celular`)
  for (const nome of ['+ Lançar números', 'Editar funil', 'Excluir funil']) {
    const caixa = await celular.page.getByRole('button', { name: nome }).boundingBox()
    assert.ok(caixa && caixa.height >= 36, `${nome}: toque baixo (${caixa?.height})`)
    assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= 390, `${nome}: fora da tela`)
  }
  if (shots) await celular.page.screenshot({ path: `${shots}/3-celular.png`, fullPage: true })
  await celular.page.getByRole('button', { name: '+ Lançar números' }).click()
  const caixaDialogo = await dialogo(celular.page).boundingBox()
  assert.ok(caixaDialogo.x >= 0 && caixaDialogo.x + caixaDialogo.width <= 390)
  await dialogo(celular.page).getByRole('button', { name: 'Lançar', exact: true }).scrollIntoViewIfNeeded()
  assert.ok(await dialogo(celular.page).getByRole('button', { name: 'Lançar', exact: true }).isVisible())
  if (shots) await celular.page.screenshot({ path: `${shots}/4-celular-lancar.png` })
  await celular.ctx.close()
  ok('celular: sem estouro horizontal, botões na tela e diálogo acessível')

  // Antes de aplicar a migration.
  tabelasAusentes = true
  await ir(ana.page, `${COMERCIAL}?${NOV}`)
  assert.match(await texto(ana.page), /Falta preparar o banco/)
  await ir(ana.page, `${COMERCIAL}/time?${NOV}`)
  assert.match(await texto(ana.page), /Falta preparar o banco/)
  tabelasAusentes = false
  ok('sem a migration aplicada, a tela explica o que fazer em vez de quebrar')

  await bia.ctx.close()
  await ana.ctx.close()
  assert.deepEqual(falhasPagina, [], 'Erros de página ou HTTP 5xx')
  ok('nenhum erro de JavaScript nem HTTP 5xx durante todo o fluxo')
  console.log(`\nE2E OK: ${passos} verificações`)
} catch (e) {
  console.error('\nFALHOU:', e)
  console.error('Erros de página:', falhasPagina)
  console.error(log.slice(-2500))
  process.exitCode = 1
} finally {
  await browser?.close()
  child.kill()
  server.closeAllConnections()
  server.close()
}
