"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { criarAbaAction, excluirAbaAction, renomearAbaAction } from "@/lib/workspace-actions"
import type { Aba, TipoAba } from "@/lib/workspace-tipos"
import PresencaWorkspace from "./PresencaWorkspace"

const FIXAS: { rotulo: string; href: string; matchExact?: boolean }[] = [
  { rotulo: "Lista", href: "/dashboard/workspace", matchExact: true },
  { rotulo: "Calendário", href: "/dashboard/workspace/calendario" },
  { rotulo: "Clientes", href: "/dashboard/workspace/clientes" },
  { rotulo: "Minhas", href: "/dashboard/workspace/minhas" },
  { rotulo: "Arquivos", href: "/dashboard/workspace/arquivos" },
]

/**
 * Cabeçalho do Workspace no desenho do Asana: ícone do projeto, título e a
 * régua de abas sublinhadas. As cinco primeiras abas são FIXAS (código — não
 * há como excluir); depois vêm as abas criadas pelo time, o "+" que cria aba
 * nova (calendário ou nota), o lápis que renomeia/exclui SÓ as criadas, e a
 * engrenagem de Configurações à direita.
 */
export default function WorkspaceNav({
  abas = [],
  presenca,
}: {
  abas?: Aba[]
  /** Quem sou eu — liga as bolinhas de usuários ativos no canto direito. */
  presenca?: { id: string; nome: string; foto?: string | null }
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [gerenciando, setGerenciando] = useState(false)
  const [nomeNova, setNomeNova] = useState("")
  const [tipoNova, setTipoNova] = useState<TipoAba>("misto")

  function criar() {
    const nome = nomeNova.trim()
    if (!nome) return
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("nome", nome)
      fd.set("tipo", tipoNova)
      const r = await criarAbaAction(fd)
      if (!r.ok || !r.id) {
        setErro(r.erro ?? "Não foi possível criar a aba.")
        return
      }
      setNomeNova("")
      setCriando(false)
      router.push(`/dashboard/workspace/t/${r.id}`)
      router.refresh()
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0 8px" }}>
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: "#cf9338",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e1f21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "var(--text-1)" }}>
          Workspace
        </h1>
        {erro && <span style={{ fontSize: 11, color: "#e24b4a" }}>{erro}</span>}
        <span style={{ flex: 1 }} />
        {presenca && (
          <PresencaWorkspace
            meuId={presenca.id}
            meuNome={presenca.nome}
            minhaFoto={presenca.foto}
          />
        )}
      </div>

      <nav
        style={{
          display: "flex",
          gap: 2,
          flexWrap: "wrap",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {FIXAS.map((item) => {
          const ativo = item.matchExact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={estiloAba(ativo)}>
              {item.rotulo}
            </Link>
          )
        })}

        {abas.map((a) => {
          const href = `/dashboard/workspace/t/${a.id}`
          return (
            <Link key={a.id} href={href} style={estiloAba(pathname.startsWith(href))}>
              {a.nome}
            </Link>
          )
        })}

        {/* + nova aba */}
        <button
          type="button"
          onClick={() => {
            setCriando((v) => !v)
            setGerenciando(false)
          }}
          aria-label="Nova aba"
          title="Nova aba"
          className="no-ds ws-btn-icone"
          style={{ width: 26, height: 26 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* lápis: gerenciar abas criadas */}
        {abas.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setGerenciando((v) => !v)
              setCriando(false)
            }}
            aria-label="Editar abas criadas"
            title="Renomear ou excluir abas criadas"
            className="no-ds ws-btn-icone"
            style={{ width: 26, height: 26 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </button>
        )}

        <span style={{ flex: 1 }} />

        <Link
          href="/dashboard/workspace/config"
          aria-label="Configurações do Workspace"
          title="Configurações"
          className="ws-btn-icone"
          style={{
            textDecoration: "none",
            color: pathname.startsWith("/dashboard/workspace/config")
              ? "var(--text-1)"
              : "var(--text-3)",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </nav>

      {/* Formulário "+ nova aba" */}
      {criando && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "10px 0",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <input
            autoFocus
            type="text"
            value={nomeNova}
            onChange={(e) => setNomeNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") criar()
              if (e.key === "Escape") setCriando(false)
            }}
            placeholder="Nome da aba (ex: Aulas)"
            maxLength={60}
            className="glass-input"
            style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, flex: "1 1 180px" }}
            disabled={pending}
          />
          <select
            value={tipoNova}
            onChange={(e) => {
              const v = e.target.value
              setTipoNova(v === "nota" || v === "calendario" ? v : "misto")
            }}
            className="glass-input"
            style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8 }}
            disabled={pending}
          >
            <option value="misto" style={{ color: "#111" }}>Calendário + notas</option>
            <option value="calendario" style={{ color: "#111" }}>Só calendário</option>
            <option value="nota" style={{ color: "#111" }}>Só notas</option>
          </select>
          <button
            type="button"
            onClick={criar}
            disabled={pending || !nomeNova.trim()}
            className="no-ds"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "7px 16px",
              borderRadius: 6,
              background: "#4573d2",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              opacity: pending || !nomeNova.trim() ? 0.5 : 1,
            }}
          >
            Criar aba
          </button>
        </div>
      )}

      {/* Gerenciar abas criadas (renomear / excluir) */}
      {gerenciando && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "10px 0",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
            As abas Lista, Calendário, Clientes, Minhas e Arquivos são
            fixas do sistema. Aqui você edita só as criadas pelo time.
          </p>
          {abas.map((a) => (
            <LinhaAba key={a.id} aba={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function estiloAba(ativo: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    fontSize: 13,
    fontWeight: ativo ? 600 : 400,
    color: ativo ? "var(--text-1)" : "var(--text-3)",
    textDecoration: "none",
    borderBottom: ativo ? "2px solid var(--text-1)" : "2px solid transparent",
    marginBottom: -1,
    transition: "color 0.15s ease",
  }
}

function LinhaAba({ aba }: { aba: Aba }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [nome, setNome] = useState(aba.nome)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  function renomear() {
    const n = nome.trim()
    if (!n || n === aba.nome) return
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", aba.id)
      fd.set("nome", n)
      const r = await renomearAbaAction(fd)
      if (!r.ok) setErro(r.erro ?? "Falhou")
      else router.refresh()
    })
  }

  function excluir() {
    setErro(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", aba.id)
      const r = await excluirAbaAction(fd)
      if (!r.ok) setErro(r.erro ?? "Falhou")
      else router.refresh()
    })
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, color: "var(--text-4)", width: 90 }}>
        {aba.tipo === "calendario"
          ? "Calendário"
          : aba.tipo === "misto"
            ? "Calend.+notas"
            : "Notas"}
      </span>
      <input
        type="text"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={renomear}
        onKeyDown={(e) => e.key === "Enter" && renomear()}
        maxLength={60}
        className="glass-input"
        style={{ fontSize: 12, padding: "5px 9px", borderRadius: 6, flex: "1 1 160px" }}
        disabled={pending}
      />
      {confirmando ? (
        <>
          <button type="button" onClick={excluir} disabled={pending} className="no-ds" style={botaoPerigo}>
            Confirmar exclusão
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="no-ds"
            style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
          >
            Cancelar
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirmando(true)} disabled={pending} className="no-ds" style={botaoPerigo}>
          Excluir
        </button>
      )}
      {erro && <span style={{ fontSize: 10, color: "#e24b4a" }}>{erro}</span>}
    </div>
  )
}

const botaoPerigo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid rgba(226,75,74,0.4)",
  background: "transparent",
  color: "#e24b4a",
  cursor: "pointer",
}
