/**
 * Skeleton do Workspace, na MESMA moldura fixa das páginas (.ws-main):
 * trocar de aba renderiza esta casca na hora — o cinza não muda de tamanho
 * e o esqueleto pulsa até os dados chegarem, sem corte seco.
 */
export default function WorkspaceLoading() {
  return (
    <main className="ws-main" aria-busy="true" aria-label="Carregando o Workspace">
      <div className="ws-topo">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0 8px" }}>
          <span style={{ ...bloco, width: 34, height: 34, borderRadius: 8 }} />
          <span style={{ ...bloco, width: 160, height: 22 }} />
        </div>
        <div style={{ display: "flex", gap: 8, paddingBottom: 8 }}>
          {[70, 90, 76, 66, 80, 72].map((w, i) => (
            <span key={i} style={{ ...bloco, width: w, height: 14 }} />
          ))}
        </div>
      </div>
      <div className="ws-conteudo">
        <span style={{ ...bloco, width: "100%", flex: 1, borderRadius: 12 }} />
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
