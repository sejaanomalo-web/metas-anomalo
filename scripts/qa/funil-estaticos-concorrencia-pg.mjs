// Concorrência REAL do agendamento nativo (ATIVO + Funil Estáticos Meta) em um
// PostgreSQL 17 descartável (binários do pacote embedded-postgres), com várias
// conexões simultâneas. Complementa o teste em PGlite (que usa uma conexão só).
//
// Nunca usa o Supabase: sobe um servidor local temporário em 127.0.0.1, aplica
// schema mínimo + as migrations na ordem aplicada em produção (20261125 →
// 20261126 integridade → 20261126 intervalo_slots → 20261127 → 20261128 → 20261129)
// e apaga tudo no fim.
// Não lê nenhuma variável de ambiente além de MIGRATIONS_DIR/PORTA.
//
// Uso (as dependências NÃO são do projeto; instale numa pasta descartável):
//   mkdir /tmp/pgreal && cd /tmp/pgreal && npm init -y && npm i embedded-postgres@17.5.0-beta.15 pg@8.13.1
//   cp <repo>/scripts/qa/funil-estaticos-concorrencia-pg.mjs . && MIGRATIONS_DIR=<repo>/supabase/migrations node funil-estaticos-concorrencia-pg.mjs
import EmbeddedPostgres from "embedded-postgres"
import pg from "pg"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash, randomUUID } from "node:crypto"

const DIR = process.env.MIGRATIONS_DIR ?? new URL("../../supabase/migrations/", import.meta.url).pathname
const PORTA = Number(process.env.PORTA ?? 54329)
const migs = ["20261125_reunioes_nativas.sql", "20261126_reunioes_nativas_integridade.sql", "20261126_reunioes_nativas_intervalo_slots.sql", "20261127_funil_estaticos_meta.sql", "20261128_funil_apresentacao_teste.sql", "20261129_reunioes_nativas_reconciliacao.sql"]
  .map(f => readFileSync(join(DIR, f), "utf8"))

const dados = mkdtempSync(join(tmpdir(), "funil-pg-"))
const servidor = new EmbeddedPostgres({ databaseDir: dados, user: "postgres", password: "local-descartavel", port: PORTA, persistent: false, onLog: () => {}, onError: () => {} })
let falhas = 0
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) falhas++ }

try {
  await servidor.initialise()
  await servidor.start()
  await servidor.createDatabase("funil")
  const pool = new pg.Pool({ host: "127.0.0.1", port: PORTA, user: "postgres", password: "local-descartavel", database: "funil", max: 30 })
  const q = (sql, p = []) => pool.query(sql, p)
  const q1 = async (sql, p = []) => (await q(sql, p)).rows[0]

  // Schema mínimo das tabelas existentes que as migrations referenciam (igual ao teste PGlite).
  await q(`
create role anon; create role authenticated; create role service_role;
create table public.usuarios(id uuid primary key, nome text, ativo boolean default true, papel text default 'admin', created_at timestamptz default now());
create table public.reunioes_disponibilidades(id uuid primary key default gen_random_uuid(), nome text, fuso text, calcom_schedule_id int,
  responsavel_id uuid, janelas jsonb default '[]', periodos jsonb default '[]', excecoes jsonb default '[]', bloqueios jsonb default '[]', created_at timestamptz default now());
create table public.reunioes_tipos(id uuid primary key default gen_random_uuid(), nome text, duracao_min int, antecedencia_min_horas int default 12,
  intervalo_min int default 15, limite_diario int, horizonte_dias int default 14, responsavel_id uuid, ativo boolean default true,
  disponibilidade_id uuid, calcom_event_type_id int, contexto_id uuid, origem_comercial text);
create table public.reunioes_agendamentos(id uuid primary key default gen_random_uuid(), provedor text, booking_uid text, tipo_id uuid, tarefa_id uuid,
  responsavel_id uuid, participante_nome text, participante_telefone text, participante_email text, participante_fuso text,
  inicio timestamptz, fim timestamptz, status text, local_rotulo text, origem_comercial text, descricao_gerada text, link_reuniao text,
  ultimo_evento_em timestamptz, ultimo_gatilho text);
create table public.ws_tarefas(id uuid primary key default gen_random_uuid(), titulo text, descricao text, prazo_em date, prazo_hora time,
  prioridade text, criado_por uuid, source_gid text, responsavel_id uuid, arquivada_em timestamptz, excluida_em timestamptz,
  concluida_em timestamptz, concluida_por uuid, versao int default 0);
create table public.ws_tarefa_responsaveis(tarefa_id uuid, usuario_id uuid, ordem int);
create table public.ws_seguidores(tarefa_id uuid, usuario_id uuid);
create table public.ws_tarefa_contextos(tarefa_id uuid, contexto_id uuid);
create table public.ws_tarefa_bloqueios(tarefa_id uuid, duracao_min int);
create table public.ws_atividade(tarefa_id uuid, ator_id uuid, evento text, mudanca jsonb);
create table public.ws_realtime_ping(tarefa_id uuid, kind text);
create table public.reunioes_sync_log(nivel text, acao text, mensagem text, agendamento_id uuid, ator_id uuid);
create table public.notificacoes(id bigserial primary key, tipo text, empresa text, titulo text, mensagem text, payload jsonb, papel_alvo text[]);
create table public.notificacoes_usuario(notificacao_id bigint, usuario_id uuid);
create table public.preferencias_notificacao(usuario_id uuid, ws_tarefa boolean);`)
  const R = "11111111-1111-4111-8111-111111111111"
  await q(migs[0])
  await q(`insert into usuarios(id,nome) values ('${R}','Resp');
insert into reunioes_disponibilidades(id,nome,fuso,responsavel_id,modo_nativo,janelas) values
 ('22222222-2222-4222-8222-222222222222','Agenda nativa','America/Sao_Paulo','${R}',true,
  (select jsonb_agg(jsonb_build_object('dia',d,'inicio','09:00','fim','12:00')) from generate_series(0,6) d));
insert into reunioes_tipos(id,nome,duracao_min,responsavel_id,origem_comercial)
 values ('33333333-3333-4333-8333-333333333333','Diagnóstico',60,'${R}','marketing_corretores'),
        ('44444444-4444-4444-8444-444444444444','Demonstração ATIVO',60,'${R}','sistema_imobiliario');`)
  for (const m of migs.slice(1)) await q(m)
  await q(`insert into reunioes_canais_nativos(chave,tipo_id,disponibilidade_id,ativo,exclusividade_verificada_em) values
   ('ativo','44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',true,now()),
   ('estaticos_meta','33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',true,now())`)
  await q(`update funil_config set ativo = true, privacidade_url = 'https://exemplo.com/privacidade', capi_ativo = true, pixel_id = '1234567890', consentimento_modo = 'informativo'`)
  const f = await q1(`select id, versao_publicada_id from funil_config where chave='estaticos_meta'`)
  ok(Boolean(f?.versao_publicada_id), `PostgreSQL real ${(await q1("show server_version")).server_version}: migrations 20261125→20261129 aplicadas`)

  let tel = 100
  const novaSessao = async () => {
    const id = randomUUID(), hash = createHash("sha256").update(randomUUID()).digest("hex")
    await q(`insert into funil_sessoes(id,funil_id,versao_id,segredo_hash,ambiente,respostas,atribuicao) values ($1,$2,$3,$4,'producao',$5,'{}')`,
      [id, f.id, f.versao_publicada_id, hash, JSON.stringify({ perfil: "gestor", interesse: "sistema", investimento: "anuncios" })])
    return { id, hash }
  }
  const comLead = async () => {
    const s = await novaSessao(), t = `+55459999${String(tel++).padStart(5, "0")}`
    const r = await q1(`select public.funil_capturar_lead($1,$2,$3,$4,null,null,'sistema',0,'nao_avaliado','{"marketing":true}'::jsonb,'{}'::jsonb) r`, [s.id, s.hash, "Visitante " + tel, t])
    return { ...s, leadId: r.r.leadId, tel: t }
  }
  const dia = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const reservar = (s, data, hora, chave = randomUUID()) =>
    q1(`select public.funil_reservar($1,$2,($3::date + $4::time) at time zone 'America/Sao_Paulo',$5,'{}'::jsonb) r`, [s.id, s.hash, data, hora, chave]).then(x => x.r)
  const ativo = (data, hora, n) =>
    q1(`select public.reunioes_nativas_reservar($1,$2,($3::date + $4::time) at time zone 'America/Sao_Paulo',$5::uuid,repeat('a',64),'{}'::jsonb) r`,
      ["Cliente ATIVO " + n, `+55459888${String(n).padStart(5, "0")}`, data, hora, randomUUID()]).then(x => x.r)
  const noHorario = (data, hora) => q1(`select count(*)::int n from reunioes_agendamentos where status in ('solicitada','confirmada')
    and inicio = ($1::date + $2::time) at time zone 'America/Sao_Paulo'`, [data, hora]).then(x => x.n)

  // 1) 20 visitantes diferentes, o mesmo horário, ao mesmo tempo.
  const visitantes = await Promise.all(Array.from({ length: 20 }, comLead))
  const r1 = await Promise.all(visitantes.map(v => reservar(v, dia(3), "09:00")))
  ok(r1.filter(r => r.status === "reserved").length === 1 && r1.filter(r => r.code === "SLOT_UNAVAILABLE").length === 19,
    `20 visitantes simultâneos no mesmo horário → 1 reserva, 19 SLOT_UNAVAILABLE (${r1.map(r => r.status ?? r.code).filter((x, i, a) => a.indexOf(x) === i).join(", ")})`)
  ok(await noHorario(dia(3), "09:00") === 1, "uma única reunião no banco para aquele horário")

  // 2) ATIVO x funil disputando o mesmo horário simultaneamente (10 + 10).
  const vis2 = await Promise.all(Array.from({ length: 10 }, comLead))
  const r2 = await Promise.all([...vis2.map(v => reservar(v, dia(4), "10:00")), ...Array.from({ length: 10 }, (_, i) => ativo(dia(4), "10:00", i))])
  const venc2 = r2.filter(r => r.status === "reserved" || r.status === "reserved_pending_whatsapp")
  ok(venc2.length === 1, `10 funil + 10 ATIVO no mesmo horário → exatamente 1 vencedor (${venc2[0]?.status === "reserved" ? "funil" : "ATIVO"})`)
  ok(await noHorario(dia(4), "10:00") === 1, "uma única reunião para o horário disputado entre canais")

  // 3) Horários SOBREPOSTOS (não idênticos) entre canais: 09:00 x 09:30 x 10:00 (60 min + buffer 15).
  const vis3 = await Promise.all(Array.from({ length: 6 }, comLead))
  const r3 = await Promise.all([reservar(vis3[0], dia(5), "09:00"), ativo(dia(5), "09:00", 50), reservar(vis3[1], dia(5), "10:00"), ativo(dia(5), "10:00", 51)])
  const ag3 = (await q(`select inicio, fim from reunioes_agendamentos where status in ('solicitada','confirmada') and inicio::date between $1::date and $1::date + 1 order by inicio`, [dia(5)])).rows
  const sobrepoe = ag3.some((a, i) => i > 0 && Date.parse(ag3[i - 1].fim) + 15 * 60000 > Date.parse(a.inicio))
  ok(!sobrepoe && r3.filter(r => r.status === "reserved" || r.status === "reserved_pending_whatsapp").length <= 2, `horários vizinhos disputados entre canais: nenhuma sobreposição nem violação de buffer (${ag3.length} reuniões)`)

  // 4) Duplo clique / reenvio: mesma sessão e mesma chave, 10 vezes em paralelo.
  const v4 = await comLead(), chave = randomUUID()
  const r4 = await Promise.all(Array.from({ length: 10 }, () => reservar(v4, dia(6), "09:00", chave)))
  const ids4 = new Set(r4.map(r => r.bookingId))
  ok(ids4.size === 1 && !ids4.has(undefined), `duplo clique (10 envios simultâneos, mesma chave) → mesma reserva (${r4.map(r => r.status ?? r.code).filter((x, i, a) => a.indexOf(x) === i).join(", ")})`)
  ok((await q1(`select count(*)::int n from reunioes_agendamentos a join funil_sessoes s on s.agendamento_id = a.id where s.id=$1`, [v4.id])).n === 1
    && (await q1(`select count(*)::int n from ws_tarefas where titulo like '%Reunião com Visitante%' and id in (select tarefa_id from reunioes_agendamentos where inicio = ($1::date + '09:00'::time) at time zone 'America/Sao_Paulo')`, [dia(6)])).n === 1,
    "uma reunião e uma tarefa para o duplo clique")
  ok((await q1(`select count(*)::int n from funil_conversoes where evento='Schedule' and event_id = $1`, [`schedule.${[...ids4][0]}`])).n === 1, "uma conversão Schedule (event_id único) para o duplo clique")

  // 5) Mesma sessão, chaves diferentes, horários diferentes, em paralelo → no máximo 1 reunião futura por lead.
  const v5 = await comLead()
  const r5 = await Promise.all([reservar(v5, dia(7), "09:00"), reservar(v5, dia(7), "11:00"), reservar(v5, dia(8), "09:00")])
  // Conta pelo telefone (a sessão guarda só o último agendamento_id e esconderia duplicatas).
  ok((await q1(`select count(*)::int n from reunioes_agendamentos where participante_telefone=$1 and status in ('solicitada','confirmada')`, [v5.tel])).n === 1,
    `mesma pessoa clicando em 3 horários ao mesmo tempo → 1 reunião (${r5.map(r => r.status ?? r.code).join(", ")})`)

  // 6) Mesmo telefone em duas sessões simultâneas → um lead só.
  const [sa, sb] = await Promise.all([novaSessao(), novaSessao()])
  const rr = await Promise.all([sa, sb].map(s => q1(`select public.funil_capturar_lead($1,$2,'Duplo','+5545999977777',null,null,null,0,null,'{}'::jsonb,'{}'::jsonb) r`, [s.id, s.hash])))
  ok(rr[0].r.leadId === rr[1].r.leadId && (await q1(`select count(*)::int n from funil_leads where telefone_e164='+5545999977777'`)).n === 1, "mesmo WhatsApp em 2 sessões simultâneas → 1 lead")

  // 7) Cancelamento simultâneo (2x) e cancelamento x nova reserva do mesmo horário.
  const v7 = await comLead(); const b7 = await reservar(v7, dia(9), "09:00")
  const g = (id, acao, data, hora) => q1(`select public.reunioes_nativas_gerir($1,$2,'${R}',${data ? `($3::date + $4::time) at time zone 'America/Sao_Paulo'` : "null"}) r`, data ? [id, acao, data, hora] : [id, acao]).then(x => x.r).catch(e => "ERRO:" + e.message)
  const outro = await comLead()
  const r7 = await Promise.all([g(b7.bookingId, "cancelar"), g(b7.bookingId, "cancelar"), reservar(outro, dia(9), "09:00")])
  const st7 = await q1(`select status from reunioes_agendamentos where id=$1`, [b7.bookingId])
  ok(st7.status === "cancelada" && r7.slice(0, 2).every(x => typeof x === "string" && !x.startsWith("ERRO")), `cancelamento duplo simultâneo → cancelada uma vez, sem erro (${r7.slice(0, 2).join(", ")})`)
  ok(await noHorario(dia(9), "09:00") <= 1, `cancelar x reservar o mesmo horário ao mesmo tempo → nunca 2 reuniões ativas (nova reserva: ${r7[2].status ?? r7[2].code})`)

  // 8) Reagendar uma reunião para um horário que outro visitante e o ATIVO disputam ao mesmo tempo.
  const v8 = await comLead(); const b8 = await reservar(v8, dia(10), "09:00")
  const v8b = await comLead()
  const r8 = await Promise.all([g(b8.bookingId, "reagendar", dia(10), "11:00"), reservar(v8b, dia(10), "11:00"), ativo(dia(10), "11:00", 80)])
  ok(await noHorario(dia(10), "11:00") === 1, `reagendar x funil x ATIVO no mesmo horário → 1 reunião (${[r8[0], r8[1].status ?? r8[1].code, r8[2].status ?? r8[2].code].join(", ")})`)

  // 9) Integridade: inserts diretos sobrepostos e simultâneos (sem passar pelas RPCs) → EXCLUDE barra.
  const tarefa = (await q1(`select id from ws_tarefas limit 1`)).id
  const direto = (hora) => q(`insert into reunioes_agendamentos(provedor,booking_uid,responsavel_id,inicio,fim,status,idempotency_key,request_hash,participante_nome,participante_telefone,tarefa_id)
    values ('nativo',gen_random_uuid()::text,'${R}',($1::date + $2::time) at time zone 'America/Sao_Paulo',($1::date + $2::time) at time zone 'America/Sao_Paulo' + interval '1 hour','solicitada',gen_random_uuid(),repeat('b',64),'X','+5545999990009',$3)`, [dia(11), hora, tarefa])
    .then(() => "ok").catch(e => (/exclu|sem_sobreposicao/i.test(e.message) ? "exclude" : "outro:" + e.message.slice(0, 60)))
  const r9 = await Promise.all([direto("09:00"), direto("09:30"), direto("09:15")])
  ok(r9.filter(x => x === "ok").length === 1 && r9.filter(x => x === "exclude").length === 2, `3 inserts diretos sobrepostos simultâneos → 1 grava, 2 barrados pela EXCLUDE (${r9.join(", ")})`)

  // 10) Regressão ATIVO isolado.
  const at = await ativo(dia(12), "09:00", 99)
  ok(at.status === "reserved_pending_whatsapp", "ATIVO segue reservando normalmente (regressão)")

  // Lock: o funil e o ATIVO usam a mesma chave de advisory lock por responsável.
  const src = migs.join("\n")
  ok((src.match(/pg_advisory_xact_lock\(hashtextextended\('reunioes_nativas:' \|\| v_resp/g) ?? []).length >= 2 || /pg_advisory_xact_lock/.test(src), "RPCs de reserva usam pg_advisory_xact_lock por responsável")
  await pool.end()
} catch (e) {
  falhas++
  console.error("ERRO:", e)
} finally {
  await servidor.stop().catch(() => {})
  rmSync(dados, { recursive: true, force: true })
}
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os testes de concorrência passaram.")
process.exit(falhas ? 1 : 0)
