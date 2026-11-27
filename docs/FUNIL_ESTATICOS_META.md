# Funil Estáticos Meta

Funil público de qualificação + agendamento para a campanha de corretores de Cascavel–PR. É a **3ª origem comercial** das Reuniões, ao lado do **Cal.com** e do **canal nativo ATIVO**.

- Página pública: `/funil/<slug>`. O slug inicial é `estaticos-meta`. Com o domínio atual, a URL prevista é `https://metas-anomalo.vercel.app/funil/estaticos-meta` (só funciona depois das migrations, do deploy e da ativação).
- Painel: **Workspace → Reuniões → Integrações → Funil Estáticos Meta → Abrir funil** (`/dashboard/workspace/funis/estaticos-meta`). Só admins do Workspace acessam.

## Sequência do funil (fase 2)

| Etapa | Tela | Observação |
|---|---|---|
| 00 | Apresentação comercial | Configurável e desligável. Desligada, o funil abre direto na 1ª pergunta (comportamento da v1). |
| 01–03 | Perguntas (uma por tela) | Mesmas 3 perguntas e alternativas da v1. Avanço automático, Voltar, "Pergunta x de 3". |
| 04 | Identificação | "Vamos conhecer você." Nome + WhatsApp. O lead é salvo **antes** da agenda. |
| 05 | Agendamento | Horários reais da agenda nativa do Workspace, carregados sob demanda. |
| 06 | Confirmação | Data, horário, duração, fuso, tipo e o próximo passo real (equipe confirma pelo WhatsApp). |

Tudo acontece na mesma URL, sem recarregar a página nem redirecionar. Os parâmetros de atribuição (UTMs, IDs da Meta, `creative_id`) são lidos no carregamento e ficam na sessão.

## Identidade visual

- Padrão novo: **branca**. Fundo `#FFFFFF`, texto `#141414`, secundários em cinza neutro, bordas cinza-claro.
- Botão principal, barra de progresso e seleção usam o amarelo oficial do projeto, **`#C9953A`** (token `--accent` do `globals.css`), com texto preto (contraste ≈ 7:1). A seleção usa um amarelo suave `#FBF3E4` com borda `#C9953A`.
- **Logo**: o projeto só tem a versão oficial branca. Na identidade branca ela vai sobre o quadrado preto oficial, a mesma arte de `logo-capa-app.png` / ícone do app (`public/funil/logo-anomalo-escuro-96.png`, apenas redimensionada). Não foi redesenhada.
- Fontes do sistema (sem Google Fonts). Tamanhos em `rem`/`clamp`: headline 30–36 px, perguntas 26–30 px, texto 17 px, auxiliares 13–14 px e botões 16 px em maiúsculas com "→".
- O CTA da apresentação, o "Continuar" e o "Confirmar agendamento" ficam num **rodapé fixo** (`position: sticky`), com altura mínima de 56 px, largura total, margens de 22 px e área segura (`env(safe-area-inset-*)`). A altura usa `100vh` com fallback para `100svh`.
  - Na identificação o rodapé some e o botão fica dentro do formulário, para o teclado aberto não cobrir nenhum campo.
  - Em telas baixas (≤ 640 px de altura) o rodapé passa a seguir o fluxo da página, com rolagem natural, para não esconder conteúdo.
- A identidade **escura** (v1) continua disponível como opção no editor.

## Arquitetura e decisões

| Peça | Onde | Por quê |
|---|---|---|
| Página pública | `app/funil/[slug]/route.ts` + `lib/funil-estaticos-pagina.ts` (puro) + `lib/funil-estaticos-cliente.ts` + `lib/funil-estaticos-seguranca.ts` (CSP) | Route Handler que devolve o HTML pronto (~40 KB, ~13 KB comprimido) já com a 1ª tela renderizada. CSS e JS inline, sem React, sem `globals.css`, sem fontes externas, CSP com hash do script. O renderizador é puro e por isso a **prévia do painel usa exatamente o mesmo HTML**. |
| API pública | `app/api/public/funil/route.ts` (POST `acao`: `sessao`, `eventos`, `contato`, `agenda`, `reservar`, `despachar`) | Cada ação só enxerga a própria sessão (id + segredo de 256 bits; o banco guarda só o hash). Rate limit distribuído, honeypot, limite de 8 KB, checagem de Origin, `no-store`. Cada sessão é interpretada pela **versão em que começou**. |
| Serviço | `lib/funil-estaticos.ts` | Sessão, eventos, lead, CRM, agenda, reserva (real ou simulada no teste) e fila da CAPI. |
| Regras puras | `lib/funil-estaticos-nucleo.ts` | Validações, atribuição, definição do formulário (inclui a apresentação), pontuação e métricas. |
| Agenda | `lib/reunioes-nativas.ts` (`configurarCanal("estaticos_meta")`) | **A mesma** disponibilidade do Workspace. Não existe agenda paralela. |
| Reserva | RPC `funil_reservar` | Mesma `pg_advisory_xact_lock` por responsável e mesma `EXCLUDE reunioes_nativas_sem_sobreposicao` do ATIVO. A fase 2 adiciona uma trava por lead (ver Concorrência). |
| Admin | `app/dashboard/workspace/funis/[slug]/page.tsx`, `components/workspace/funil/*`, `lib/funil-estaticos-actions.ts`, `lib/funil-estaticos-admin.ts` | Abas: Visão geral, Leads, Formulário, Agendamento, Tracking, Relatórios e Configurações. |
| Rotina | `app/api/funil/processar` (cron diário da Vercel) + pg_cron `funil_inatividade_10min` | Abandono e follow-up rodam no banco a cada 10 min. Fila da CAPI e espelho no CRM rodam no endpoint. |

### O que foi alterado em infraestrutura existente (mínimo)
- `reunioes_canais_nativos`: a chave aceita `estaticos_meta`. Caiu o UNIQUE em `tipo_id`.
- `reunioes_agendamentos.canal_nativo` (nova, nula nas reservas antigas, que contam como `ativo`).
- `reunioes_nativas_gerir`: o reagendamento procura o canal da própria reserva.
- `lib/reunioes-nativas.ts`: `configurarCanal(chave)`. `configurarNativo()` continua exigindo `ATIVO_NATIVE_BOOKING_ENABLED` para o ATIVO.
- `reunioes_nativas_reservar` (ATIVO) **não foi tocada**.

## Painel administrativo

- **Editar a tela inicial**: aba **Formulário** → cartão **"Tela inicial de apresentação"**. É o mesmo editor e o mesmo versionamento das perguntas.
  - Liga/desliga a apresentação.
  - Edita o texto de identificação, a headline, o texto complementar, o CTA e o rodapé.
  - Benefícios: adicionar (até 6), remover, reordenar e trocar o emoji; o destaque aparece em negrito.
  - "Restaurar textos padrão".
- **Identidade visual**: no mesmo cartão da versão, "Identidade visual da página" (branca ou escura).
- **Textos novos**: "Texto da identificação" e "Botão de confirmar horário".
- **Prévia mobile (390 px) e desktop (1100 px)**: é a página real rodando num iframe isolado, sem rede, sem armazenamento e sem Pixel. A agenda mostra horários de **exemplo** e a confirmação avisa que nada foi reservado.
- **Publicar**: o rascunho vira a versão publicada. A anterior fica arquivada e continua interpretando as sessões que começaram nela. Quem está no meio do formulário termina na versão em que começou, porque a página envia `versaoId` e a API fixa a sessão nela.
- **Ver os dados da Etapa 00**: aba **Visão geral** → cartão **"Tela inicial (Etapa 00)"** e as etapas "Apresentação vista" e "Clique no botão inicial" na jornada. Em **Tracking → Sessões recentes**, a coluna "Entrada" e a situação ("viu a apresentação", "clicou no botão inicial"...).

## Tracking

### Eventos internos (`funil_eventos`, sem PII)
`funnel_page_view` (servidor, ao abrir a sessão, com versão, entrada e visual), `welcome_viewed`, `welcome_cta_clicked`, `funnel_started`, `question_viewed/answered/completed/back`, `contact_form_viewed`, `contact_submitted`, `lead_created`, `booking_page_viewed`, `booking_no_slots`, `booking_slot_selected`, `booking_failed`, `booking_simulated` (só teste), `booking_confirmed`, `funnel_abandoned` e `meeting_cancelled/rescheduled/attended`.

Na sessão (`funil_sessoes`, migration 20261128):
- `variante_entrada` (`apresentacao` | `direto`) e `versao_visual` (`claro` | `escuro`), além de `versao_id`.
- `apresentacao_vista_em` e `cta_inicial_em`: gravados **uma única vez**, por isso voltar ou recarregar não duplica.
- `funnel_started` = **1ª resposta** (entrada efetiva nas perguntas). Ver a apresentação ou clicar no CTA **não** inicia o funil, **não** é lead e **não** dispara evento da Meta.

### Métricas da Etapa 00
- **Taxa de clique** = sessões que clicaram no CTA / sessões que viram a apresentação.
- **Taxa de início** = sessões que responderam a 1ª pergunta / sessões que viram a apresentação.
- **Abandono inicial** = sessões que viram a apresentação e foram marcadas como abandonadas sem iniciar / sessões **elegíveis**. Elegíveis são as que iniciaram ou já foram marcadas como abandonadas; sessões ainda ativas ficam fora do denominador.
- A tabela "Entrada" compara "Com apresentação" e "Direto na 1ª pergunta". Não há sorteio A/B: as duas entradas não rodam ao mesmo tempo, então a comparação é entre períodos/versões. A coluna `variante_entrada` deixa a base pronta para um teste A/B futuro.

### Eventos Meta (inalterados)
- `PageView`: só Pixel, depois do load e, no modo opt-in, só depois do aceite.
- `Lead`: depois que o lead foi persistido.
- `Schedule`: depois que a reserva foi gravada, no máximo uma vez por reserva no navegador.
- Abrir a página, ver a apresentação, clicar no CTA, ver a agenda ou escolher horário **não** geram `Lead` nem `Schedule`.
- **Deduplicação**: Pixel e CAPI usam o mesmo `event_name` e o mesmo `event_id` (`lead.<lead_id>` / `schedule.<agendamento_id>`), com `UNIQUE(event_id)` na fila.
- **CAPI**: hash SHA-256 em `ph`, `fn`, `ln`, `em`, `external_id` e `country`; IP, UA, `fbp` e `fbc` vão sem hash; `fbc` só nasce de um `fbclid` real. Retry com backoff (1 min → 6 h, 8 tentativas) e trava otimista.

### Consentimento e privacidade
- O aviso de cookies fica **no rodapé**, já no HTML do servidor (sem pop-up e sem deslocar o layout), com **Recusar** e **Aceitar** do mesmo tamanho de toque. Recusar não bloqueia nada: perguntas, contato e agenda funcionam igual.
- No modo opt-in (padrão), Pixel **e CAPI** só rodam com aceite, inclusive o envio servidor a servidor (a RPC marca `ignorado – sem consentimento de marketing` e apaga IP/UA).
- Os eventos internos não são enviados à Meta e não substituem o consentimento.
- Separação:
  - dados **necessários ao formulário** (sessão técnica);
  - **analytics internos** (`funil_eventos`, sem PII);
  - **rastreamento publicitário** (Pixel/CAPI, só com aceite);
  - **contato comercial solicitado** (nome/WhatsApp, usados só para este atendimento);
  - **comunicações promocionais**: não são coletadas nem enviadas.
- A ativação em produção continua bloqueada sem política de privacidade (`CHECK funil_ativo_exige_privacidade`).

## Modo de teste

| Tipo | Como abre | O que faz |
|---|---|---|
| **Prévia visual** | Aba Formulário (iframe) | Sem rede, sem banco, sem Pixel. Horários de exemplo. |
| **Teste funcional interno** | Botão "Versão de teste" (link assinado, 7 dias) | Sessão `ambiente='teste'`. Grava sessão/lead/eventos como TESTE. **Reserva simulada**: confere o horário na agenda real, mas não cria reunião, tarefa nem bloqueio. **Não** notifica a equipe, **não** gera follow-up e **não** espelha no CRM. **Nenhum** envio à Meta (nem Pixel, nem CAPI). Fica fora dos relatórios (só aparece com "Incluir testes"). |
| **Teste de integração (CAPI)** | Aba Tracking → "Abrir link de diagnóstico da CAPI" | Igual ao funcional, mas `Lead` e `Schedule` vão à Meta **somente com o `test_event_code`** e aparecem em Gerenciador de Eventos → **Eventos de teste**. Só é gerado se houver Pixel, CAPI ligada, código de teste e token no servidor. O Pixel do navegador continua desligado (o navegador não tem como marcar evento de teste). O `Schedule` de teste usa `event_id` próprio (`schedule.teste.<sessão>`). |
| **Conversão real** | URL pública sem `previa` | Produção. |

A fase 1 sugeria validar eventos usando a versão de teste, mas na época ela também enviava CAPI quando havia código de teste. Agora isso só acontece pelo **link de diagnóstico**, explícito e separado.

A confirmação da deduplicação Pixel × CAPI (mesmo `event_id` dos dois lados) só pode ser vista em produção, no primeiro lead real: Gerenciador de Eventos → evento `Lead` → "Desduplicação".

## Concorrência e Cal.com

**Entre os canais nativos (ATIVO + funil)** a proteção é real e foi testada em PostgreSQL 17 com várias conexões simultâneas (`scripts/qa/funil-estaticos-concorrencia-pg.mjs`):
- trava consultiva por responsável nas duas RPCs;
- `EXCLUDE` de sobreposição como última linha de defesa;
- chave de idempotência por tentativa;
- desde a 20261128, trava por **lead** no funil.

Esse teste encontrou um bug real da fase 1: a mesma pessoa, em pedidos simultâneos para **horários diferentes**, conseguia criar mais de uma reunião, porque a checagem de "já tem reunião futura" vinha antes da trava. A 20261128 corrige isso.

**Cal.com (CALL) × agenda nativa — conclusão da investigação: B + C.**
- **A — proteção real comum: não existe.** O Cal.com não participa da trava nem da constraint (a `EXCLUDE` só vale para `provedor='nativo'`).
- **B — existe sincronização posterior, nos dois sentidos:**
  - Cal.com → Workspace: o webhook grava a reserva em `reunioes_agendamentos`, e a agenda/RPC nativas passam a desconsiderar o horário. Até o webhook chegar, há uma janela em que os dois podem vender o mesmo horário.
  - Workspace → Cal.com: o feed ICS (`/api/reunioes/agenda-bloqueios/<token>`) inclui as reservas nativas, mas o Cal.com só relê o feed periodicamente, e só se o feed estiver conectado.
- **C — requisito operacional para ativar com segurança:** as janelas da agenda nativa **não podem** estar abertas no Cal.com para o mesmo responsável. Ou se usa um responsável exclusivo, ou horários que não se sobrepõem. A aba Agendamento exige essa confirmação, e qualquer mudança na agenda/tipo desativa o canal até nova confirmação (mesma regra do ATIVO).
- **Não existe proteção global contra conflitos com o Cal.com.**

## Criativos

A campanha tem 12 criativos estáticos, semeados pela 20261128 **sem ID de anúncio** (a equipe associa no painel, em Tracking → Criativos). O cadastro não tem limite: o próximo código sugerido é E13.

| Código | Conceito |
|---|---|
| E01 | Enquanto você poderia estar vendendo |
| E02 | Seu próximo comprador precisa te encontrar |
| E03 | A primeira visita acontece na tela do celular |
| E04 | Dois lados da operação imobiliária |
| E05 | Você não precisa de mais um CRM |
| E06 | Procura-se corretor de imóveis |
| E07 | Resultados de quem já investe |
| E08 | Marketing especializado para corretores |
| E09 | Olha o que um corretor nos mandou |
| E10 | Sem depender apenas de indicações |
| E11 | Corretor cansado de prospectar |
| E12 | Marketing imobiliário de alto padrão |

Todos usam a mesma URL pública. Parâmetros de URL do anúncio:
```
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}
```
Opcionalmente acrescente `&creative_id=E01` … `E12`. A atribuição usa primeiro o `ad_id` cadastrado e depois o código. Uma macro sem substituição (`{{...}}`) é descartada. Os IDs são guardados como string.

## Métricas
A coorte é formada pelas sessões abertas no período. Cada taxa mostra o denominador, e sem denominador aparece "Sem dados". Por padrão só entram sessões de **produção**; o botão "Incluir testes" soma as de teste, que aparecem marcadas. O investimento soma lançamentos manuais e `dados_diarios_ad` da Sentinela, quando o `ad_id` está cadastrado.

## Banco
- `20261127_funil_estaticos_meta.sql` (fase 1): tabelas, RPCs, trigger, pg_cron. **Não foi alterada na fase 2.**
- `20261128_funil_apresentacao_teste.sql` (fase 2, incremental e não destrutiva):
  - colunas novas em `funil_sessoes`, com CHECKs: o diagnóstico e a reserva simulada só existem em sessão de teste;
  - versão 2 do formulário (v1 + apresentação + identidade branca), publicada **só se a v1 semeada ainda for a única versão**, com a v1 arquivada;
  - criativos E01–E12;
  - `CREATE OR REPLACE` de três funções da 20261127 (diferenças comentadas no arquivo): `funil_reservar` (trava por lead), `funil_capturar_lead` (teste não notifica) e `funil_processar_inatividade` (teste não gera follow-up).
  - É idempotente: reaplicar não cria v3 nem duplica criativos.

## Variáveis de ambiente (servidor)
| Variável | Obrigatória | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | já existem | banco |
| `CRON_SECRET` | já existe | `/api/funil/processar` |
| `FUNIL_ESTATICOS_META_CAPI_TOKEN` | para CAPI | token do conjunto de dados da ANÔMALO |
| `FUNIL_HASH_SECRET` | opcional | assina links de teste e hashes de IP; se faltar, deriva da service role |
| `META_GRAPH_VERSION` | opcional | padrão `v26.0` |
| `APP_PUBLIC_URL` | opcional | URL exibida no painel |
| `ATIVO_NATIVE_BOOKING_ENABLED`, `ATIVO_WORKSPACE_API_SECRET` | só para o ATIVO | não afetam o funil |

## Organização dos commits (locais, sem push)
1. `a627ffb` **feat(ativo): consolida infraestrutura de agendamento nativo**: base do ATIVO (migrations 20261125/20261126, `lib/reunioes-nativas.ts` original, API `/api/public/ativo`, telas de Reuniões, testes).
2. `091fe17` **feat(funil): implementa Funil Estáticos Meta integrado ao Workspace**: fase 1 exatamente como entregue antes desta fase (migration 20261127, página, API, painel, fila CAPI, cron).
3. **feat(funil): aprimora experiência pública e validações**: esta fase (20261128, identidade branca, Etapa 00, editor, modo de teste, trava por lead, testes novos).

Cada estado foi exportado do índice e validado sozinho: tsc + `npm test`, e PGlite onde se aplica. Outros trabalhos que estão no working tree (revisão de fluidez, remoção de migrations antigas do CRM) **não** entraram nesses commits.

## Plano seguro de publicação (só quando autorizado)
1. **Conferir o estado real da produção** (somente leitura, no SQL Editor):
   ```sql
   select to_regclass('public.reunioes_canais_nativos') as m25,
          (select count(*) from information_schema.columns where table_name='reunioes_tipos' and column_name='intervalo_minutos') as m26,
          to_regclass('public.funil_config') as m27,
          (select count(*) from information_schema.columns where table_name='funil_sessoes' and column_name='variante_entrada') as m28;
   ```
2. Aplicar **na ordem**, só as que faltarem: `20261125` → `20261126` → `20261127` → `20261128`. Se houver staging, aplicar lá primeiro. Todas são aditivas, mas precisam estar no banco **antes** do deploy: o código novo lê as colunas novas, e em 20/11 a produção quebrou justamente por migration depois do deploy.
3. Conferir: `select numero, status from funil_versoes order by numero;` (v2 publicada), `select count(*) from funil_criativos;` (12) e `select jobname from cron.job where jobname='funil_inatividade_10min';`.
4. Vercel → Environment Variables (Production): `FUNIL_ESTATICOS_META_CAPI_TOKEN` (e, se quiser, `FUNIL_HASH_SECRET`).
5. Push da branch e deploy, só com autorização.
6. Painel:
   - **Agendamento**: tipo "Diagnóstico" + agenda nativa, mesmo responsável, janelas **fora** de qualquer conta Cal.com; confirmar e ativar.
   - **Configurações**: política de privacidade, Pixel, CAPI e código de teste.
   - **Tracking**: ID real de cada anúncio em E01–E12.
7. Testes em produção, nesta ordem:
   - "Versão de teste" (fluxo completo, nada real é criado);
   - "Link de diagnóstico da CAPI" (conferir `Lead`/`Schedule` em Eventos de teste);
   - opcionalmente, **um** agendamento real feito pela equipe, cancelado em seguida pelo Workspace, para validar tarefa e notificação.
8. Ativar o funil em Configurações e usar a URL nos anúncios.

### Rollback
- **Desligar o funil**: desativar em Configurações; a URL passa a mostrar a mensagem de indisponível. Desativar a agenda mantém os leads salvos, sem horários.
- **Reverter o código**: basta um redeploy anterior, porque as tabelas e colunas novas não são lidas pelo código antigo.
- **Reverter a 20261128**: funções e versões continuam compatíveis com o código da fase 1. Para desfazer só a trava por lead, reaplicar o bloco `funil_reservar` da 20261127.

## Testes
| Teste | Comando | Resultado nesta fase |
|---|---|---|
| Unitários | `npm test` (inclui `lib/funil-estaticos.test.ts`) | 215/215 |
| Banco (PGlite, 1 conexão) | `node scripts/qa/funil-estaticos-pglite.mjs` (precisa de `@electric-sql/pglite`) | 54/54 |
| Concorrência (PostgreSQL 17 real, várias conexões) | `scripts/qa/funil-estaticos-concorrencia-pg.mjs` (precisa de `embedded-postgres` e `pg` numa pasta descartável) | 17/17 |
| Regressão ATIVO | `scripts/qa/reunioes-nativas-grade-pglite.mjs` | 15/15 |
| Navegador — página | harness `scripts/qa/funil-estaticos-harness.ts` + `scripts/qa/funil-estaticos-e2e.mjs` | 56/56 |
| Navegador — editor do painel | `scripts/qa/funil-estaticos-admin-harness.mjs` + `scripts/qa/funil-estaticos-admin-e2e.mjs` | 24/24 |
| Performance (laboratório) | `scripts/qa/funil-estaticos-perf.mjs` + Lighthouse 12 | ver relatório da fase 2 |

Os harnesses usam o HTML/JS/CSP reais com **API simulada**. Nada disso toca o Supabase nem a Meta.

## Limitações conhecidas
- **Cal.com**: sem proteção comum (ver Concorrência). Exige janelas separadas.
- **Painel com banco real**: o editor foi testado com os componentes reais e ações simuladas. Permissões, consultas e gravação do painel contra um Postgres/PostgREST local não foram executadas (o download do binário do PostgREST foi bloqueado pela política de permissões desta sessão).
- **Aparelhos reais**: Safari/iOS e Chrome/Android físicos e os navegadores internos do Instagram/Facebook não foram testados (só emulação no Chrome).
- **Google Calendar/Meet**: não existe. O funil não promete link de vídeo, e-mail ou mensagem automática.
- **WhatsApp/e-mail automáticos**: não são enviados. A confirmação é feita pela equipe a partir da tarefa.
- **Cache da página**: até 60 s na CDN. Ativar/desativar ou publicar leva até 1 minuto. Sessões já abertas continuam na versão em que começaram.
- **Retenção**: `retencao_dias` é registrado, mas o expurgo automático não foi implementado.
- **Domínio**: só `metas-anomalo.vercel.app`. Um domínio próprio é recomendado para os anúncios.
