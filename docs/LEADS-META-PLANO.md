# Leads do Meta Ads → Dashboard do Cliente

**Status:** implementado (código). **Pendente:** migration no SQL Editor + credenciais do Meta.
**Escopo:** ~10 clientes, tráfego rodando quase diariamente.
**Objetivo:** eliminar o repasse manual "Google Sheets → copia e cola no WhatsApp".

---

## 1. O que foi construído

Lead preenchido no anúncio → webhook grava no banco em segundos → o cliente abre
um link fixo e vê os leads dele, filtrando por período e formulário.

**Sem envio automático de WhatsApp. Sem Google Sheets.** A entrega é o link, que
o time copia em `/dashboard/leads` e manda pro cliente.

### 1.1 Por que não tem WhatsApp automático

Decisão do dia 05/08: o número da WABA não vai ser mantido. O link é **fixo e
permanente por cliente** — não muda a cada lead — então enviar manualmente uma
vez por semana entrega o mesmo valor que enviar automático a cada lead.

Vale registrar o que ficou descartado e por quê, pra não ser reaberto por
engano: **Evolution (Baileys) está fora**. Não é preferência — é uma decisão que
já existia no projeto. O `lib/crm-anti-ban.ts` documenta um incidente real (envio
de mensagens quase idênticas para vários contatos derrubou o número por 5h) e o
`lib/evolution.ts` **não tem mais função de envio**, removida na Fase 8 do CRM.
Notificação de lead é o pior caso possível pro Baileys: mensagem repetida, para
vários contatos, várias vezes ao dia.

Se um dia voltar a fazer sentido notificar, o caminho é a Cloud API oficial
(`lib/whatsapp.ts`, que já manda os relatórios diários) — e nada do que está
construído precisa mudar: é só somar o disparo.

### 1.2 Por que não tem Google Sheets

O Sheets seria gravado **depois** do banco. Ou seja, só protegeria contra "a
linha foi salva e depois sumiu" — o cenário menos provável. Contra o que
realmente acontece (o lead nunca chegar: webhook perdido, token expirado,
instabilidade) ele não protegeria nada, porque se não chegou no banco também não
chegaria na planilha.

Quem protege contra isso é a **reconciliação** (§4.6): todo dia o sistema
pergunta à Meta o que entrou e insere o que faltou. É essa rotina que sustenta a
decisão de dispensar o Sheets — não a confiança no banco.

---

## 2. Como usar (operação)

1. **Cadastrar o formulário.** `/dashboard/leads` → no cliente → "+ Formulário".
   Precisa do `form_id` (Gerenciador de Anúncios → Formulários instantâneos) e
   do Page Access Token da página dona do formulário.
2. **Copiar o link.** Botão "🔗 Copiar link de leads" no card do cliente.
3. **Enviar pro cliente** pelo WhatsApp, uma vez. O link não expira.
4. **Se o link vazar:** botão "Novo link" gera outro e invalida o anterior na
   hora.

O cliente abre e filtra por **Hoje, Ontem, Anteontem, Esta semana, Semana
passada, Este mês, Mês passado, Tudo** — e por formulário, quando há mais de um.

> Nota de interpretação: o pedido original listava "antes de amanhã", que
> entendi como **anteontem**. Os dois filtros de mês entraram junto para cobrir
> a intenção com folga. Se era outra coisa, é um item a mais na lista de
> `PERIODOS_ORDEM` em `lib/leads-datas.ts`.

---

## 3. Arquivos

### Banco
```
supabase/migrations/20260805_leads_meta.sql
```
- `cliente_trafego.leads_dash_token` — uuid v4, único, rotacionável.
- `leads_form_mapping` — formulário do Meta → cliente + Page Access Token.
- `leads_log` — o lead, com `leadgen_id` único (deduplicação) e `payload_bruto`.
- `leads_webhook_eventos` — log cru de cada POST, antes de qualquer processamento.

RLS ligada **sem policy** nas três tabelas novas: só service_role acessa. Vale
inclusive pro dashboard público — o token resolve *qual* `cliente_id` consultar,
e o filtro é aplicado no servidor; a chave anon nunca toca essas tabelas.

### Biblioteca
```
lib/leads-datas.ts      períodos em BRT (módulo puro, testado — §5)
lib/leads-campos.ts     normalização do field_data (nomes de campo variam por cliente)
lib/leads-graph.ts      Graph API + validação da assinatura X-Hub-Signature-256
lib/leads.ts            leituras
lib/leads-actions.ts    escritas ("use server")
lib/leads-ingestao.ts   orquestração compartilhada webhook + reconciliação
```

### Rotas
```
app/api/leads/meta/webhook/route.ts   GET (handshake) + POST (ingestão)
app/api/leads/reconciliar/route.ts    cron diário 05:00 BRT (0 8 * * * UTC)
app/leads/[token]/page.tsx            dashboard público do cliente
app/dashboard/leads/page.tsx          tela interna (permissão "leads")
```

### Componentes
```
components/leads/FiltrosLeads.tsx           filtros (Server Component, links puros)
components/leads/CardLead.tsx               ficha do lead (<details> nativo)
components/leads/BotaoLinkLeads.tsx         copiar link
components/leads/GerenciadorFormsLeads.tsx  CRUD de formulários
```

### Alterados
- `lib/auth.ts` — nova chave `leads` nos 4 presets (nasce `false` pra `comercial`
  e `custom`).
- `components/AppShell.tsx` — item "Leads" + rota na lista de rotas-não-empresa.
- `components/GerenciadorUsuarios.tsx` — checkbox da permissão.
- `vercel.json` — cron da reconciliação.
- `.env.example` — `META_LEADGEN_VERIFY_TOKEN`, `META_LEADGEN_APP_SECRET`.

---

## 4. Decisões de implementação que não são óbvias

### 4.1 O payload cru é a primeira escrita

`leads_webhook_eventos` recebe o POST inteiro **antes** de qualquer
processamento. Se tudo abaixo falhar, o lead ainda dá pra reconstruir dali sem
pedir nada à Meta. Mesmo padrão do `crm_wa_eventos` no webhook da Evolution.

### 4.2 O webhook responde 200 mesmo quando o processamento falha

A Meta reentrega em caso de não-200. Devolver 5xx por erro de processamento
geraria loop de reentrega. Só assinatura inválida recusa (401); o erro fica na
linha de `leads_webhook_eventos`, não no status HTTP.

### 4.3 O corpo é lido como texto cru

`assinaturaValida()` precisa do corpo exatamente como chegou. `await req.json()`
seguido de re-serialização mudaria espaços e ordem, quebrando o HMAC. Por isso
a rota faz `req.text()` e só depois `JSON.parse`.

### 4.4 Deduplicação é do banco, não do JavaScript

`unique (leadgen_id)` + `upsert(..., { ignoreDuplicates: true })`. Um "select
antes do insert" teria janela de corrida real: webhook e cron de reconciliação
podem rodar ao mesmo tempo.

### 4.5 Lead de formulário não cadastrado é gravado assim mesmo

Com `cliente_id` null. Vira "lead órfão" na tela interna. Descartar seria
reintroduzir exatamente a perda de lead que o módulo veio resolver — e campanha
nova entrando no ar sem alguém ter cadastrado o `form_id` **vai** acontecer.

**Consequência que exigiu código extra:** como a gravação é idempotente, a
reconciliação reencontraria o órfão e não faria nada — ele ficaria órfão para
sempre, mesmo depois de o formulário ser cadastrado. Por isso
`adotarOrfaos()` roda ao cadastrar/editar um mapeamento: vincula os órfãos
daquele `form_id` ao cliente e preenche o `field_data` dos que entraram vazios
(formulário cadastrado sem token, token adicionado depois).

### 4.6 A reconciliação usa janela de 48h, não 24h

Sobreposição entre execuções: uma falha isolada do cron não abre buraco.
Reprocessar é barato porque a deduplicação é do banco.

### 4.7 `data_brt` é coluna materializada

Todos os filtros são por dia BRT e `recebido_em` é UTC. Derivar o dia em toda
query é a receita clássica do bug "lead das 22h aparece no dia seguinte".

### 4.8 O filtro do cliente não usa JavaScript

`FiltrosLeads` é Server Component renderizando `<Link>`; a expansão da ficha usa
`<details>` nativo. O cliente abre esse link pelo navegador embutido do
WhatsApp, muitas vezes em conexão ruim: link puro funciona antes de qualquer
bundle carregar, o filtro vai junto na URL ao compartilhar, e o botão "voltar"
se comporta como a pessoa espera.

### 4.9 `leads_dash_token` ficou FORA de `COLUNAS_CLIENTE`

`COLUNAS_CLIENTE` é usada por todas as telas de tráfego e pelo `/vendas/<token>`.
Incluir a coluna nova ali faria **todas elas quebrarem** se o código subisse
antes da migration. O módulo de leads seleciona o campo explicitamente
(`COLUNAS_CLIENTE_LEADS` em `lib/leads.ts`), então migration pendente derruba só
as telas novas.

---

## 5. Verificação feita

- `npx tsc --noEmit` — limpo.
- `npx next build` — compila; as 4 rotas novas aparecem no manifesto.
- **37 asserções de lógica pura** (datas, extração de campos, parsing do
  webhook), incluindo virada de ano, fevereiro bissexto, semana cruzando mês,
  `field_data` malformado e payload com múltiplos `entry`/`changes`.
- **12 asserções de segurança** do webhook: assinatura correta aceita, corpo
  alterado rejeitado, hex inválido rejeitado sem lançar, algoritmo errado
  rejeitado, handshake com `verify_token` errado rejeitado.

**Não verificado:** a migration não foi executada contra um Postgres (não há
Postgres nem Docker nesta máquina). Foi revisada, não testada.

---

## 6. Para colocar no ar

Nesta ordem — a 1 é pré-requisito das telas novas.

1. **Aplicar `supabase/migrations/20260805_leads_meta.sql`** no SQL Editor do
   Supabase. É idempotente (`if not exists` em tudo).
2. **Permissão do Meta:** `leads_retrieval` passa por **App Review**. Prazo
   externo, sem SLA — é o gargalo do projeto, começar por aqui.
3. **Page Access Token** de cada página de cliente (exige o aceite do cliente no
   Business Manager). Cadastrar no formulário correspondente em
   `/dashboard/leads`.
4. **Envs na Vercel:** `META_LEADGEN_VERIFY_TOKEN` (valor livre) e
   `META_LEADGEN_APP_SECRET` (App Secret do App).
5. **Webhook:** developers.facebook.com → App → Webhooks → Page → `leadgen`,
   Callback `<APP_URL>/api/leads/meta/webhook`. Depois assinar cada página com
   `POST /{page_id}/subscribed_apps`.
6. **Testar** com a "Lead Ads Testing Tool" do Meta antes de contar com tráfego
   real.

> Enquanto 2 e 3 não saem, dá pra cadastrar os formulários e conferir a tela: o
> lead entra como órfão sem `field_data`, e `adotarOrfaos()` preenche tudo assim
> que o token for cadastrado.

---

## 7. Riscos que sobraram

| Risco | Impacto | Mitigação no código |
| --- | --- | --- |
| App Review de `leads_retrieval` demora | Bloqueia o projeto inteiro | Nenhuma — é externo. Por isso é o passo 2 |
| Page Access Token expira/é revogado | Para de entrar lead daquele cliente | Reconciliação recupera; notificação no sino quando um formulário não responde |
| Campanha nova sem `form_id` cadastrado | Lead não aparece pro cliente | Lead é gravado como órfão + alerta na tela interna + `adotarOrfaos()` ao cadastrar |
| Cliente encaminha o link | Quem tem o link tem acesso | Rotação de token no admin. É o tradeoff aceito de não ter login |
| Retenção de dado pessoal | LGPD | `payload_bruto` guarda tudo indefinidamente — **definir política de retenção** (não implementado) |
| `getResumoLeadsPorCliente` varre até 50k linhas | Lentidão na tela interna com o tempo | Aceitável no volume atual; vira `count` agregado quando incomodar |

---

## 8. Histórico das decisões

- **04/08** — planejamento inicial. Descoberto que **não há Clerk** no projeto
  (auth é caseira: cookie HMAC + `public.usuarios` + RBAC próprio) e que o
  `anomalo-hub-dashboard` **não serve de padrão** (é `index.html` estático +
  GitHub Action semanal que commita `data.json` no git — incompatível com tempo
  real e inseguro para telefone/dado financeiro).
- **05/08** — decidido: sem WhatsApp automático (número da WABA será
  descontinuado), sem Google Sheets, entrega por link copiável com filtros no
  lado do cliente. Implementado.
