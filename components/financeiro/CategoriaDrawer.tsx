"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { salvarCategoriaAction } from "@/lib/financeiro-actions"
import type { CategoriaFinanceira } from "@/lib/financeiro"
import {
  CORES_DISPONIVEIS,
  proximaCorLivre,
  type TipoLancamento,
} from "@/lib/financeiro-regras"
import CampoInteiro from "@/components/inputs/CampoInteiro"

interface Props {
  aberto: boolean
  fechar: () => void
  categoria?: CategoriaFinanceira | null
  /** Tipo pré-selecionado ao criar (o botão "+ Nova" já sabe de qual bloco
   *  veio — perguntar de novo seria pedir a mesma informação duas vezes). */
  tipoInicial?: TipoLancamento
  /** Cores já usadas: a nova nasce com a primeira livre da paleta. */
  coresEmUso?: (string | null)[]
  /** Pedido de exclusão. O drawer não exclui direto: quem decide é o diálogo
   *  que conta o uso e oferece "desativar" — excluir sem saber quantos
   *  lançamentos dependem da categoria é decidir no escuro. */
  onPedirExclusao?: (categoria: CategoriaFinanceira) => void
}

export default function CategoriaDrawer({
  aberto,
  fechar,
  categoria,
  tipoInicial,
  coresEmUso = [],
  onPedirExclusao,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoLancamento>(
    categoria?.tipo ?? tipoInicial ?? "despesa"
  )
  // Categoria nova já vem com uma cor que ninguém usa: sair tudo cinza (ou
  // tudo da mesma cor) torna o gráfico de rosca ilegível já na terceira
  // categoria.
  const [cor, setCor] = useState(
    categoria?.cor || proximaCorLivre(coresEmUso)
  )

  if (!aberto) return null
  const editando = !!categoria

  /**
   * Revalidação suave. A Server Action correspondente já chama
   * revalidatePath, o que invalida a rota no servidor E devolve o RSC novo
   * na resposta da própria ação — router.refresh() apenas garante que a
   * árvore atual seja repintada com esse payload.
   *
   * Aqui havia um reload duro do documento 250–400ms depois. Ele abortava o
   * refresh em voo, destruía o documento, rebaixava todo o bundle e
   * reexecutava o layout inteiro. No app instalado (display: standalone) não
   * existe barra de navegação, então isso aparecia como a tela de splash de
   * volta — parecia que o aplicativo tinha fechado sozinho. O motivo alegado
   * era o cache do Service Worker, mas public/sw.js só trata push e
   * notificationclick: ele nunca serve HTML, logo nunca serviu HTML velho.
   */
  function refreshUI() {
    router.refresh()
  }

  async function onSubmit(fd: FormData) {
    setErro(null)
    fd.set("tipo", tipo)
    fd.set("cor", cor)
    if (editando) fd.set("id", categoria!.id)
    startTransition(async () => {
      const r = await salvarCategoriaAction(fd)
      if (!r.ok) { setErro(r.erro ?? "Erro"); return }
      refreshUI()
      fechar()
    })
  }

  function onExcluir() {
    if (!categoria) return
    fechar()
    onPedirExclusao?.(categoria)
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(32, 37, 42, 0.45)",
        zIndex: 100, display: "flex", justifyContent: "flex-end",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) fechar() }}
    >
      <div
        style={{
          width: "min(440px, 100vw)",
          background: "var(--background)",
          borderLeft: "1px solid var(--border)",
          overflowY: "auto",
          // Impede o scroll de encadear na página atrás do drawer (iOS).
          overscrollBehavior: "contain",
          padding: "32px 28px",
          animation: "painel-slide-left 0.22s ease-out",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22 }}>{editando ? "Editar categoria" : "Nova categoria"}</h2>
          <button type="button" onClick={fechar} aria-label="Fechar" style={fecharBtn}>✕</button>
        </div>

        <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Label>Tipo</Label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["receita", "despesa"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  style={{
                    flex: 1, padding: 10, borderRadius: 2,
                    border: tipo === t ? "1px solid var(--foreground)" : "1px solid var(--border)",
                    background: tipo === t ? "var(--surface-2)" : "transparent",
                    color: "var(--foreground)", fontWeight: 500, fontSize: 13,
                    cursor: "pointer", textTransform: "capitalize",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <Campo label="Nome" obrigatorio>
            <input
              type="text" name="nome" required maxLength={80}
              defaultValue={categoria?.nome ?? ""}
              className="glass-input" style={{ width: "100%" }}
            />
          </Campo>

          <Campo label="Cor">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {CORES_DISPONIVEIS.map((c) => (
                <button
                  key={c} type="button" onClick={() => setCor(c)}
                  aria-label={`Cor ${c}`}
                  style={{
                    width: 28, height: 28, borderRadius: 4, background: c,
                    border: cor === c ? "2px solid var(--foreground)" : "1px solid var(--border)",
                    cursor: "pointer", padding: 0,
                  }}
                />
              ))}
              <input
                type="color"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                style={{ width: 28, height: 28, border: "1px solid var(--border)", borderRadius: 4, padding: 0, cursor: "pointer" }}
              />
            </div>
          </Campo>

          <Campo label="Ordem">
            <CampoInteiro
              name="ordem" maxDigitos={4} valorMax={9999}
              defaultValue={categoria?.ordem ?? 0}
              className="glass-input" style={{ width: 100 }}
            />
          </Campo>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" name="ativa" defaultChecked={categoria?.ativa ?? true} />
            Categoria ativa
          </label>

          {erro && (
            <div style={erroBox}>{erro}</div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="submit" disabled={pending} className="btn-gold-filled" style={{ flex: 1, opacity: pending ? 0.6 : 1 }}>
              {pending ? "Salvando..." : editando ? "Salvar" : "Criar"}
            </button>
            {editando && (
              <button type="button" onClick={onExcluir} disabled={pending} style={excluirBtn}>
                Excluir
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

const fecharBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  color: "var(--foreground)",
}

const excluirBtn: React.CSSProperties = {
  padding: "0 16px", height: 32,
  background: "transparent",
  border: "1px solid var(--destructive)",
  borderRadius: 2,
  color: "var(--destructive)",
  cursor: "pointer", fontWeight: 500, fontSize: 12,
}

const erroBox: React.CSSProperties = {
  padding: 12,
  background: "rgba(217, 103, 88, 0.12)",
  border: "1px solid rgba(217, 103, 88, 0.35)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 13,
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)",
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>
      {children}
    </p>
  )
}

function Campo({
  label, obrigatorio, children,
}: { label: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label>
        {label}
        {obrigatorio && <span style={{ color: "var(--destructive)", marginLeft: 4 }}>*</span>}
      </Label>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}
