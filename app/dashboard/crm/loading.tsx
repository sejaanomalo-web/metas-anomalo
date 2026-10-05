import { Bloco } from "@/components/ui/Esqueleto"

/**
 * Casca do CRM.
 *
 * O CRM não usa a moldura das outras telas: ele ocupa a altura toda
 * (`.crm-fullscreen`) e divide a área em lista de conversas + thread
 * (`.crm-conversas-grid`). Um esqueleto com a moldura padrão faria a tela
 * saltar de formato quando os dados chegassem, que é exatamente o que uma
 * fronteira de carregamento deveria evitar.
 */
export default function CrmLoading() {
  return (
    <main
      className="crm-fullscreen mx-auto px-8 py-8 flex flex-col"
      aria-busy="true"
      aria-label="Carregando o CRM"
    >
      <div
        className="flex items-center justify-between flex-wrap gap-4"
        style={{ flexShrink: 0 }}
      >
        <div className="flex items-center gap-6">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Bloco largura={120} altura={11} />
            <Bloco largura={200} altura={30} raio={8} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[92, 88, 96].map((w, i) => (
            <Bloco key={i} largura={w} altura={32} raio={8} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, marginTop: 20 }}>
        <div className="glass crm-conversas-grid" style={{ height: "100%" }}>
          {/* Lista de conversas */}
          <div
            className="crm-sidebar-pane"
            style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <Bloco largura="100%" altura={34} raio={8} />
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0" }}>
                <Bloco largura={36} altura={36} raio={18} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Bloco largura="60%" altura={12} />
                  <Bloco largura="85%" altura={10} />
                </div>
              </div>
            ))}
          </div>

          {/* Thread */}
          <div
            className="crm-thread-pane"
            style={{
              minWidth: 0,
              minHeight: 0,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              justifyContent: "flex-end",
            }}
          >
            {[
              { l: "46%", d: "flex-start" },
              { l: "38%", d: "flex-end" },
              { l: "58%", d: "flex-start" },
              { l: "30%", d: "flex-end" },
              { l: "50%", d: "flex-start" },
            ].map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.d }}>
                <Bloco largura={m.l} altura={38} raio={12} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
