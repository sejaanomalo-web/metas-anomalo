/**
 * Skeleton do Workspace. Todas as rotas do módulo são dinâmicas (dados do
 * servidor a cada navegação) — sem este boundary, trocar de aba deixava a
 * tela ANTIGA congelada até o servidor responder, que é o "travamento"
 * percebido. Com ele, a troca é instantânea e o esqueleto pulsa enquanto
 * os dados chegam.
 */
export default function WorkspaceLoading() {
  return (
    <main
      className="ws-main"
      style={{ padding: "16px 16px 48px", maxWidth: 1280, margin: "0 auto" }}
      aria-busy="true"
      aria-label="Carregando o Workspace"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...bloco, width: 34, height: 34, borderRadius: 8 }} />
          <span style={{ ...bloco, width: 160, height: 22 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[70, 90, 76, 66, 80, 72].map((w, i) => (
            <span key={i} style={{ ...bloco, width: w, height: 14 }} />
          ))}
        </div>
        <span style={{ ...bloco, width: "100%", height: "56vh", borderRadius: 12 }} />
      </div>
    </main>
  )
}

const bloco: React.CSSProperties = {
  display: "inline-block",
  background: "rgba(255,255,255,0.07)",
  borderRadius: 6,
  animation: "pulse 1.4s ease-in-out infinite",
}
