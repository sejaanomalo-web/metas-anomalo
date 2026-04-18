interface Celula {
  rotulo: string
  valor: string
  cor?: string
  metaDisplay?: string
  corMeta?: string
  hint?: string
}

export default function StripMetricas({ celulas }: { celulas: Celula[] }) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4"
      style={{
        background: "#141414",
        gap: "0.5px",
      }}
    >
      {celulas.map((c, i) => (
        <div
          key={i}
          style={{
            background: "#090909",
            padding: "18px 24px",
          }}
        >
          <p
            style={{
              fontSize: 11,
              letterSpacing: "1px",
              color: "#666",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            {c.rotulo}
          </p>
          <p
            style={{
              fontSize: 24,
              fontWeight: 400,
              color: c.cor ?? "#fff",
              marginTop: 8,
              lineHeight: 1.1,
            }}
          >
            {c.valor}
          </p>
          {c.metaDisplay && (
            <p
              style={{
                fontSize: 12,
                color: c.corMeta ?? "#333",
                marginTop: 4,
                fontWeight: 400,
              }}
            >
              {c.metaDisplay}
            </p>
          )}
          {c.hint && (
            <p
              style={{
                fontSize: 11,
                color: "#444",
                marginTop: 2,
                fontWeight: 400,
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
