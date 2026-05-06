"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { EmpresaMeta, TipoFunil } from "@/lib/data"
import {
  atualizarEmpresaAction,
  criarEmpresaAction,
  desativarEmpresaAction,
  excluirEmpresaAction,
  reativarEmpresaAction,
  reordenarEmpresasAction,
} from "@/lib/empresas-actions"

interface Props {
  empresas: EmpresaMeta[]
  empresasInativas: EmpresaMeta[]
  supabaseOk: boolean
}

const TIPOS: { chave: TipoFunil; label: string; hint: string }[] = [
  {
    chave: "leads-reunioes-contratos",
    label: "Leads · Reuniões · Contratos",
    hint: "funil padrão de agência",
  },
  { chave: "aton", label: "Leads · Orçamentos · Vendas", hint: "estilo Aton" },
  {
    chave: "hato",
    label: "Influenciadores · Vendas",
    hint: "estilo Hato",
  },
  { chave: "diego", label: "Participação no faturamento", hint: "estilo Diego" },
]

export default function DrawerEmpresas({
  empresas,
  empresasInativas,
  supabaseOk,
}: Props) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        style={{
          fontSize: 10,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: "#C9953A",
          border: "0.5px solid rgba(201,149,58,0.35)",
          padding: "6px 14px",
          borderRadius: 6,
          fontWeight: 500,
        }}
        className="hover:bg-[rgba(201,149,58,0.08)] transition"
      >
        Gerenciar empresas
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            className="absolute inset-0"
            style={{
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
            }}
          />

          <aside
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto"
            style={{
              background: "rgba(15,15,15,0.92)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderLeft: "0.5px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="sticky top-0"
              style={{
                background: "rgba(10,10,10,0.75)",
                backdropFilter: "blur(16px)",
                borderBottom: "0.5px solid rgba(255,255,255,0.06)",
                padding: "18px 24px",
                zIndex: 5,
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    style={{
                      fontSize: 9,
                      letterSpacing: "2px",
                      color: "rgba(255,255,255,0.35)",
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    Empresas do Hub
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      color: "#ffffff",
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    Gerenciar
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 22,
                    lineHeight: 1,
                  }}
                  className="hover:text-white transition"
                >
                  ×
                </button>
              </div>
            </div>

            {!supabaseOk && (
              <div
                style={{
                  margin: "16px 24px 0",
                  padding: 12,
                  border: "0.5px solid rgba(226,75,74,0.35)",
                  background: "rgba(226,75,74,0.08)",
                  color: "#e24b4a",
                  fontSize: 12,
                  borderRadius: 8,
                }}
              >
                Supabase não configurado — CRUD de empresas indisponível.
              </div>
            )}

            <div style={{ padding: 24 }}>
              <Conteudo
                empresas={empresas}
                empresasInativas={empresasInativas}
                supabaseOk={supabaseOk}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}

function Conteudo({
  empresas,
  empresasInativas,
  supabaseOk,
}: {
  empresas: EmpresaMeta[]
  empresasInativas: EmpresaMeta[]
  supabaseOk: boolean
}) {
  const [formAberto, setFormAberto] = useState(false)
  const [inativosAbertos, setInativosAbertos] = useState(false)
  const [editando, setEditando] = useState<EmpresaMeta | null>(null)
  const [modalExcluir, setModalExcluir] = useState<EmpresaMeta | null>(null)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!formAberto && !editando && (
        <button
          type="button"
          onClick={() => setFormAberto(true)}
          disabled={!supabaseOk}
          className="btn-gold-filled uppercase"
          style={{
            width: "100%",
            padding: "12px 16px",
            opacity: supabaseOk ? 1 : 0.5,
          }}
        >
          + Adicionar empresa
        </button>
      )}

      {(formAberto || editando) && (
        <FormEmpresa
          empresa={editando}
          onClose={() => {
            setFormAberto(false)
            setEditando(null)
          }}
        />
      )}

      <SecaoListaEmpresas
        titulo="Ativas"
        empresas={empresas}
        onEditar={(e) => {
          setEditando(e)
          setFormAberto(false)
        }}
        onSolicitarExcluir={(e) => setModalExcluir(e)}
        supabaseOk={supabaseOk}
        reordenavel
      />

      {empresasInativas.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setInativosAbertos((v) => !v)}
            className="flex items-center gap-2"
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            Inativas ({empresasInativas.length})
            <span
              style={{
                display: "inline-block",
                transform: inativosAbertos
                  ? "rotate(180deg)"
                  : "rotate(0)",
                transition: "transform 0.2s ease",
              }}
            >
              ▾
            </span>
          </button>
          {inativosAbertos && (
            <ListaEmpresas
              empresas={empresasInativas}
              inativa
              onEditar={(e) => setEditando(e)}
              onSolicitarExcluir={(e) => setModalExcluir(e)}
              supabaseOk={supabaseOk}
            />
          )}
        </div>
      )}

      {modalExcluir && (
        <ModalExcluirEmpresa
          empresa={modalExcluir}
          onCancel={() => setModalExcluir(null)}
          onSuccess={() => setModalExcluir(null)}
        />
      )}
    </div>
  )
}

function FormEmpresa({
  empresa,
  onClose,
}: {
  empresa: EmpresaMeta | null
  onClose: () => void
}) {
  const editando = Boolean(empresa)
  const [nome, setNome] = useState(empresa?.nome ?? "")
  const [tipo, setTipo] = useState<TipoFunil>(
    empresa?.tipo ?? "leads-reunioes-contratos"
  )
  const [subtitulo, setSubtitulo] = useState(empresa?.subtitulo ?? "")
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  async function salvar() {
    const fd = new FormData()
    fd.set("nome", nome)
    fd.set("tipo", tipo)
    fd.set("subtitulo", subtitulo)
    let r
    if (editando) {
      fd.set("id", empresa?.id ?? "")
      r = await atualizarEmpresaAction(fd)
    } else {
      r = await criarEmpresaAction(fd)
    }
    if (r.ok) {
      setStatus("Salvo ✓")
      router.refresh()
      setTimeout(onClose, 900)
    } else {
      setStatus(r.erro ?? "Erro")
    }
  }

  return (
    <div
      style={{
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
          {editando ? "Editar empresa" : "Adicionar empresa"}
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: 10,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.3)",
          }}
          className="hover:text-[#C9953A] transition"
        >
          Cancelar
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <LabelSmall>Nome</LabelSmall>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Empresa Nova"
            className="glass-input"
            style={{
              marginTop: 6,
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
            }}
          />
        </label>

        <label className="block">
          <LabelSmall>Subtítulo (aparece no card)</LabelSmall>
          <input
            value={subtitulo}
            onChange={(e) => setSubtitulo(e.target.value)}
            placeholder="Ex: Agência de marketing"
            className="glass-input"
            style={{
              marginTop: 6,
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
            }}
          />
        </label>

        <div>
          <LabelSmall>Tipo de funil</LabelSmall>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {TIPOS.map((t) => (
              <label
                key={t.chave}
                className="flex items-center gap-2 cursor-pointer"
                style={{
                  padding: "6px 8px",
                  borderRadius: 6,
                  background:
                    tipo === t.chave
                      ? "rgba(201,149,58,0.08)"
                      : "transparent",
                }}
              >
                <input
                  type="radio"
                  checked={tipo === t.chave}
                  onChange={() => setTipo(t.chave)}
                  style={{ accentColor: "#C9953A" }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color:
                      tipo === t.chave ? "#C9953A" : "rgba(255,255,255,0.75)",
                    fontWeight: tipo === t.chave ? 500 : 400,
                  }}
                >
                  {t.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    fontWeight: 300,
                  }}
                >
                  ({t.hint})
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => startTransition(() => salvar())}
            disabled={pending || !nome.trim()}
            className="btn-gold-filled uppercase"
            style={{
              opacity: pending || !nome.trim() ? 0.5 : 1,
            }}
          >
            {pending ? "Salvando..." : editando ? "Atualizar" : "Criar empresa"}
          </button>
          {status && (
            <span
              style={{
                fontSize: 11,
                color: status.includes("✓") ? "#4caf50" : "#e24b4a",
              }}
            >
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function SecaoListaEmpresas({
  titulo,
  empresas,
  onEditar,
  onSolicitarExcluir,
  supabaseOk,
  reordenavel,
}: {
  titulo: string
  empresas: EmpresaMeta[]
  onEditar: (e: EmpresaMeta) => void
  onSolicitarExcluir: (e: EmpresaMeta) => void
  supabaseOk: boolean
  reordenavel?: boolean
}) {
  if (empresas.length === 0) return null
  return (
    <div>
      <p
        style={{
          fontSize: 9,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: 10,
        }}
      >
        {titulo}
        {reordenavel && (
          <span
            style={{
              marginLeft: 8,
              color: "rgba(255,255,255,0.25)",
              fontWeight: 400,
              letterSpacing: "0.5px",
            }}
          >
            · use ↑↓ para reordenar
          </span>
        )}
      </p>
      <ListaEmpresas
        empresas={empresas}
        onEditar={onEditar}
        onSolicitarExcluir={onSolicitarExcluir}
        supabaseOk={supabaseOk}
        reordenavel={reordenavel}
      />
    </div>
  )
}

function ListaEmpresas({
  empresas,
  inativa,
  onEditar,
  onSolicitarExcluir,
  supabaseOk,
  reordenavel,
}: {
  empresas: EmpresaMeta[]
  inativa?: boolean
  onEditar: (e: EmpresaMeta) => void
  onSolicitarExcluir: (e: EmpresaMeta) => void
  supabaseOk: boolean
  reordenavel?: boolean
}) {
  const [pending, startTransition] = useTransition()
  // Ordem local otimista — começa = empresas (já ordenadas pelo servidor).
  // Ao reordenar, atualizamos isso na hora pra UI responder, e disparamos
  // o action em background; quando o router.refresh() volta com a nova
  // lista do servidor, o useEffect resincroniza.
  const [ordem, setOrdem] = useState<EmpresaMeta[]>(empresas)
  const [salvandoOrdem, setSalvandoOrdem] = useState(false)
  const router = useRouter()

  // Mantém a ordem local em sync quando o servidor atualiza a lista
  // (após reload, criação, edição, desativação, etc.).
  useEffect(() => {
    setOrdem(empresas)
  }, [empresas])

  async function desativar(e: EmpresaMeta) {
    const id = e.id
    if (!id) return
    const fd = new FormData()
    fd.set("id", id)
    const r = await desativarEmpresaAction(fd)
    if (r.ok) router.refresh()
  }

  async function reativar(e: EmpresaMeta) {
    const id = e.id
    if (!id) return
    const fd = new FormData()
    fd.set("id", id)
    const r = await reativarEmpresaAction(fd)
    if (r.ok) router.refresh()
  }

  async function persistirOrdem(novaOrdem: EmpresaMeta[]) {
    const ids = novaOrdem.map((e) => e.id).filter((id): id is string => Boolean(id))
    // Se alguma empresa da lista não tem id (fallback hardcoded sem
    // sincronização com Supabase), aborta a persistência sem reverter
    // a UI — ela ainda é válida visualmente, só não vira durável.
    if (ids.length !== novaOrdem.length) return
    setSalvandoOrdem(true)
    const fd = new FormData()
    fd.set("ids", ids.join(","))
    const r = await reordenarEmpresasAction(fd)
    setSalvandoOrdem(false)
    if (r.ok) router.refresh()
  }

  function mover(index: number, direcao: -1 | 1) {
    const destino = index + direcao
    if (destino < 0 || destino >= ordem.length) return
    const nova = [...ordem]
    ;[nova[index], nova[destino]] = [nova[destino], nova[index]]
    setOrdem(nova)
    persistirOrdem(nova)
  }

  const lista = reordenavel ? ordem : empresas

  return (
    <div className="space-y-2">
      {lista.map((e, idx) => {
        const semId = !e.id
        const podeReordenar = reordenavel && supabaseOk && !semId
        return (
          <div
            key={e.slug}
            className="flex items-center justify-between gap-2"
            style={{
              padding: "10px 12px",
              border: "0.5px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              opacity: inativa ? 0.65 : 1,
            }}
          >
            {reordenavel && (
              <div
                className="flex flex-col items-center justify-center flex-shrink-0"
                style={{ gap: 2 }}
              >
                <button
                  type="button"
                  onClick={() => mover(idx, -1)}
                  disabled={
                    !podeReordenar || idx === 0 || salvandoOrdem || pending
                  }
                  title={
                    semId
                      ? "Rode o schema.sql para sincronizar"
                      : idx === 0
                      ? "Já está no topo"
                      : "Mover para cima"
                  }
                  style={{
                    fontSize: 11,
                    lineHeight: 1,
                    width: 22,
                    height: 18,
                    color:
                      !podeReordenar || idx === 0
                        ? "rgba(255,255,255,0.15)"
                        : "rgba(255,255,255,0.55)",
                    border: "0.5px solid rgba(255,255,255,0.10)",
                    borderRadius: 4,
                    cursor:
                      !podeReordenar || idx === 0 ? "default" : "pointer",
                  }}
                  className="hover:text-[#C9953A] transition"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => mover(idx, 1)}
                  disabled={
                    !podeReordenar ||
                    idx === lista.length - 1 ||
                    salvandoOrdem ||
                    pending
                  }
                  title={
                    semId
                      ? "Rode o schema.sql para sincronizar"
                      : idx === lista.length - 1
                      ? "Já está no fim"
                      : "Mover para baixo"
                  }
                  style={{
                    fontSize: 11,
                    lineHeight: 1,
                    width: 22,
                    height: 18,
                    color:
                      !podeReordenar || idx === lista.length - 1
                        ? "rgba(255,255,255,0.15)"
                        : "rgba(255,255,255,0.55)",
                    border: "0.5px solid rgba(255,255,255,0.10)",
                    borderRadius: 4,
                    cursor:
                      !podeReordenar || idx === lista.length - 1
                        ? "default"
                        : "pointer",
                  }}
                  className="hover:text-[#C9953A] transition"
                >
                  ▼
                </button>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p
                style={{
                  fontSize: 13,
                  color: "#fff",
                  fontWeight: 500,
                }}
                className="truncate"
              >
                {e.nome}
              </p>
              <p
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  fontWeight: 300,
                }}
                className="truncate"
              >
                {e.slug} · {e.tipo}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => onEditar(e)}
                disabled={!supabaseOk || semId}
                title={semId ? "Rode o schema.sql para sincronizar" : "Editar"}
                style={{
                  fontSize: 12,
                  padding: "2px 6px",
                  color: "rgba(255,255,255,0.3)",
                  opacity: !supabaseOk || semId ? 0.3 : 1,
                }}
                className="hover:text-[#C9953A] transition"
              >
                ✎
              </button>
              {inativa ? (
                <button
                  type="button"
                  onClick={() => startTransition(() => reativar(e))}
                  disabled={pending || semId}
                  style={{
                    fontSize: 10,
                    color: "#C9953A",
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    padding: "3px 8px",
                    border: "0.5px solid rgba(201,149,58,0.35)",
                    borderRadius: 4,
                    opacity: semId ? 0.3 : 1,
                  }}
                >
                  Reativar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startTransition(() => desativar(e))}
                  disabled={pending || semId}
                  title={
                    semId ? "Rode o schema.sql para sincronizar" : "Desativar"
                  }
                  style={{
                    fontSize: 12,
                    padding: "2px 6px",
                    color: "rgba(255,255,255,0.2)",
                    opacity: semId ? 0.3 : 1,
                  }}
                  className="hover:text-[#e24b4a] transition"
                >
                  🗑
                </button>
              )}
              <button
                type="button"
                onClick={() => onSolicitarExcluir(e)}
                disabled={!supabaseOk || semId}
                title={
                  semId
                    ? "Rode o schema.sql para sincronizar"
                    : "Excluir permanentemente"
                }
                style={{
                  fontSize: 12,
                  padding: "2px 6px",
                  color: "rgba(255,255,255,0.2)",
                  opacity: !supabaseOk || semId ? 0.3 : 1,
                }}
                className="hover:text-[#e24b4a] transition"
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ModalExcluirEmpresa({
  empresa,
  onCancel,
  onSuccess,
}: {
  empresa: EmpresaMeta
  onCancel: () => void
  onSuccess: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  async function excluir() {
    if (!empresa.id) {
      setErro("ID da empresa não disponível.")
      return
    }
    const fd = new FormData()
    fd.set("id", empresa.id)
    fd.set("db", empresa.db)
    const r = await excluirEmpresaAction(fd)
    if (r.ok) {
      router.refresh()
      onSuccess()
    } else {
      setErro(r.erro ?? "Erro ao excluir")
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="glass"
        style={{
          padding: 22,
          maxWidth: 380,
          width: "100%",
        }}
      >
        <p
          style={{
            fontSize: 14,
            color: "#fff",
            fontWeight: 500,
            marginBottom: 8,
          }}
        >
          Excluir {empresa.nome} permanentemente?
        </p>
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 300,
            marginBottom: 14,
          }}
        >
          Essa ação bloqueia se houver histórico de dados reais ou metas
          editadas. Nesse caso, use Desativar.
        </p>
        {erro && (
          <p
            style={{
              fontSize: 11,
              color: "#e24b4a",
              marginBottom: 14,
            }}
          >
            {erro}
          </p>
        )}
        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              padding: "8px 14px",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => excluir())}
            disabled={pending}
            style={{
              fontSize: 11,
              color: "#fff",
              background: "#e24b4a",
              border: "0.5px solid #e24b4a",
              borderRadius: 8,
              padding: "8px 14px",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              fontWeight: 500,
              opacity: pending ? 0.5 : 1,
            }}
          >
            {pending ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  )
}

function LabelSmall({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "2px",
        color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  )
}
