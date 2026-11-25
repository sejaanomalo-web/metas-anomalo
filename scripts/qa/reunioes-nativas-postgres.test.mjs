// PostgreSQL real, conexões independentes. Banco descartável, exclusivamente local.
// PG_BIN=/caminho/bin PGHOST=/diretorio/socket PGPORT=55439 node --test scripts/qa/reunioes-nativas-postgres.test.mjs
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
const exec = promisify(execFile)
const bin = process.env.PG_BIN
const host = process.env.PGHOST
if (!bin || !host?.startsWith('/') || !process.env.PGPORT) throw new Error('Defina PG_BIN, PGHOST (socket local) e PGPORT do PostgreSQL descartável.')
const database = `nativo_qa_${randomUUID().replaceAll('-','')}`
const env = { ...process.env, PGDATABASE: database }
const run = async sql => (await exec(`${bin}/psql`, ['-X','-v','ON_ERROR_STOP=1','-qAt','-c',sql], {env,maxBuffer:5_000_000})).stdout.trim()
const json = async sql => JSON.parse(await run(sql))
const U='11111111-1111-4111-8111-111111111111', T='22222222-2222-4222-8222-222222222222', D='33333333-3333-4333-8333-333333333333'
let day
const start = (h='09:00',days=0)=>`((now() at time zone 'America/Sao_Paulo')::date + ${days+1} + time '${h}') at time zone 'America/Sao_Paulo'`
const reserve = (key=randomUUID(),h='09:00',hash='a'.repeat(64),days=0)=>json(`select public.reunioes_nativas_reservar('João Teste','+5545999999999',${start(h,days)},'${key}','${hash}','{}')`)
const manage = (id,action,h='09:00',days=0)=>run(`select public.reunioes_nativas_gerir('${id}','${action}','${U}',${start(h,days)})`)
const activate = ()=>run(`update public.reunioes_canais_nativos set ativo=true,exclusividade_verificada_em=now(),exclusividade_verificada_por='${U}'`)
before(async()=>{
 await exec(`${bin}/createdb`,[database],{env})
 await run(await readFile(new URL('./fixtures/reunioes-base.sql',import.meta.url),'utf8'))
 for(const file of ['20260721_workspace_fase1.sql','20260824_workspace_multi_responsaveis.sql']) await run(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'))
 await run('alter table public.ws_tarefas add column source_gid text; create unique index on public.ws_tarefas(source_gid) where source_gid is not null;')
 for(const file of ['20261021_reunioes_calcom.sql','20261113_reunioes_calcom_multi_contas.sql','20261125_reunioes_nativas.sql','20261126_reunioes_nativas_integridade.sql']) await run(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'))
 // A atualização precisa poder ser reaplicada sem criar reservas ou apagar histórico.
 await run(await readFile(new URL('../../supabase/migrations/20261126_reunioes_nativas_integridade.sql',import.meta.url),'utf8'))
})
after(async()=>{await exec(`${bin}/dropdb`,['--if-exists',database],{env})})
beforeEach(async()=>{
 await run(`truncate public.reunioes_agendamentos,public.reunioes_canais_nativos,public.reunioes_tipos,public.reunioes_disponibilidades,public.ws_tarefas,public.usuarios,public.ws_contextos,public.notificacoes,public.reunioes_nativas_rate cascade;
 insert into public.usuarios(id,nome,papel,ativo) values('${U}','Responsável Teste','admin',true);
 insert into public.ws_contextos(id,nome,tipo) values('${U}','Projeto teste','interno');
 insert into public.reunioes_disponibilidades(id,nome,responsavel_id,modo_nativo,janelas)
 values('${D}','Nativa','${U}',true,(select jsonb_agg(jsonb_build_object('dia',d,'inicio','09:00','fim','18:00')) from generate_series(0,6) d));
 insert into public.reunioes_tipos(id,nome,origem_comercial,responsavel_id,duracao_min,intervalo_min,antecedencia_min_horas,limite_diario,contexto_id)
 values('${T}','Demonstração ATIVO','sistema_imobiliario','${U}',60,15,0,3,'${U}');
 insert into public.reunioes_canais_nativos(chave,tipo_id,disponibilidade_id,ativo,exclusividade_verificada_em) values('ativo','${T}','${D}',true,now());`)
 day=await run(`select ((now() at time zone 'America/Sao_Paulo')::date + 1)::text`)
})
test('reserva, tarefa, responsável, contexto, seguidores, atividade, realtime e notificação são persistidos',async()=>{
 const a=await reserve();assert.equal(a.status,'reserved_pending_whatsapp')
 assert.equal(await run(`select count(*) from public.ws_tarefas w join public.reunioes_agendamentos a on a.tarefa_id=w.id where a.id='${a.bookingId}' and w.titulo like '09:00 - Reunião com João Teste%' and w.prazo_em='${day}' and w.responsavel_id='${U}'`),'1')
 for(const table of ['ws_tarefa_responsaveis','ws_tarefa_contextos','ws_seguidores','ws_atividade','ws_realtime_ping','notificacoes_usuario']) assert.equal(await run(`select count(*) from public.${table}`),'1',table)
})
test('duas conexões concorrentes recebem uma reserva e um conflito',async()=>{
 const results=await Promise.all([reserve(),reserve()]);assert.equal(results.filter(x=>x.bookingId).length,1);assert.equal(results.filter(x=>x.code==='SLOT_UNAVAILABLE').length,1)
 assert.equal(await run('select count(*) from public.ws_tarefas'),'1')
})
test('mesma chave concorrente retorna uma única reserva; payload diferente é recusado',async()=>{
 const key=randomUUID();const [a,b]=await Promise.all([reserve(key),reserve(key)]);assert.equal(a.bookingId,b.bookingId)
 assert.equal((await reserve(key,'09:00','b'.repeat(64))).code,'IDEMPOTENCY_MISMATCH')
 assert.equal(await run('select count(*) from public.ws_tarefas'),'1')
})
test('Cal.com e sobreposição parcial bloqueiam; cancelamento libera',async()=>{
 await run(`insert into public.reunioes_agendamentos(provedor,booking_uid,status,inicio,fim,responsavel_id) values('calcom','cal-teste','confirmada',${start('09:30')},${start('10:30')},'${U}')`)
 assert.equal((await reserve()).code,'SLOT_UNAVAILABLE');assert.equal((await reserve(randomUUID(),'10:15')).code,'SLOT_UNAVAILABLE')
 await run("update public.reunioes_agendamentos set status='cancelada' where provedor='calcom'")
 assert.ok((await reserve()).bookingId)
 assert.equal(await run("select status from public.reunioes_agendamentos where provedor='calcom'"),'cancelada')
})
test('antecedência, horizonte e limite diário são revalidados no banco',async()=>{
 await run(`update public.reunioes_tipos set antecedencia_min_horas=720 where id='${T}'`);await activate();assert.equal((await reserve()).code,'SLOT_UNAVAILABLE')
 await run(`update public.reunioes_tipos set antecedencia_min_horas=0,horizonte_dias=1 where id='${T}'`);await activate();assert.equal((await reserve()).code,'SLOT_UNAVAILABLE')
 await run(`update public.reunioes_tipos set horizonte_dias=14,limite_diario=1 where id='${T}'`);await activate();assert.ok((await reserve()).bookingId);assert.equal((await reserve(randomUUID(),'16:00')).code,'SLOT_UNAVAILABLE')
})
test('exceção, período e bloqueio por data são respeitados',async()=>{
 await run(`update public.reunioes_disponibilidades set excecoes='[{"data":"${day}","janelas":[]}]' where id='${D}'`);await activate();assert.equal((await reserve()).code,'SLOT_UNAVAILABLE')
 await run(`update public.reunioes_disponibilidades set excecoes='[]', periodos=jsonb_build_array(jsonb_build_object('de','${day}','ate','${day}','janelas',jsonb_build_array(jsonb_build_object('dia',extract(dow from '${day}'::date)::int,'inicio','16:00','fim','18:00')))) where id='${D}'`);await activate();assert.equal((await reserve()).code,'SLOT_UNAVAILABLE');assert.ok((await reserve(randomUUID(),'16:00')).bookingId)
 await run(`update public.reunioes_disponibilidades set bloqueios='[{"de":"${day}","ate":"${day}"}]' where id='${D}'`);await activate();assert.equal((await reserve(randomUUID(),'17:00')).code,'SLOT_UNAVAILABLE')
})
test('bloqueio de tarefa considera responsáveis secundários',async()=>{
 await run(`insert into public.usuarios(id,nome) values('44444444-4444-4444-8444-444444444444','Outro'); insert into public.ws_tarefas(id,titulo,prazo_em,prazo_hora) values('${U}','Bloqueio','${day}','09:30'); insert into public.ws_tarefa_responsaveis(tarefa_id,usuario_id,ordem) values('${U}','44444444-4444-4444-8444-444444444444',0),('${U}','${U}',1); insert into public.ws_tarefa_bloqueios(tarefa_id,duracao_min) values('${U}',60)`)
 assert.equal((await reserve()).code,'SLOT_UNAVAILABLE')
})
test('cancelamento nativo libera e reagendamento mantém tarefa e notas',async()=>{
 const a=await reserve();await run(`update public.ws_tarefas set descricao=descricao || E'\nNota da equipe' where source_gid='nativo:${a.bookingId}'`)
 assert.equal(await manage(a.bookingId,'reagendar','16:00'),'OK');assert.equal(await run(`select count(*) from public.ws_tarefas where prazo_hora='16:00' and descricao like '%Nota da equipe%'`),'1')
 assert.equal(await manage(a.bookingId,'confirmar'),'OK');assert.equal(await manage(a.bookingId,'confirmar'),'OK')
 assert.equal(await manage(a.bookingId,'cancelar'),'OK');assert.ok((await reserve(randomUUID(),'16:00')).bookingId)
})
test('falha no banco faz rollback da tarefa; falha na notificação é recuperada sem nova reserva',async()=>{
 await run(`create function public.qa_fail() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$;create trigger qa_fail before insert on public.reunioes_agendamentos for each row execute function public.qa_fail();`)
 await assert.rejects(reserve());assert.equal(await run('select count(*) from public.ws_tarefas'),'0');await run('drop trigger qa_fail on public.reunioes_agendamentos')
 await run('create trigger qa_fail before insert on public.notificacoes for each row execute function public.qa_fail()')
 const a=await reserve();assert.ok(a.bookingId);assert.equal(await run('select count(*) from public.notificacoes_usuario'),'0');assert.equal(await run('select count(*) from public.reunioes_nativas_notificacoes where entregue_em is null'),'1')
 await run('drop trigger qa_fail on public.notificacoes; drop function public.qa_fail();select public.reunioes_nativas_entregar_notificacoes(); select public.reunioes_nativas_entregar_notificacoes()')
 assert.equal(await run('select count(*) from public.notificacoes_usuario'),'1');assert.equal(await run('select count(*) from public.reunioes_agendamentos'),'1')
})
test('RLS/RPCs negam anon; rate limit é persistente',async()=>{
 await assert.rejects(run(`set role anon; select public.reunioes_nativas_reservar('Teste','+5545999999999',now(),'${randomUUID()}','${'a'.repeat(64)}','{}')`))
 assert.equal(await run(`select public.reunioes_nativas_limitar('${'c'.repeat(64)}',1)`),'t');assert.equal(await run(`select public.reunioes_nativas_limitar('${'c'.repeat(64)}',1)`),'f')
})
test('alteração direta da tarefa não descola horário e reserva; notas permanecem editáveis',async()=>{
 const a=await reserve();await assert.rejects(run(`update public.ws_tarefas set prazo_hora='14:00' where source_gid='nativo:${a.bookingId}'`))
 await run(`update public.ws_tarefas set descricao=descricao || ' Nota' where source_gid='nativo:${a.bookingId}'`)
})

test('buffer do outro tipo, reserva nativa sobreposta e reunião realizada',async()=>{
 const other=randomUUID()
 await run(`insert into public.reunioes_tipos(id,nome,origem_comercial,intervalo_min) values('${other}','Marketing','marketing_corretores',120); insert into public.reunioes_agendamentos(provedor,booking_uid,tipo_id,status,inicio,fim,responsavel_id) values('calcom','cal-buffer','${other}','confirmada',${start('07:00')},${start('08:00')},'${U}')`)
 assert.equal((await reserve()).code,'SLOT_UNAVAILABLE')
 await run("update public.reunioes_agendamentos set status='realizada' where provedor='calcom'")
 const a=await reserve();assert.ok(a.bookingId);assert.equal((await reserve(randomUUID(),'09:30')).code,'SLOT_UNAVAILABLE')
 assert.equal(await manage(a.bookingId,'realizar'),'INVALID_INPUT')
 await run(`update public.reunioes_agendamentos set inicio=now()-interval '2 hours',fim=now()-interval '1 hour' where id='${a.bookingId}'`)
 assert.equal(await manage(a.bookingId,'realizar'),'OK')
 assert.equal(await run(`select count(*) from public.ws_tarefas where concluida_por='${U}'`),'1')
})
