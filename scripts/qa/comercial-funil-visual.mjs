// QA visual da tela de funis (Visão geral + Análise, desktop e celular).
// Mesmo harness de comercial-funis.mjs. Rodar:
// PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs QA_SCREENSHOTS=/pasta node scripts/qa/comercial-funil-visual.mjs

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
  funis_comerciais: [{ id: FUNIL_CAIO, usuario_id: CAIO, nome: 'Campanha Marketing', descricao: 'Processo comercial para fechamento de planos de Marketing',
    etapas: [{ id: 'e1', nome: 'Leads gerados' }, { id: 'e2', nome: 'Responderam' }, { id: 'e3', nome: 'Reuniões agendadas' }, { id: 'e4', nome: 'Reuniões realizadas' }, { id: 'e5', nome: 'Propostas enviadas' }, { id: 'e6', nome: 'Contratos fechados' }],
    fontes: [{ id: 'trafego', nome: 'Tráfego' }, { id: 'indicacao', nome: 'Indicação' }, { id: 'prospeccao', nome: 'Prospecção fria' }],
    created_at: agora, updated_at: agora }],
  funil_lancamentos: [
    { id: LANC_CAIO, funil_id: FUNIL_CAIO, data: '2026-11-04', fonte: 'indicacao', investimento: 40, valores: { e1: 3, e2: 2, e3: 2, e4: 2, e5: 2, e6: 2 }, perdidos: 0, faturamento: 0, contratos: [{ primeira: 1500, mensal: 800, meses: 3 }, { primeira: 1100, mensal: 0, meses: 1 }], observacoes: null, criado_por: CAIO, created_at: agora, updated_at: agora },
    { id: randomUUID(), funil_id: FUNIL_CAIO, data: '2026-11-11', fonte: 'prospeccao', investimento: 57, valores: { e1: 2, e2: 2, e3: 1, e4: 1, e5: 1, e6: 1 }, perdidos: 0, faturamento: 0, contratos: [{ primeira: 2844, mensal: 1147, meses: 5 }], observacoes: null, criado_por: CAIO, created_at: agora, updated_at: agora },
    { id: randomUUID(), funil_id: FUNIL_CAIO, data: '2026-11-15', fonte: 'trafego', origem_importacao: 'meta', investimento: 0, valores: { e1: 0 }, perdidos: 0, faturamento: 0, observacoes: null, criado_por: CAIO, created_at: agora, updated_at: agora },
  ],
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
  const shotsDir = process.env.QA_SCREENSHOTS
  const URL_ = `${COMERCIAL}?${NOV}`
  const shot = async (page, nome) => { if (shotsDir) await page.screenshot({ path: `${shotsDir}/${nome}.png`, fullPage: true }) }
  const semRolagem = async (page, onde) => {
    const l = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(l <= 1, `${onde}: rolagem horizontal de ${l}px`)
  }
  const aba = (page, nome) => page.getByRole('tab', { name: nome, exact: true })
  for (const [nome, vp] of [['desktop', { width: 1440, height: 1000 }], ['celular', { width: 390, height: 844 }]]) {
    const { ctx, page } = await abrirSessao(CAIO, vp)
    const r = await page.goto(base + URL_, { waitUntil: 'networkidle', timeout: 90000 })
    assert.ok(r.status() < 400, `HTTP ${r.status()}`)
    const main = () => page.locator('main').innerText()

    // Visão geral: só o funil (+ resultado), sem botões soltos nem importação.
    let t = await main()
    assert.match(t, /Funil do período/i); assert.match(t, /Resultado/i)
    for (const fora of [/De onde vem a demanda/i, /Investimento e custo/i, /Comparação entre fontes/i, /Importar do Meta/, /Lançar números/, /Editar funil/, /Novo funil/])
      assert.ok(!fora.test(t), `${nome}: "${fora}" não deveria estar na visão geral`)
    await semRolagem(page, `${nome} geral`)
    ok(`${nome}: visão geral só com o funil, sem rolagem horizontal`)
    await shot(page, `${nome}-1-geral`)

    // Menu ⋯
    await page.getByRole('button', { name: 'Ações e funis' }).click()
    const menu = page.getByRole('menu')
    for (const item of ['Lançar números', 'Editar funil', 'Excluir funil', 'Novo funil']) await menu.getByRole('menuitem', { name: item }).waitFor()
    assert.equal(await menu.getByRole('menuitemradio', { name: 'Campanha Marketing' }).getAttribute('aria-checked'), 'true')
    await semRolagem(page, `${nome} menu`)
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${nome}-2-menu.png` })
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('menu').count(), 0, 'Esc fecha o menu')
    ok(`${nome}: ⋯ tem lançar, editar, excluir, funis e novo funil; Esc fecha`)
    await page.getByRole('button', { name: 'Ações e funis' }).click()
    await page.getByRole('menuitem', { name: 'Lançar números' }).click()
    await page.getByRole('dialog').waitFor()
    ok(`${nome}: Lançar números pelo ⋯ abre o formulário`)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(async () => { await page.getByRole('button', { name: /Cancelar|Fechar/ }).first().click() })

    // Demanda
    await aba(page, 'Demanda').click()
    t = await main()
    assert.match(t, /De onde vem a demanda/i); assert.ok(!/Funil do período/i.test(t))
    await semRolagem(page, `${nome} demanda`)
    await shot(page, `${nome}-3-demanda`)
    await page.getByRole('button', { name: /^Indicação/ }).click()
    await aba(page, 'Visão geral').click()
    t = await main()
    assert.match(t, /Funil · Indicação/i)
    await page.getByRole('button', { name: /Remover filtro/ }).waitFor()
    ok(`${nome}: aba Demanda filtra a fonte e o selo aparece na visão geral`)
    await shot(page, `${nome}-4-geral-filtrada`)
    await page.getByRole('button', { name: /Remover filtro/ }).click()
    assert.match(await main(), /Funil do período/i)
    ok(`${nome}: o selo limpa o filtro`)

    // Investimento
    await aba(page, 'Investimento').click()
    t = await main()
    assert.match(t, /Investimento e custo/i); assert.match(t, /Retorno do total contratado/)
    await semRolagem(page, `${nome} investimento`)
    await shot(page, `${nome}-5-investimento`)
    ok(`${nome}: aba Investimento com os indicadores`)

    // Análise
    await aba(page, 'Análise').click()
    t = await main()
    assert.match(t, /Comparação entre fontes/i); assert.match(t, /Evolução no período/i); assert.match(t, /Lançamentos/i)
    await semRolagem(page, `${nome} análise`)
    await shot(page, `${nome}-6-analise`)
    await page.reload({ waitUntil: 'networkidle' })
    assert.equal(await aba(page, 'Análise').getAttribute('aria-selected'), 'true')
    ok(`${nome}: aba Análise completa e mantida ao recarregar`)
    await ctx.close()
  }
  assert.deepEqual(falhasPagina, [], 'Erros de página ou HTTP 5xx')
  ok('sem erro de JavaScript nem HTTP 5xx')
  console.log(`\nQA OK: ${passos} verificações`)
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
