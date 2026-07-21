// =============================================================================
// Asana — adaptador de origem. SOMENTE LEITURA. Server-only.
// =============================================================================
//
// POR QUE ESTA ABSTRAÇÃO EXISTE (plano §9.1):
//
// A auditoria do Asana foi feita por MCP, dentro de uma sessão de chat. Isso
// não serve como motor de importação: o plano exige dry-run, reexecução
// idempotente, delta incremental e uma sincronização final na janela de corte.
// Nada disso pode depender de alguém ter um chat aberto.
//
// Então o pipeline fala com uma interface, e existem duas implementações:
//
//   • AsanaRest  — API oficial, token só no servidor (ASANA_PAT). É o caminho
//                  recomendado: roda por script, quantas vezes for preciso.
//   • AsanaArquivo — lê um dump JSON do disco. Serve pra replay offline de um
//                  snapshot e como saída se o token não estiver disponível.
//
// Staging, normalização, dry-run e reconciliação não sabem qual das duas está
// em uso.
//
// NUNCA escrever no Asana. Este arquivo só faz GET.

import type {
  AsanaAnexo,
  AsanaComentario,
  AsanaCustomField,
  AsanaProjeto,
  AsanaRecurso,
  AsanaSecao,
  AsanaTarefa,
  AsanaUsuario,
  SnapshotAsana,
} from "./tipos"

export interface AsanaSource {
  readonly nome: string
  workspaces(): Promise<AsanaRecurso[]>
  equipes(workspaceGid: string): Promise<AsanaRecurso[]>
  usuarios(workspaceGid: string): Promise<AsanaUsuario[]>
  projetos(workspaceGid: string): Promise<AsanaProjeto[]>
  projeto(gid: string): Promise<AsanaProjeto | null>
  secoes(projetoGid: string): Promise<AsanaSecao[]>
  tarefasDoProjeto(projetoGid: string): Promise<AsanaTarefa[]>
  tarefa(gid: string): Promise<AsanaTarefa | null>
  subtarefas(tarefaGid: string): Promise<AsanaTarefa[]>
  comentarios(tarefaGid: string): Promise<AsanaComentario[]>
  anexosDe(objetoGid: string): Promise<AsanaAnexo[]>
  /** Baixa o binário de um anexo. null se não for possível (link externo,
   *  URL expirada). Nunca lança por 404 — devolve null e o chamador registra. */
  baixarAnexo(anexo: AsanaAnexo): Promise<{ bytes: Uint8Array; contentType: string | null } | null>
}

// =============================================================================
// Campos pedidos — opt_fields explícito
// =============================================================================
// A API do Asana devolve um subconjunto mínimo por padrão. Sem opt_fields,
// `notes`, `memberships` e `custom_fields` simplesmente não vêm — e a
// importação ficaria "completa" com metade dos dados faltando, em silêncio.

const CAMPOS_TAREFA = [
  "gid", "name", "notes", "html_notes", "completed", "completed_at",
  "completed_by.gid", "completed_by.name",
  "assignee.gid", "assignee.name",
  "created_by.gid", "created_by.name",
  "followers.gid", "followers.name",
  "due_on", "due_at", "start_on", "start_at",
  "created_at", "modified_at",
  "parent.gid", "parent.name",
  "memberships.project.gid", "memberships.project.name",
  "memberships.section.gid", "memberships.section.name",
  "projects.gid", "projects.name",
  "resource_subtype", "approval_status", "num_subtasks",
  "custom_fields.gid", "custom_fields.name", "custom_fields.type",
  "custom_fields.resource_subtype", "custom_fields.display_value",
  "custom_fields.text_value", "custom_fields.number_value",
  "custom_fields.enum_value.gid", "custom_fields.enum_value.name",
  "custom_fields.enum_value.color", "custom_fields.enum_value.enabled",
  "custom_fields.multi_enum_values.gid", "custom_fields.multi_enum_values.name",
  "custom_fields.multi_enum_values.color", "custom_fields.multi_enum_values.enabled",
  "custom_fields.people_value.gid", "custom_fields.people_value.name",
  "custom_fields.date_value.date", "custom_fields.date_value.date_time",
].join(",")

const CAMPOS_PROJETO = [
  "gid", "name", "archived", "color", "notes", "html_notes", "public",
  "default_view", "created_at", "modified_at",
  "owner.gid", "owner.name", "members.gid", "members.name",
  "custom_field_settings.gid",
  "custom_field_settings.custom_field.gid",
  "custom_field_settings.custom_field.name",
  "custom_field_settings.custom_field.description",
  "custom_field_settings.custom_field.type",
  "custom_field_settings.custom_field.resource_subtype",
  "custom_field_settings.custom_field.precision",
  "custom_field_settings.custom_field.format",
  "custom_field_settings.custom_field.currency_code",
  "custom_field_settings.custom_field.enum_options.gid",
  "custom_field_settings.custom_field.enum_options.name",
  "custom_field_settings.custom_field.enum_options.color",
  "custom_field_settings.custom_field.enum_options.enabled",
].join(",")

const CAMPOS_COMENTARIO = [
  "gid", "resource_subtype", "type", "text", "html_text", "created_at",
  "created_by.gid", "created_by.name", "is_pinned", "is_edited",
].join(",")

const CAMPOS_ANEXO = [
  "gid", "name", "resource_subtype", "host", "download_url", "view_url",
  "permanent_url", "created_at", "size", "parent.gid",
].join(",")

// =============================================================================
// Implementação REST
// =============================================================================

const BASE = "https://app.asana.com/api/1.0"

interface OpcoesRest {
  token: string
  /** Chamadas simultâneas. O Asana limita ~150 req/min por token; 4 é
   *  conservador de propósito — a importação roda uma vez, não vale a pena
   *  arriscar tomar 429 em cascata no meio de 1.588 tarefas. */
  concorrencia?: number
  aoProgredir?: (msg: string) => void
}

export class AsanaRest implements AsanaSource {
  readonly nome = "asana-rest"
  private token: string
  private concorrencia: number
  private aoProgredir: (msg: string) => void
  private chamadas = 0

  constructor(opts: OpcoesRest) {
    if (!opts.token) throw new Error("[asana] token ausente")
    this.token = opts.token
    this.concorrencia = opts.concorrencia ?? 4
    this.aoProgredir = opts.aoProgredir ?? (() => {})
  }

  get totalChamadas(): number {
    return this.chamadas
  }

  /**
   * GET com retry. Trata os três modos de falha que aparecem numa importação
   * longa de verdade:
   *   429 → respeita Retry-After (o Asana manda o valor certo);
   *   5xx → backoff exponencial com jitter (jitter importa: sem ele, N
   *         requisições que falharam juntas voltam juntas e derrubam de novo);
   *   rede→ mesma coisa do 5xx.
   * 4xx que não seja 429 não é retryable — devolve null e o chamador registra.
   */
  private async get<T>(caminho: string, tentativa = 0): Promise<T | null> {
    const url = caminho.startsWith("http") ? caminho : `${BASE}${caminho}`
    this.chamadas++
    let resp: Response
    try {
      resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      })
    } catch (e) {
      if (tentativa >= 5) throw e
      await this.esperar(this.backoff(tentativa))
      return this.get<T>(caminho, tentativa + 1)
    }

    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("Retry-After") ?? "")
      const espera = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : this.backoff(tentativa)
      if (tentativa >= 8) throw new Error("[asana] 429 persistente")
      this.aoProgredir(`rate limit, aguardando ${Math.round(espera / 1000)}s`)
      await this.esperar(espera)
      return this.get<T>(caminho, tentativa + 1)
    }

    if (resp.status >= 500) {
      if (tentativa >= 5) throw new Error(`[asana] ${resp.status} persistente`)
      await this.esperar(this.backoff(tentativa))
      return this.get<T>(caminho, tentativa + 1)
    }

    if (resp.status === 404 || resp.status === 403) return null
    if (!resp.ok) {
      // Mensagem sem corpo: a resposta de erro pode ecoar conteúdo.
      throw new Error(`[asana] GET ${caminho.split("?")[0]} -> ${resp.status}`)
    }

    const json = (await resp.json()) as { data?: T }
    return (json.data ?? null) as T | null
  }

  /** Percorre TODAS as páginas. Não parar aqui é como metade dos dados some. */
  private async getPaginado<T>(caminho: string): Promise<T[]> {
    const out: T[] = []
    const sep = caminho.includes("?") ? "&" : "?"
    let proxima: string | null = `${caminho}${sep}limit=100`

    while (proxima) {
      const url: string = proxima.startsWith("http") ? proxima : `${BASE}${proxima}`
      this.chamadas++
      const resp = await this.fetchComRetry(url)
      if (!resp) break
      const json = (await resp.json()) as {
        data?: T[]
        next_page?: { uri?: string; offset?: string } | null
      }
      if (Array.isArray(json.data)) out.push(...json.data)
      proxima = json.next_page?.uri ?? null
    }
    return out
  }

  private async fetchComRetry(url: string, tentativa = 0): Promise<Response | null> {
    let resp: Response
    try {
      resp = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
        cache: "no-store",
      })
    } catch (e) {
      if (tentativa >= 5) throw e
      await this.esperar(this.backoff(tentativa))
      return this.fetchComRetry(url, tentativa + 1)
    }
    if (resp.status === 429) {
      const ra = Number(resp.headers.get("Retry-After") ?? "")
      const espera = Number.isFinite(ra) && ra > 0 ? ra * 1000 : this.backoff(tentativa)
      if (tentativa >= 8) throw new Error("[asana] 429 persistente")
      this.aoProgredir(`rate limit, aguardando ${Math.round(espera / 1000)}s`)
      await this.esperar(espera)
      return this.fetchComRetry(url, tentativa + 1)
    }
    if (resp.status >= 500) {
      if (tentativa >= 5) throw new Error(`[asana] ${resp.status} persistente`)
      await this.esperar(this.backoff(tentativa))
      return this.fetchComRetry(url, tentativa + 1)
    }
    if (resp.status === 404 || resp.status === 403) return null
    if (!resp.ok) throw new Error(`[asana] GET -> ${resp.status}`)
    return resp
  }

  private backoff(tentativa: number): number {
    const base = Math.min(1000 * 2 ** tentativa, 30_000)
    return base + Math.random() * 500 // jitter
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  /** Executa em lotes limitados pela concorrência configurada. */
  async emLotes<T, R>(itens: T[], fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(itens.length)
    let cursor = 0
    const trabalhadores = Array.from(
      { length: Math.min(this.concorrencia, Math.max(itens.length, 1)) },
      async () => {
        for (;;) {
          const i = cursor++
          if (i >= itens.length) return
          out[i] = await fn(itens[i], i)
        }
      }
    )
    await Promise.all(trabalhadores)
    return out
  }

  workspaces(): Promise<AsanaRecurso[]> {
    return this.getPaginado<AsanaRecurso>("/workspaces?opt_fields=gid,name")
  }

  equipes(workspaceGid: string): Promise<AsanaRecurso[]> {
    return this.getPaginado<AsanaRecurso>(
      `/organizations/${workspaceGid}/teams?opt_fields=gid,name`
    ).catch(() => [])
  }

  usuarios(workspaceGid: string): Promise<AsanaUsuario[]> {
    return this.getPaginado<AsanaUsuario>(
      `/workspaces/${workspaceGid}/users?opt_fields=gid,name,email`
    )
  }

  async projetos(workspaceGid: string): Promise<AsanaProjeto[]> {
    // archived=false e archived=true separados: o default do Asana omite
    // arquivados, e o plano exige importar os dois.
    const [ativos, arquivados] = await Promise.all([
      this.getPaginado<AsanaProjeto>(
        `/workspaces/${workspaceGid}/projects?archived=false&opt_fields=${CAMPOS_PROJETO}`
      ),
      this.getPaginado<AsanaProjeto>(
        `/workspaces/${workspaceGid}/projects?archived=true&opt_fields=${CAMPOS_PROJETO}`
      ).catch(() => []),
    ])
    return [...ativos, ...arquivados]
  }

  projeto(gid: string): Promise<AsanaProjeto | null> {
    return this.get<AsanaProjeto>(`/projects/${gid}?opt_fields=${CAMPOS_PROJETO}`)
  }

  secoes(projetoGid: string): Promise<AsanaSecao[]> {
    return this.getPaginado<AsanaSecao>(
      `/projects/${projetoGid}/sections?opt_fields=gid,name,created_at`
    )
  }

  tarefasDoProjeto(projetoGid: string): Promise<AsanaTarefa[]> {
    // completed_since=now faria o Asana esconder as concluídas — 1.500 das
    // 1.588. Sem esse parâmetro vêm todas, que é o que a migração precisa.
    return this.getPaginado<AsanaTarefa>(
      `/projects/${projetoGid}/tasks?opt_fields=${CAMPOS_TAREFA}`
    )
  }

  tarefa(gid: string): Promise<AsanaTarefa | null> {
    return this.get<AsanaTarefa>(`/tasks/${gid}?opt_fields=${CAMPOS_TAREFA}`)
  }

  subtarefas(tarefaGid: string): Promise<AsanaTarefa[]> {
    return this.getPaginado<AsanaTarefa>(
      `/tasks/${tarefaGid}/subtasks?opt_fields=${CAMPOS_TAREFA}`
    )
  }

  async comentarios(tarefaGid: string): Promise<AsanaComentario[]> {
    const todas = await this.getPaginado<AsanaComentario>(
      `/tasks/${tarefaGid}/stories?opt_fields=${CAMPOS_COMENTARIO}`
    )
    // O endpoint de stories mistura comentário humano com evento do sistema
    // ("X marcou como concluída"). Só o comentário é conteúdo do usuário.
    return todas.filter((s) => s.resource_subtype === "comment_added" || s.type === "comment")
  }

  anexosDe(objetoGid: string): Promise<AsanaAnexo[]> {
    return this.getPaginado<AsanaAnexo>(
      `/attachments?parent=${objetoGid}&opt_fields=${CAMPOS_ANEXO}`
    )
  }

  async baixarAnexo(
    anexo: AsanaAnexo
  ): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
    // download_url do Asana é assinada e EXPIRA. Por isso o download acontece
    // durante a execução, logo depois de listar — não numa etapa futura.
    const url = anexo.download_url
    if (!url) return null
    try {
      const resp = await fetch(url, { cache: "no-store" })
      if (!resp.ok) return null
      const buf = await resp.arrayBuffer()
      return {
        bytes: new Uint8Array(buf),
        contentType: resp.headers.get("content-type"),
      }
    } catch {
      return null
    }
  }
}

// =============================================================================
// Implementação por ARQUIVO — replay offline de um snapshot
// =============================================================================

/**
 * Lê um snapshot já extraído (JSON no disco) e serve como se fosse a API.
 *
 * Duas utilidades reais:
 *   • rodar dry-run e normalização quantas vezes quiser sem tocar no Asana;
 *   • caminho de saída se o PAT não estiver disponível — dá pra exportar o
 *     snapshot por outro meio e alimentar o pipeline por aqui.
 *
 * Anexos binários NÃO existem neste modo (não há URL válida), então
 * baixarAnexo devolve null e eles ficam registrados como pendentes.
 */
export class AsanaArquivo implements AsanaSource {
  readonly nome = "asana-arquivo"
  private snap: SnapshotAsana

  constructor(snapshot: SnapshotAsana) {
    this.snap = snapshot
  }

  static deJSON(texto: string): AsanaArquivo {
    const bruto = JSON.parse(texto) as Partial<SnapshotAsana>
    return new AsanaArquivo({
      lidoEm: bruto.lidoEm ?? new Date().toISOString(),
      workspaces: bruto.workspaces ?? [],
      equipes: bruto.equipes ?? [],
      usuarios: bruto.usuarios ?? [],
      projetos: bruto.projetos ?? [],
      secoes: bruto.secoes ?? [],
      camposDefinicoes: bruto.camposDefinicoes ?? [],
      camposPorProjeto: bruto.camposPorProjeto ?? {},
      tarefas: bruto.tarefas ?? [],
      subtarefas: bruto.subtarefas ?? [],
      comentariosPorTarefa: bruto.comentariosPorTarefa ?? {},
      anexos: bruto.anexos ?? [],
    })
  }

  async workspaces() { return this.snap.workspaces }
  async equipes() { return this.snap.equipes }
  async usuarios() { return this.snap.usuarios }
  async projetos() { return this.snap.projetos }
  async projeto(gid: string) {
    return this.snap.projetos.find((p) => p.gid === gid) ?? null
  }
  async secoes(projetoGid: string) {
    return this.snap.secoes.filter((s) => s.project?.gid === projetoGid)
  }
  async tarefasDoProjeto(projetoGid: string) {
    return this.snap.tarefas.filter((t) =>
      (t.memberships ?? []).some((m) => m.project?.gid === projetoGid) ||
      (t.projects ?? []).some((p) => p.gid === projetoGid)
    )
  }
  async tarefa(gid: string) {
    return (
      this.snap.tarefas.find((t) => t.gid === gid) ??
      this.snap.subtarefas.find((t) => t.gid === gid) ??
      null
    )
  }
  async subtarefas(tarefaGid: string) {
    return this.snap.subtarefas.filter((s) => s.parent?.gid === tarefaGid)
  }
  async comentarios(tarefaGid: string) {
    return this.snap.comentariosPorTarefa[tarefaGid] ?? []
  }
  async anexosDe(objetoGid: string) {
    return this.snap.anexos.filter((a) => a.parent?.gid === objetoGid)
  }
  async baixarAnexo() {
    return null
  }
}

/** Constrói a origem a partir do ambiente. Token nunca sai do servidor. */
export function criarSourceDoAmbiente(
  aoProgredir?: (m: string) => void
): AsanaSource | null {
  const token = process.env.ASANA_PAT
  if (!token) return null
  return new AsanaRest({ token, aoProgredir })
}
