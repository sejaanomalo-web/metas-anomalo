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
        borderBottom: "0.5px solid #141414",
        padding: "14px 24px",
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: "#888",
          fontWeight: 400,
        }}
      >
        {titulo}
      </span>
      {hint && (
        <span
          style={{
            fontSize: 11,
            color: "#555",
            fontWeight: 400,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  )
}
