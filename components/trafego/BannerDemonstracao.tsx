/**
 * Banner de estado pro Gerenciador de Anúncios. Distingue dois casos que NÃO
 * são a mesma coisa:
 *   • "sem-conexao": empresa sem token Meta → ação é conectar.
 *   • "sem-dados": conectada, mas sem campanhas no período (ou histórico ainda
 *     não coletado) → ação é ajustar período / aguardar o Sentinela.
 */
export default function BannerDemonstracao({
  tipo,
}: {
  tipo: "sem-conexao" | "sem-dados"
}) {
  const { titulo, corpo } =
    tipo === "sem-conexao"
      ? {
          titulo: "Sem conexão com o Meta",
          corpo:
            "Esta empresa não tem token Meta cadastrado (tokens_meta). Conecte a conta em Configurações para o Sentinela puxar as campanhas.",
        }
      : {
          titulo: "Sem campanhas no período",
          corpo:
            "O Sentinela não registrou campanhas pagas neste intervalo. Ajuste o período ou aguarde a próxima execução do agente.",
        }
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 12,
        border: "1px solid rgba(201,149,58,0.30)",
        background: "rgba(201,149,58,0.06)",
        color: "var(--text-2)",
        fontSize: 13,
        lineHeight: 1.6,
        display: "flex",
        gap: 12,
      }}
    >
      <span aria-hidden="true" style={{ color: "var(--accent)", fontSize: 16 }}>
        ⚠️
      </span>
      <span>
        <strong style={{ color: "var(--accent)" }}>{titulo}</strong> · {corpo}
      </span>
    </div>
  )
}
