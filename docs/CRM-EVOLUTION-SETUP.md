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

Recomendado: Hetzner CX22 (2 vCPU / 4GB RAM, ~€4-5/mês) ou equivalente
(Contabo, DigitalOcean). Evitar tiers "grátis" instáveis — o WhatsApp
conectado precisa de uptime alto; um VPS pago e previsível compensa o custo
baixo.

Ubuntu 22.04+, com Docker e Docker Compose instalados.

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
    image: atendai/evolution-api:latest
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
      WEBHOOK_GLOBAL_URL: https://<dominio-vercel>/api/crm/wa/webhook/<EVOLUTION_WEBHOOK_SECRET>
      WEBHOOK_GLOBAL_ENABLED: "true"
      WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS: "false"
      WEBHOOK_EVENTS_MESSAGES_UPSERT: "true"
      WEBHOOK_EVENTS_CONNECTION_UPDATE: "true"
      WEBHOOK_EVENTS_QRCODE_UPDATED: "true"
    volumes:
      - evolution_instances:/evolution/instances
    ports:
      - "8080:8080" # atrás do Caddy, não exposto direto

volumes:
  evolution_pg:
  evolution_redis:
  evolution_instances:
```

`AUTHENTICATION_API_KEY` vira o `EVOLUTION_API_KEY` do nosso `.env` (Vercel).
`WEBHOOK_GLOBAL_URL` já aponta pro segredo que vai em `EVOLUTION_WEBHOOK_SECRET`
— gerar um valor aleatório novo (ex: `openssl rand -hex 32`) só pra isso.

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
EVOLUTION_API_URL=https://evolution.anomalo.com.br
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
