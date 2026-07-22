# Migração do Asana → Workspace

> Complementa `docs/WORKSPACE-PLANO.md` (o módulo em si). Este documento cobre
> só a **migração dos dados**: como o Asana é lido, onde os dados pousam e o
> que ainda falta.
>
> Base: plano mestre da auditoria do Asana (1.588 tarefas, 40 projetos, 52
> anexos), reescrito contra o repositório real.

---

## 0. As decisões que fogem do plano mestre, e por quê

| # | Plano mestre | O que foi feito | Motivo |
|---|---|---|---|
| 1 | Extração via MCP do Asana | **API REST com `ASANA_PAT`** (+ adaptador de arquivo) | O MCP vive numa sessão de chat. O plano exige dry-run, reexecução idempotente e delta na janela de corte — nada disso pode depender de um chat aberto. O próprio plano §9.1 pede a abstração; aqui ela é obrigatória |
| 2 | `due_on date` **e** `due_at timestamptz` | `prazo_em date` + `prazo_hora time`, em BRT | Guarda as 8 tarefas com horário exato sem perda **e** sem o deslocamento de fuso que o plano §3.7 manda evitar. Conversão em `prazoDoAsana()`, reversível |
| 3 | `organization_id` em toda tabela | Não existe | Sistema mono-tenant. Já documentado em `WORKSPACE-PLANO.md` §0 |
| 4 | RLS por usuário | RLS ligada **sem policy** + autorização no servidor | Não há Supabase Auth aqui; `auth.uid()` é sempre nulo. Policy daria aparência de proteção sem proteger |
| 5 | Tabelas `tasks`/`task_contexts` novas | **Estende `ws_*`** que já existe | O módulo já implementa tarefa-única-com-N-contextos. Criar um segundo modelo seria a duplicação que o plano proíbe |

---

## 1. O que o Asana vira aqui

| Asana | Destino |
|---|---|
| project | `ws_contextos` (+ `tipo` novo: `calendario_conteudo`, `estudos`, `arquivos`, `aprovados`, `desconhecido`) |
| project members | `ws_contexto_membros` |
| section | `ws_secoes` (+ `ws_tarefa_contextos.secao_id`) |
| task | `ws_tarefas` (**uma linha por GID**) |
| memberships | `ws_tarefa_contextos` (N por tarefa) |
| subtask | `ws_tarefas` com `tarefa_pai_id` |
| comment | `ws_comentarios` |
| followers | `ws_seguidores` / `ws_seguidores_externos` |
| custom field | `ws_campos_definicoes` + `ws_campos_opcoes` + `ws_campos_valores` |
| attachment (binário) | download → bucket privado `ws-anexos` + `ws_anexos` |
| attachment (externo) | `ws_anexos` com `estado='externo'` |
| links na descrição | `ws_links_externos` (sem tirar da descrição) |
| user | `ws_identidades_externas` → mapeado para `usuarios` depois |

**Regra que não pode quebrar:** as 1.349 tarefas que estão em 2 projetos e as 8
que estão em 3 continuam sendo **uma linha** em `ws_tarefas`. A deduplicação por
GID acontece na extração (`lib/workspace-import.ts`), antes do staging.

---

## 2. Campos personalizados sem `ALTER TABLE`

O pedido era "criar campo novo no banco e no frontend". A resposta **não** é uma
coluna por campo — os 30 `Colaborators` do Asana (um GID por projeto) virariam
30 colunas mortas, e cada campo futuro exigiria migration + deploy.

Aqui campo é **dado**:

```
ws_campos_definicoes  (o campo)      ← tipo canônico + renderer_key
   └── ws_campos_opcoes  (enum)
ws_campos_valores     (o valor)      ← coluna tipada por tipo
   ├── ws_campos_valor_opcoes   (enum / multi_enum)
   └── ws_campos_valor_pessoas  (people)
```

`lib/workspace-campos.ts` é o registry compartilhado: diz, por tipo, em qual
coluna o valor mora, qual componente renderiza e quais filtros existem. Backend
e frontend leem o mesmo arquivo — campo novo aparece nos dois sem código novo.

**Tipo desconhecido nunca vira texto.** Vira `'desconhecido'`, o payload fica em
`valor_bruto`, e o dry-run marca **BLOCKER** — o cutover não acontece até o tipo
ganhar persistência, edição, filtro e renderer de verdade.

---

## 3. Raw-first

```
Asana ──► ws_import_raw (payload cru + checksum) ──► análise ──► tabelas canônicas
```

Nada é interpretado antes de estar salvo. Se o normalizador não souber ler um
campo, o dado continua íntegro no staging e a execução acusa pendência. O
checksum é canônico (chaves ordenadas), então reexecutar não reescreve o que não
mudou.

`ws_import_mapeamentos` é o mapa permanente origem→destino. É ele que faz a
segunda execução **atualizar** em vez de duplicar.

---

## 4. Como rodar

### Passo 1 — aplicar a migration

Supabase → SQL Editor → `supabase/migrations/20260722_workspace_asana_fase1.sql`.
Idempotente. Depende de `20260721_workspace_fase1.sql` já estar aplicada.

Cria também o bucket privado `ws-anexos` (`public: false` — diferente do
`crm-midia`, que é público; aqui pode ter documento de cliente).

### Passo 2 — criar o token do Asana

https://app.asana.com/0/my-apps → **Create new token**. Em `.env.local`:

```
ASANA_PAT=1/xxxxxxxxxxxx
```

O token só é lido por `scripts/asana-import.ts`, no servidor. Não vai pro
browser, não vai pro banco, não aparece em log.

### Passo 3 — descoberta (não grava nada)

```bash
npx tsx scripts/asana-import.ts descoberta
```

Confere que o token enxerga os 40 projetos e os 7 usuários. Se a contagem vier
menor que a auditoria, o token não tem acesso a tudo — resolver antes de seguir.

### Passo 4 — dry-run

```bash
npx tsx scripts/asana-import.ts dry-run --relatorio dryrun.json
```

Extrai tudo, grava o **cru** em `ws_import_raw` e imprime o relatório. **Não cria
nenhuma tarefa canônica.** Sai com código 2 se houver blocker.

O relatório responde: projetos vazios, usuários sem conta, projetos sem cliente
correspondente, tipos de campo não suportados, tarefas sem prazo, distribuição
multi-projeto, anexos binários × externos, anexos com URL expirada, domínios de
link e subtarefas órfãs.

### Sem token

```bash
npx tsx scripts/asana-import.ts dry-run --arquivo snapshot.json
```

O adaptador de arquivo lê um dump JSON e alimenta o mesmo pipeline. Anexos
binários não existem nesse modo (não há URL válida) e ficam pendentes.

---

## 5. Baseline de reconciliação

Números da auditoria, para **comparar**, nunca para hardcode — o Asana continua
mudando e a execução real recalcula tudo.

| | Auditoria |
|---|---:|
| projetos ativos | 40 |
| tarefas principais únicas | 1.588 |
| associações tarefa↔projeto | 2.953 |
| concluídas / pendentes | 1.500 / 88 |
| subtarefas | 26 |
| comentários | 117 |
| definições de campo | 32 |
| anexos (binários / externos) | 52 (41 / 11) |
| usuários | 7 |

Sinal de erro grave: `tarefas únicas ≠ 1.588` mas `associações ≈ 2.953` significa
que a deduplicação por GID quebrou — e tarefas estão sendo duplicadas.

---

## 6. Estado

| Etapa | Estado |
|---|---|
| Fase 0 — auditoria do repo | **feita** |
| Fase 1 — staging, mappings, source adapter, dry-run, CLI | **feita** |
| Fase 2 — schema canônico (seções, campos, anexos, links, identidades) | **feita** (migration) |
| Fase 2 — normalizador staging → canônico | **falta** |
| Fase 2 — download de anexos → Storage | **falta** |
| Fase 3 — UI: campos dinâmicos, mapeamento de clientes/usuários | **falta** |
| Fase 4 — Estudos, Arquivos, Aprovados | **falta** |
| Fase 5 — carga em homologação + reconciliação | **falta** |
| Fase 6 — cutover | **falta** |

O corte entre Fase 1 e o normalizador é de propósito, e é o mesmo gate do plano
mestre §2.7: **a importação definitiva não começa antes de migrations, RLS,
dry-run e reconciliação aprovados.** Hoje não existe nenhum caminho de código que
escreva em `ws_tarefas` a partir do Asana — o pior que uma execução acidental faz
é encher o staging.

---

## 7. Próximo incremento

1. `lib/workspace-import-normalizar.ts` — staging → canônico, na ordem do plano
   §9.5, com upsert por `ws_import_mapeamentos`.
2. `lib/workspace-anexos.ts` — download, SHA-256, MIME real, upload no bucket
   privado, signed URL via route handler.
3. Tela de mapeamento assistido (projeto→cliente, usuário Asana→`usuarios`) —
   nenhum projeto vira cliente automaticamente.
4. Renderers dos campos dinâmicos.
5. Reconciliação por GID/checksum + relatório persistido.
