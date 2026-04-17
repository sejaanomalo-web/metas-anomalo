# Anômalo Hub — Painel de Metas

Dashboard interno do Grupo Anômalo Hub para acompanhamento de metas e funil de
vendas das empresas do grupo. Aplicação Next.js 14 (App Router) + TypeScript +
Tailwind + Recharts, 100% hardcoded (sem banco de dados).

## Empresas cobertas

A2 Marketing · F2 Sports · F2 Móveis · Hato · Aton Estofados · Diego Knebel

Período: Abril a Dezembro de 2025.

## Rodando localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000` — você será redirecionado para `/login`.

## Autenticação

Senha fixa (hardcoded, sem banco). A sessão é mantida num cookie HTTP-only
assinado por `next/headers`.

Senha padrão: **`anomalo2025`**

### Como trocar a senha

Abra [`lib/auth.ts`](lib/auth.ts) e altere a constante:

```ts
export const SENHA_ACESSO = "anomalo2025" // troque aqui
```

Após alterar, faça commit e o Vercel fará o redeploy automático.

## Logo

O header do `/dashboard`, a tela de `/login` e o favicon usam o mesmo arquivo
[`public/logo-anomalo.png`](public/logo-anomalo.png). O arquivo incluído neste
repositório é um **placeholder dourado 128×128**. Substitua pelo logo oficial
antes de publicar:

```
public/logo-anomalo.png
```

Dimensões recomendadas: PNG quadrado, mínimo 256×256, fundo transparente.

## Estrutura de páginas

- `/` → redireciona para `/login` (ou `/dashboard` se já autenticado)
- `/login` → tela de login com campo de senha
- `/dashboard` → visão geral do grupo com seletor de mês e 6 cards de empresa
- `/dashboard/[empresa]` → detalhe individual: gráfico, tabela, funil, métricas

Slugs disponíveis: `a2-marketing`, `f2-sports`, `f2-moveis`, `hato`, `aton`,
`diego-knebel`.

## Dados

Todos os números ficam em [`lib/data.ts`](lib/data.ts). Edite o arquivo e
rode `npm run build` para validar.

## Deploy no Vercel

### Opção 1 — CLI

```bash
npm i -g vercel
vercel
```

Siga o wizard (login, nome do projeto, team). Para publicar em produção:

```bash
vercel --prod
```

### Opção 2 — GitHub + dashboard Vercel

1. Crie um repositório no GitHub e faça push deste diretório.
2. Acesse [vercel.com/new](https://vercel.com/new) e importe o repositório.
3. Framework: **Next.js** (detectado automaticamente).
4. Build command: `next build` · Output: `.next` (defaults).
5. Clique em **Deploy**.

Nenhuma variável de ambiente é necessária.

### Atualizando a senha em produção

1. Edite `lib/auth.ts` → troque `SENHA_ACESSO`.
2. `git commit -am "chore: nova senha de acesso"`
3. `git push` — o Vercel redeploya em ~1min.

## Scripts

- `npm run dev` — servidor local em http://localhost:3000
- `npm run build` — build de produção
- `npm run start` — serve o build em produção
- `npm run lint` — checagem estática

## Stack

- Next.js 14.2 (App Router, React Server Components)
- TypeScript 5.5
- Tailwind CSS 3.4
- Recharts 2.12 (gráficos)

## Identidade visual

Paleta cinematográfica premium: fundo `#0a0a0a`, cartões `#111111`, detalhes em
dourado `#C9953A`, tipografia Inter/system sans-serif.
