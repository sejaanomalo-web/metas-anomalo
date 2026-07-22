"use client"

import { useState, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { alternarConclusaoAction } from "@/lib/workspace-actions"
import { corDoContexto, type TarefaComRelacoes } from "@/lib/workspace-tipos"
import { corDaTarefa } from "@/lib/workspace-cores"
import { descricaoResumida } from "@/lib/workspace-markdown"
import { rotuloPrazo, situacaoPrazo } from "@/lib/workspace-datas"
import Avatar from "./Avatar"

/** #rrggbb → rgba com alpha — tinta de fundo da linha na cor do cliente. */
function tinta(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * Uma linha da lista de tarefas.
 *
 * O checkbox é OTIMISTA: marca na hora e, se o Supabase recusar, volta ao
 * estado anterior e mostra o erro. Nunca mostra sucesso antes da confirmação
 * — é a regra que impede "marquei como feito e no dia seguinte tinha sumido".
 *
 * Abrir a tarefa é navegação (?tarefa=<id>), não estado de client: assim o
 * detalhe vem renderizado do servidor com dado fresco, o link é compartilhável
 * e voltar/fechar preserva a posição e os filtros da URL.
 */
export default function LinhaTarefa({
  tarefa,
  hoje,
  compacta,
}: {
  tarefa: TarefaComRelacoes
  hoje: string
  compacta?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [concluidaLocal, setConcluidaLocal] = useState(Boolean(tarefa.concluida_em))
  const [erro, setErro] = useState<string | null>(null)

  const situacao = situacaoPrazo(tarefa.prazo_em, hoje)
  const atrasada = situacao === "atrasada" && !concluidaLocal
  const resumo = descricaoResumida(tarefa.descricao, 90)
  // A linha carrega a cor do CLIENTE (tinta suave + barra à esquerda) — em
  // Lista e Minhas a tarefa se identifica pela cor, não pelo preto genérico.
  const corCliente = corDaTarefa(tarefa.contextos)

  function alternar() {
    const alvo = !concluidaLocal
    setConcluidaLocal(alvo) // otimista
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", tarefa.id)
      fd.set("concluir", alvo ? "1" : "0")
      const r = await alternarConclusaoAction(fd)
      if (!r.ok) {
        setConcluidaLocal(!alvo) // reverte
        setErro(r.erro ?? "Não foi possível salvar.")
        return
      }
      router.refresh()
    })
  }

  function abrir() {
    const qs = new URLSearchParams(searchParams.toString())
    qs.set("tarefa", tarefa.id)
    router.push(`${pathname}?${qs.toString()}`, { scroll: false })
  }

  return (
    <div
      className="glass glass-hover"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: compacta ? "8px 10px" : "10px 12px",
        borderRadius: 10,
        opacity: pending ? 0.6 : 1,
        transition: "opacity 0.15s ease",
        ...(corCliente
          ? {
              background: tinta(corCliente, 0.16),
              borderLeft: `3px solid ${corCliente}`,
            }
          : {}),
      }}
    >
      <button
        type="button"
        onClick={alternar}
        disabled={pending}
        aria-label={concluidaLocal ? "Reabrir tarefa" : "Concluir tarefa"}
        aria-pressed={concluidaLocal}
        className="no-ds"
        style={{
          // Círculo de conclusão do Asana: redondo, verde quando feito.
          flexShrink: 0,
          width: 18,
          height: 18,
          marginTop: 2,
          borderRadius: "50%",
          border: `1.5px solid ${concluidaLocal ? "#5da283" : "var(--text-4)"}`,
          background: concluidaLocal ? "#5da283" : "transparent",
          cursor: pending ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={concluidaLocal ? "#fff" : "var(--text-4)"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: concluidaLocal ? 1 : 0.5 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>

      <button
        type="button"
        onClick={abrir}
        className="no-ds"
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "inherit",
        }}
      >
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: concluidaLocal ? "var(--text-4)" : "var(--text-1)",
            textDecoration: concluidaLocal ? "line-through" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {tarefa.titulo}
        </span>

        {!compacta && resumo && (
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: "var(--text-4)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {resumo}
          </span>
        )}

        <span
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 5,
          }}
        >
          {tarefa.prazo_em || atrasada ? (
            <ChipPrazo
              rotulo={rotuloPrazo(tarefa.prazo_em, hoje)}
              hora={tarefa.prazo_hora}
              atrasada={atrasada}
              hoje={situacao === "hoje" && !concluidaLocal}
            />
          ) : null}

          {tarefa.responsavel_nome && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Avatar nome={tarefa.responsavel_nome} tamanho={16} />
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                {tarefa.responsavel_nome}
              </span>
            </span>
          )}

          {tarefa.contextos.map((c) => (
            <Chip key={c.id} texto={c.nome} cor={corDoContexto(c)} />
          ))}

          {tarefa.subtarefas_total > 0 && (
            <Chip
              texto={`${tarefa.subtarefas_concluidas}/${tarefa.subtarefas_total} subtarefas`}
            />
          )}

          {tarefa.comentarios_total > 0 && (
            <Chip texto={`${tarefa.comentarios_total} comentário${tarefa.comentarios_total === 1 ? "" : "s"}`} />
          )}

          {tarefa.prioridade === "alta" && <Chip texto="Alta" cor="#e0a458" />}
        </span>

        {erro && (
          <span style={{ display: "block", fontSize: 11, color: "#e24b4a", marginTop: 4 }}>
            {erro}
          </span>
        )}
      </button>
    </div>
  )
}

function Chip({ texto, cor }: { texto: string; cor?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        padding: "2px 7px",
        borderRadius: 999,
        background: "var(--surface-3)",
        color: "var(--text-3)",
        whiteSpace: "nowrap",
      }}
    >
      {cor && (
        // Quadradinho arredondado, como o chip de projeto do Asana.
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: 2, background: cor, flexShrink: 0 }}
        />
      )}
      {texto}
    </span>
  )
}

/**
 * Chip de prazo. Atrasada/hoje têm cor E texto ("Atrasada 3 dias") — cor
 * sozinha não comunica nada para quem não distingue vermelho de verde.
 */
function ChipPrazo({
  rotulo,
  hora,
  atrasada,
  hoje,
}: {
  rotulo: string
  hora: string | null
  atrasada: boolean
  hoje: boolean
}) {
  const cor = atrasada ? "#e24b4a" : hoje ? "var(--accent)" : "var(--text-3)"
  const fundo = atrasada
    ? "rgba(226,75,74,0.12)"
    : hoje
      ? "rgba(201,149,58,0.14)"
      : "var(--surface-3)"
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: atrasada || hoje ? 700 : 500,
        padding: "2px 7px",
        borderRadius: 999,
        background: fundo,
        color: cor,
        whiteSpace: "nowrap",
      }}
    >
      {rotulo}
      {hora ? ` · ${hora.slice(0, 5)}` : ""}
    </span>
  )
}
