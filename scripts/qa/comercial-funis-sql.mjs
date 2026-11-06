/**
 * Roda a migration dos funis em um Postgres de verdade, em WASM (PGlite), sem
 * tocar em banco nenhum do projeto. Confere restrições, CASCADE e SET NULL.
 * PGLITE_MODULE=/caminho/node_modules/@electric-sql/pglite/dist/index.js node scripts/qa/comercial-funis-sql.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.usuarios (id uuid primary key default gen_random_uuid(), nome text);
`)
const sql = await readFile('supabase/migrations/20261106_comercial_funis.sql', 'utf8')
await db.exec(sql)
await db.exec(sql) // precisa poder rodar de novo sem erro
console.log('ok  migration aplica e é idempotente')

const { rows: [a] } = await db.query(`insert into usuarios (nome) values ('A') returning id`)
const { rows: [b] } = await db.query(`insert into usuarios (nome) values ('B') returning id`)
const ETAPAS = JSON.stringify([{ id: 'x', nome: 'X' }, { id: 'y', nome: 'Y' }])
const criarFunil = (dono, nome, etapas = ETAPAS) => db.query(
  `insert into funis_comerciais (usuario_id, nome, etapas) values ($1, $2, $3::jsonb) returning id`, [dono, nome, etapas])

async function recusa(titulo, codigo, fn) {
  await assert.rejects(fn, (e) => e.code === codigo, titulo)
  console.log(`ok  recusa: ${titulo} (${codigo})`)
}

const { rows: [f] } = await criarFunil(a.id, 'Sistema')
await recusa('nome repetido, mesmo mudando caixa e espaços', '23505', () => criarFunil(a.id, '  sistema '))
await criarFunil(b.id, 'Sistema')
console.log('ok  duas pessoas podem usar o mesmo nome')
await recusa('nome em branco', '23514', () => criarFunil(a.id, '   '))
await recusa('funil com 1 etapa', '23514', () => criarFunil(a.id, 'Um', JSON.stringify([{ id: 'x', nome: 'X' }])))
await recusa('etapas fora de array', '23514', () => criarFunil(a.id, 'Obj', '{}'))
await recusa('dono inexistente', '23503', () => criarFunil('00000000-0000-4000-8000-000000000099', 'Fantasma'))

const lancar = (campos) => {
  const c = { data: '2026-11-06', investimento: 0, valores: '{}', perdidos: 0, faturamento: 0, criado_por: b.id, ...campos }
  return db.query(
    `insert into funil_lancamentos (funil_id, data, investimento, valores, perdidos, faturamento, criado_por)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7) returning id`,
    [f.id, c.data, c.investimento, c.valores, c.perdidos, c.faturamento, c.criado_por])
}
await recusa('investimento negativo', '23514', () => lancar({ investimento: -1 }))
await recusa('perdidos negativo', '23514', () => lancar({ perdidos: -1 }))
await recusa('faturamento negativo', '23514', () => lancar({ faturamento: -1 }))
await recusa('valores fora de objeto', '23514', () => lancar({ valores: '[]' }))
await recusa('data que não existe', '22008', () => lancar({ data: '2026-02-31' }))

const { rows: [l] } = await lancar({ valores: '{"x": 5}', investimento: '1234.56' })
const { rows: [lido] } = await db.query(`select investimento, valores from funil_lancamentos where id = $1`, [l.id])
assert.equal(Number(lido.investimento), 1234.56)
assert.equal(lido.valores.x, 5)
console.log('ok  grava e lê centavos e valores')

// Excluir quem lançou mantém o número (SET NULL), sem violar nenhum CHECK.
await db.query(`delete from usuarios where id = $1`, [b.id])
const { rows: [semAutor] } = await db.query(`select criado_por from funil_lancamentos where id = $1`, [l.id])
assert.equal(semAutor.criado_por, null)
console.log('ok  excluir quem lançou mantém o lançamento (SET NULL)')

// Excluir o dono leva funis e lançamentos (CASCADE).
await db.query(`delete from usuarios where id = $1`, [a.id])
const conta = async (t) => Number((await db.query(`select count(*)::int as n from ${t}`)).rows[0].n)
assert.equal(await conta('funis_comerciais'), 0)
assert.equal(await conta('funil_lancamentos'), 0)
console.log('ok  excluir o dono leva funis e lançamentos (CASCADE)')

for (const t of ['funis_comerciais', 'funil_lancamentos']) {
  const { rows: [r] } = await db.query(`select relrowsecurity as rls from pg_class where relname = $1`, [t])
  assert.equal(r.rls, true)
  for (const role of ['anon', 'authenticated']) {
    const { rows: [p] } = await db.query(`select has_table_privilege($1, $2, 'select') as pode`, [role, `public.${t}`])
    assert.equal(p.pode, false)
  }
  const { rows: [s] } = await db.query(`select has_table_privilege('service_role', $1, 'insert') as pode`, [`public.${t}`])
  assert.equal(s.pode, true)
}
console.log('ok  RLS ligada, anon/authenticated sem acesso, service_role com acesso')
await db.close()
console.log('SQL OK')
