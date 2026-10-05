import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "METΛS",
  description: "Painel interno de metas e funil de vendas do Grupo Anômalo Hub.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Anômalo",
  },
  icons: {
    // Favicon do navegador = Λ branco sem fundo (versão minimalista).
    // PWA icons (apple-touch + manifest 192/512) seguem com fundo
    // preto pra ficarem destacados na tela inicial do iOS/Android.
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  // `viewportFit: "cover"` é o que LIGA o env(safe-area-inset-*) do CSS.
  // Sem ele, todo env(safe-area-inset-*) resolve para 0 — e o app declara
  // `statusBarStyle: "black-translucent"`, que no iOS em modo standalone
  // faz o conteúdo começar em y=0, POR BAIXO do relógio e da ilha dinâmica.
  // O resultado era o botão do menu e o sino ficarem embaixo da barra de
  // status no app instalado. As compensações de notch já existiam no CSS;
  // faltava esta linha para elas valerem alguma coisa.
  viewportFit: "cover",
  themeColor: "#c9953a",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Largura do menu lateral ANTES da primeira pintura.
         *
         * O AppShell só descobre a preferência dentro de um useEffect, então
         * a primeira pintura saía sempre com o rail recolhido (72px). Para
         * quem deixa o menu aberto, logo após a hidratação a largura pulava
         * para 240px — e como `.app-main` anima `margin-left`, que é
         * propriedade de LAYOUT, cada quadro dessa animação refazia o layout
         * de toda a árvore à direita (tabelas, gráficos, grade do Workspace)
         * justamente enquanto a thread ainda estava hidratando.
         *
         * Lendo aqui, o valor certo já vale no primeiro quadro. O try/catch
         * cobre navegação privada e storage bloqueado, caindo no mesmo
         * padrão de hoje (72px). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var v=localStorage.getItem('anomalo-sidebar-expandido');" +
              "document.documentElement.style.setProperty('--rail-width'," +
              "v==='true'?'240px':'72px')}catch(e){}",
          }}
        />
      </head>
      {/* min-h-dvh (não min-h-screen/100vh): em mobile, vh usa a viewport
          "grande" (barra do navegador recolhida) — com a barra visível
          (o estado mais comum), min-height:100vh deixa o body mais alto do
          que o conteúdo, sobrando espaço em branco rolável no fim da página. */}
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
