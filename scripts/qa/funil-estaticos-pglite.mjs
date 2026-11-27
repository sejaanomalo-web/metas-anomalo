// Teste das RPCs do Funil Estáticos Meta em PostgreSQL embutido (PGlite), com
// schema mínimo + migrations 20261125, 20261126, 20261127 e 20261128. Não toca banco real.
// Uso (PGlite não é dependência do projeto):
//   npm i --no-save @electric-sql/pglite@0.2.17 && node scripts/qa/funil-estaticos-pglite.mjs
import { PGlite } from "@electric-sql/pglite"
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist"
import { readFileSync } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { join } from "node:path"

const DIR = process.env.MIGRATIONS_DIR ?? new URL("../../supabase/migrations/", import.meta.url).pathname
const [m1, m2, m3, m4] = ["20261125_reunioes_nativas.sql", "20261126_reunioes_nativas_intervalo_slots.sql", "20261127_funil_estaticos_meta.sql", "20261128_funil_apresentacao_teste.sql"]
  .map(f => readFileSync(join(DIR, f), "utf8"))
const db = new PGlite({ extensions: { btree_gist } })
await db.exec(`
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
create table public.preferencias_notificacao(usuario_id uuid, ws_tarefa boolean);
`)
const R = "11111111-1111-4111-8111-111111111111"
await db.exec(m1)
await db.exec(`insert into usuarios(id,nome) values ('${R}','Resp');
insert into reunioes_disponibilidades(id,nome,fuso,responsavel_id,modo_nativo,janelas) values
 ('22222222-2222-4222-8222-222222222222','Agenda nativa','America/Sao_Paulo','${R}',true,
  (select jsonb_agg(jsonb_build_object('dia',d,'inicio','09:00','fim','12:00')) from generate_series(0,6) d));
insert into reunioes_tipos(id,nome,duracao_min,responsavel_id,origem_comercial)
 values ('33333333-3333-4333-8333-333333333333','Diagnóstico',60,'${R}','marketing_corretores');`)
await db.exec(m2)
await db.exec(m3)

let falhas = 0
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) falhas++ }
const q1 = async (sql, p = []) => (await db.query(sql, p)).rows[0]
const ativarCanais = () => db.exec(`
  insert into reunioes_canais_nativos(chave,tipo_id,disponibilidade_id,ativo,exclusividade_verificada_em) values
   ('ativo','33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',true,now()),
   ('estaticos_meta','33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',true,now())
  on conflict (chave) do update set ativo=true, exclusividade_verificada_em=now()`)
await ativarCanais()

const f0 = await q1(`select id, versao_publicada_id, ativo from funil_config where chave='estaticos_meta'`)
ok(f0 && f0.versao_publicada_id && f0.ativo === false, "seed: funil criado inativo com versão 1 publicada")

// 20261128 (fase 2): v2 com apresentação, criativos E01–E12, colunas novas.
await db.exec(m4)
const f = await q1(`select id, versao_publicada_id, ativo from funil_config where chave='estaticos_meta'`)
const vs = (await db.query(`select numero, status, definicao from funil_versoes where funil_id=$1 order by numero`, [f.id])).rows
ok(vs.length === 2 && vs[0].status === "arquivada" && vs[1].status === "publicada" && f.ativo === false, "20261128: v2 publicada, v1 arquivada, funil continua inativo")
ok(JSON.stringify(vs[1].definicao.perguntas) === JSON.stringify(vs[0].definicao.perguntas), "v2 mantém exatamente as perguntas da v1")
ok(vs[1].definicao.apresentacao?.ativo === true && vs[1].definicao.visual === "claro" && vs[1].definicao.apresentacao.beneficios.length === 4, "v2 com apresentação ativa e identidade branca")
const cr = (await db.query(`select codigo, meta_ad_id from funil_criativos where funil_id=$1 order by codigo`, [f.id])).rows
ok(cr.length === 12 && cr[0].codigo === "E01" && cr[11].codigo === "E12" && cr.every(c => c.meta_ad_id === null), "12 criativos E01–E12, sem ID de anúncio inventado")
await db.exec(m4)
ok((await q1(`select count(*)::int n from funil_versoes where funil_id=$1`, [f.id])).n === 2 && (await q1(`select count(*)::int n from funil_criativos`)).n === 12, "20261128 reaplicada: idempotente (sem v3, sem criativo duplicado)")
let erroAtivar = false
try { await db.exec(`update funil_config set ativo = true`) } catch { erroAtivar = true }
ok(erroAtivar, "CHECK: não publica sem política de privacidade")
await db.exec(`update funil_config set ativo = true, privacidade_url = 'https://exemplo.com/privacidade'`)

const novaSessao = async (ambiente = "producao", extra = {}) => {
  const id = randomUUID(), segredo = randomUUID()
  const hash = createHash("sha256").update(segredo).digest("hex")
  await db.query(`insert into funil_sessoes(id,funil_id,versao_id,segredo_hash,ambiente,respostas,atribuicao,consentimento_marketing)
    values ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, f.id, f.versao_publicada_id, hash, ambiente,
    JSON.stringify({ perfil: "gestor", interesse: "sistema", investimento: "anuncios" }), JSON.stringify({ ad_id: "120200000000000001", utm_source: "ig" }), extra.consent ?? null])
  return { id, hash }
}
const lead = (s, nome, tel) => q1(`select public.funil_capturar_lead($1,$2,$3,$4,null,null,'sistema',0,'nao_avaliado','{"marketing":true}'::jsonb,'{"client_ip_address":"1.2.3.4"}'::jsonb) r`, [s.id, s.hash, nome, tel]).then(x => x.r)
const dia = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const reservar = (s, data, hora, chave = randomUUID()) => q1(`select public.funil_reservar($1,$2,($3::date + $4::time) at time zone 'America/Sao_Paulo',$5,'{}'::jsonb) r`, [s.id, s.hash, data, hora, chave]).then(x => x.r)

const s1 = await novaSessao()
ok((await reservar(s1, dia(3), "09:00")).code === "LEAD_REQUIRED", "reserva sem lead → LEAD_REQUIRED (lead é salvo ANTES da agenda)")
ok((await q1(`select public.funil_capturar_lead($1,$2,'João','+5545999990001',null,null,null,0,null,'{}'::jsonb,'{}'::jsonb) r`, [s1.id, "f".repeat(64)])).r.code === "SESSION_INVALID", "segredo errado → SESSION_INVALID")
const l1 = await lead(s1, "João Silva", "+5545999990001")
ok(l1.leadId && l1.novo === true && l1.eventId === `lead.${l1.leadId}`, "lead criado com event_id estável lead.<id>")
const l1b = await lead(s1, "João Silva", "+5545999990001")
ok(l1b.leadId === l1.leadId && l1b.novo === false, "reenvio da mesma submissão não duplica o lead")
ok((await q1(`select count(*)::int n from funil_conversoes where event_id=$1`, [l1.eventId])).n === 1, "uma única conversão Lead por contato")
ok((await q1(`select status, motivo from funil_conversoes where event_id=$1`, [l1.eventId])).status === "ignorado", "CAPI desligada → conversão registrada como 'ignorado'")
ok((await q1(`select count(*)::int n from funil_eventos where evento='lead_created' and sessao_id=$1`, [s1.id])).n === 1, "evento lead_created idempotente")
const sess1 = await q1(`select estado, lead_id, contato_em from funil_sessoes where id=$1`, [s1.id])
ok(sess1.estado === "lead" && sess1.lead_id === l1.leadId && sess1.contato_em, "sessão vinculada ao lead real")

ok((await reservar(s1, dia(3), "09:30")).code === "SLOT_UNAVAILABLE", "início fora da grade (09:30, passo 60) → SLOT_UNAVAILABLE")
ok((await reservar(s1, dia(3), "07:00")).code === "SLOT_UNAVAILABLE", "fora da janela → SLOT_UNAVAILABLE")
ok((await reservar(s1, dia(0), "09:00")).code === "SLOT_UNAVAILABLE", "antecedência mínima respeitada")
const chave = randomUUID()
const b1 = await reservar(s1, dia(3), "10:00", chave)
ok(b1.status === "reserved" && b1.eventId === `schedule.${b1.bookingId}`, "reserva confirmada com event_id schedule.<id>")
const b1b = await reservar(s1, dia(3), "10:00", chave)
ok(b1b.bookingId === b1.bookingId, "retry com a mesma chave devolve a MESMA reserva (sem duplicar)")
ok((await reservar(s1, dia(3), "11:00", chave)).code === "IDEMPOTENCY_MISMATCH", "mesma chave com outro horário → IDEMPOTENCY_MISMATCH")
ok((await reservar(s1, dia(4), "09:00")).status === "existing", "mesmo lead não acumula 2ª reunião futura pelo funil")
const ag = await q1(`select provedor, canal_nativo, status, tarefa_id, participante_nome, responsavel_id from reunioes_agendamentos where id=$1`, [b1.bookingId])
ok(ag.provedor === "nativo" && ag.canal_nativo === "estaticos_meta" && ag.status === "solicitada" && ag.responsavel_id === R, "reunião nativa no módulo existente, canal estaticos_meta, responsável do tipo")
const t = await q1(`select titulo, descricao from ws_tarefas where id=$1`, [ag.tarefa_id])
ok(/^\d\d:\d\d - Reunião com João Silva \(a confirmar\)$/.test(t.titulo), `tarefa no padrão do Workspace: "${t.titulo}"`)
ok(t.descricao.includes("Funil Estáticos Meta") && t.descricao.includes("Proprietário ou gestor") && t.descricao.includes("120200000000000001"), "descrição com respostas, origem e ad_id")
ok((await q1(`select count(*)::int n from funil_conversoes where evento='Schedule'`)).n === 1, "uma conversão Schedule por reunião")
ok((await q1(`select status_comercial from funil_leads where id=$1`, [l1.leadId])).status_comercial === "reuniao_agendada", "status comercial → reunião agendada")

// Conflito entre canais: outro visitante e o canal ATIVO tentam o mesmo horário.
const s2 = await novaSessao(); await lead(s2, "Maria", "+5545999990002")
ok((await reservar(s2, dia(3), "10:00")).code === "SLOT_UNAVAILABLE", "2º visitante no mesmo horário → SLOT_UNAVAILABLE")
const ativo = await q1(`select public.reunioes_nativas_reservar('Cliente ATIVO','+5545999990003',($1::date + '10:00'::time) at time zone 'America/Sao_Paulo',$2::uuid,repeat('a',64),'{}'::jsonb) r`, [dia(3), randomUUID()])
ok(ativo.r.code === "SLOT_UNAVAILABLE", "canal ATIVO não reserva horário já tomado pelo funil (exclusividade compartilhada)")
const ativo2 = await q1(`select public.reunioes_nativas_reservar('Cliente ATIVO','+5545999990003',($1::date + '09:00'::time) at time zone 'America/Sao_Paulo',$2::uuid,repeat('a',64),'{}'::jsonb) r`, [dia(5), randomUUID()])
ok(ativo2.r.status === "reserved_pending_whatsapp", "ATIVO continua funcionando (regressão)")
ok((await reservar(s2, dia(5), "09:00")).code === "SLOT_UNAVAILABLE", "funil não reserva horário tomado pelo ATIVO")
// Buffer (intervalo_min=15): 11:00 colide com 10:00–11:00 + 15 min.
ok((await reservar(s2, dia(3), "11:00")).code === "SLOT_UNAVAILABLE", "buffer após reunião respeitado")
// A constraint EXCLUDE é a última linha de defesa (sem passar pelas checagens).
let excl = false
try {
  await db.query(`insert into reunioes_agendamentos(provedor,booking_uid,responsavel_id,inicio,fim,status,idempotency_key,request_hash,participante_nome,participante_telefone,tarefa_id)
    values ('nativo','x','${R}',($1::date + '10:30'::time) at time zone 'America/Sao_Paulo',($1::date + '11:30'::time) at time zone 'America/Sao_Paulo','solicitada',gen_random_uuid(),repeat('b',64),'X','+5545999990009',$2)`, [dia(3), ag.tarefa_id])
} catch (e) { excl = /exclu|reunioes_nativas_sem_sobreposicao/i.test(String(e.message)) }
ok(excl, "EXCLUDE impede sobreposição mesmo num insert direto")

// Gestão interna: reagendar procura o canal da própria reserva.
const g = (acao, data, hora) => q1(`select public.reunioes_nativas_gerir($1,$2,'${R}',${data ? `($3::date + $4::time) at time zone 'America/Sao_Paulo'` : "null"}) r`, data ? [b1.bookingId, acao, data, hora] : [b1.bookingId, acao]).then(x => x.r)
ok(await g("reagendar", dia(6), "09:00") === "OK", "reagendar reserva do funil pelo Workspace → OK (canal correto)")
ok((await q1(`select count(*)::int n from funil_eventos where evento='meeting_rescheduled'`)).n === 1, "reagendamento refletido no funil")
ok(await g("cancelar") === "OK", "cancelar pelo Workspace → OK")
ok((await q1(`select status_comercial from funil_leads where id=$1`, [l1.leadId])).status_comercial === "reagendamento", "cancelamento → lead em 'Reagendamento'")
ok((await reservar(s2, dia(6), "09:00")).status === "reserved", "horário cancelado volta a ficar disponível")

// Inatividade e follow-up.
const s3 = await novaSessao()
await db.query(`update funil_sessoes set ultima_interacao_em = now() - interval '2 hours', etapa_atual='interesse' where id=$1`, [s3.id])
await db.exec(`update funil_config set followup_ativo = true, followup_minutos = 10`)
const s4 = await novaSessao(); const l4 = await lead(s4, "Pedro", "+5545999990004")
await db.query(`update funil_leads set criado_em = now() - interval '1 hour' where id=$1`, [l4.leadId])
const inat = (await q1(`select public.funil_processar_inatividade() r`)).r
ok(inat.abandonos >= 1, `abandono inferido por inatividade (${inat.abandonos})`)
ok((await q1(`select abandonada, etapa_abandono from funil_sessoes where id=$1`, [s3.id])).etapa_abandono === "interesse", "etapa do abandono registrada")
ok(inat.followups >= 1 && (await q1(`select followup_tarefa_id from funil_leads where id=$1`, [l4.leadId])).followup_tarefa_id, "follow-up criado para lead sem reunião")
const inat2 = (await q1(`select public.funil_processar_inatividade() r`)).r
ok(inat2.followups === 0, "follow-up não duplica")
ok((await q1(`select count(*)::int n from ws_tarefas where source_gid like 'funil-followup:%'`)).n === inat.followups, "uma tarefa de follow-up por lead")

// CAPI ligada + consentimento: conversão pendente com contexto; teste fica separado.
await db.exec(`update funil_config set capi_ativo = true, pixel_id = '1234567890'`)
const s5 = await novaSessao("teste", { consent: true }); const l5 = await lead(s5, "Ana Teste", "+5545999990005")
const c5 = await q1(`select status, ambiente, contexto from funil_conversoes where event_id=$1`, [l5.eventId])
ok(c5.status === "pendente" && c5.ambiente === "teste" && c5.contexto.client_ip_address === "1.2.3.4", "CAPI ligada: Lead pendente, ambiente teste marcado")
await lead(s5, "Ana Teste", "+5545999990001")
ok((await q1(`select count(*)::int n from funil_leads where telefone_e164='+5545999990001'`)).n === 2, "mesmo telefone em teste e produção não se misturam")
await db.exec(`update funil_config set consentimento_modo = 'opt_in'`)
const s6 = await novaSessao("producao", { consent: false })
const l6 = await q1(`select public.funil_capturar_lead($1,$2,'Sem Consent','+5545999990006',null,null,null,0,null,'{"marketing":false}'::jsonb,'{"client_ip_address":"9.9.9.9"}'::jsonb) r`, [s6.id, s6.hash])
const c6 = await q1(`select status, motivo, contexto from funil_conversoes where event_id=$1`, [l6.r.eventId])
ok(c6.status === "ignorado" && Object.keys(c6.contexto).length === 0, "opt-in recusado: CAPI não envia e não guarda IP")

// Fase 2: teste não notifica, não gera follow-up e só aceita colunas de teste em sessão de teste.
await db.exec(`update funil_config set followup_ativo = true, followup_minutos = 10, notificar_novo_lead = true`)
const nAntes = (await q1(`select count(*)::int n from notificacoes`)).n
const s7 = await novaSessao("teste"); const l7 = await lead(s7, "Teste Sem Efeito", "+5545999990077")
ok((await q1(`select count(*)::int n from notificacoes`)).n === nAntes, "lead de TESTE não gera notificação para a equipe")
const s8 = await novaSessao(); await lead(s8, "Lead Real", "+5545999990088")
ok((await q1(`select count(*)::int n from notificacoes where titulo like 'Novo lead%'`)).n >= 1 && (await q1(`select count(*)::int n from notificacoes`)).n === nAntes + 1, "lead de produção continua notificando")
await db.query(`update funil_leads set criado_em = now() - interval '1 hour' where id=$1`, [l7.leadId])
await q1(`select public.funil_processar_inatividade() r`)
ok((await q1(`select followup_tarefa_id from funil_leads where id=$1`, [l7.leadId])).followup_tarefa_id === null, "lead de TESTE não gera tarefa de follow-up")
ok((await q1(`select count(*)::int n from ws_tarefas where titulo like '[TESTE] Follow-up%'`)).n === 0, "nenhuma tarefa '[TESTE] Follow-up' criada")
let ck1 = false, ck2 = false, ck3 = false
try { await db.query(`update funil_sessoes set diagnostico_capi = true where id=$1`, [s8.id]) } catch { ck1 = true }
try { await db.query(`update funil_sessoes set teste_reserva_inicio = now(), teste_reserva_fim = now() + interval '1 hour' where id=$1`, [s8.id]) } catch { ck2 = true }
try { await db.query(`update funil_sessoes set variante_entrada = 'xyz' where id=$1`, [s8.id]) } catch { ck3 = true }
ok(ck1 && ck2 && ck3, "CHECK: diagnóstico da CAPI e reserva simulada só em sessão de teste; variante válida")
await db.query(`update funil_sessoes set diagnostico_capi = true, teste_reserva_inicio = now(), teste_reserva_fim = now() + interval '1 hour', variante_entrada = 'apresentacao', versao_visual = 'claro' where id=$1`, [s7.id])
ok((await q1(`select count(*)::int n from reunioes_agendamentos where participante_telefone='+5545999990077'`)).n === 0, "reserva simulada de teste não cria reunião real")

// Mudar a agenda desativa os DOIS canais (mesma proteção do ATIVO).
await db.exec(`update reunioes_disponibilidades set janelas = '[]'`)
ok((await q1(`select bool_or(ativo) a from reunioes_canais_nativos`)).a === false, "alterar disponibilidade desativa os canais até nova verificação")
ok((await reservar(await novaSessao().then(async s => { await lead(s, "Zé", "+5545999990007"); return s }), dia(8), "09:00")).code === "CONFIG_UNAVAILABLE", "canal desativado → CONFIG_UNAVAILABLE (lead preservado)")

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os testes passaram.")
process.exit(falhas ? 1 : 0)
