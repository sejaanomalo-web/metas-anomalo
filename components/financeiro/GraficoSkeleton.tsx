/**
 * Espaço reservado enquanto o gráfico carrega.
 *
 * Tem a MESMA altura do gráfico que vai substituí-lo: sem isso, o conteúdo
 * abaixo pularia quando o Recharts chegasse — e pular é pior que esperar
 * quando a pessoa já começou a ler a tela.
 */
export default function GraficoSkeleton({ altura = 320 }: { altura?: number }) {
  return (
    <div
      className="glass"
      style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}
      aria-hidden="true"
    >
      <div
        style={{
          width: 180,
          height: 12,
          borderRadius: 4,
          background: "var(--surface-2)",
        }}
      />
      <div
        style={{
          width: "100%",
          height: altura,
          borderRadius: 10,
          background:
            "linear-gradient(90deg, var(--surface-2) 0%, rgba(255,255,255,0.04) 50%, var(--surface-2) 100%)",
          backgroundSize: "200% 100%",
          animation: "fin-skeleton 1.4s ease-in-out infinite",
        }}
      />
    </div>
  )
}
