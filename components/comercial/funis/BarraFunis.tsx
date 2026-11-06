"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { excluirFunilAction } from "@/lib/funis-comerciais-actions"
import type { FunilComercial } from "@/lib/funil-tipos"
import FormularioFunil from "./FormularioFunil"
import FormularioLancamento from "./FormularioLancamento"
import ModalComercial, {
  MensagemErro,
  estiloCampo,
  estiloRotulo,
} from "./ModalComercial"

const estiloChip = (ativo: boolean): React.CSSProperties => ({
  padding: "9px 14px",
  minHeight: 40,
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  cursor: "pointer",
  color: ativo ? "#000" : "var(--text-2)",
  background: ativo ? "var(--accent)" : "var(--card-bg)",
  border: ativo
    ? "1px solid var(--accent)"
    : "1px solid var(--card-border)",
})

const estiloAcao: React.CSSProperties = { padding: "10px 14px" }

/**
 * Faixa de controle do funil: troca de funil, criar, editar, excluir e o botão
 * de lançar números. O funil selecionado fica na URL (?funil=).
 */
export default function BarraFunis({
  funis,
  selecionado,
  usuarioId,
  totalLancamentos,
  dataPadrao,
}: {
  funis: FunilComercial[]
  selecionado: FunilComercial | null
  usuarioId: string
  /** Lançamentos do funil selecionado em qualquer data. */
  totalLancamentos: number
  dataPadrao: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [modal, setModal] = useState<
    "novo" | "editar" | "excluir" | "lancar" | null
  >(null)
  const [navegando, startNav] = useTransition()

  function irParaFunil(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set("funil", id)
    else params.delete("funil")
    startNav(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  function concluirNoFunil(id: string | null) {
    setModal(null)
    irParaFunil(id)
    router.refresh()
  }

  return (
    <div
      aria-busy={navegando}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        opacity: navegando ? 0.6 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <div
        role="group"
        aria-label="Funis"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        {funis.map((f) => (
          <button
            key={f.id}
            type="button"
            style={estiloChip(f.id === selecionado?.id)}
            aria-pressed={f.id === selecionado?.id}
            onClick={() => irParaFunil(f.id)}
          >
            {f.nome}
          </button>
        ))}
        <button
          type="button"
          className="btn-ghost"
          style={estiloAcao}
          onClick={() => setModal("novo")}
        >
          + Novo funil
        </button>
      </div>

      {selecionado && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-gold-outline"
            style={estiloAcao}
            onClick={() => setModal("editar")}
          >
            Editar funil
          </button>
          <button
            type="button"
            className="btn-gold-outline"
            style={estiloAcao}
            onClick={() => setModal("excluir")}
          >
            Excluir funil
          </button>
          <button
            type="button"
            className="btn-gold-filled"
            style={estiloAcao}
            onClick={() => setModal("lancar")}
          >
            + Lançar números
          </button>
        </div>
      )}

      {modal === "novo" && (
        <FormularioFunil
          usuarioId={usuarioId}
          fechar={() => setModal(null)}
          aoSalvar={concluirNoFunil}
        />
      )}
      {modal === "editar" && selecionado && (
        <FormularioFunil
          funil={selecionado}
          fechar={() => setModal(null)}
          aoSalvar={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
      {modal === "lancar" && selecionado && (
        <FormularioLancamento
          funil={selecionado}
          dataPadrao={dataPadrao}
          fechar={() => setModal(null)}
          aoSalvar={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
      {modal === "excluir" && selecionado && (
        <DialogoExcluirFunil
          funil={selecionado}
          totalLancamentos={totalLancamentos}
          fechar={() => setModal(null)}
          aoExcluir={() => concluirNoFunil(null)}
        />
      )}
    </div>
  )
}

/** Excluir apaga números de vez: com lançamentos, pede a palavra digitada. */
function DialogoExcluirFunil({
  funil,
  totalLancamentos,
  fechar,
  aoExcluir,
}: {
  funil: FunilComercial
  totalLancamentos: number
  fechar: () => void
  aoExcluir: () => void
}) {
  const [confirmacao, setConfirmacao] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const exigeConfirmacao = totalLancamentos > 0
  const liberado = !exigeConfirmacao || confirmacao === "Excluir"

  function excluir() {
    setErro(null)
    startTransition(async () => {
      const r = await excluirFunilAction(funil.id)
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível excluir.")
        return
      }
      aoExcluir()
    })
  }

  return (
    <ModalComercial titulo={`Excluir "${funil.nome}"?`} fechar={fechar} largura={460}>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-2)" }}>
        {exigeConfirmacao
          ? `Os ${totalLancamentos} lançamento(s) deste funil serão apagados junto, em todas as datas. Não dá para desfazer.`
          : "Este funil não tem nenhum lançamento."}
      </p>
      {exigeConfirmacao && (
        <label style={{ ...estiloRotulo, marginTop: 14 }}>
          Digite Excluir para confirmar
          <input
            data-autofoco
            className="glass-input"
            style={estiloCampo}
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
          />
        </label>
      )}
      <MensagemErro erro={erro} />
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          marginTop: 20,
        }}
      >
        <button type="button" className="btn-gold-outline" onClick={fechar}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={!liberado || pending}
          onClick={excluir}
          style={{
            padding: "12px 22px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "1.17px",
            textTransform: "uppercase",
            borderRadius: 10,
            color: "#fff",
            background: "#dc2626",
            border: "1px solid #dc2626",
            cursor: !liberado || pending ? "not-allowed" : "pointer",
            opacity: !liberado || pending ? 0.5 : 1,
          }}
        >
          {pending ? "Excluindo…" : "Excluir funil"}
        </button>
      </div>
    </ModalComercial>
  )
}
