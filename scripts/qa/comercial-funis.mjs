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
  const reservado = ['select', 'order', 'limit', 'offset', 'columns']
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
    if (req.method === 'POST') {
      const novos = (Array.isArray(data) ? data : [data]).map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...r }))
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
const NOV = 'modo=mes&de=2026-11-01&ate=2026-11-30'
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
  }
  const texto = (page) => page.locator('main').innerText()
  const valorEtapa = (page, nome) => page.locator(`[data-etapa="${nome}"]`).innerText()
  const passo = (page, nome) => page.locator(`[data-passo="${nome}"]`).innerText()
  const dialogo = (page) => page.getByRole('dialog')
  const fechou = (page) => dialogo(page).waitFor({ state: 'detached', timeout: 20000 })
  const campo = (page, nome) => dialogo(page).getByLabel(nome, { exact: true })

  async function lancar(page, numeros, extras = {}) {
    await page.getByRole('button', { name: '+ Lançar números' }).click()
    await campo(page, 'Data').fill(extras.data)
    if (extras.investimento) await campo(page, 'Valor investido no tráfego').fill(extras.investimento)
    for (const [nome, v] of Object.entries(numeros)) await campo(page, nome).fill(String(v))
    if (extras.perdidos) await campo(page, 'Contratos perdidos').fill(String(extras.perdidos))
    if (extras.faturamento) await campo(page, 'Faturamento gerado').fill(extras.faturamento)
    await dialogo(page).getByRole('button', { name: 'Lançar', exact: true }).click()
    await fechou(page)
    await page.waitForLoadState('networkidle')
  }
  const funisDe = (id) => tables.funis_comerciais.filter((f) => f.usuario_id === id)

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
  assert.equal(await dialogo(bia.page).getByRole('listitem').count(), 6)
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
  assert.match(t, /Taxa de fechamento\s+40%/)
  assert.match(await valorEtapa(bia.page, 'Contratos fechados'), /2% do topo/)
  const largura = (nome) => bia.page.locator(`[data-etapa="${nome}"]`).evaluate((el) => el.getBoundingClientRect().width)
  assert.ok(await largura('Leads gerados') > await largura('Responderam'))
  assert.ok(await largura('Responderam') > await largura('Contratos fechados'))
  ok('camadas afunilam e mostram %, gargalo, custos, retorno e taxa de fechamento corretos')
  if (shots) await bia.page.screenshot({ path: `${shots}/1-funil-desktop.png`, fullPage: true })

  // Filtros de data.
  await lancar(bia.page, { 'Leads gerados': 40, Responderam: 30 }, { data: '2026-11-10', investimento: '50000' })
  await lancar(bia.page, { 'Leads gerados': 7 }, { data: '2026-03-15' })
  await ir(bia.page, `${COMERCIAL}?${NOV}`)
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /140/)
  ok('o mês soma só os lançamentos do mês')

  await bia.page.getByRole('button', { name: 'Semana', exact: true }).click()
  await bia.page.waitForURL(/modo=semana/)
  await bia.page.waitForLoadState('networkidle')
  assert.match(bia.page.url(), /de=2026-11-02/)
  await bia.page.getByRole('heading', { name: '02 – 08 nov 2026' }).waitFor()
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /100/)
  ok('Semana filtra de segunda a domingo, partindo de hoje')

  await bia.page.getByRole('button', { name: 'Próximo período' }).click()
  await bia.page.getByRole('heading', { name: '09 – 15 nov 2026' }).waitFor()
  await bia.page.waitForLoadState('networkidle')
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /40/)
  assert.match(bia.page.url(), /funil=|modo=semana/)
  ok('a seta avança uma semana inteira')

  await ir(bia.page, `${COMERCIAL}?modo=dia&de=2026-11-03&ate=2026-11-03`)
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /100/)
  await ir(bia.page, `${COMERCIAL}?modo=dia&de=2026-11-04&ate=2026-11-04`)
  assert.match(await texto(bia.page), /Nenhum lançamento neste período/)
  ok('Dia filtra um dia exato, e dia vazio não quebra')

  await ir(bia.page, `${COMERCIAL}?${NOV}`)
  await bia.page.getByRole('button', { name: 'Ano', exact: true }).click()
  await bia.page.getByRole('heading', { name: '2026', exact: true }).waitFor()
  await bia.page.waitForLoadState('networkidle')
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /147/)
  assert.equal(await bia.page.locator('tbody tr').count(), 12)
  assert.equal(await bia.page.getByRole('link', { name: 'Por dia' }).count(), 0)
  ok('Ano soma tudo, abre por mês e não oferece "por dia"')

  await ir(bia.page, `${COMERCIAL}?modo=intervalo&de=2026-03-01&ate=2026-11-05`)
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /107/)
  await bia.page.getByLabel('Até').fill('2026-11-30')
  await bia.page.waitForURL(/ate=2026-11-30/)
  await bia.page.waitForLoadState('networkidle')
  assert.match(await valorEtapa(bia.page, 'Leads gerados'), /147/)
  ok('Intervalo funciona pela URL e pelos campos de data')

  // Semana a semana.
  await ir(bia.page, `${COMERCIAL}?${NOV}`)
  const linhas = bia.page.locator('tbody tr')
  assert.equal(await linhas.count(), 6)
  assert.match(await bia.page.locator('tbody tr', { hasText: '02 – 08 nov' }).innerText(), /100[\s\S]*50[\s\S]*50%/)
  assert.match(await bia.page.locator('tbody tr', { hasText: '09 – 15 nov' }).innerText(), /40[\s\S]*30[\s\S]*75%/)
  await bia.page.getByRole('link', { name: 'Por dia' }).click()
  await bia.page.waitForURL(/agrupar=dia/)
  await bia.page.waitForLoadState('networkidle')
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
  await ir(bia.page, `${COMERCIAL}?modo=mes&de=2026-12-01&ate=2026-12-31`)
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
  while (await dialogo(bia.page).getByRole('listitem').count() > 2) {
    await dialogo(bia.page).getByRole('button', { name: /^Remover / }).first().click()
  }
  assert.equal(await dialogo(bia.page).getByRole('button', { name: /^Remover / }).first().isDisabled(), true)
  await dialogo(bia.page).getByRole('button', { name: 'Criar funil' }).click()
  await fechou(bia.page)
  await bia.page.waitForLoadState('networkidle')
  await bia.page.getByRole('button', { name: 'Só o sistema', pressed: true }).waitFor()
  assert.match(await texto(bia.page), /Nenhum lançamento neste período/)
  await bia.page.getByRole('button', { name: 'Funil de marketing' }).click()
  await bia.page.locator('[data-etapa="Leads do Meta"]', { hasText: '100' }).waitFor()
  ok('funis separados: nome repetido recusado, mínimo de 2 etapas e números que não se misturam')

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
  assert.match(t, /Investido pelo time\s+R\$\s*1\.777/)
  if (shots) await ana.page.screenshot({ path: `${shots}/2-time.png`, fullPage: true })
  await ana.page.getByRole('link', { name: 'Funil secreto do Caio' }).click()
  await ana.page.locator('[data-etapa="Topo Caio"]', { hasText: '70' }).waitFor()
  ok('Time mostra todos com acesso, totais corretos e abre o funil da pessoa')

  await ana.page.getByRole('button', { name: 'Editar lançamento de 04 nov 2026' }).click()
  await campo(ana.page, 'Topo Caio').fill('80')
  await dialogo(ana.page).getByRole('button', { name: 'Salvar', exact: true }).click()
  await fechou(ana.page)
  await ana.page.locator('[data-etapa="Topo Caio"]', { hasText: '80' }).waitFor()
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
