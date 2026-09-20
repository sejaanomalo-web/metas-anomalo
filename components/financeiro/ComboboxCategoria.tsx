"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { criarCategoriaRapidaAction } from "@/lib/financeiro-actions"
import { corDaCategoria, type TipoLancamento } from "@/lib/financeiro-regras"
import type { CategoriaFinanceira } from "@/lib/financeiro"

/**
 * Seletor de categoria com busca, que cria na hora o que não existe.
 *
 * O motivo de não ser um `<select>`: na hora de lançar uma despesa, a pessoa
 * já sabe o nome da categoria que quer. Se ela não existir, abandonar o
 * formulário, ir até a aba Categorias, criar, voltar e redigitar tudo é
 * fricção suficiente pra que o lançamento acabe sem categoria — e categoria
 * vazia é o que esvazia o DRE.
 *
 * "+ Criar X" só aparece quando não há correspondência EXATA (ignorando
 * maiúsculas). Se já existe "Aluguel" e a pessoa digita "aluguel", a opção de
 * criar não aparece: ela seleciona a que existe.
 */
export default function ComboboxCategoria({
  categorias,
  tipo,
  valor,
  onChange,
  name = "categoria_id",
}: {
  /** Todas as categorias; a filtragem por tipo/ativa é feita aqui. */
  categorias: CategoriaFinanceira[]
  tipo: TipoLancamento
  valor: string
  onChange: (id: string) => void
  name?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState("")
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  /** Categoria criada nesta sessão do formulário: a página só recebe a lista
   *  nova depois do refresh, e até lá o nome precisa aparecer selecionado. */
  const [criada, setCriada] = useState<CategoriaFinanceira | null>(null)
  const caixaRef = useRef<HTMLDivElement>(null)

  const disponiveis = useMemo(() => {
    const base = categorias.filter((c) => c.tipo === tipo && c.ativa)
    if (criada && criada.tipo === tipo && !base.some((c) => c.id === criada.id)) {
      return [criada, ...base]
    }
    return base
  }, [categorias, tipo, criada])

  const selecionada = disponiveis.find((c) => c.id === valor) ?? null

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return disponiveis
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(termo))
  }, [disponiveis, busca])

  const termo = busca.trim()
  const temExata = disponiveis.some(
    (c) => c.nome.trim().toLowerCase() === termo.toLowerCase()
  )
  const podeCriar = termo.length >= 2 && !temExata

  // Fecha ao clicar fora. Sem isso, a lista fica aberta por cima dos campos
  // seguintes do formulário.
  useEffect(() => {
    if (!aberto) return
    function aoClicar(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", aoClicar)
    return () => document.removeEventListener("mousedown", aoClicar)
  }, [aberto])

  function selecionar(id: string) {
    onChange(id)
    setBusca("")
    setAberto(false)
    setErro(null)
  }

  function criar() {
    setErro(null)
    startTransition(async () => {
      const r = await criarCategoriaRapidaAction(termo, tipo)
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível criar a categoria.")
        return
      }
      setCriada({
        id: r.id,
        nome: r.nome ?? termo,
        tipo,
        parent_id: null,
        cor: r.cor ?? "",
        ativa: true,
        ordem: 0,
      })
      selecionar(r.id)
    })
  }

  return (
    <div ref={caixaRef} style={{ position: "relative" }}>
      <input type="hidden" name={name} value={valor} />

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="glass-input"
        style={{
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {selecionada ? (
          <>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: corDaCategoria(selecionada),
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1 }}>{selecionada.nome}</span>
          </>
        ) : (
          <span style={{ flex: 1, color: "var(--text-3)" }}>· Sem categoria ·</span>
        )}
        <span style={{ color: "var(--text-3)", fontSize: 10 }}>▾</span>
      </button>

      {aberto && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            background: "var(--surface-1)",
            border: "0.5px solid rgba(255,255,255,0.14)",
            borderRadius: 8,
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >
          <input
            type="text"
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar ou criar…"
            className="glass-input"
            style={{ width: "100%", borderRadius: 0, border: "none", borderBottom: "1px solid var(--border)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (filtradas.length > 0) selecionar(filtradas[0].id)
                else if (podeCriar) criar()
              }
              if (e.key === "Escape") setAberto(false)
            }}
          />

          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            <Opcao onClick={() => selecionar("")}>
              <span style={{ color: "var(--text-3)" }}>· Sem categoria ·</span>
            </Opcao>

            {filtradas.map((c) => (
              <Opcao key={c.id} onClick={() => selecionar(c.id)} ativo={c.id === valor}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: corDaCategoria(c),
                    flexShrink: 0,
                  }}
                />
                {c.nome}
              </Opcao>
            ))}

            {podeCriar && (
              <Opcao onClick={criar} destaque>
                {pending ? "Criando…" : `+ Criar categoria "${termo}"`}
              </Opcao>
            )}

            {filtradas.length === 0 && !podeCriar && (
              <p style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-3)" }}>
                Nenhuma categoria de {tipo === "receita" ? "receita" : "despesa"}.
              </p>
            )}
          </div>

          {erro && (
            <p
              style={{
                padding: "10px 14px",
                fontSize: 12,
                color: "#ef4444",
                borderTop: "1px solid var(--border)",
              }}
            >
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Opcao({
  onClick,
  ativo,
  destaque,
  children,
}: {
  onClick: () => void
  ativo?: boolean
  destaque?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        background: ativo ? "rgba(201,149,58,0.14)" : "transparent",
        border: "none",
        borderTop: "1px solid var(--border)",
        cursor: "pointer",
        fontSize: 13,
        textAlign: "left",
        color: destaque ? "var(--accent)" : "var(--text-1)",
        fontWeight: destaque ? 600 : 400,
      }}
    >
      {children}
    </button>
  )
}
