# Anômalo Hub — Painel de Metas

Dashboard interno do Grupo Anômalo Hub para acompanhamento de metas, funil de
vendas e comissionamento do time. Next.js 14 (App Router) + TypeScript estrito
+ Tailwind + Recharts + Supabase.

## Stack

- Next.js 14.2 · React 18.3 · TypeScript 5.5
- Tailwind CSS 3.4
- Recharts 2.12 (gráficos)
- Supabase (dados reais e comissionamento)

Sem nenhum `any`. Sem banco local — metas são hardcoded em `lib/data.ts`; apenas
os valores **realizados** e o comissionamento vivem no Supabase.

## Empresas e período

A2 Marketing · F2 Sports · F2 Móveis · Hato · Aton Estofados · Diego Knebel
Período: Abril a Dezembro de 2025.

## Período e seletor

Mês vai de **Janeiro a Dezembro**. Ano padrão ao abrir é **2026**, com opções
2025/2026/2027/2028. Mês e ano ficam na URL — `/dashboard?mes=Abril&ano=2026`
e `/dashboard/hato?mes=Abril&ano=2026` — para compartilhar períodos
específicos.

Os dados **projetados** em `lib/data.ts` existem apenas para 2025. Para os
demais anos, o painel mostra os cartões sem metas (hífens) e consolida
apenas os **reais** inseridos no Supabase.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha com suas chaves do Supabase
npm run dev
```

Acesse `http://localhost:3000` — você será redirecionado para `/login`.

## Autenticação

Senha fixa (hardcoded, sem banco). A sessão é mantida num cookie HTTP-only via
`next/headers`.

Senha padrão: **`anomalo2025`**

### Como trocar a senha

Abra [`lib/auth.ts`](lib/auth.ts) e altere a constante:

```ts
export const SENHA_ACESSO = "anomalo2025" // troque aqui
```

Após alterar, faça commit → o Vercel faz redeploy automático.

## Supabase — criação das tabelas

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No painel do projeto, abra **SQL Editor** → **New query**.
3. Cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e rode.
   - Cria as tabelas `dados_reais` e `comissionamento`
   - Habilita RLS e libera leitura/escrita via `anon` (autenticação é feita
     pelo próprio app via cookie — o painel é interno, sem usuários públicos).

### Variáveis de ambiente

Em **Project Settings → API**, copie `Project URL` e `anon public key` e
preencha em `.env.local` (ou no Vercel):

```
NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Se o Supabase não estiver configurado, o painel continua funcionando com as
metas hardcoded, mas a escrita/leitura de dados reais e comissionamento
ficam desabilitadas com aviso explícito.

### Esquema das tabelas

**`dados_reais`** — uma linha por empresa × mês × ano (unique constraint)
```
id uuid pk · empresa text · mes text · ano int
investimento_real numeric · leads_real int · reunioes_real int
contratos_real int · faturamento_real numeric
criativos_entregues int · cpl_real numeric · observacoes text
updated_at timestamptz
```

**`comissionamento`** — uma linha por colaborador × mês × ano
```
id uuid pk · colaborador text · mes text · ano int
entregas_validas int · entregas_descontadas int
bonus_calculado numeric · gatilhos_atingidos jsonb
observacoes text · updated_at timestamptz
```

`gatilhos_atingidos` armazena os 4 booleanos do Felipe (`cpl_meta`,
`leads_meta`, `roas_hato`, `posts_prazo`). Para Vinicius e Emanuel o
bônus vem de `max(0, entregas_validas - entregas_descontadas)` e escalas
fixas (10/14/20/25/30 para Vinicius, 5/8/11/15 para Emanuel).

> O `schema.sql` já contém migrações idempotentes que adicionam
> `entregas_descontadas`, `observacoes` e `gatilhos_atingidos` em
> instalações antigas e renomeiam `detalhes` para `gatilhos_atingidos`.

## Estrutura de páginas

- `/` → redireciona para `/login` (ou `/dashboard` se já autenticado)
- `/login` → tela de login
- `/dashboard` → visão geral do grupo, com seletor de mês, 4 cards de resumo
  e grid com 6 cards de empresa (cada um com ponto verde se houver dados reais)
- `/dashboard/[empresa]` → funil em cascata, cenário real vs meta, gráfico com
  linha de meta e linha de real, tabela mensal e drawer lateral para inserir
  dados reais
- `/dashboard/comissionamento` → Felipe (gatilhos), Vinicius e Emanuel
  (entregas válidas), bônus calculado em tempo real, salva no Supabase

Slugs: `a2-marketing`, `f2-sports`, `f2-moveis`, `hato`, `aton`, `diego-knebel`.

## Logo

Header do `/dashboard` (32px), `/login` (48px) e favicon usam o mesmo arquivo
[`public/logo-anomalo.png`](public/logo-anomalo.png). Substitua pelo arquivo
oficial se necessário (há uma cópia em `app/icon.png` para o favicon).

## Deploy no Vercel

### Via GitHub (recomendado)

1. Importe o repo em [vercel.com/new](https://vercel.com/new).
2. Framework: **Next.js** (detectado).
3. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**.

### Via CLI

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # produção
```

Adicione as env vars com `vercel env add NEXT_PUBLIC_SUPABASE_URL` etc.

## Scripts

- `npm run dev` — servidor local em http://localhost:3000
- `npm run build` — build de produção
- `npm run start` — serve o build em produção
- `npm run lint` — lint

## Identidade visual

Fundo `#0a0a0a`, cartões `#111`, detalhes em dourado `#C9953A`, texto branco,
Inter/system sans-serif. Estilo cinematográfico e premium — alinhado à marca
Anômalo Hub.
