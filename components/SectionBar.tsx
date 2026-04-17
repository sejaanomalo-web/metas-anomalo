export default function SectionBar({
  titulo,
  hint,
}: {
  titulo: string
  hint?: string
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        background: "#090909",
        borderBottom: "0.5px solid #111111",
        padding: "12px 24px",
      }}
    >
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.3px",
          color: "#686868",
          fontWeight: 400,
        }}
      >
        {titulo}
      </span>
      {hint && (
        <span
          style={{
            fontSize: 8,
            letterSpacing: "2px",
            color: "#1e1e1e",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  )
}
