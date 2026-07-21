import LinhaTarefa from "./LinhaTarefa"
import type { TarefaComRelacoes } from "@/lib/workspace-tipos"
import { situacaoPrazo } from "@/lib/workspace-datas"

export type Agrupamento = "prazo" | "responsavel" | "contexto" | "nenhum"

/**
 * Lista agrupada. Server Component: só arruma os dados que a página já
 * buscou e delega cada linha ao client (LinhaTarefa cuida da conclusão).
 *
 * A ordem dentro de cada grupo já vem do servidor (prazo asc, sem prazo por
 * último) — aqui não se reordena nada, só se separa em seções.
 */
export default function ListaTarefas({
  tarefas,
  hoje,
  agrupar = "prazo",
  vazio = "Nenhuma tarefa por aqui.",
}: {
  tarefas: TarefaComRelacoes[]
  hoje: string
  agrupar?: Agrupamento
  vazio?: string
}) {
  if (tarefas.length === 0) {
    return (
      <div
        className="glass"
        style={{
          padding: "28px 16px",
          borderRadius: 12,
          textAlign: "center",
          fontSize: 12,
          color: "var(--text-4)",
        }}
      >
        {vazio}
      </div>
    )
  }

  const grupos = agruparTarefas(tarefas, agrupar, hoje)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {grupos.map((g) => (
        <section key={g.chave} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {agrupar !== "nenhum" && (
            <header
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 2px 2px",
              }}
            >
              <span
                className="ds-label"
                style={{ fontSize: 11, color: g.cor ?? "var(--text-3)", fontWeight: 700 }}
              >
                {g.titulo}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-4)" }}>
                {g.tarefas.length}
              </span>
            </header>
          )}
          {g.tarefas.map((t) => (
            <LinhaTarefa key={t.id} tarefa={t} hoje={hoje} />
          ))}
        </section>
      ))}
    </div>
  )
}

interface Grupo {
  chave: string
  titulo: string
  cor?: string
  tarefas: TarefaComRelacoes[]
}

function agruparTarefas(
  tarefas: TarefaComRelacoes[],
  agrupar: Agrupamento,
  hoje: string
): Grupo[] {
  if (agrupar === "nenhum") {
    return [{ chave: "todas", titulo: "Todas", tarefas }]
  }

  if (agrupar === "prazo") {
    // Ordem fixa e semântica — atrasadas primeiro, sem prazo por último.
    const ordem: { chave: string; titulo: string; cor?: string }[] = [
      { chave: "atrasada", titulo: "Atrasadas", cor: "#e24b4a" },
      { chave: "hoje", titulo: "Hoje", cor: "var(--accent)" },
      { chave: "amanha", titulo: "Amanhã" },
      { chave: "proximos_7", titulo: "Próximos 7 dias" },
      { chave: "futura", titulo: "Depois" },
      { chave: "sem_prazo", titulo: "Sem prazo" },
    ]
    const mapa = new Map<string, TarefaComRelacoes[]>()
    for (const t of tarefas) {
      // Concluída não é "atrasada" — sai do balde de urgência e cai em Depois.
      const s = t.concluida_em ? "futura" : situacaoPrazo(t.prazo_em, hoje)
      const lista = mapa.get(s) ?? []
      lista.push(t)
      mapa.set(s, lista)
    }
    return ordem
      .filter((o) => (mapa.get(o.chave) ?? []).length > 0)
      .map((o) => ({ ...o, tarefas: mapa.get(o.chave)! }))
  }

  if (agrupar === "responsavel") {
    const mapa = new Map<string, { titulo: string; tarefas: TarefaComRelacoes[] }>()
    for (const t of tarefas) {
      const chave = t.responsavel_id ?? "__sem__"
      const titulo = t.responsavel_nome ?? "Sem responsável"
      const g = mapa.get(chave) ?? { titulo, tarefas: [] }
      g.tarefas.push(t)
      mapa.set(chave, g)
    }
    return [...mapa.entries()]
      .sort((a, b) => a[1].titulo.localeCompare(b[1].titulo, "pt-BR"))
      .map(([chave, g]) => ({ chave, titulo: g.titulo, tarefas: g.tarefas }))
  }

  // contexto: uma tarefa em N contextos aparece em N grupos — é a
  // representação honesta do modelo (uma linha só, várias visões).
  const mapa = new Map<string, { titulo: string; cor?: string; tarefas: TarefaComRelacoes[] }>()
  for (const t of tarefas) {
    if (t.contextos.length === 0) {
      const g = mapa.get("__sem__") ?? { titulo: "Sem contexto", tarefas: [] }
      g.tarefas.push(t)
      mapa.set("__sem__", g)
      continue
    }
    for (const c of t.contextos) {
      const g = mapa.get(c.id) ?? { titulo: c.nome, cor: c.cor ?? undefined, tarefas: [] }
      g.tarefas.push(t)
      mapa.set(c.id, g)
    }
  }
  return [...mapa.entries()]
    .sort((a, b) => a[1].titulo.localeCompare(b[1].titulo, "pt-BR"))
    .map(([chave, g]) => ({ chave, titulo: g.titulo, cor: g.cor, tarefas: g.tarefas }))
}
