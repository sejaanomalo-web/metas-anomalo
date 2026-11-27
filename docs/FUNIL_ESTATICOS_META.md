# Funil Estáticos Meta

Funil público de qualificação + agendamento para a campanha de corretores de Cascavel–PR. É a **3ª origem comercial** das Reuniões, ao lado do **Cal.com** e do **canal nativo ATIVO**.

- Página pública: `/funil/<slug>`. O slug inicial é `estaticos-meta`, então em produção a URL é `https://metas-anomalo.vercel.app/funil/estaticos-meta`.
- Painel: **Workspace → Reuniões → Integrações → Funil Estáticos Meta → Abrir funil** (`/dashboard/workspace/funis/estaticos-meta`). Só admins do Workspace acessam.

## Arquitetura e decisões

| Peça | Onde | Por quê |
|---|---|---|
| Página pública | `app/funil/[slug]/route.ts` + `lib/funil-estaticos-pagina.ts` + `lib/funil-estaticos-cliente.ts` | É um Route Handler que devolve HTML pronto (~33 KB) com a 1ª pergunta já renderizada no servidor. CSS e JS vão inline, sem React, sem o `globals.css`, sem Google Fonts e sem o layout do Workspace. A CSP é estrita, com hash do script. Pensado para o navegador interno do Instagram/Facebook em 4G fraco. |
| API pública | `app/api/public/funil/route.ts` (POST com `acao`: `sessao`, `eventos`, `contato`, `agenda`, `reservar`, `despachar`) | Cada ação só enxerga a própria sessão (id + segredo de 256 bits; o banco guarda só o hash). Tem rate limit distribuído (reaproveita `reunioes_nativas_limitar`), honeypot, limite de 8 KB, checagem de Origin e `no-store`. |
| Serviço | `lib/funil-estaticos.ts` | Sessão, eventos, captura do lead, CRM, agenda, reserva e fila da CAPI. |
| Regras puras | `lib/funil-estaticos-nucleo.ts` | Validação de telefone/nome/e-mail, atribuição, definição do formulário, pontuação e métricas. |
| Agenda | `lib/reunioes-nativas.ts` (`configurarCanal("estaticos_meta")`) | É **a mesma** disponibilidade do Workspace (janelas, períodos, exceções, bloqueios, reuniões de todos os canais do responsável, bloqueios de tarefa, antecedência, horizonte, limite diário, intervalo entre horários). Não existe agenda paralela. |
| Reserva | RPC `funil_reservar` | Usa o mesmo `pg_advisory_xact_lock` por responsável e a mesma constraint `EXCLUDE reunioes_nativas_sem_sobreposicao` do ATIVO. Reserva, tarefa, notificação, evento e conversão são gravados numa única transação. |
| Admin | `app/dashboard/workspace/funis/[slug]/page.tsx`, `components/workspace/funil/*`, `lib/funil-estaticos-actions.ts`, `lib/funil-estaticos-admin.ts` | Abas: Visão geral, Leads, Formulário, Agendamento, Tracking, Relatórios e Configurações. |
| Rotina | `app/api/funil/processar` (cron diário da Vercel) + pg_cron `funil_inatividade_10min` | Abandono e follow-up rodam no próprio banco, a cada 10 min. A fila da CAPI e o espelho no CRM rodam no endpoint. |

### O que foi reutilizado sem mudança
Tipos de reunião, disponibilidades, `reunioes_agendamentos`, tarefas (`ws_tarefas`, responsáveis, seguidores, contexto), `ws_atividade`, realtime ping, `notificacoes` + preferências, rate limit e a gestão de reunião nativa na tarefa (confirmar, reagendar, cancelar, realizada).

### O que foi alterado em infraestrutura existente (mínimo)
- `reunioes_canais_nativos`: a chave aceita `estaticos_meta`. Caiu o UNIQUE em `tipo_id`, então dois canais podem usar o mesmo tipo.
- `reunioes_agendamentos.canal_nativo` (nova, nula nas reservas antigas, que contam como `ativo`).
- `reunioes_nativas_gerir`: o reagendamento procura o canal da **própria** reserva (`coalesce(canal_nativo,'ativo')`). Nenhuma outra linha mudou.
- `lib/reunioes-nativas.ts`: ganhou `configurarCanal(chave)`. `configurarNativo()` continua exigindo `ATIVO_NATIVE_BOOKING_ENABLED` para o ATIVO.
- `reunioes_nativas_reservar` (ATIVO) **não foi tocada**.

## Fluxo público
1. A 1ª pergunta chega no HTML. O JS abre a sessão em paralelo, sem bloquear o toque.
2. São 3 perguntas, uma por vez, com avanço automático, botão Voltar sem perder respostas e progresso real ("Etapa x de 5").
3. Na etapa de contato (nome + WhatsApp com máscara, `inputmode=tel`, validação no navegador e no servidor), a RPC `funil_capturar_lead` salva o lead **antes** da agenda. Ela deduplica pelo telefone E.164 dentro de funil + ambiente, vincula a sessão, grava `lead_created` e enfileira o `Lead`.
4. Na agenda, os horários vêm da disponibilidade real (sem cache). Quando não há horário, aparece a mensagem combinada; o lead continua salvo e entra no follow-up.
5. A reserva usa `funil_reservar` com chave de idempotência por tentativa. Um 409 avisa o visitante, recarrega os horários e mantém os dados.
6. A confirmação mostra data, horário de Brasília, duração, tipo e "a equipe vai confirmar pelo WhatsApp". Não existe link de vídeo: o Workspace não usa Google Meet e o local é combinado pelo WhatsApp, igual ao ATIVO.
7. Ao recarregar, a sessão é retomada e o `Schedule` não é disparado de novo, porque há uma marca local por `bookingId`.

Ficam no `localStorage` só o id e o segredo da sessão, a etapa e os ids das respostas. Nome e WhatsApp não ficam no navegador.

## Banco (migration `supabase/migrations/20261127_funil_estaticos_meta.sql`)
Tabelas: `funil_config`, `funil_versoes` (versionada, com um rascunho por funil), `funil_criativos`, `funil_leads`, `funil_sessoes`, `funil_eventos`, `funil_conversoes` (fila CAPI), `funil_investimentos` e `funil_leads_historico`. Todas têm RLS ligada e nenhuma policy, ou seja, só o service role acessa.

RPCs, todas `security definer` com `search_path=''` e liberadas só para `service_role`: `funil_capturar_lead`, `funil_reservar` e `funil_processar_inatividade`. A trigger `funil_refletir_reuniao` age só em reservas com `canal_nativo='estaticos_meta'`.

Os estados ficam separados:
- `funil_sessoes.estado`: técnico (aberta → em_andamento → lead → horario_selecionado → agendada), com `abandonada` inferido.
- Conversão: `funil_conversoes.status`.
- Reunião: `reunioes_agendamentos.status`, que é a fonte do módulo de Reuniões.
- Comercial: `funil_leads.status_comercial`.

## Tracking
- **Eventos internos** (`funil_eventos`, sem PII): `funnel_page_view`, `funnel_started`, `question_viewed/answered/completed/back`, `contact_form_viewed`, `contact_submitted`, `lead_created`, `booking_page_viewed`, `booking_no_slots`, `booking_slot_selected`, `booking_failed`, `booking_confirmed`, `funnel_abandoned`, `meeting_cancelled/rescheduled/attended`.
- **Eventos Meta**:
  - `PageView`: só Pixel, após o load e após o consentimento quando o modo é opt-in.
  - `Lead`: depois que o lead foi persistido.
  - `Schedule`: depois que a reserva foi gravada.
  - Clique, seleção de horário e abertura da agenda **não** geram `Schedule`.
- **Deduplicação**: Pixel e CAPI usam o mesmo `event_name` e o mesmo `event_id`. O `event_id` é `lead.<lead_id>` (um por contato) e `schedule.<agendamento_id>`, com `UNIQUE(event_id)` na fila. Retry reaproveita o mesmo id.
- **CAPI**: hash SHA-256 em `ph` (dígitos com 55), `fn`, `ln`, `em`, `external_id` e `country`. `client_ip_address`, `client_user_agent`, `fbp` e `fbc` vão sem hash. `fbc` só é gerado a partir de um `fbclid` real. A `event_source_url` não leva query string. Há retry com backoff (1 min → 6 h, até 8 tentativas) e trava otimista contra envio duplo. O erro é salvo sanitizado, e IP/UA são apagados depois do envio ou em até 7 dias.
- **Ambientes**: sessões da "versão de teste" são `teste` e não carregam o Pixel. A CAPI só envia teste com `test_event_code`, e em deploy que não é de produção só envia com código de teste. Leads, reuniões e tarefas de teste levam a marca `[TESTE]`.
- **Consentimento**: opt-in (padrão) mostra uma barra discreta, e Pixel/CAPI só rodam com aceite. O aceite é separado do pedido de atendimento. Os dados de contato são sempre usados para o atendimento.

### Parâmetros de URL do anúncio
```
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}
```
Também é aceito `creative_id=E01…E06` para identificação manual. A atribuição usa primeiro o `ad_id` cadastrado no criativo e depois o código. Uma macro que chegar sem substituição (`{{...}}`) é descartada, sem inventar valor. Os IDs são guardados como string.

## Métricas
A coorte é formada pelas sessões abertas no período. Cada taxa mostra o denominador, e sem denominador aparece "Sem dados". O comparecimento conta só reuniões já encerradas e não canceladas. Propostas e vendas vêm do status comercial (com valor de venda) que a equipe atualiza no lead.

O investimento soma lançamentos manuais e `dados_diarios_ad` da Sentinela, quando o `ad_id` do criativo está cadastrado e a conta da ANÔMALO está na Sentinela. Sem investimento, CPL, CAC e ROAS aparecem como "Sem dados". O alcance não é somado.

## Variáveis de ambiente (servidor)
| Variável | Obrigatória | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | já existem | banco |
| `CRON_SECRET` | já existe | `/api/funil/processar` |
| `FUNIL_ESTATICOS_META_CAPI_TOKEN` | para CAPI | token do conjunto de dados da ANÔMALO |
| `FUNIL_HASH_SECRET` | opcional | assina links de teste e hashes de IP; se faltar, deriva da service role |
| `META_GRAPH_VERSION` | opcional | padrão `v26.0` |
| `APP_PUBLIC_URL` | opcional | URL exibida no painel |

## Implantação (ordem)
1. **SQL Editor (staging antes, se houver)**: aplicar `20261125_reunioes_nativas.sql` e `20261126_reunioes_nativas_intervalo_slots.sql`, se ainda não estiverem aplicadas, e depois `20261127_funil_estaticos_meta.sql`. Todas precisam estar aplicadas **antes** do deploy, porque a 20261127 só adiciona coisas e o código novo depende dela.
2. Conferir: `select chave, slug, ativo from funil_config;` e `select jobname from cron.job where jobname='funil_inatividade_10min';`.
3. Vercel: `FUNIL_ESTATICOS_META_CAPI_TOKEN` (Production). Deploy.
4. Em Reuniões, criar ou escolher o tipo de **diagnóstico** e uma **agenda nativa** com o mesmo responsável e as janelas. Na aba **Agendamento** do funil, selecionar os dois, confirmar que nenhuma conta Cal.com oferece as mesmas janelas e ativar.
5. Na aba **Configurações**: política de privacidade, Pixel ID, CAPI, código de teste, CRM e follow-up.
6. Na aba **Tracking**: cadastrar E01–E06 com o ID real de cada anúncio.
7. Testar pela **Versão de teste** do começo ao fim e conferir no Gerenciador de Eventos, em "Eventos de teste".
8. Ativar o funil em Configurações e usar a URL como destino dos 6 anúncios.

### Rollback
Desativar o funil em Configurações: a URL passa a mostrar a mensagem de indisponível. Desativar a agenda na aba Agendamento faz os leads continuarem sendo salvos, sem horários. Para reverter o código, basta um redeploy anterior, porque as tabelas novas não são lidas pelo código antigo. A mudança em `reunioes_nativas_gerir` é retrocompatível. Para desfazê-la, reaplicar o bloco da função da `20261126`.

## Testes
- `npm test`: inclui `lib/funil-estaticos.test.ts` (validações, atribuição, métricas, script cliente, HTML/CSP).
- `node scripts/qa/funil-estaticos-pglite.mjs`, que precisa de `@electric-sql/pglite`, roda as migrations reais num Postgres embutido. Cobre lead antes da agenda, idempotência, conflito funil × ATIVO, EXCLUDE, reagendamento/cancelamento pelo Workspace, abandono, follow-up, consentimento e separação teste/produção.
- `npx tsx scripts/qa/funil-estaticos-harness.ts` serve a página real com API simulada, para teste em navegador e medição de performance.

## Limitações conhecidas
- **Cal.com × agenda nativa**: as reservas do Cal.com entram em `reunioes_agendamentos` via webhook e são consideradas. Entre o Cal.com e o banco, porém, não existe lock comum. A exclusividade depende de as janelas nativas não estarem abertas no Cal.com (confirmação na ativação) e de o canal ser desativado sozinho quando a disponibilidade muda. É a mesma regra do ATIVO.
- **Google Calendar/Meet**: não existe integração no Workspace, por decisão anterior: o Workspace é a única agenda. O funil não promete link de vídeo e não coleta e-mail por padrão.
- **WhatsApp/e-mail automáticos**: não são enviados (WABA descontinuada, Evolution só para visualização). A confirmação é feita pela equipe a partir da tarefa.
- **Concorrência real**: o PGlite usa uma conexão só. O lock e a constraint EXCLUDE são os mesmos do ATIVO, mas o teste de concorrência contra o Postgres real continua pendente (`scripts/qa/reunioes-nativas-db.mjs` em staging).
- **Cache da página**: a CDN guarda o HTML por até 60 s, então ativar ou desativar leva até 1 minuto para aparecer. A disponibilidade nunca é cacheada.
- **Retenção**: `retencao_dias` fica registrado, mas o expurgo automático ainda não foi implementado. Pedidos de exclusão da LGPD são atendidos apagando o `funil_leads` (cascata no histórico; as sessões perdem o vínculo).
