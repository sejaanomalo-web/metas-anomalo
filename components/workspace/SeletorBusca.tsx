"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

export interface OpcaoBusca {
  valor: string
  rotulo: string
  /** Linha secundária (e-mail, "Empresa", grupo…). Também entra na busca. */
  detalhe?: string
  /** Texto extra que casa na busca sem aparecer na tela. */
  termos?: string
  /** Avatar, quadradinho de cor — o que identifica a opção de relance. */
  icone?: ReactNode
}

/**
 * Seletor com CAMPO DE PESQUISA — substitui o <select> nativo nos campos cuja
 * lista cresce com o uso (Responsável, Projetos/Cliente).
 *
 * Por que não o <select>: ele não filtra. Com 6 pessoas dava pra rolar; com o
 * time e a carteira de clientes crescendo, achar "Mãe Divina Yôga" no meio de
 * dezenas de linhas viraria caça ao tesouro. Aqui o clique abre a lista JÁ com
 * o cursor num campo de busca: quem sabe o nome digita 3 letras, quem não sabe
 * rola a lista — os dois caminhos funcionam.
 *
 * Decisões que não são estéticas:
 *
 *  • POPOVER EM PORTAL PRO <body>, com position:fixed e coordenadas calculadas
 *    do gatilho. O portal NÃO é enfeite: o painel de tarefa (.ws-drawer) tem
 *    `will-change: transform` e uma animação de entrada com transform, e pelo
 *    CSS isso o torna CONTAINING BLOCK dos descendentes `position: fixed`.
 *    Renderizado dentro do painel, o popover interpretava as coordenadas de
 *    viewport como se fossem relativas ao painel e ia parar ~900px à direita,
 *    fora da tela — e o foco no campo de busca fazia o painel rolar atrás dele,
 *    o que aparecia como "a telinha pisca e some". No <body> nenhum ancestral
 *    com transform, overflow ou z-index interfere.
 *  • VIRA PRA CIMA quando não há espaço embaixo, e no celular vira folha
 *    inferior — o campo "Projetos" fica na metade de baixo do painel, onde uma
 *    lista pra baixo cairia fora da tela.
 *  • BUSCA SEM ACENTO E SEM CAIXA, por TERMOS: "mae divina" acha
 *    "MÃE DIVINA YÔGA", e "bru fre" acha "Bruno Freitas". Digitar do jeito
 *    fácil tem que funcionar.
 *  • TECLADO COMPLETO (↑ ↓ Enter Esc) com aria-activedescendant, porque um
 *    combobox de mentira só serve pra quem usa mouse.
 */
export default function SeletorBusca({
  rotuloCampo,
  valor,
  opcoes,
  onEscolher,
  textoVazio = "Selecionar…",
  prefixoNoGatilho,
  placeholderBusca = "Pesquisar…",
  textoNenhum = "Nada encontrado.",
  disabled = false,
  variante = "campo",
  iconeNoGatilho = true,
}: {
  /** Nome do campo — vai no aria-label e no prefixo do gatilho, se pedido. */
  rotuloCampo: string
  valor: string
  opcoes: OpcaoBusca[]
  onEscolher: (valor: string) => void
  /** O que o gatilho mostra quando `valor` não casa com nenhuma opção. */
  textoVazio?: string
  /** "Responsável: Todos" nos filtros. Omitido nos campos do painel. */
  prefixoNoGatilho?: string
  placeholderBusca?: string
  textoNenhum?: string
  disabled?: boolean
  /** `campo` = texto discreto (painel da tarefa); `filtro` = pílula de vidro. */
  variante?: "campo" | "filtro"
  /**
   * false quando quem chama JÁ desenha o ícone do valor atual do lado de fora —
   * é o caso do Responsável no painel da tarefa, que tem o avatar grande de 26px
   * ali. Sem isso apareciam DOIS avatares em sequência antes do nome.
   */
  iconeNoGatilho?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState("")
  const [ativo, setAtivo] = useState(0)
  const [pos, setPos] = useState<Posicao | null>(null)

  const gatilhoRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const buscaRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  // A última mudança de opção ativa veio do teclado? Decide se a lista pode
  // rolar sozinha (ver o efeito de scrollIntoView).
  const viaTecladoRef = useRef(false)

  const idBase = useId()
  const idLista = `${idBase}-lista`

  const selecionada = opcoes.find((o) => o.valor === valor && o.valor !== "")

  const filtradas = useMemo(() => filtrar(opcoes, busca), [opcoes, busca])

  // Índice ativo nunca aponta pra fora da lista filtrada — sem isto, filtrar
  // depois de descer com a seta deixaria o Enter selecionando o vazio.
  const indiceAtivo = filtradas.length === 0 ? -1 : Math.min(ativo, filtradas.length - 1)

  const recalcularPosicao = useCallback(() => {
    const el = gatilhoRef.current
    if (!el) return
    setPos(calcularPosicao(el.getBoundingClientRect()))
  }, [])

  function abrir() {
    if (disabled) return
    setBusca("")
    setAtivo(0)
    recalcularPosicao()
    setAberto(true)
  }

  // preventScroll em todo devolver-foco: o gatilho mora dentro do painel de
  // tarefa (overflow-y:auto) e o navegador aproveitaria o focus() pra rolar o
  // painel — o mesmo salto que fazia a lista parecer "piscar e sumir".
  function fechar(devolverFoco = true) {
    setAberto(false)
    setBusca("")
    if (devolverFoco) gatilhoRef.current?.focus({ preventScroll: true })
  }

  function escolher(v: string) {
    setAberto(false)
    setBusca("")
    gatilhoRef.current?.focus({ preventScroll: true })
    // Só avisa quando muda de verdade: reescolher o mesmo responsável não
    // precisa virar request, refresh e linha no histórico da tarefa.
    if (v !== valor) onEscolher(v)
  }

  // Reposiciona enquanto aberto: rolar a tela de trás ou girar o celular não
  // pode deixar o popover "solto" longe do campo.
  useEffect(() => {
    if (!aberto) return
    function aoRolar(e: Event) {
      // Rolar a LISTA DE OPÇÕES não move o gatilho. Sem este filtro, cada
      // quadro de rolagem da lista virava um setPos com objeto novo — re-render
      // a cada evento de scroll, à toa.
      if (e.target instanceof Node && popRef.current?.contains(e.target)) return
      recalcularPosicao()
    }
    recalcularPosicao()
    window.addEventListener("resize", recalcularPosicao)
    window.addEventListener("scroll", aoRolar, true)
    return () => {
      window.removeEventListener("resize", recalcularPosicao)
      window.removeEventListener("scroll", aoRolar, true)
    }
  }, [aberto, recalcularPosicao])

  // Foco no campo de busca assim que abre — é o ponto da tela toda.
  // preventScroll porque a posição do popover é calculada por nós: deixar o
  // browser "rolar até o campo" só produziria salto de layout.
  useEffect(() => {
    if (aberto) buscaRef.current?.focus({ preventScroll: true })
  }, [aberto])

  // Clique fora fecha. pointerdown (e não click) porque o clique num item da
  // lista já resolve sozinho, e mousedown não cobre toque.
  useEffect(() => {
    if (!aberto) return
    function aoApontar(e: PointerEvent) {
      const alvo = e.target as Node
      if (popRef.current?.contains(alvo)) return
      if (gatilhoRef.current?.contains(alvo)) return
      setAberto(false)
      setBusca("")
    }
    document.addEventListener("pointerdown", aoApontar, true)
    return () => document.removeEventListener("pointerdown", aoApontar, true)
  }, [aberto])

  // Mantém a opção ativa visível ao navegar com as SETAS — e só com as setas.
  // Rolar a lista por causa do hover faria o item fugir de baixo do cursor, que
  // é como se perde o clique num item parcialmente visível.
  useEffect(() => {
    if (!aberto || indiceAtivo < 0 || !viaTecladoRef.current) return
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-i="${indiceAtivo}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [aberto, indiceAtivo])

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      viaTecladoRef.current = true
      setAtivo((i) => (filtradas.length === 0 ? 0 : Math.min(i + 1, filtradas.length - 1)))
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      viaTecladoRef.current = true
      setAtivo((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === "Home") {
      e.preventDefault()
      viaTecladoRef.current = true
      setAtivo(0)
      return
    }
    if (e.key === "End") {
      e.preventDefault()
      viaTecladoRef.current = true
      setAtivo(Math.max(filtradas.length - 1, 0))
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      const op = filtradas[indiceAtivo]
      if (op) escolher(op.valor)
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      fechar()
      return
    }
    // Tab sai do componente: fecha sem roubar o foco de volta, senão o
    // "próximo campo" seria sempre o mesmo gatilho.
    if (e.key === "Tab") fechar(false)
  }

  const textoGatilho = selecionada?.rotulo ?? textoVazio

  return (
    <>
      <button
        ref={gatilhoRef}
        type="button"
        disabled={disabled}
        onClick={() => (aberto ? fechar() : abrir())}
        aria-label={rotuloCampo}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className={variante === "filtro" ? "glass-input ws-combo-gatilho" : "no-ds ws-combo-gatilho ws-combo-gatilho-campo"}
        style={
          variante === "filtro"
            ? { fontSize: 12, padding: "6px 8px", borderRadius: 7, maxWidth: 200 }
            : undefined
        }
      >
        {iconeNoGatilho && selecionada?.icone}
        <span className="ws-combo-gatilho-texto">
          {prefixoNoGatilho ? `${prefixoNoGatilho}: ${textoGatilho}` : textoGatilho}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0, opacity: 0.6 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {aberto &&
        pos &&
        // Portal pro <body>: ver o comentário do topo. `aberto` só vira true
        // por clique, então nunca há portal durante o SSR.
        createPortal(
          <div
            ref={popRef}
            className={`ws-combo-pop${pos.folha ? " ws-combo-pop-folha" : ""}`}
            style={
              pos.folha
                ? undefined
                : { left: pos.left, top: pos.top, width: pos.largura, maxHeight: pos.alturaMax }
            }
          >
            <input
              ref={buscaRef}
              type="text"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                // Digitar reancora no primeiro resultado, e a lista PODE rolar
                // pro topo por causa disso — é movimento pedido pelo teclado.
                viaTecladoRef.current = true
                setAtivo(0)
              }}
              onKeyDown={aoTeclar}
              placeholder={placeholderBusca}
              aria-label={`Pesquisar ${rotuloCampo.toLowerCase()}`}
              role="combobox"
              aria-expanded="true"
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={indiceAtivo >= 0 ? `${idBase}-op-${indiceAtivo}` : undefined}
              className="no-ds ws-combo-busca"
              autoComplete="off"
              spellCheck={false}
            />

            <div ref={listaRef} id={idLista} role="listbox" aria-label={rotuloCampo} className="ws-combo-lista">
              {filtradas.length === 0 && <p className="ws-combo-vazio">{textoNenhum}</p>}

              {filtradas.map((o, i) => {
                const escolhida = o.valor === valor
                return (
                  <button
                    key={o.valor || `__vazio-${i}`}
                    id={`${idBase}-op-${i}`}
                    data-i={i}
                    type="button"
                    role="option"
                    aria-selected={escolhida}
                    // pointerdown em vez de click: cobre mouse, toque e caneta
                    // com um handler só, e acontece ANTES de qualquer mudança de
                    // foco — no celular o `click` chega tarde demais, depois de o
                    // teclado virtual mexer no layout.
                    onPointerDown={(e) => {
                      e.preventDefault()
                      escolher(o.valor)
                    }}
                    onMouseEnter={() => {
                      // Zera a marca do teclado: sem isso, a PRIMEIRA vez que
                      // se usasse a seta deixava o ref em true pra sempre e o
                      // hover voltava a rolar a lista sozinho.
                      viaTecladoRef.current = false
                      setAtivo(i)
                    }}
                    className={`no-ds ws-combo-item${i === indiceAtivo ? " ws-combo-item-ativo" : ""}`}
                  >
                    {o.icone}
                    <span className="ws-combo-item-texto">
                      <span className="ws-combo-item-rotulo">{o.rotulo}</span>
                      {o.detalhe && <span className="ws-combo-item-detalhe">{o.detalhe}</span>}
                    </span>
                    {escolhida && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, color: "#5da283" }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

// ============================================================
// Busca e posicionamento (puros — fáceis de conferir de cabeça)
// ============================================================

/**
 * Sem acento, sem caixa. NFD separa "ã" em "a" + diacrítico combinante, e o
 * replace tira a faixa U+0300–U+036F. Escrito com \u escapado de propósito: o
 * caractere combinante literal no código-fonte é invisível e sobrevive mal a
 * copiar e colar.
 */
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g")

function normalizar(s: string): string {
  return s.normalize("NFD").replace(DIACRITICOS, "").toLowerCase()
}

/**
 * Todos os termos digitados precisam aparecer em algum lugar da opção (rótulo,
 * detalhe ou termos ocultos). É o que faz "bru fre" achar "Bruno Freitas" sem
 * exigir que a pessoa digite na ordem exata.
 */
function filtrar(opcoes: OpcaoBusca[], busca: string): OpcaoBusca[] {
  const termos = normalizar(busca).split(/\s+/).filter(Boolean)
  if (termos.length === 0) return opcoes
  return opcoes.filter((o) => {
    const palheiro = normalizar(`${o.rotulo} ${o.detalhe ?? ""} ${o.termos ?? ""}`)
    return termos.every((t) => palheiro.includes(t))
  })
}

interface Posicao {
  left: number
  top: number
  largura: number
  alturaMax: number
  /** Folha inferior: no celular a lista sobe do rodapé, ocupando a largura. */
  folha: boolean
}

const ALTURA_IDEAL = 300
const MARGEM = 8

function calcularPosicao(r: DOMRect): Posicao {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (vw <= 640) {
    return { left: 0, top: 0, largura: 0, alturaMax: 0, folha: true }
  }

  const largura = Math.min(Math.max(r.width, 260), vw - MARGEM * 2)
  const abaixo = vh - r.bottom - MARGEM
  const acima = r.top - MARGEM
  // Só sobe se caber MAIS espaço em cima — descer é o esperado.
  const paraCima = abaixo < 180 && acima > abaixo
  const alturaMax = Math.min(ALTURA_IDEAL, Math.max(paraCima ? acima : abaixo, 140))

  return {
    left: Math.min(Math.max(r.left, MARGEM), vw - largura - MARGEM),
    top: paraCima ? Math.max(r.top - alturaMax - 4, MARGEM) : r.bottom + 4,
    largura,
    alturaMax,
    folha: false,
  }
}
