/**
 * Top bar minimalista que algumas páginas internas (/dashboard/[empresa],
 * configuracoes, etc.) ainda usam pra ancorar o SeletorPeriodo. Não
 * mostra logo nem ações — a navegação inteira vive no rail (AppShell).
 *
 * /dashboard e /dashboard/empresas não usam mais este componente —
 * elas embutem o SeletorPeriodo direto no hero da página, sem cabeçalho
 * sticky.
 */
export default function Header({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <header
      className="glass-header sticky top-0 z-20"
      style={{ height: 56 }}
    >
      <div className="mx-auto h-full px-8 flex items-center justify-end gap-3" style={{ maxWidth: 1280 }}>
        {children}
      </div>
    </header>
  )
}
