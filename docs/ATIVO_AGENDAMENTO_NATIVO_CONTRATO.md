# ATIVO → agendamento nativo do ANÔMALO Workspace

Contrato para o backend da LP ATIVO. Estado nesta branch: integrado ao `main` com suporte às duas contas Cal.com, testado localmente e **não ativado em produção**. Nenhuma credencial deve ir ao navegador.

## Arquitetura e URL

`Browser → API server-side da LP → HTTPS → API do ANÔMALO → RPC PostgreSQL → tarefa/Calendário/notificação`.

No servidor da LP, configure `ANOMALO_WORKSPACE_API_BASE_URL=https://<dominio-do-workspace>` e `ANOMALO_WORKSPACE_API_SECRET=<segredo>`. No ANÔMALO, configure o mesmo segredo como `ATIVO_WORKSPACE_API_SECRET` (mínimo 32 caracteres aleatórios), sem prefixo `NEXT_PUBLIC_`. `ATIVO_NATIVE_BOOKING_ENABLED=true` libera o canal **somente** quando o banco também marcar o canal ativo e a exclusividade das janelas tiver sido verificada. Por padrão a API falha fechada (503).

O backend ANÔMALO também precisa das variáveis já existentes `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. A service role permanece exclusivamente no servidor.

Enviar `Authorization: Bearer <segredo>` em ambas as chamadas. O servidor da LP deve passar `X-Ativo-Visitor-IP` com o IP do visitante obtido na requisição, para rate limit distribuído por visitante. Não expor esse cabeçalho ao browser; a chave nunca sai do servidor. Rate limit no banco: 30 requisições/hora por visitante e 5 tentativas de reserva/hora por WhatsApp. Respeitar HTTPS em produção. Todas as respostas usam `Cache-Control: no-store`.

## Disponibilidade

`GET /api/public/ativo/agenda?from=YYYY-MM-DD&days=14`

`from` é uma data civil em Brasília. `days` aceita 1–14. O servidor recorta ao horizonte real configurado no tipo de reunião. A resposta 200 não contém dados de outras reservas:

```json
{
  "timezone": "America/Sao_Paulo",
  "durationMinutes": 60,
  "days": [
    { "date": "2026-12-01", "slots": [
      { "start": "2026-12-01T12:00:00.000Z", "end": "2026-12-01T13:00:00.000Z", "label": "09:00" }
    ] }
  ]
}
```

O exemplo de horário é ilustrativo. A LP deve exibir `label` e enviar `start` sem recalcular fuso. Slots podem desaparecer entre a consulta e a reserva.

## Criar reserva

`POST /api/public/ativo/book` com `Content-Type: application/json` e corpo até 4 KiB:

```json
{
  "name": "João da Silva",
  "whatsapp": "+5545999999999",
  "start": "2026-12-01T12:00:00.000Z",
  "idempotencyKey": "b993e704-151a-4496-b2ee-0b00bc13acb4",
  "attribution": {
    "utm_source": "facebook",
    "utm_medium": "paid_social",
    "utm_campaign": "campanha",
    "utm_content": "criativo"
  }
}
```

`name`: 2–120 caracteres, letras Unicode, espaços, ponto, hífen e apóstrofo; HTML/controle recusados. `whatsapp`: telefone brasileiro válido, normalizado para E.164. `start`: instante UTC ISO 8601 com `Z`. `idempotencyKey`: UUID gerado pelo backend da LP **uma vez por tentativa** e reutilizado em retentativas da mesma submissão. `attribution`: opcional; somente as quatro UTMs acima, até 120 caracteres por valor. E-mail não é aceito nem exigido. Nenhum campo interno de tipo, responsável ou agenda pode ser enviado.

Sucesso `201` (inclusive reenvio idêntico):

```json
{
  "status": "reserved_pending_whatsapp",
  "bookingId": "7da754e2-d33b-4d0f-9f7c-b651a3d0dcd3",
  "startsAt": "2026-12-01T12:00:00+00:00",
  "endsAt": "2026-12-01T13:00:00+00:00",
  "timezone": "America/Sao_Paulo"
}
```

O horário está bloqueado imediatamente. `reserved_pending_whatsapp` significa **reserva criada**, aguardando o comercial confirmar detalhes pelo WhatsApp. Não há link de videochamada nem mensagem automática ao visitante. O `bookingId` é opaco; não exibir informações internas no browser além dos dados da própria reserva.

Erros `{ "code": "...", "message": "..." }`:

| HTTP | code | Ação da LP |
|---|---|---|
| 400 | `INVALID_INPUT` | Corrigir dados; não enviar conversão. |
| 401 | `UNAUTHORIZED` | Erro de configuração server-side; não repetir no browser. |
| 403 | `HTTPS_REQUIRED` | Corrigir URL base. |
| 409 | `SLOT_UNAVAILABLE` | Atualizar agenda e pedir outro horário. |
| 409 | `IDEMPOTENCY_MISMATCH` | Gerar nova chave só para uma tentativa com dados diferentes. |
| 413 | `INVALID_INPUT` | Reduzir payload. |
| 429 | `RATE_LIMITED` | Aguardar; não tentar em loop. |
| 503 | `CONFIG_UNAVAILABLE` | Canal ainda não ativado/validado. |
| 503 | `TEMPORARY_FAILURE` | Retentar com a **mesma** chave, com backoff. |

Nunca mostrar stack trace, erro SQL ou segredo. Falha 503 não confirma reserva; para resultado incerto (timeout), retentar com mesma chave. O banco garante uma reserva/tarefa por chave e rejeita a mesma chave com dados diferentes. Reserva e tarefa são uma transação; o sucesso só é retornado após ambas serem gravadas.

## Exemplo de chamada server-side

```ts
const resposta = await fetch(`${process.env.ANOMALO_WORKSPACE_API_BASE_URL}/api/public/ativo/book`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.ANOMALO_WORKSPACE_API_SECRET}`,
    "Content-Type": "application/json",
    "X-Ativo-Visitor-IP": visitorIp,
  },
  body: JSON.stringify({ name, whatsapp, start, idempotencyKey, attribution }),
  cache: "no-store",
})
const resultado = await resposta.json()
```

Para a agenda, usar os mesmos cabeçalhos com `GET`.

## Meta Ads

O evento de intenção `ScheduleClick` da LP permanece. O **backend da LP** será o único produtor de `Schedule`, após obter `201` com `bookingId`. Usar `bookingId` como `event_id` estável e registrar no backend da LP o envio por `bookingId` antes de retentar; não criar outro produtor independente no ANÔMALO. Se Pixel e Conversions API forem usados juntos, ambos devem compartilhar o mesmo `event_id`; preferir um único produtor server-side. Clique, seleção, 4xx, 5xx e timeout não geram `Schedule`. Não colocar telefone, nome ou UTMs sensíveis em query strings ou logs.

## Preparação do Workspace e deploy

1. Usar esta branch, baseada no `main` que já suporta as contas `principal` (Anômalo Hub) e `ativo`. A Anômalo Hub continua com seu agendamento Cal.com; a LP ATIVO adotará o canal nativo. Reservas históricas da conta ATIVO continuam vinculadas ao provedor e seguem usando seu cancelamento oficial.
2. A migration inicial `supabase/migrations/20261125_reunioes_nativas.sql` já foi informada como aplicada; sua tabela foi confirmada por leitura no Supabase. Aplicar também **`supabase/migrations/20261126_reunioes_nativas_integridade.sql`** antes de ativar. Ela atualiza funções, adiciona a fila de recuperação de notificações e protege a tarefa contra alterações de horário fora da ação de reagendamento. A API exige a versão 2 da RPC, falhando fechada enquanto essa atualização estiver pendente. Instalações novas devem aplicar as duas em ordem, após as migrations de Reuniões/Workspace.
3. Em **Workspace → Reuniões → Tipos de reunião**, configurar o tipo `sistema_imobiliario` com responsável e regras reais. Não usar valores de prints como configuração de produção.
4. Criar `Agenda ATIVO nativa`; em **Disponibilidade**, definir o mesmo responsável, `America/Sao_Paulo`, janelas, períodos, exceções e bloqueios. Essa agenda não é publicada no Cal.com.
5. Na conta **Anômalo Hub** e em qualquer link Cal.com ATIVO que ainda aceite reservas, confirmar que nenhum event type do mesmo responsável oferece as janelas nativas. Ao substituir o funil público ATIVO, retirar o link antigo da LP e fechar sua oferta de novas reservas no Cal.com, preservando as reservas existentes. Validar com consultas públicas reais de cada conta. O feed ICS inclui reservas nativas como defesa adicional se estiver cadastrado, mas é periódico e **não serve como garantia instantânea**. Uma alteração de disponibilidade pelo Workspace desativa automaticamente o canal no banco e exige nova verificação. Alterações feitas diretamente no Cal.com exigem revalidação operacional manual.
6. Configurar `ATIVO_WORKSPACE_API_SECRET` no servidor ANÔMALO e o par de variáveis da LP. Manter `ATIVO_NATIVE_BOOKING_ENABLED` ausente/falso durante staging.
7. Rodar testes unitários, typecheck, build e teste de concorrência **contra PostgreSQL real**; testar criação, cancelamento, reagendamento, notificação e as duas contas Cal.com. O script `node scripts/qa/reunioes-nativas-db.mjs` exige `ATIVO_NATIVE_TEST_ALLOW_WRITES=1`, `ATIVO_NATIVE_TEST_DATABASE=staging`, `ATIVO_NATIVE_TEST_EXPECTED_HOST`, `ATIVO_NATIVE_TEST_START` (slot UTC exclusivo livre) e `ATIVO_NATIVE_TEST_ATOR_ID` (usuário interno de teste). Ele cria e cancela uma reserva de teste; executar somente no staging. Só então confirmar a exclusividade na UI, ativar o canal no banco e mudar a flag para `true`.
8. Integrar o backend da LP e validar um fluxo real fim a fim. Em conflito, retornar 409 e renovar slots. Em rollback operacional, desligar `ATIVO_NATIVE_BOOKING_ENABLED`; isso não desliga Cal.com nem apaga reservas nativas existentes.

## Estados internos

`solicitada` + `confirmacao_comercial=aguardando_whatsapp`: reservada; `confirmada`: comercial confirmou; `cancelada`: libera slot; `realizada`: atendimento encerrado. Reagendamento move a **mesma** reserva e tarefa, mantém notas e registra atividade. O cancelamento Cal.com continua pelo provedor; o nativo usa a RPC local. As reuniões de ambos aparecem no Calendário e em Próximas/Histórico.

## Testes e estado da implantação

A integração foi concluída sobre o `main` com duas contas. Uma leitura do Supabase confirmou as duas conexões e o tipo ATIVO com 60 minutos, antecedência de 12 horas, buffer de 15 minutos, limite diário de 3 e horizonte de 14 dias. Na conferência posterior, o canal nativo está ativo e associado a agenda nativa e responsável. A RPC `reunioes_nativas_versao` retornou `PGRST202` na API consultada; conferir a aplicação da migration complementar no projeto do deployment e o reload do schema cache antes da validação com a LP. Esses valores são lidos do banco, nunca fixados no motor.

Verificações finais: `npm run typecheck` e `npm run build` passaram; 179 testes unitários e 12 testes transacionais passaram. Os testes transacionais locais usam PostgreSQL 17 real com conexões independentes e aplicam as migrations reais de Workspace, multi responsáveis e Reuniões. Cobrem corrida, idempotência, reserva/tarefa/vínculos/notificação/realtime, conflito Cal.com, janelas especiais, limites, reagendamento, cancelamento, rollback, fila de notificação e restrição das RPCs. Não criam dados em produção.

Para repetir em PostgreSQL local descartável:

```sh
PG_BIN=/caminho/postgresql/bin PGHOST=/diretorio/socket PGPORT=55439 npm run test:reunioes:postgres
```

O script cria e remove seu próprio banco `nativo_qa_*`; exige socket Unix local. Dependências externas mínimas são declaradas em `scripts/qa/fixtures/reunioes-base.sql`; tabelas e triggers do Workspace/Reuniões vêm das migrations reais.

A entrega permanece **aguardando aplicação da migration complementar, configuração da agenda/segredos e integração da LP**. A flag está desligada por padrão; não foi feito deploy de produção nem alteradas conexões Cal.com.

As notificações usam uma fila durável lateral com entrega atômica e lock `SKIP LOCKED`. O sino e o push continuam usando `notificacoes`/`notificacoes_usuario`. Falha ao entregar não desfaz a reserva. A entrega é tentada na criação e no cron existente `/api/reunioes/reconciliar`; não gera outra reserva ou tarefa.

A validação de UUID aceita o formato de cinco grupos (`8-4-4-4-12`). A chave de exemplo `b993e704-151a-4496-b2ee-0b00bc13acb4` tem regressão tanto no validador usado pelo backend quanto na reserva PostgreSQL concorrente e idempotente.
