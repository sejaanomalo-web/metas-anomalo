export default function MetaProjetada({
  cards,
}: {
  cards: { titulo: string; valor: string; hint?: string }[]
}) {
  return (
    <div className="glass" style={{ padding: 24 }}>
      <p
        style={{
          fontSize: 9,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: 16,
        }}
      >
        Meta Projetada
      </p>
      <div
        className="grid grid-cols-2 sm:grid-cols-3"
        style={{ gap: 10 }}
      >
        {cards.map((c) => (
          <div
            key={c.titulo}
            className="glass"
            style={{ padding: "14px 16px", borderRadius: 12 }}
          >
            <p
              style={{
                fontSize: 9,
                letterSpacing: "2px",
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              {c.titulo}
            </p>
            <p
              style={{
                fontSize: 18,
                color: "#ffffff",
                fontWeight: 600,
                marginTop: 6,
                lineHeight: 1.1,
              }}
            >
              {c.valor}
            </p>
            {c.hint && (
              <p
                style={{
                  fontSize: 10,
                  color: "#C9953A",
                  fontWeight: 400,
                  marginTop: 4,
                }}
              >
                {c.hint}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
