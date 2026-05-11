import LogoToggle from "@/components/LogoToggle"

/**
 * Top bar global das rotas autenticadas. Contém:
 *   • LogoToggle (logo Anômalo, clicar expande/recolhe a sidebar)
 *   • Slot pra children (geralmente o SeletorPeriodo da página)
 *
 * Configurações e Sair foram movidos pro rail (AppShell). Inputs de
 * navegação por sessão ficam todos lá; o header fica só pra contexto
 * (logo + filtro de período).
 */
export default function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header
      className="glass-header sticky top-0 z-20"
      style={{ height: 64 }}
    >
      <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between gap-4">
        <LogoToggle />
        <div className="flex items-center gap-3">{children}</div>
      </div>
    </header>
  )
}
