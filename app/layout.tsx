import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Anômalo Hub — Painel de Metas",
  description: "Painel interno de metas e funil de vendas do Grupo Anômalo Hub.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-bg text-white">{children}</body>
    </html>
  )
}
