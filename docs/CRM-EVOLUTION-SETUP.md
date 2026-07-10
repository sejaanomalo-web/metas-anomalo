# Runbook — Servidor Evolution API (WhatsApp do CRM)

> Status: **a executar**. Nada disso roda no repo/Vercel — é infraestrutura
> à parte (um VPS) que só *conversa* com o app via webhook HTTP.

## Por que fora da Vercel

A Vercel é 100% serverless: funções sobem, respondem e desligam. A Evolution
API precisa manter uma conexão WhatsApp Web (Baileys) viva o tempo todo — não
dá pra rodar como função serverless. Por isso ela roda num VPS separado, e só
**chama** nosso Next.js via webhook HTTP (isso sim é compatível com
serverless — é só um POST recebido).

## 1. VPS

Recomendado: DigitalOcean Basic (Regular CPU, 2GB RAM, ~$12/mês) ou
equivalente (Hetzner, Contabo). Evitar o tier de 512MB/1GB — aperta demais
rodando Postgres + Redis + Evolution juntos. Evitar tiers "grátis" instáveis
— o WhatsApp conectado precisa de uptime alto; um VPS pago e previsível
compensa o custo baixo.

Ubuntu 24.04+, com Docker e Docker Compose instalados
(`curl -fsSL https://get.docker.com | sh`).

**Sem domínio próprio?** Não tem problema — dá pra usar o IP do servidor
direto (`http://<IP>:8080`) sem TLS. O único efeito colateral é o navegador
avisar que a conexão não é criptografada ao abrir o Manager da Evolution
direto; a chamada da Evolution pro nosso webhook continua normal (o webhook
em si já é `https://` porque mora na Vercel). A seção 3 (Caddy/TLS) fica
opcional nesse caso — pule pra seção 4.

## 2. Docker Compose

Três serviços: `evolution-api`, `postgres` (storage de sessão/instâncias) e
`redis` (cache de conexão — reduz reconexões, recomendado pela própria
Evolution para produção multi-instância).

```yaml
# docker-compose.yml (no VPS, fora deste repo)
services:
  postgres:
    image: postgres:16
    restart: always
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: <gerar-senha-forte>
      POSTGRES_DB: evolution
    volumes:
      - evolution_pg:/var/lib/postgresql/data

  redis:
    image: redis:7
    restart: always
    volumes:
      - evolution_redis:/data

  evolution-api:
    image: evoapicloud/evolution-api:v2.3.7
    restart: always
    depends_on:
      - postgres
      - redis
    environment:
      AUTHENTICATION_API_KEY: <gerar-apikey-forte>
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:<senha>@postgres:5432/evolution
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://redis:6379
      WEBHOOK_GLOBAL_URL: https://<dominio-ou-app-vercel>/api/crm/wa/webhook/<EVOLUTION_WEBHOOK_SECRET>
      WEBHOOK_GLOBAL_ENABLED: "true"
      WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS: "false"
      WEBHOOK_EVENTS_MESSAGES_UPSERT: "true"
      WEBHOOK_EVENTS_CONNECTION_UPDATE: "true"
      WEBHOOK_EVENTS_QRCODE_UPDATED: "true"
      WEBHOOK_EVENTS_CONTACTS_UPSERT: "true"
      WEBHOOK_EVENTS_CONTACTS_UPDATE: "true"
    volumes:
      - evolution_instances:/evolution/instances
    ports:
      - "8080:8080" # atrás do Caddy se tiver domínio, ou exposto direto se for só IP

volumes:
  evolution_pg:
  evolution_redis:
  evolution_instances:
```

> **Nome da imagem**: o projeto migrou de `atendai/evolution-api` pra
> `evoapicloud/evolution-api` (mesmo time, repositório novo) — e nenhum dos
> dois publica a tag `:latest` de forma confiável. Sempre fixar uma versão
> (`v2.3.7` no momento em que este runbook foi escrito) e conferir a mais
> recente em hub.docker.com/r/evoapicloud/evolution-api/tags antes de subir.

`AUTHENTICATION_API_KEY` vira o `EVOLUTION_API_KEY` do nosso `.env` (Vercel).
`WEBHOOK_GLOBAL_URL` já aponta pro segredo que vai em `EVOLUTION_WEBHOOK_SECRET`
— gerar um valor aleatório novo (ex: `openssl rand -hex 32`) só pra isso.
`CONTACTS_UPSERT`/`CONTACTS_UPDATE` (Fase 2) alimentam o nome salvo no
celular (`crm_contatos`), preferido sobre o pushName ao criar um lead.

## 3. TLS / reverse proxy (Caddy)

```
# /etc/caddy/Caddyfile
evolution.anomalo.com.br {
  reverse_proxy localhost:8080
}
```

Caddy renova certificado Let's Encrypt sozinho. Firewall do VPS: só as portas
`22` (SSH) e `443` abertas — a porta `8080` do Evolution nunca fica exposta
direto na internet, só via `localhost` pro Caddy.

## 4. Env vars no nosso app (Vercel)

Preencher as 3 já existentes em `.env.example`, hoje em branco:

```
EVOLUTION_API_URL=https://evolution.anomalo.com.br   (ou http://<IP-do-VPS>:8080 sem domínio)
EVOLUTION_API_KEY=<mesma AUTHENTICATION_API_KEY do compose>
EVOLUTION_WEBHOOK_SECRET=<mesmo segredo usado no WEBHOOK_GLOBAL_URL>
```

## 5. Criar uma instância (número de WhatsApp)

Depois do servidor no ar, criar instâncias pela UI em
`/dashboard/crm/conexoes` (não mais via SQL manual): escolher a empresa,
dar um nome técnico à instância (ex: `tato-comercial`) e clicar em "Criar
instância". O QR aparece assim que a Evolution disparar o evento
`QRCODE_UPDATED` pro nosso webhook — escanear no WhatsApp do celular em
"Aparelhos conectados → Conectar aparelho".

**Isolamento por usuário (Fase 2)**: cada instância pertence a quem a
criou — literal como WhatsApp Web. Se dois colegas precisam gerenciar
números diferentes, cada um cria a própria instância logado com o próprio
usuário; não existe uma instância "da equipe" visível pra todo mundo.

## 6. Backup

O volume `evolution_pg` guarda o estado de todas as instâncias — perder ele
= ter que reconectar (rescan de QR) todos os números. Backup mínimo:
`pg_dump` diário do banco `evolution` pra fora do VPS (ex: cron + upload pra
um bucket), ou snapshot do disco do provedor de VPS.

## 7. Recriar uma instância se o VPS cair

1. Subir um VPS novo com o mesmo `docker-compose.yml`.
2. Restaurar o dump do Postgres (`evolution_pg`).
3. Apontar o DNS de `evolution.anomalo.com.br` pro IP novo.
4. Nenhuma mudança necessária no nosso app — só reaponta o DNS, as env vars
   continuam as mesmas (mesma URL, mesma apikey).

## 8. Fase 3 — áudio, fotos de perfil, mídia e tipos de atividade

O que mudou e o que exige ação sua:

- **Migração `20260711_crm_fase3_midia_fotos_tipos.sql`** — aplicar (via
  `apply_migration` / SQL do Supabase). Ela: cria as colunas de foto/preview,
  a tabela de tipos de atividade, **cria o bucket `crm-midia`** (Storage,
  público) e **corrige o histórico** de mensagens que apareciam do lado errado
  (as enviadas pelo próprio celular).

- **Enviar áudio (nota de voz)** — botão 🎤 na conversa grava pelo navegador e
  manda pra Evolution (`/message/sendWhatsAppAudio`). Nenhuma env nova. Só
  exige **HTTPS** (o microfone do navegador não funciona em `http://` — na
  Vercel já é https). O `next.config.mjs` foi ajustado (`microphone=(self)`).

- **Foto + nome do contato (estilo WhatsApp)** — a foto vem de dois lugares:
  do evento `CONTACTS_UPSERT` (campo `profilePicUrl`, já habilitado no
  compose) e de uma busca sob demanda na criação do lead
  (`/chat/fetchProfilePictureUrl`). URLs de foto do WhatsApp **expiram** — se
  quebrar, a UI cai no avatar de iniciais automaticamente.

- **Áudios/imagens recebidos** — o webhook não traz o binário, então o app
  baixa sob demanda (`/chat/getBase64FromMediaMessage`) e sobe pro bucket
  `crm-midia`. É best-effort: se a Evolution não devolver a mídia, a conversa
  mostra o rótulo (`🎤 Áudio` / `🖼️ Imagem`) mesmo assim.

- **Excluir instância** — a tela de Conexões agora tem 🗑 (com confirmação),
  que desloga e apaga a instância na Evolution (`/instance/logout` +
  `/instance/delete`) e remove a linha local. O histórico de mensagens fica
  preservado.

- **Opcional (recibos de leitura)** — pra ✓✓ no futuro, habilitar
  `WEBHOOK_EVENTS_MESSAGES_UPDATE: "true"` no compose. Não é necessário agora.

> **Resumo do que você precisa fazer:** (1) aplicar a migração `20260711`;
> (2) confirmar que o app roda em HTTPS (Vercel já roda); (3) nada de env nova.
> O resto é automático.
