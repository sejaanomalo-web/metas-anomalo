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
  maximumScale: 1,
  userScalable: false,
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
      </head>
      {/* min-h-dvh (não min-h-screen/100vh): em mobile, vh usa a viewport
          "grande" (barra do navegador recolhida) — com a barra visível
          (o estado mais comum), min-height:100vh deixa o body mais alto do
          que o conteúdo, sobrando espaço em branco rolável no fim da página. */}
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
