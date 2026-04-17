interface Celula {
  rotulo: string
  valor: string
  destaque?: boolean
  hint?: string
  semProjecao?: boolean
}

export default function StripMetricas({ celulas }: { celulas: Celula[] }) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4"
      style={{
        background: "#111111",
        gap: "0.5px",
      }}
    >
      {celulas.map((c, i) => (
        <div
          key={i}
          style={{
            background: "#090909",
            padding: "14px 20px",
          }}
        >
          <p
            style={{
              fontSize: 8,
              letterSpacing: "2px",
              color: "#202020",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            {c.rotulo}
          </p>
          <p
            className="font-mono"
            style={{
              fontSize: 20,
              fontWeight: 300,
              color: c.semProjecao
                ? "#1c1c1c"
                : c.destaque
                ? "#C9953A"
                : "#b8b8b8",
              letterSpacing: "-0.5px",
              marginTop: 6,
              lineHeight: 1.1,
            }}
          >
            {c.valor}
          </p>
          {c.hint && (
            <p
              className="font-mono"
              style={{
                fontSize: 9,
                color: "#1a1a1a",
                marginTop: 4,
                fontWeight: 300,
              }}
            >
              {c.hint}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
