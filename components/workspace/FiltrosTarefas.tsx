"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import type { Contexto } from "@/lib/workspace-tipos"

/**
 * Filtros da lista. Todo estado vive na URL (não no client), porque:
 *   • a consulta é feita no SERVIDOR e paginada — filtrar no browser exigiria
 *     baixar a tabela inteira;
 *   • o link fica compartilhável ("as atrasadas do Pedro");
 *   • abrir e fechar o detalhe da tarefa não perde o filtro.
 *
 * A busca tem debounce de 400ms — sem ele, cada tecla viraria uma consulta.
 */
export default function FiltrosTarefas({
  contextos,
  usuarios,
  mostrarAgrupamento = true,
  mostrarBusca = true,
  situacaoPadrao = "pendentes",
  rotuloContexto = "Contexto",
  placeholderBusca = "Título ou descrição…",
}: {
  contextos: Contexto[]
  usuarios: { id: string; nome: string }[]
  mostrarAgrupamento?: boolean
  /** false no calendário: a consulta de lá não usa busca textual. */
  mostrarBusca?: boolean
  /** O que a página assume quando a URL não tem ?situacao. A lista assume
   *  'pendentes'; o calendário assume 'todas' (concluídas aparecem com ✓,
   *  como no Asana). O seletor precisa refletir o MESMO padrão da consulta,
   *  senão ele mostra um valor e a página filtra por outro. */
  situacaoPadrao?: "pendentes" | "todas"
  /** Rótulo do seletor de contexto — o calendário chama de "Cliente". */
  rotuloContexto?: string
  placeholderBusca?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [busca, setBusca] = useState(searchParams.get("q") ?? "")
  const primeiroRender = useRef(true)

  function aplicar(mudancas: Record<string, string>) {
    const qs = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === "") qs.delete(k)
      else qs.set(k, v)
    }
    // Trocar filtro sempre volta pra primeira página e fecha o detalhe aberto
    // (a tarefa pode nem existir no novo recorte).
    qs.delete("pagina")
    qs.delete("tarefa")
    const s = qs.toString()
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false })
  }

  useEffect(() => {
    if (primeiroRender.current) {
      primeiroRender.current = false
      return
    }
    const t = setTimeout(() => aplicar({ q: busca.trim() }), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const situacao = searchParams.get("situacao") ?? situacaoPadrao
  const responsavel = searchParams.get("responsavel") ?? ""
  const contexto = searchParams.get("contexto") ?? ""
  const agrupar = searchParams.get("agrupar") ?? "prazo"
  const soAtrasadas = searchParams.get("atrasadas") === "1"

  return (
    // Uma faixa só, alinhada ao centro: o rótulo mora DENTRO do seletor
    // ("Cliente: Todos"), o que economiza a linha inteira que a label
    // empilhada ocupava — mais altura sobra pra lista de tarefas.
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {mostrarBusca && (
        <input
          type="search"
          aria-label="Buscar"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholderBusca}
          className="glass-input"
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 7,
            flex: "1 1 170px",
            minWidth: 0,
            maxWidth: 280,
          }}
        />
      )}

      <Seletor
        rotulo="Situação"
        valor={situacao}
        onChange={(v) => aplicar({ situacao: v === situacaoPadrao ? "" : v })}
        opcoes={
          situacaoPadrao === "todas"
            ? [
                { valor: "todas", texto: "Todas" },
                { valor: "pendentes", texto: "Pendentes" },
              ]
            : [
                { valor: "pendentes", texto: "Pendentes" },
                { valor: "concluidas", texto: "Concluídas" },
                { valor: "todas", texto: "Todas" },
              ]
        }
      />

      <Seletor
        rotulo="Responsável"
        valor={responsavel}
        onChange={(v) => aplicar({ responsavel: v })}
        opcoes={[
          { valor: "", texto: "Todos" },
          ...usuarios.map((u) => ({ valor: u.id, texto: u.nome })),
        ]}
      />

      <Seletor
        rotulo={rotuloContexto}
        valor={contexto}
        onChange={(v) => aplicar({ contexto: v })}
        opcoes={[
          { valor: "", texto: "Todos" },
          ...contextos.map((c) => ({ valor: c.id, texto: c.nome })),
        ]}
      />

      {mostrarAgrupamento && (
        <Seletor
          rotulo="Agrupar por"
          valor={agrupar}
          onChange={(v) => aplicar({ agrupar: v === "prazo" ? "" : v })}
          opcoes={[
            { valor: "prazo", texto: "Prazo" },
            { valor: "responsavel", texto: "Responsável" },
            { valor: "contexto", texto: "Contexto" },
            { valor: "nenhum", texto: "Sem agrupar" },
          ]}
        />
      )}

      <button
        type="button"
        onClick={() => aplicar({ atrasadas: soAtrasadas ? "" : "1" })}
        className="no-ds"
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "6px 11px",
          borderRadius: 7,
          border: `1px solid ${soAtrasadas ? "#e24b4a" : "rgba(255,255,255,0.1)"}`,
          background: soAtrasadas ? "rgba(226,75,74,0.12)" : "transparent",
          color: soAtrasadas ? "#e24b4a" : "var(--text-3)",
          cursor: "pointer",
        }}
      >
        Só atrasadas
      </button>
    </div>
  )
}

/**
 * Seletor compacto: o rótulo vai DENTRO do texto da opção ("Cliente: Todos"),
 * então não existe label empilhada e a faixa de filtros tem uma linha só.
 * aria-label mantém o nome do campo para leitor de tela.
 */
function Seletor({
  rotulo,
  valor,
  onChange,
  opcoes,
}: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  opcoes: { valor: string; texto: string }[]
}) {
  return (
    <select
      aria-label={rotulo}
      title={rotulo}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="glass-input"
      style={{
        fontSize: 12,
        padding: "6px 8px",
        borderRadius: 7,
        maxWidth: 190,
      }}
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor} style={{ color: "#111" }}>
          {rotulo}: {o.texto}
        </option>
      ))}
    </select>
  )
}
