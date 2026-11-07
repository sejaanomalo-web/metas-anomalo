"use client"

import dynamic from "next/dynamic"
import { useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { excluirFunilAction } from "@/lib/funis-comerciais-actions"
import { fontesDoFunil, type FunilComercial } from "@/lib/funil-tipos"
import FormularioFunil from "./FormularioFunil"
import FormularioLancamento from "./FormularioLancamento"
import ModalComercial, {
  MensagemErro,
  estiloCampo,
  estiloRotulo,
} from "./ModalComercial"
import estilos from "./funis.module.css"

// Só baixa o leitor de arquivos quando alguém abre a importação.
const ImportarMeta = dynamic(() => import("./ImportarMeta"), { ssr: false })

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
    "novo" | "editar" | "excluir" | "lancar" | "importar" | null
  >(null)
  const [navegando, startNav] = useTransition()

  const fonteNaUrl = searchParams.get("fonte")
  const fontePadrao =
    selecionado && fontesDoFunil(selecionado).some((f) => f.id === fonteNaUrl)
      ? fonteNaUrl
      : null

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
        opacity: navegando ? 0.6 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <div role="group" aria-label="Funis" className={estilos.chips}>
        {funis.map((f) => (
          <button
            key={f.id}
            type="button"
            className={estilos.chip}
            title={f.nome}
            aria-pressed={f.id === selecionado?.id}
            onClick={() => irParaFunil(f.id)}
          >
            {f.nome}
          </button>
        ))}
        <button
          type="button"
          className={estilos.chipNovo}
          onClick={() => setModal("novo")}
        >
          + Novo funil
        </button>
      </div>

      {selecionado && (
        <div className={`glass ${estilos.painel}`}>
          <div className={estilos.painelInfo}>
            <h2>{selecionado.nome}</h2>
            {selecionado.descricao && <p>{selecionado.descricao}</p>}
          </div>
          <div className={estilos.painelAcoes}>
            <button
              type="button"
              className={estilos.botaoPrimario}
              onClick={() => setModal("lancar")}
            >
              + Lançar números
            </button>
            <button
              type="button"
              className={estilos.botaoSecundario}
              onClick={() => setModal("importar")}
            >
              Importar do Meta
            </button>
          </div>
          <div className={estilos.painelGerir}>
            <button
              type="button"
              className={estilos.botaoLeve}
              onClick={() => setModal("editar")}
            >
              Editar funil
            </button>
            <button
              type="button"
              className={estilos.botaoLeve}
              onClick={() => setModal("excluir")}
            >
              Excluir funil
            </button>
          </div>
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
          fontePadrao={fontePadrao}
          fechar={() => setModal(null)}
          aoSalvar={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
      {modal === "importar" && selecionado && (
        <ImportarMeta
          funil={selecionado}
          fechar={() => setModal(null)}
          aoImportar={(de, ate) => {
            setModal(null)
            // Mostra o período importado, mesmo que seja outro mês.
            const params = new URLSearchParams(searchParams.toString())
            params.set("funil", selecionado.id)
            params.set("modo", "intervalo")
            params.set("de", de)
            params.set("ate", ate)
            params.delete("mes")
            params.delete("ano")
            params.delete("agrupar")
            params.delete("fonte") // para o que entrou aparecer, em qualquer filtro
            startNav(() => {
              router.push(`${pathname}?${params.toString()}`, { scroll: false })
              router.refresh()
            })
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
