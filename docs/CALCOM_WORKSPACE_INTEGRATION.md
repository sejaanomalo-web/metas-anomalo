# Cal.com → Workspace (aba Reuniões)

> Implementado em 2026-10-21, branch `feat/calcom-workspace-reunioes`.
> Referência oficial consultada: API v2 do Cal.com (https://cal.com/docs/api-reference/v2) e o guia de webhooks.

## 1. Arquitetura

```
 Corretor (formulário Meta Ads) ──► página pública Cal.com ──► reserva
                                                                │
              webhook assinado (x-cal-signature-256)            ▼
 /api/reunioes/calcom/webhook ◄──────────────────────────── Cal.com
        │  grava evento cru (idempotência) → máquina de estados
        ▼
 reunioes_agendamentos (1 linha por booking UID) ──► ws_tarefas (tarefa NORMAL)
                                                       │ ws_realtime_ping
                                                       ▼
                                          Calendário do Workspace (atualiza sozinho)

 Workspace ──(PATCH /v2/schedules, /v2/event-types, /v2/me/ooo)──► Cal.com   [regras]
 Tarefas "bloqueia agenda" ──► /api/reunioes/agenda-bloqueios/<token>.ics ──► Cal.com lê como calendário de conflitos
 Cron diário /api/reunioes/reconciliar ──(GET /v2/bookings)──► corrige o que o webhook perdeu
```

- **Cal.com** é o motor de reserva pública: horários livres, conflito de agenda e link do Cal Video.
- **Workspace** continua sendo a única agenda de trabalho. Cada reserva vira **uma tarefa normal** em `ws_tarefas`, com `prazo_em`/`prazo_hora` no horário de Brasília. Ela aparece no Calendário, na Lista e em Minhas, e abre no mesmo painel de detalhe. Não existe calendário paralelo.
- **Google Calendar não é usado nem exigido.** A videochamada padrão é o **Cal Video**.

### Arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20261021_reunioes_calcom.sql` | Tabelas novas (aditiva; não altera `ws_tarefas`) |
| `lib/reunioes-nucleo.ts` | Puro: normalização do webhook, fuso, título, máquina de estados, disponibilidade → corpo da API, ICS |
| `lib/reunioes-processar.ts` | Executor do plano (cria/move/encerra a tarefa) sobre um `RepoReunioes` |
| `lib/reunioes-repo.ts` | `RepoReunioes` sobre o Supabase |
| `lib/reunioes-sync.ts` | Recebimento do webhook, reprocessamento, reconciliação |
| `lib/reunioes-assinatura.ts` | HMAC-SHA256 do webhook |
| `lib/calcom.ts` | Cliente da API v2 (só servidor) |
| `lib/reunioes-actions.ts` | Server Actions da aba (admin) e do bloqueio de tarefa |
| `lib/reunioes-cancelar.ts` | Cancelar pelo Workspace: confirma no Cal.com antes de mexer no Workspace; trata timeout, falha parcial e cliques simultâneos |
| `lib/reunioes-guarda.ts` | Impede excluir/arquivar tarefa que é reunião ativa sem cancelar a reserva |
| `lib/acesso-admin.ts` | Quem administra: papel REAL admin + Workspace visível na visão atual (visão simplificada esconde módulos, não tira o cargo) |
| `lib/reunioes.ts`, `lib/reunioes-tipos.ts` | Leituras e tipos de tela |
| `app/api/reunioes/calcom/webhook/route.ts` | Webhook |
| `app/api/reunioes/reconciliar/route.ts` | Cron diário (`vercel.json`, 10:30 UTC = 07:30 BRT) |
| `app/api/reunioes/agenda-bloqueios/[token]/route.ts` | Feed ICS de bloqueios |
| `app/dashboard/workspace/reunioes/page.tsx` + `components/workspace/reunioes/*` | Aba Reuniões |
| `lib/reunioes-*.test.ts` | Testes (`npm run test`) |

## 2. Tabelas

| Tabela | Para quê |
|---|---|
| `reunioes_integracoes` | Estado da conexão (conta, webhook registrado, feed ICS, último teste/erro). **Nenhuma credencial.** |
| `reunioes_tipos` | Tipo interno ↔ event type do Cal.com (único por event type), regras, responsável, link público |
| `reunioes_disponibilidades` | Regra semanal, períodos, exceções e bloqueios ↔ schedule do Cal.com |
| `reunioes_agendamentos` | 1 linha por booking UID: status, participante, horário, link, tarefa vinculada |
| `reunioes_webhook_eventos` | Corpo de cada webhook (único por sha256 do corpo): idempotência e reprocessamento |
| `reunioes_sync_log` | Histórico técnico |
| `ws_tarefa_bloqueios` | Tarefas marcadas como "Bloqueia agenda de reuniões" (tabela lateral; `ws_tarefas` não muda) |

Todas usam RLS ligada **sem policy**, no mesmo padrão do resto do app: só o servidor (service_role) acessa.

## 3. Eventos recebidos

Assinados no webhook registrado pelo botão **Conectar**: `BOOKING_CREATED`, `BOOKING_REQUESTED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`, `BOOKING_REJECTED`, `BOOKING_LOCATION_UPDATED`, `MEETING_ENDED`. `PING` (botão de teste do Cal.com) responde 200 sem efeito. Outros gatilhos são registrados como "ignorado".

> **Não existe `BOOKING_CONFIRMED` no Cal.com.** Quando um evento exige confirmação, a solicitação chega como `BOOKING_REQUESTED`. Quando o organizador aprova, chega `BOOKING_CREATED` com `status: ACCEPTED`. A integração trata exatamente isso, mas a confirmação ainda precisa ser validada com uma reserva real (§12).

## 4. Como a tarefa é criada

- **Título:** `HH:mm - Reunião com Nome`, com horário de Brasília (`America/Sao_Paulo`, 24 h) e nome vindo de `responses.name` / `attendees[0].name`, sanitizado.
  - Uma solicitação pendente leva o sufixo ` (a confirmar)`, para nunca parecer reunião confirmada.
- **Data:** `prazo_em` é o dia em Brasília. Uma reserva às 23:30 BRT (02:30 UTC do dia seguinte) cai no dia certo.
- **Responsável:** o do tipo de reunião. Se não houver, o usuário ativo cujo e-mail de login é **exatamente** o e-mail do organizador no Cal.com. Nunca é inferido pelo nome. Sem responsável, a tarefa é criada mesmo assim e fica marcada como pendente.
- **Projeto:** o "Projeto da tarefa" configurado no tipo (opcional).
- **Descrição** (markdown-lite, nunca HTML): Tipo, Participante, E-mail, Telefone, Início, Fim, Local, Link, Origem: Cal.com, Campanha, Status.
- **Realtime:** grava `ws_realtime_ping`, e o Calendário aberto atualiza sozinho. O responsável recebe notificação no sino.
- **Idempotência:**
  - o mesmo corpo de webhook repetido é descartado pelo sha256;
  - o mesmo booking UID nunca gera duas linhas (índice único);
  - a tarefa tem `source_gid = calcom:<uid>` (índice único), então duas entregas simultâneas não criam duas tarefas.
- **Tipo não associado:** a tarefa é criada mesmo assim, para não perder a reserva, e fica pendente em Histórico até o tipo ser associado.

## 5. Reagendamento

O Cal.com cria um **UID novo** e informa o antigo em `rescheduleUid` (webhook) ou `rescheduledFromUid`/`rescheduledToUid` (API). Tratamento:

- A **mesma tarefa** é movida para o novo dia e recebe o título novo (ex.: `14:00 - Reunião com João Silva`).
- O UID antigo fica `reagendada`, e o novo fica ativo apontando para a mesma tarefa. Nunca há duas reuniões ativas.
- Se o reagendamento chegar **antes** da criação original, o UID antigo recebe uma "lápide" e a criação atrasada é ignorada.
- Se a equipe escreveu algo na descrição, nada é apagado: só é acrescentada uma linha "Atualização Cal.com".

## 6. Cancelamento e recusa

Cancelar em qualquer um dos dois lados leva ao mesmo estado final.

**Pelo Cal.com** (organizador ou participante cancela a reserva): chega o webhook `BOOKING_CANCELLED`, e o Workspace encerra a tarefa ligada ao booking UID. Isso vale **mesmo que a tarefa esteja na lixeira**.

**Pelo Workspace** (botão **Cancelar reunião** no detalhe da tarefa e em Reuniões → Próximas reuniões):

1. Confirmação com participante, tipo, data, horário e um motivo opcional. O motivo vai para o participante; sem motivo, vai "Reunião cancelada pela equipe ANÔMALO.".
2. O servidor lê a reserva pelo **id interno** (o browser nunca informa o UID) e confere a permissão: o responsável pela reunião ou um admin do Workspace.
3. `POST /v2/bookings/{uid}/cancel` (versão 2026-02-25). O Cal.com libera o horário, remove o evento do calendário conectado (inclusive o Meet) e avisa o participante.
4. Só depois da confirmação o Workspace encerra a tarefa, registrando quem cancelou e a origem "workspace".
5. O webhook `BOOKING_CANCELLED` que chega em seguida encontra a reunião já cancelada e é ignorado, sem nova chamada ao Cal.com.

| Situação | O que acontece |
|---|---|
| Cal.com recusa e a reserva segue ativa | Erro na tela; nada muda em nenhum dos dois lados. |
| Resposta perdida (timeout) | Consulta `GET /v2/bookings/{uid}`. Se já está cancelada, conclui sem repetir o POST. |
| Cal.com fora do ar também na consulta | **"Cancelamento pendente de confirmação"**: a reunião **continua ativa** aqui até confirmar. |
| Cal.com cancelou, mas o banco falhou | A tela diz isso. **Sincronizar agora** conclui o encerramento. |
| Dois cliques ou duas pessoas ao mesmo tempo | Um único cancelamento; o outro vê "já estava cancelada". |

**Excluir ou arquivar** uma tarefa que é reunião **ativa** do Cal.com é recusado com orientação: excluir só aqui deixaria a reserva ativa no Cal.com. Tarefas comuns não mudam.

**O que NÃO é cancelamento de reserva:**
- Apagar o evento direto no Google Calendar: a reserva continua ativa no Cal.com.
- Excluir um tipo de evento: as reservas existentes continuam e não são canceladas em massa.
- Reagendar: gera um UID novo, e a mesma tarefa muda de horário.
- Recusar uma solicitação pendente (`BOOKING_REJECTED`): a tarefa fica `[Recusada]`.

Efeitos sobre a tarefa encerrada:
- A tarefa é **arquivada**: sai do Calendário e continua visível no Arquivo.
- O título passa a ser `[Cancelada] …` (ou `[Recusada] …`), e a descrição recebe Status e Motivo.
- O histórico fica em `reunioes_agendamentos` e na atividade da tarefa.
- O horário é liberado pelo próprio Cal.com (é lá que o cancelamento acontece).
- Estados terminais (cancelada, recusada, reagendada) são definitivos: **um webhook atrasado nunca reabre uma reunião cancelada**.
- `MEETING_ENDED` (Cal Video) marca a reunião como **realizada** e conclui a tarefa.

## 7. Configurar o Cal.com (resumo — passo a passo no relatório da entrega)

1. Conta Cal.com da agência, com o fuso **America/Sao_Paulo** (Settings → General).
2. Gere a API key em **Settings → Developer → API Keys** e coloque em `CALCOM_API_KEY` (Vercel).
3. Gere um segredo aleatório e coloque em `CALCOM_WEBHOOK_SECRET` (Vercel).
4. Gere outro valor aleatório (24+ caracteres) e coloque em `REUNIOES_ICS_TOKEN` (Vercel).
5. Faça o redeploy, aplique a migration e abra **Workspace → Reuniões → Integrações → Testar conexão**.
6. **Conectar** registra o webhook via API, sem passo manual no Cal.com.
7. Em **Tipos de reunião**, escolha o responsável e clique em **Criar evento no Cal.com** (ou associe um evento existente). O link público aparece no card, com botão de copiar.

## 8. Webhook manual (só se o botão Conectar falhar)

app.cal.com → **Settings → Developer → Webhooks → New**:

- Subscriber URL: `https://<domínio do app>/api/reunioes/calcom/webhook`
- Secret: o mesmo valor de `CALCOM_WEBHOOK_SECRET`
- Event triggers: Booking Created, Booking Requested, Booking Rescheduled, Booking Cancelled, Booking Rejected, Booking Location Updated, Meeting Ended
- Payload template: deixe vazio (o padrão)

## 9. Disponibilidade

Editada em **Reuniões → Disponibilidade** e publicada pelo botão **Salvar e publicar**:

| No Workspace | No Cal.com (API v2) |
|---|---|
| Regra semanal (várias janelas por dia) | `availability` do schedule (`PATCH /v2/schedules/{id}`, versão 2024-06-11) |
| Período (ex.: só em novembro) | um **override por dia** do período (o Cal.com não tem regra semanal com vigência) |
| Data específica (outro horário ou dia todo indisponível) | override da data; "indisponível" = `00:00–00:00` |
| Bloqueio temporário (dias inteiros) | **Out of Office** (`POST/DELETE /v2/me/ooo`) |
| Antecedência mínima, intervalo, limite diário, horizonte, duração, local | `PATCH /v2/event-types/{id}` (versão 2026-06-12): `minimumBookingNotice`, `afterEventBuffer`, `bookingLimitsCount.day`, `bookingWindow`, `lengthInMinutes`, `locations` |

O status "Publicado" só aparece quando a API confirma. Se algo falhar, a tela mostra **"Não publicado: <motivo>"** e o que foi salvo continua salvo no Workspace.

## 10. Conflitos de agenda e bloqueios manuais (sem Google Calendar)

- **Marketing × Sistema:** os dois event types pertencem à **mesma conta/usuário** do Cal.com. O Cal.com considera todas as reservas desse usuário ao calcular horários livres, então uma reserva das 10:00 ocupa as 10:00 nos dois links. Requisito: os dois eventos precisam ser do mesmo usuário, e não de um time round-robin com outras pessoas.
- **Tarefas manuais:** no detalhe da tarefa, marque **"Bloqueia agenda de reuniões"** e escolha a duração. Só tarefas com **data e horário** entram no feed. Tarefas comuns (editar vídeo, roteiro etc.) **não** bloqueiam.
- **Feed ICS:** o botão **Cadastrar feed no Cal.com** chama `POST /v2/calendars/ics-feed/save` com a URL secreta do feed. O Cal.com passa a ler o feed como calendário e trata cada evento dele como horário ocupado. Detalhes:
  - o feed mostra só "Ocupado", sem título nem cliente;
  - reuniões vindas do Cal.com nunca entram no feed, o que evita loop.
- **Atenção:** o Cal.com relê feeds ICS periodicamente (intervalo controlado por ele), então um bloqueio novo pode levar alguns minutos para valer.

## 11. Google Calendar e Meet

O Google Calendar não é a agenda de trabalho; essa agenda é o Workspace.

Os tipos de reunião podem usar **Google Meet** como local, desde que o app Google Meet esteja instalado no Cal.com. Funcionamento:
- O link do Meet chega no webhook e aparece na tarefa como "Entrar na reunião", só enquanto a reunião está ativa.
- **Cancelar sempre pela reserva** (Cal.com ou botão do Workspace). O Cal.com cuida do evento de calendário e da sala.
- Apagar o evento direto no Google Calendar **não** cancela a reserva.

## 12. Como testar uma reserva (validação real — pendente até haver credenciais)

1. Abra o link público do tipo **Sistema** e reserve uma quarta às 09:30 com nome "João Silva" (e-mail de teste seu).
2. Em segundos, o Calendário do Workspace mostra `09:30 - Reunião com João Silva` na quarta. No detalhe, aparece **Entrar na reunião**.
3. Abra o link do tipo **Marketing**: a quarta 09:30 **não** pode aparecer livre (teste I).
4. Reagende para sexta 14:00: a tarefa muda de dia e o título vira `14:00 - …`, sem duplicar.
5. Cancele pelo **Cal.com** (app.cal.com → Bookings → Cancel): em segundos a tarefa some do Calendário e aparece no Arquivo como `[Cancelada] …`. Em Reuniões → Histórico aparece "Cancelamento recebido do Cal.com".
5b. Faça outra reserva de teste e cancele pelo **Workspace** (detalhe da tarefa → **Cancelar reunião** → **Confirmar cancelamento**). Confira:
   - em app.cal.com → Bookings → Canceled, a reserva aparece cancelada;
   - na página pública, o mesmo dia e horário voltam a ficar livres (se nada mais bloquear);
   - o Histórico mostra "Reunião cancelada no Workspace e sincronizada com o Cal.com".
5c. Tente mandar para a lixeira uma tarefa de reunião ativa: deve aparecer a orientação para usar "Cancelar reunião".
6. Mude uma janela em Disponibilidade e publique. No Cal.com, confira em **Availability** (teste J). Confira também se o override "dia indisponível" (`00:00–00:00`) aparece como indisponível.
7. Marque uma tarefa manual com horário como "Bloqueia agenda" e confira, após a releitura do feed, que o horário sumiu da página pública.

## 13. Identificar erros

- **Reuniões → Histórico:**
  - pendências (reuniões sem tipo/responsável e eventos com erro);
  - eventos recebidos;
  - log técnico.
- **Tentar de novo** reprocessa eventos com erro a partir do corpo guardado.
- **Conferir com o Cal.com** compara com `GET /v2/bookings` e corrige o que faltou.
- O cron diário faz a mesma conferência e, se houver falha, avisa o admin no sino.
- O cabeçalho da aba mostra "N itens aguardando sincronização".

## 14. Desconectar

**Integrações → Desconectar** (exige digitar `DESCONECTAR`):

- apaga o webhook no Cal.com;
- para a importação;
- preserva reuniões, tarefas e histórico;
- **não cancela nenhuma reserva**.

Para encerrar de vez:
1. Revogue a API key em app.cal.com → Settings → Developer → API Keys.
2. Remova `CALCOM_API_KEY` na Vercel.
3. Opcional: remova o feed ICS em app.cal.com → Settings → Calendars.

**Pausar sincronização** é a versão leve: o webhook é desativado e os eventos que chegarem são ignorados, sem apagar nada.

## 15. Restaurar

Configure as variáveis de novo (se tiverem sido removidas), faça o redeploy e clique em **Conectar**. Depois, **Conferir com o Cal.com** importa o que entrou enquanto estava desconectado: reservas de até 7 dias atrás em diante.

## 16. Limitações conhecidas

- **Validação com o Cal.com real ainda não foi feita.** Faltam as credenciais. A lógica foi coberta por testes automatizados com mocks (§12 lista o roteiro real).
- **Limite diário é por tipo de reunião.** O limite global por usuário (`/v2/me/booking-limits`) só existe para contas de **organização**; contas comuns recebem 403. Por isso ele não é usado.
- **Não-comparecimento** (`AFTER_*_NO_SHOW`) não é tratado.
- **"Realizada"** só chega automaticamente com Cal Video (`MEETING_ENDED`).
- **Reagendamento feito pelo Cal.com** gera UID novo. Tratado, mas validar no teste real.
- **Retentativa de webhook:** a documentação do Cal.com não garante quantas vezes ele reentrega. Por isso existem o cron diário e o botão de reconciliação.
- **Dados pessoais:** `reunioes_webhook_eventos.payload` guarda o corpo do webhook (nome, e-mail, telefone) para permitir o reprocessamento. Sugestão de retenção, para rodar periodicamente no SQL Editor:
  `delete from reunioes_webhook_eventos where status in ('processado','ignorado') and recebido_em < now() - interval '90 days';`
- **Desligar o "Ativo"** de um tipo oculta o evento no Cal.com (`hidden`). As reservas já feitas continuam valendo.

## 17. Recursos que podem depender do plano Cal.com

Confira com **Testar conexão**: cada item mostra OK ou o erro exato da API (403 = sem permissão/plano).

- API key e webhooks de usuário: disponíveis em contas individuais, segundo a documentação.
- Schedules, event types, Out of Office e feed ICS: endpoints de usuário. A disponibilidade no plano gratuito ainda precisa ser confirmada no teste real.
- Limite global de reservas por usuário: só organizações (não usado).
- `confirmationPolicy` (exigir confirmação): configure direto no evento do Cal.com, se quiser. A integração já trata solicitações pendentes.
