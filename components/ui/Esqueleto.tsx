/**
 * Peças de esqueleto para as fronteiras de carregamento (`loading.tsx`).
 *
 * Por que isso existe
 * -------------------
 * Toda página de /dashboard é `force-dynamic`: ao trocar de seção, o Next
 * precisa ir ao servidor, rodar as consultas e só então tem o que desenhar.
 * Sem um `loading.tsx` no segmento, não existe fronteira de Suspense — e sem
 * fronteira o roteador NÃO troca a tela: a página ANTIGA fica congelada
 * até a nova ficar pronta. O clique parece não ter funcionado.
 *
 * Com um `loading.tsx`, a casca aparece no mesmo quadro do clique e o
 * conteúdo chega por cima. O tempo total é o mesmo; o que muda é que o
 * sistema responde na hora.
 *
 * Por que o esqueleto imita o layout real
 * ---------------------------------------
 * Um spinner genérico centralizado troca "tela congelada" por "tela em
 * branco" — e ainda faz o conteúdo saltar quando chega. Estas peças
 * reproduzem a MOLDURA de cada módulo (título, abas, cards), então a
 * transição lê como a página se preenchendo, não como um flash.
 *
 * Server Component de propósito: é só marcação, não precisa de JS no
 * cliente. Um esqueleto que custa hidratação seria um contrassenso.
 */

export function Bloco({
  largura = "100%",
  altura = 14,
  raio = 6,
  style,
}: {
  largura?: number | string
  altura?: number | string
  raio?: number
  style?: React.CSSProperties
}) {
  return (
    <span
      style={{
        display: "block",
        width: largura,
        height: altura,
        borderRadius: raio,
        background: "rgba(255,255,255,0.07)",
        // `pulse` já existe em globals.css e respeita prefers-reduced-motion
        // junto com as outras animações do projeto.
        animation: "pulse 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  )
}

/** Cartão vazio na mesma moldura do `.glass` usado pelas telas reais. */
export function CartaoEsqueleto({
  altura = 120,
  children,
}: {
  altura?: number | string
  children?: React.ReactNode
}) {
  return (
    <div
      className="glass"
      style={{
        padding: "20px 24px",
        minHeight: altura,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {children ?? (
        <>
          <Bloco largura={120} altura={11} />
          <Bloco largura="70%" altura={22} />
        </>
      )}
    </div>
  )
}

/** Fileira de KPIs — a mesma grade `md:grid-cols-2 lg:grid-cols-N` das telas. */
export function KpisEsqueleto({ quantidade = 4 }: { quantidade?: number }) {
  // As classes precisam ser literais: o Tailwind varre o código como TEXTO,
  // então uma classe montada por template (`lg:grid-cols-${n}`) nunca entra
  // no CSS gerado e a grade sairia com uma coluna só.
  const grade =
    quantidade === 3
      ? "grid grid-cols-1 md:grid-cols-3"
      : quantidade === 2
        ? "grid grid-cols-1 md:grid-cols-2"
        : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"

  return (
    <section className={grade} style={{ gap: 16 }}>
      {Array.from({ length: quantidade }, (_, i) => (
        <CartaoEsqueleto key={i} altura={104}>
          <Bloco largura={90} altura={10} />
          <Bloco largura="60%" altura={26} />
          <Bloco largura={70} altura={10} />
        </CartaoEsqueleto>
      ))}
    </section>
  )
}

/** Barra de abas em pílulas (FinanceiroNav, TabsTrafego, TabsMetas…). */
export function AbasEsqueleto({ quantidade = 5 }: { quantidade?: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: 4,
        background: "var(--surface-1)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {[96, 112, 104, 88, 120, 100, 132].slice(0, quantidade).map((w, i) => (
        <Bloco key={i} largura={w} altura={30} raio={8} />
      ))}
    </div>
  )
}

/** Cabeçalho: rótulo do módulo, título grande e o seletor de período. */
export function CabecalhoEsqueleto({
  comDivisor = true,
  larguraTitulo = 280,
}: {
  comDivisor?: boolean
  larguraTitulo?: number
}) {
  return (
    <div>
      <Bloco largura={140} altura={11} />
      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Bloco largura={larguraTitulo} altura={36} raio={8} />
        <Bloco largura={200} altura={34} raio={8} />
      </div>
      {comDivisor && <div className="gold-divider" style={{ marginTop: 18, opacity: 0.4 }} />}
    </div>
  )
}

/** Tabela: cabeçalho + N linhas, dentro da mesma moldura `.glass`. */
export function TabelaEsqueleto({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="glass" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Bloco largura={130} altura={14} />
        <Bloco largura={150} altura={32} raio={8} />
      </div>
      {Array.from({ length: linhas }, (_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "14px 24px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <Bloco largura={64} altura={12} />
          <Bloco largura="34%" altura={12} />
          <Bloco largura="16%" altura={12} />
          <div style={{ flex: 1 }} />
          <Bloco largura={92} altura={12} />
        </div>
      ))}
    </div>
  )
}

/**
 * Moldura padrão de uma página do dashboard. As telas reais usam
 * `mx-auto px-4 md:px-8 py-10` com `maxWidth: 1280` — o esqueleto usa a
 * mesma, senão o conteúdo escorrega lateralmente quando chega.
 */
export function PaginaEsqueleto({
  children,
  rotulo = "Carregando",
}: {
  children: React.ReactNode
  rotulo?: string
}) {
  return (
    <main
      className="mx-auto px-4 md:px-8 py-10 space-y-8"
      style={{ maxWidth: 1280 }}
      aria-busy="true"
      aria-label={rotulo}
    >
      {children}
    </main>
  )
}
