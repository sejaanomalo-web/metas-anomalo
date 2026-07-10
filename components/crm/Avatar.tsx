function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/** Círculo de iniciais colorido pela cor da instância/empresa — mesma cor
 *  em toda a UI (lista, thread, kanban) pra identificar de qual número
 *  veio a conversa. */
export default function Avatar({
  nome,
  cor,
  size = 40,
}: {
  nome: string
  cor: string
  size?: number
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `${cor}2e`,
        color: cor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.38),
        fontWeight: 600,
        flexShrink: 0,
        border: `1px solid ${cor}4d`,
      }}
    >
      {iniciais(nome)}
    </div>
  )
}
