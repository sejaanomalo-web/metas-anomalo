// Teste da grade de horários nas RPCs nativas em PostgreSQL embutido (PGlite),
// com schema mínimo + as migrations 20261125 e 20261126. Não toca nenhum banco real.
// Uso (PGlite não é dependência do projeto):
//   npm i --no-save @electric-sql/pglite@0.2.17 && node scripts/qa/reunioes-nativas-grade-pglite.mjs
import { PGlite } from "@electric-sql/pglite"
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist"
import { readFileSync } from "node:fs"
const [m1, m2] = ["20261125_reunioes_nativas.sql", "20261126_reunioes_nativas_intervalo_slots.sql"]
  .map(f => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8"))
const db = new PGlite({ extensions: { btree_gist } })
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table public.usuarios(id uuid primary key, nome text, ativo boolean default true);
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
create table public.preferencias_notificacao(usuario_id uuid, ws_tarefa boolean);
`)
await db.exec(m1)
const R = "11111111-1111-4111-8111-111111111111"
await db.exec(`insert into usuarios values ('${R}','Resp',true);
insert into reunioes_disponibilidades(id,nome,fuso,responsavel_id,modo_nativo,janelas) values
 ('22222222-2222-4222-8222-222222222222','Agenda ATIVO nativa','America/Sao_Paulo','${R}',true,
  (select jsonb_agg(j) from (select jsonb_build_object('dia',d,'inicio','09:00','fim','11:00') j from generate_series(0,6) d
   union all select jsonb_build_object('dia',d,'inicio','16:00','fim','18:00') from generate_series(0,6) d) s));
insert into reunioes_tipos(id,nome,duracao_min,responsavel_id,origem_comercial,limite_diario)
 values ('33333333-3333-4333-8333-333333333333','Demo',60,'${R}','sistema_imobiliario',3);`)
await db.exec(m2)
let falhas = 0
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) falhas++ }
const tipo = (await db.query(`select intervalo_minutos from reunioes_tipos`)).rows[0]
ok(tipo.intervalo_minutos === 60, "migration preencheu intervalo_minutos com a duração (60)")
const ativar = () => db.exec(`insert into reunioes_canais_nativos(chave,tipo_id,disponibilidade_id,ativo,exclusividade_verificada_em)
  values ('ativo','33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',true,now())
  on conflict (chave) do update set ativo=true, exclusividade_verificada_em=now()`)
await ativar()
const dia = n => (new Date(Date.now() + n * 86400000)).toISOString().slice(0, 10)
let k = 0
const reservar = async (data, hora) => {
  const uuid = `aaaaaaaa-aaaa-4aaa-8aaa-${String(++k).padStart(12, "0")}`
  const r = await db.query(`select public.reunioes_nativas_reservar('João Teste','+5545999999999',
    ($1::date + $2::time) at time zone 'America/Sao_Paulo', $3::uuid, repeat('a',64), '{}'::jsonb) r`, [data, hora, uuid])
  return r.rows[0].r
}
ok((await reservar(dia(3), "09:15")).code === "SLOT_UNAVAILABLE", "intervalo 60: 09:15 (fora da grade) → SLOT_UNAVAILABLE")
ok((await reservar(dia(3), "09:30")).code === "SLOT_UNAVAILABLE", "intervalo 60: 09:30 (fora da grade) → SLOT_UNAVAILABLE")
ok((await reservar(dia(3), "10:30")).code === "SLOT_UNAVAILABLE", "intervalo 60: 10:30 (fora da grade, fim fora da janela) → SLOT_UNAVAILABLE")
const a = await reservar(dia(3), "10:00")
ok(a.status === "reserved_pending_whatsapp", "intervalo 60: 10:00 (na grade, livre) → reservado")
ok((await reservar(dia(3), "10:00")).code === "SLOT_UNAVAILABLE", "10:00 já ocupado → SLOT_UNAVAILABLE")
ok((await reservar(dia(4), "17:00")).status === "reserved_pending_whatsapp", "16:00–18:00: 17:00 na grade → reservado")
ok((await reservar(dia(4), "16:30")).code === "SLOT_UNAVAILABLE", "16:00–18:00: 16:30 fora da grade → SLOT_UNAVAILABLE")

await db.exec(`update reunioes_tipos set intervalo_minutos = 30`)
const canal = (await db.query(`select ativo, exclusividade_verificada_em from reunioes_canais_nativos`)).rows[0]
ok(canal.ativo === false && canal.exclusividade_verificada_em === null, "alterar intervalo desativa o canal e zera a verificação")
ok((await reservar(dia(5), "09:30")).code === "CONFIG_UNAVAILABLE", "canal desativado → CONFIG_UNAVAILABLE")
await ativar()
ok((await reservar(dia(5), "09:30")).status === "reserved_pending_whatsapp", "intervalo 30: 09:30 → reservado")
ok((await reservar(dia(6), "09:45")).code === "SLOT_UNAVAILABLE", "intervalo 30: 09:45 → SLOT_UNAVAILABLE")
let bad = false
try { await db.exec(`update reunioes_tipos set intervalo_minutos = 4`) } catch { bad = true }
ok(bad, "CHECK recusa intervalo_minutos fora de 5–480")

const g = async (h) => (await db.query(`select public.reunioes_nativas_gerir($1::uuid,'reagendar','${R}'::uuid,
  ($2::date + $3::time) at time zone 'America/Sao_Paulo') r`, [a.bookingId, dia(7), h])).rows[0].r
ok(await g("16:15") === "SLOT_UNAVAILABLE", "reagendar para 16:15 (fora da grade de 30) → SLOT_UNAVAILABLE")
ok(await g("16:30") === "OK", "reagendar para 16:30 (na grade) → OK")
process.exit(falhas ? 1 : 0)
