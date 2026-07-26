"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { excluirNotaAction, salvarNotaAction } from "@/lib/workspace-actions"
import {
  CORES_NOTA,
  FONTES_NOTA,
  TAMANHOS_NOTA,
  sanitizarHtmlNota,
} from "@/lib/workspace-notas"
import type { Nota } from "@/lib/workspace-tipos"

export type EstadoSalvamento = "limpo" | "pendente" | "salvando" | "salvo" | "erro"

/** Tamanho máximo do corpo — o mesmo que o servidor aceita. */
const MAX_CORPO = 200_000
/** Espera depois da última tecla antes de salvar. */
const ESPERA_MS = 600
/** Espera antes de tentar de novo depois de uma falha de rede. */
const RETENTAR_MS = 3000

/**
 * Editor de nota no espírito do Notas do iPhone: blocos (Título, Subtítulo,
 * Corpo), fonte, tamanho, cor, negrito/itálico/sublinhado/tachado, listas,
 * link, alinhamento e caixa do texto.
 *
 * ---------------------------------------------------------------------------
 * SALVAMENTO — o que estava errado e por que a formatação "voltava atrás"
 * ---------------------------------------------------------------------------
 * A versão anterior perdia conteúdo por quatro caminhos diferentes:
 *
 *  1. O cleanup do unmount só chamava clearTimeout. Trocar de aba do Workspace
 *     desmonta este componente, então tudo que estava na janela de debounce
 *     era DESCARTADO — a pessoa via o texto sumir sem nenhum erro na tela.
 *  2. Título e corpo dividiam UM timer e UM payload: digitar no título
 *     cancelava o save do corpo e mandava só o título. Como o servidor grava
 *     apenas os campos recebidos, a edição do corpo ia embora.
 *  3. Cada save era um request solto. Dois em vôo podiam chegar fora de ordem
 *     e a versão velha ganhava.
 *  4. `formatBlock` era chamado com "h1" sem os sinais < >. Em WebKit — e este
 *     sistema roda como web app do Safari — a forma sem sinais falha calada.
 *     Era o "H1 vira parágrafo sozinho".
 *
 * O que existe agora:
 *
 *  • FILA POR NOTA (filaRef): os campos ACUMULAM por id de nota; um save nunca
 *    apaga o campo que outro ia mandar. Um request por vez, em ordem.
 *  • FLUSH em unmount, blur, troca de nota, `visibilitychange` e `pagehide`.
 *    Nos dois últimos vai por fetch(keepalive) para /api/workspace/notas/salvar,
 *    porque com a página morrendo uma Server Action não sai.
 *  • MEMÓRIA DE CONTEÚDO (memoriaRef): trocar de nota e voltar não relê uma
 *    prop velha do servidor por cima do que acabou de ser escrito. A prop só
 *    vence quando ELA mudou (ou seja, quando outra pessoa editou de verdade).
 *  • BLOCOS TROCADOS NA MÃO (aplicarBloco), sem execCommand: determinístico em
 *    WebKit, Blink e Gecko. H1 ⇄ H2 ⇄ Corpo ⇄ Citação sempre reversível.
 *  • COLAR SANITIZADO com a MESMA função do servidor: o que aparece na tela é
 *    o que vai pro banco. Nada mais "muda depois de recarregar".
 *
 * Segurança não depende de nada disso: TODO corpo é re-sanitizado no servidor
 * (lib/workspace-notas-gravar.ts) antes de tocar o banco.
 *
 * Sobre execCommand: é API antiga, mas é a única que edita SELEÇÃO rica sem
 * trazer um editor inteiro (TipTap/Lexical) pro bundle. Segue em uso para o
 * que ela faz bem — negrito, itálico, listas, undo — com três correções:
 *  • styleWithCSS(true): sem isso ele emite <font> e tags legadas que o
 *    sanitizador descarta — a formatação "sumia" ao salvar.
 *  • fontSize só aceita 1..7; aplicamos e trocamos o <font size> resultante
 *    por um <span style="font-size:Npx"> logo em seguida.
 *  • SELEÇÃO SALVA: abrir um <select> tira o foco do contentEditable e o
 *    navegador COLAPSA a seleção. Guardamos o Range e o devolvemos antes de
 *    cada comando.
 */
export default function EditorNota({
  nota,
  onErro,
  onEstado,
  onTitulo,
  onExcluida,
}: {
  nota: Nota
  onErro: (e: string | null) => void
  onEstado: (e: EstadoSalvamento) => void
  onTitulo: (titulo: string) => void
  onExcluida: () => void
}) {
  const [titulo, setTitulo] = useState(nota.titulo)
  const [confirmando, setConfirmando] = useState(false)
  const [estado, setEstado] = useState<EstadoSalvamento>("limpo")
  const [linkAberto, setLinkAberto] = useState(false)
  const [linkUrl, setLinkUrl] = useState("https://")

  const corpoRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Último trecho selecionado DENTRO do editor — o que sobrevive ao <select>
  // roubar o foco.
  const selecaoRef = useRef<Range | null>(null)
  const rangeLinkRef = useRef<Range | null>(null)

  // --- Fila de gravação -----------------------------------------------------
  // Map<id da nota, campos pendentes>. Map e não objeto solto porque a troca de
  // nota pode deixar duas notas pendentes ao mesmo tempo, e o save de uma
  // jamais pode ir com o id da outra.
  const filaRef = useRef<Map<string, { titulo?: string; corpo_html?: string }>>(new Map())
  const enviandoRef = useRef(false)
  // Corpo mexido desde a última leitura do DOM, e quando foi essa leitura.
  const corpoSujoRef = useRef(false)
  const ultimaCapturaRef = useRef(0)

  // --- Memória do que já foi digitado nesta sessão --------------------------
  // Guarda, por nota: o conteúdo que o editor tinha e QUAL era a prop do
  // servidor naquele momento. Se a prop continuar a mesma, o servidor não
  // recebeu nada de ninguém e a nossa versão é a mais nova.
  const memoriaRef = useRef<
    Map<string, { corpo: string; titulo: string; propCorpo: string; propTitulo: string }>
  >(new Map())

  // Props em ref: os efeitos de gravação não podem depender da identidade das
  // callbacks (elas são arrow functions novas a cada render do pai, e o efeito
  // rodaria o flush a cada render).
  const notaRef = useRef(nota)
  const onErroRef = useRef(onErro)
  useEffect(() => {
    notaRef.current = nota
    onErroRef.current = onErro
  })

  useEffect(() => {
    onEstado(estado)
    // onEstado é recriada a cada render do pai; depender dela reentraria aqui
    // sem parar. O que importa é reagir à mudança de `estado`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado])

  // ==========================================================
  // Gravação
  // ==========================================================

  const cancelarTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /**
   * Lê o corpo do DOM e o põe na fila DA NOTA INFORMADA.
   *
   * O id é parâmetro, e não `notaRef.current.id`, por um motivo que quase
   * causou corrupção: na troca de nota o efeito de carregamento roda DEPOIS do
   * efeito que atualiza notaRef, então nesse instante o DOM ainda tem o texto
   * da nota ANTERIOR enquanto a ref já aponta pra nova. Capturar sem dizer o id
   * salvaria o texto de uma nota dentro da outra.
   */
  const capturarCorpo = useCallback(
    (id: string, propCorpo: string, propTitulo: string) => {
      const el = corpoRef.current
      if (!el) return
      const html = el.innerHTML
      corpoSujoRef.current = false
      ultimaCapturaRef.current = Date.now()
      const anterior = memoriaRef.current.get(id)
      memoriaRef.current.set(id, {
        corpo: html,
        titulo: anterior?.titulo ?? propTitulo,
        propCorpo,
        propTitulo,
      })
      if (html.length > MAX_CORPO) {
        onErroRef.current(
          "Esta nota chegou no tamanho máximo — o fim do texto pode não ser salvo. Divida em duas notas."
        )
      }
      const atual = filaRef.current.get(id) ?? {}
      filaRef.current.set(id, { ...atual, corpo_html: html })
    },
    []
  )

  /** Captura o corpo da nota ATUAL (o caminho normal de edição). */
  const capturarAtual = useCallback(() => {
    const n = notaRef.current
    capturarCorpo(n.id, n.corpo_html, n.titulo)
  }, [capturarCorpo])

  /** Envia a fila, uma nota por vez, em ordem. */
  const enviar = useCallback(async function enviarFila(): Promise<void> {
    if (enviandoRef.current) return
    const primeira = filaRef.current.entries().next()
    if (primeira.done) return
    const [id, campos] = primeira.value
    filaRef.current.delete(id)

    enviandoRef.current = true
    setEstado("salvando")

    const fd = new FormData()
    fd.set("id", id)
    if (campos.titulo !== undefined) fd.set("titulo", campos.titulo)
    if (campos.corpo_html !== undefined) fd.set("corpo_html", campos.corpo_html)

    let resultado: { ok: boolean; erro?: string }
    try {
      resultado = await salvarNotaAction(fd)
    } catch {
      // Rede caiu / servidor reiniciou: trata como falha retentável em vez de
      // deixar a promise rejeitada matar o autosave pro resto da sessão.
      resultado = { ok: false, erro: "Sem conexão. Tentando salvar de novo…" }
    }
    enviandoRef.current = false

    if (!resultado.ok) {
      // Devolve pra fila SEM atropelar o que foi digitado durante o envio.
      const novo = filaRef.current.get(id) ?? {}
      filaRef.current.set(id, { ...campos, ...novo })
      setEstado("erro")
      onErroRef.current(resultado.erro ?? "Não foi possível salvar. Tentando de novo…")
      cancelarTimer()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void enviarFila()
      }, RETENTAR_MS)
      return
    }

    onErroRef.current(null)
    if (filaRef.current.size > 0) return enviarFila()
    setEstado("salvo")
  }, [cancelarTimer])

  /**
   * Agenda o envio. O timer SEMPRE captura o corpo sujo antes de enviar — é o
   * que impede o bug antigo em versão nova: digitar no corpo e em seguida no
   * título fazia o timer do título cancelar o do corpo e mandar só o título.
   */
  const agendar = useCallback(
    (ms = ESPERA_MS) => {
      cancelarTimer()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        if (corpoSujoRef.current) capturarAtual()
        void enviar()
      }, ms)
    },
    [cancelarTimer, capturarAtual, enviar]
  )

  /** Acumula campos na fila e agenda o envio. */
  const marcar = useCallback(
    (campos: { titulo?: string; corpo_html?: string }) => {
      const id = notaRef.current.id
      const atual = filaRef.current.get(id) ?? {}
      filaRef.current.set(id, { ...atual, ...campos })
      setEstado("pendente")
      agendar()
    },
    [agendar]
  )

  /**
   * Flush que sobrevive à página morrendo. `fetch(keepalive)` é a única forma
   * suportada de dizer "termine este POST mesmo que a aba feche" — Server
   * Action não aceita a flag.
   */
  const flushKeepalive = useCallback(() => {
    // Lê o DOM ANTES de decidir se há algo pendente: o último trecho digitado
    // pode ainda não ter sido capturado, e é justamente ele que se perdia.
    if (corpoSujoRef.current) {
      const n = notaRef.current
      capturarCorpo(n.id, n.corpo_html, n.titulo)
    }
    if (filaRef.current.size === 0) return
    const pendentes = Array.from(filaRef.current.entries())
    filaRef.current.clear()
    cancelarTimer()
    for (const [id, campos] of pendentes) {
      try {
        void fetch("/api/workspace/notas/salvar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...campos }),
          keepalive: true,
          credentials: "same-origin",
        })
      } catch {
        /* aba fechando: não há mais o que fazer nem a quem avisar */
      }
    }
  }, [cancelarTimer, capturarCorpo])

  // Guarda a função mais recente pra que o cleanup de unmount (deps []) não
  // precise dela nas dependências — senão o flush rodaria a cada render.
  const flushRef = useRef(flushKeepalive)
  useEffect(() => {
    flushRef.current = flushKeepalive
  }, [flushKeepalive])

  // Página escondendo ou fechando: o pendente vai agora.
  useEffect(() => {
    function aoSair() {
      flushRef.current()
    }
    function aoTrocarVisibilidade() {
      if (document.visibilityState === "hidden") flushRef.current()
    }
    window.addEventListener("pagehide", aoSair)
    document.addEventListener("visibilitychange", aoTrocarVisibilidade)
    return () => {
      window.removeEventListener("pagehide", aoSair)
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade)
    }
  }, [])

  // Desmontar (trocar de aba do Workspace, fechar a tela) SALVA. Era aqui que
  // o texto se perdia: antes este cleanup só cancelava o timer.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      flushRef.current()
    }
  }, [])

  /**
   * Reação a cada tecla no corpo.
   *
   * Não serializa o innerHTML a cada tecla: numa nota grande isso é trabalho de
   * O(tamanho) por caractere digitado, e o editor começaria a "engasgar" quanto
   * mais a nota crescesse. Marca como suja e deixa a captura pro debounce —
   * com uma leitura de segurança a cada 400ms, caso a página morra entre duas
   * teclas antes de o debounce vencer.
   */
  const aoDigitarCorpo = useCallback(() => {
    corpoSujoRef.current = true
    setEstado("pendente")
    if (Date.now() - ultimaCapturaRef.current > 400) capturarAtual()
    agendar()
  }, [agendar, capturarAtual])

  /** Salva agora: usado pelos botões de formatação. */
  const salvarCorpo = useCallback(() => {
    corpoSujoRef.current = true
    capturarAtual()
    setEstado("pendente")
    agendar()
  }, [agendar, capturarAtual])

  /** Sai do campo: não espera o debounce. */
  const flushAgora = useCallback(() => {
    cancelarTimer()
    if (corpoSujoRef.current) capturarAtual()
    void enviar()
  }, [cancelarTimer, capturarAtual, enviar])

  // ==========================================================
  // Carregar a nota (e salvar a anterior ao trocar)
  // ==========================================================

  const idAnteriorRef = useRef<string | null>(null)

  // Prop da nota anterior, guardada junto com o id: a captura precisa saber
  // qual era a prop do servidor NAQUELA nota pra decidir depois, na volta, se a
  // memória ainda é mais nova que o servidor.
  const propsAnterioresRef = useRef<{ corpo: string; titulo: string } | null>(null)

  useEffect(() => {
    // Trocou de nota: captura o texto da ANTERIOR (o DOM ainda tem ele) e
    // manda AGORA, sem esperar debounce.
    const anterior = idAnteriorRef.current
    const propsAnteriores = propsAnterioresRef.current
    if (anterior && anterior !== nota.id) {
      cancelarTimer()
      if (corpoSujoRef.current && propsAnteriores) {
        capturarCorpo(anterior, propsAnteriores.corpo, propsAnteriores.titulo)
      }
      void enviar()
    }
    idAnteriorRef.current = nota.id
    propsAnterioresRef.current = { corpo: nota.corpo_html, titulo: nota.titulo }

    const el = corpoRef.current
    if (!el) return

    // A prop do servidor só vence quando ELA mudou desde a última vez que
    // guardamos — aí é edição de outra pessoa, e ela tem que aparecer. Se a
    // prop está igual, o que temos em memória é mais novo (nosso próprio
    // texto ainda não refletido na prop) e é ele que entra.
    const lembrado = memoriaRef.current.get(nota.id)
    const corpo =
      lembrado && lembrado.propCorpo === nota.corpo_html ? lembrado.corpo : nota.corpo_html
    const tituloInicial =
      lembrado && lembrado.propTitulo === nota.titulo ? lembrado.titulo : nota.titulo

    // O HTML já veio SANITIZADO (toda gravação passa por sanitizarHtmlNota),
    // então é seguro injetar no contentEditable.
    el.innerHTML = corpo
    normalizarBlocos(el)
    setTitulo(tituloInicial)
    selecaoRef.current = null
    // O corpo acabou de ser (re)carregado: nada sujo a capturar da nota nova.
    corpoSujoRef.current = false
    setEstado(filaRef.current.has(nota.id) ? "pendente" : "limpo")

    // Reagir só ao ID: incluir corpo_html/titulo aqui faria um refresh do
    // servidor re-injetar o innerHTML no meio da digitação, jogando o cursor
    // pro começo e apagando a seleção.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota.id])

  // ==========================================================
  // Seleção
  // ==========================================================

  // Memoriza a seleção enquanto ela está dentro do editor. selectionchange é
  // o único evento que cobre teclado, mouse e toque de uma vez.
  useEffect(() => {
    function aoMudarSelecao() {
      const el = corpoRef.current
      const sel = window.getSelection()
      if (!el || !sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (el.contains(range.commonAncestorContainer)) {
        selecaoRef.current = range.cloneRange()
      }
    }
    document.addEventListener("selectionchange", aoMudarSelecao)
    return () => document.removeEventListener("selectionchange", aoMudarSelecao)
  }, [])

  /** Devolve o cursor/seleção ao editor antes de aplicar um comando. */
  function restaurarSelecao(): boolean {
    const el = corpoRef.current
    if (!el) return false
    el.focus()
    const range = selecaoRef.current
    if (!range) return false
    const sel = window.getSelection()
    if (!sel) return false
    try {
      sel.removeAllRanges()
      sel.addRange(range)
    } catch {
      // Range apontando pra nó que já saiu do documento (aconteceu um
      // aplicarBloco no meio): segue com o cursor onde o browser deixou.
      return false
    }
    return true
  }

  // ==========================================================
  // Comandos de formatação
  // ==========================================================

  /**
   * Executa um comando na seleção guardada e agenda o autosave.
   *
   * undo/redo são exceção: têm pilha própria no navegador e devolvem o
   * cursor sozinhos. Reinjetar um Range velho antes deles faria o cursor
   * pular pra onde o texto nem existe mais.
   */
  function comando(cmd: string, valor?: string) {
    const el = corpoRef.current
    if (!el) return
    if (cmd === "undo" || cmd === "redo") el.focus()
    else restaurarSelecao()
    // CSS em vez de <font>/<b>: o sanitizador guarda style, não tag legada.
    try {
      document.execCommand("styleWithCSS", false, "true")
    } catch {
      /* navegador antigo — segue com o padrão dele */
    }
    document.execCommand(cmd, false, valor)
    salvarCorpo()
  }

  /**
   * Troca o BLOCO da seleção (Título/Subtítulo/Corpo/Citação) reescrevendo o
   * elemento na mão.
   *
   * Não usa execCommand("formatBlock") de propósito: em WebKit ele exige o
   * valor entre sinais ("<h1>"), ignora silenciosamente vários casos e aninha
   * blocos quando o cursor está dentro de um <div> gerado pelo próprio
   * contentEditable. Trocar a tag preservando os filhos é previsível nos três
   * motores e, principalmente, é REVERSÍVEL: voltar de Título pra Corpo
   * funciona sempre.
   */
  function aplicarBloco(tag: "h1" | "h2" | "h3" | "p" | "blockquote") {
    const el = corpoRef.current
    if (!el) return
    restaurarSelecao()

    let alvos = blocosDaSelecao(el)
    if (alvos.length === 0) {
      // Nota que começou como texto solto: dá blocos a ela e tenta de novo.
      normalizarBlocos(el)
      restaurarSelecao()
      alvos = blocosDaSelecao(el)
    }
    if (alvos.length === 0) {
      onErro("Clique dentro do texto que você quer mudar.")
      return
    }
    if (alvos.some((b) => b.tagName.toLowerCase() === "li")) {
      onErro("Tire o texto da lista antes de mudar o estilo do parágrafo.")
      return
    }
    onErro(null)

    const novos: HTMLElement[] = []
    for (const antigo of alvos) {
      const novo = document.createElement(tag)
      // O style do bloco (cor, alinhamento) é da PESSOA, não do tipo de
      // bloco: sobrevive à troca.
      const estilo = antigo.getAttribute("style")
      if (estilo) novo.setAttribute("style", estilo)
      while (antigo.firstChild) novo.appendChild(antigo.firstChild)
      antigo.replaceWith(novo)
      novos.push(novo)
    }

    // Reseleciona o conteúdo convertido: aplicar Título e em seguida negrito
    // tem que atingir o mesmo trecho, sem clicar de novo.
    const sel = window.getSelection()
    const primeiro = novos[0]
    const ultimo = novos[novos.length - 1]
    if (sel && primeiro && ultimo) {
      try {
        const r = document.createRange()
        r.setStart(primeiro, 0)
        r.setEnd(ultimo, ultimo.childNodes.length)
        sel.removeAllRanges()
        sel.addRange(r)
        selecaoRef.current = r.cloneRange()
      } catch {
        selecaoRef.current = null
      }
    }
    el.focus()
    salvarCorpo()
  }

  /** Tamanho em px: execCommand só aceita 1..7, então convertemos depois. */
  function aplicarTamanho(px: number) {
    const el = corpoRef.current
    if (!el) return
    restaurarSelecao()
    try {
      document.execCommand("styleWithCSS", false, "false")
    } catch {}
    // 7 é um valor sentinela improvável de existir no texto — marcamos com
    // ele e trocamos todos os <font size="7"> pelo px real logo abaixo.
    document.execCommand("fontSize", false, "7")
    const marcados = Array.from(el.querySelectorAll<HTMLElement>('font[size="7"]'))
    for (const f of marcados) {
      const span = document.createElement("span")
      span.style.fontSize = `${px}px`
      while (f.firstChild) span.appendChild(f.firstChild)
      f.replaceWith(span)
    }
    if (marcados.length === 0) {
      // WebKit em alguns casos não emite <font>. Envolve a seleção na mão —
      // sem isto, "mudar o tamanho" simplesmente não fazia nada.
      const sel = window.getSelection()
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
      if (range && !range.collapsed) {
        try {
          const span = document.createElement("span")
          span.style.fontSize = `${px}px`
          span.appendChild(range.extractContents())
          range.insertNode(span)
        } catch {
          onErro("Não foi possível mudar o tamanho desse trecho. Selecione um pedaço menor.")
          return
        }
      }
    }
    salvarCorpo()
  }

  /**
   * Caixa do texto na SELEÇÃO. Reescreve o texto de verdade (não usa
   * text-transform do CSS): o conteúdo copiado pra fora da nota sai como a
   * pessoa vê, e a busca encontra o que está escrito.
   */
  function aplicarCaixa(modo: "maiuscula" | "minuscula" | "capitalizada") {
    const el = corpoRef.current
    if (!el) return
    restaurarSelecao()
    const sel = window.getSelection()
    const texto = sel?.toString() ?? ""
    if (!texto) {
      onErro("Selecione o texto que você quer mudar.")
      return
    }
    onErro(null)
    const novo =
      modo === "maiuscula"
        ? texto.toLocaleUpperCase("pt-BR")
        : modo === "minuscula"
          ? texto.toLocaleLowerCase("pt-BR")
          : texto
              .toLocaleLowerCase("pt-BR")
              .replace(/(^|[\s(["'¿¡])(\p{L})/gu, (_m, antes, letra) =>
                antes + letra.toLocaleUpperCase("pt-BR")
              )
    // insertText preserva a formatação do trecho e entra no undo do browser.
    document.execCommand("insertText", false, novo)
    salvarCorpo()
  }

  // ==========================================================
  // Link
  // ==========================================================

  function abrirLink() {
    const range = selecaoRef.current
    if (!range || range.collapsed) {
      onErro("Selecione o texto que vai virar link.")
      return
    }
    onErro(null)
    rangeLinkRef.current = range.cloneRange()
    setLinkUrl("https://")
    setLinkAberto(true)
  }

  function confirmarLink() {
    const el = corpoRef.current
    const range = rangeLinkRef.current
    if (!el || !range) return
    const url = linkUrl.trim()
    // As mesmas regras do sanitizador do servidor (hrefSeguro): http(s) e sem
    // aspas ou sinais que quebrariam o atributo. Melhor barrar aqui do que a
    // pessoa aplicar o link, ver na tela e ele desaparecer ao salvar.
    if (!/^https?:\/\//i.test(url) || /["'<>]/.test(url)) {
      onErro("O link precisa começar com http:// ou https:// e não pode ter aspas.")
      return
    }
    const sel = window.getSelection()
    el.focus()
    try {
      sel?.removeAllRanges()
      sel?.addRange(range)
    } catch {
      onErro("A seleção mudou. Selecione o texto de novo.")
      setLinkAberto(false)
      return
    }
    document.execCommand("createLink", false, url)
    marcarLinksSeguros(el)
    onErro(null)
    setLinkAberto(false)
    salvarCorpo()
  }

  // ==========================================================
  // Colar
  // ==========================================================

  /**
   * Colar passa pelo MESMO sanitizador do servidor antes de entrar na tela.
   *
   * Sem isto, colar do Google Docs/Word/site trazia <font>, classes e estilos
   * que o servidor descarta depois — a nota aparecia formatada, a pessoa
   * recarregava e o texto estava diferente. Sanitizando na entrada, o que se
   * vê é exatamente o que fica salvo.
   */
  function aoColar(e: React.ClipboardEvent<HTMLDivElement>) {
    const dados = e.clipboardData
    if (!dados) return
    const html = dados.getData("text/html")
    const texto = dados.getData("text/plain")
    if (!html && !texto) return
    e.preventDefault()
    const limpo = html ? sanitizarHtmlNota(html, MAX_CORPO) : textoParaHtml(texto)
    document.execCommand("insertHTML", false, limpo)
    const el = corpoRef.current
    if (el) marcarLinksSeguros(el)
    salvarCorpo()
  }

  // ==========================================================
  // Excluir
  // ==========================================================

  function excluir() {
    onErro(null)
    // Nada de salvar depois de excluir: a fila desta nota é descartada e o
    // corpo deixa de estar "sujo", senão um flush posterior ressuscitaria o
    // texto numa nota que já foi pra lixeira.
    filaRef.current.delete(nota.id)
    memoriaRef.current.delete(nota.id)
    corpoSujoRef.current = false
    cancelarTimer()
    void (async () => {
      const fd = new FormData()
      fd.set("id", nota.id)
      const r = await excluirNotaAction(fd)
      if (!r.ok) onErro(r.erro ?? "Não foi possível excluir.")
      else onExcluida()
    })()
  }

  const salvandoAgora = estado === "salvando" || estado === "pendente"

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ---------- Barra de formatação ---------- */}
      <div className="ws-nota-barra">
        {/* Bloco: título / subtítulo / corpo */}
        <select
          aria-label="Estilo do parágrafo"
          title="Título, subtítulo ou corpo"
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value
            e.target.value = ""
            if (!v) return
            aplicarBloco(v as "h1" | "h2" | "h3" | "p" | "blockquote")
          }}
          className="ws-nota-select"
        >
          <option value="" style={opt}>Estilo…</option>
          <option value="h1" style={opt}>Título</option>
          <option value="h2" style={opt}>Subtítulo</option>
          <option value="h3" style={opt}>Subtítulo menor</option>
          <option value="p" style={opt}>Corpo</option>
          <option value="blockquote" style={opt}>Citação</option>
        </select>

        {/* Fonte */}
        <select
          aria-label="Fonte"
          title="Fonte"
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return
            comando("fontName", e.target.value)
            e.target.value = ""
          }}
          className="ws-nota-select"
        >
          <option value="" style={opt}>Fonte…</option>
          {FONTES_NOTA.map((f) => (
            <option key={f.nome} value={f.css} style={opt}>
              {f.nome}
            </option>
          ))}
        </select>

        {/* Tamanho */}
        <select
          aria-label="Tamanho da fonte"
          title="Tamanho"
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return
            aplicarTamanho(Number(e.target.value))
            e.target.value = ""
          }}
          className="ws-nota-select"
          style={{ minWidth: 74 }}
        >
          <option value="" style={opt}>Tam.</option>
          {TAMANHOS_NOTA.map((t) => (
            <option key={t} value={t} style={opt}>
              {t}px
            </option>
          ))}
        </select>

        <span className="ws-nota-sep" aria-hidden="true" />

        <Botao rotulo="B" aria="Negrito" onAplicar={() => comando("bold")} estilo={{ fontWeight: 800 }} />
        <Botao rotulo="I" aria="Itálico" onAplicar={() => comando("italic")} estilo={{ fontStyle: "italic" }} />
        <Botao rotulo="U" aria="Sublinhado" onAplicar={() => comando("underline")} estilo={{ textDecoration: "underline" }} />
        <Botao rotulo="S" aria="Tachado" onAplicar={() => comando("strikeThrough")} estilo={{ textDecoration: "line-through" }} />

        <span className="ws-nota-sep" aria-hidden="true" />

        {/* Cor */}
        <select
          aria-label="Cor do texto"
          title="Cor do texto"
          defaultValue=""
          onChange={(e) => {
            const hex = e.target.value
            e.target.value = ""
            comando("foreColor", hex || "#e8e8ea")
          }}
          className="ws-nota-select"
        >
          <option value="" style={opt}>Cor…</option>
          {CORES_NOTA.map((c) => (
            <option key={c.nome} value={c.hex} style={opt}>
              {c.nome}
            </option>
          ))}
        </select>

        <span className="ws-nota-sep" aria-hidden="true" />

        <Botao rotulo="•" aria="Lista" onAplicar={() => comando("insertUnorderedList")} />
        <Botao rotulo="1." aria="Lista numerada" onAplicar={() => comando("insertOrderedList")} />

        {/* Link: o editor tinha suporte a link salvo (colado), mas nenhuma
            forma de CRIAR um. */}
        <Botao
          aria="Inserir link"
          onAplicar={abrirLink}
          icone={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          }
        />

        <span className="ws-nota-sep" aria-hidden="true" />

        {/* Caixa do texto */}
        <Botao rotulo="AA" aria="MAIÚSCULAS" onAplicar={() => aplicarCaixa("maiuscula")} />
        <Botao rotulo="aa" aria="minúsculas" onAplicar={() => aplicarCaixa("minuscula")} />
        <Botao rotulo="Aa" aria="Primeira Maiúscula" onAplicar={() => aplicarCaixa("capitalizada")} />

        <span className="ws-nota-sep" aria-hidden="true" />

        {/* Setas curvas de verdade (o ⟲ do texto some em algumas fontes). */}
        <Botao
          aria="Desfazer"
          onAplicar={() => comando("undo")}
          icone={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13" />
            </svg>
          }
        />
        <Botao
          aria="Refazer"
          onAplicar={() => comando("redo")}
          icone={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3L21 13" />
            </svg>
          }
        />
        <Botao rotulo="⌫" aria="Limpar formatação" onAplicar={() => comando("removeFormat")} />

        <span style={{ flex: 1 }} />

        {confirmando ? (
          <>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={excluir}
              className="no-ds"
              style={{ fontSize: 11, fontWeight: 600, color: "#e24b4a", background: "none", border: "1px solid rgba(226,75,74,0.4)", borderRadius: 6, padding: "4px 9px", cursor: "pointer" }}
            >
              Confirmar exclusão
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setConfirmando(false)}
              className="no-ds"
              style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setConfirmando(true)}
            aria-label="Excluir nota"
            title="Excluir nota"
            className="no-ds ws-btn-icone"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>

      {/* Campo do link: aparece só quando pedido, ao lado da barra. */}
      {linkAberto && (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            padding: "6px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <input
            type="url"
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                confirmarLink()
              }
              if (e.key === "Escape") setLinkAberto(false)
            }}
            placeholder="https://…"
            aria-label="Endereço do link"
            className="glass-input"
            style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 6 }}
          />
          <button
            type="button"
            onClick={confirmarLink}
            className="no-ds"
            style={{ fontSize: 11, fontWeight: 600, color: "#4573d2", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => setLinkAberto(false)}
            className="no-ds"
            style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
          >
            Cancelar
          </button>
        </div>
      )}

      <input
        type="text"
        value={titulo}
        onChange={(e) => {
          const v = e.target.value
          setTitulo(v)
          onTitulo(v) // lista da esquerda atualiza na hora
          const n = notaRef.current
          const anterior = memoriaRef.current.get(n.id)
          memoriaRef.current.set(n.id, {
            corpo: anterior?.corpo ?? corpoRef.current?.innerHTML ?? n.corpo_html,
            titulo: v,
            propCorpo: n.corpo_html,
            propTitulo: n.titulo,
          })
          // Campo próprio na fila: título e corpo não se atropelam mais.
          marcar({ titulo: v })
        }}
        onBlur={flushAgora}
        placeholder="Título da nota"
        maxLength={200}
        className="no-ds"
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "var(--text-1)",
          background: "transparent",
          border: "none",
          padding: "14px 16px 6px",
          fontFamily: "inherit",
        }}
      />

      <div
        ref={corpoRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Corpo da nota"
        aria-busy={salvandoAgora}
        onInput={aoDigitarCorpo}
        onPaste={aoColar}
        // Sair do campo salva na hora: clicar em outra nota ou em outro lugar
        // da tela não tem que esperar o debounce.
        onBlur={flushAgora}
        className="ws-nota-corpo"
        data-placeholder="Escreva aqui… selecione um trecho e use a barra acima para formatar."
      />
    </div>
  )
}

// ============================================================
// Helpers de DOM (puros o suficiente pra conferir de cabeça)
// ============================================================

const TAGS_BLOCO = "p, div, h1, h2, h3, blockquote, li"
const NOMES_BLOCO = new Set(["p", "div", "h1", "h2", "h3", "blockquote", "ul", "ol", "li"])

function ehBloco(n: Node): boolean {
  return n.nodeType === 1 && NOMES_BLOCO.has((n as Element).tagName.toLowerCase())
}

/**
 * Garante que todo conteúdo do topo esteja dentro de um bloco.
 *
 * Uma nota nova começa como texto solto no contentEditable (sem <p>), e nesse
 * estado não existe bloco pra trocar por <h1> — era mais um jeito de "mudar o
 * estilo e nada acontecer". <br> solto no topo separa parágrafos.
 *
 * Não mexe em nota vazia: um <p></p> injetado quebraria o :empty::before que
 * desenha o texto de ajuda.
 */
function normalizarBlocos(el: HTMLElement) {
  if (el.innerHTML.trim() === "") return

  const filhos = Array.from(el.childNodes)
  let grupo: Node[] = []

  function fecharGrupo(referencia: Node | null) {
    if (grupo.length === 0) return
    const p = document.createElement("p")
    for (const n of grupo) p.appendChild(n) // appendChild MOVE o nó
    el.insertBefore(p, referencia)
    grupo = []
  }

  for (const filho of filhos) {
    const tag = filho.nodeType === 1 ? (filho as Element).tagName.toLowerCase() : ""
    if (tag === "br") {
      const proximo = filho.nextSibling
      el.removeChild(filho)
      fecharGrupo(proximo)
      continue
    }
    if (ehBloco(filho)) {
      fecharGrupo(filho)
      continue
    }
    // Espaço em branco entre blocos não vira parágrafo vazio.
    if (filho.nodeType === 3 && !filho.textContent?.trim() && grupo.length === 0) continue
    grupo.push(filho)
  }
  fecharGrupo(null)
}

/**
 * Blocos MAIS INTERNOS que a seleção toca. Selecionar três linhas e pedir
 * "Subtítulo" converte as três — é o que a pessoa espera de um editor.
 */
function blocosDaSelecao(el: HTMLElement): HTMLElement[] {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return []
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return []

  const tocados = Array.from(el.querySelectorAll<HTMLElement>(TAGS_BLOCO)).filter((b) => {
    // Bloco que contém outro bloco é só embalagem — converter ele arrastaria
    // os filhos junto e embaralharia a estrutura.
    if (b.querySelector(TAGS_BLOCO)) return false
    return range.intersectsNode(b)
  })
  if (tocados.length > 0) return tocados

  // Cursor colapsado: sobe até o primeiro bloco.
  let n: Node | null = range.startContainer
  while (n && n !== el) {
    if (ehBloco(n)) return [n as HTMLElement]
    n = n.parentNode
  }
  return []
}

/**
 * target/rel nos links do editor. O sanitizador do servidor já força isso na
 * gravação; aqui é pra que o link recém-criado JÁ abra em nova aba, sem
 * precisar recarregar a página pra ganhar o comportamento.
 */
function marcarLinksSeguros(el: HTMLElement) {
  for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    a.target = "_blank"
    a.rel = "noopener noreferrer"
  }
}

/**
 * Texto puro colado → HTML. Escapa primeiro (nada de tag virando elemento),
 * transforma URL em link clicável e respeita as quebras de linha.
 */
function textoParaHtml(texto: string): string {
  const escapado = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  const comLinks = escapado.replace(
    /(https?:\/\/[^\s<]+)/g,
    (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`
  )
  return comLinks
    .split(/\r?\n/)
    .map((linha) => (linha.trim() === "" ? "<p><br></p>" : `<p>${linha}</p>`))
    .join("")
}

/**
 * Botão da barra. preventDefault no mousedown é OBRIGATÓRIO: sem ele o clique
 * tira o foco do contentEditable, a seleção morre e o execCommand não tem
 * onde aplicar.
 */
function Botao({
  rotulo,
  icone,
  aria,
  onAplicar,
  estilo,
}: {
  rotulo?: string
  icone?: React.ReactNode
  aria: string
  onAplicar: () => void
  estilo?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      title={aria}
      onMouseDown={(e) => {
        e.preventDefault()
        onAplicar()
      }}
      className="no-ds ws-btn-icone"
      style={{ width: 28, height: 26, fontSize: 12, flexShrink: 0, ...estilo }}
    >
      {icone ?? rotulo}
    </button>
  )
}

const opt: React.CSSProperties = { color: "#111" }
