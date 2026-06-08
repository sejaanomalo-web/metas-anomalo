import Link from "next/link"

/**
 * Abas de seção no nível da página (ex.: [Funil | Time], [Visão geral |
 * Time]). Server component — o caller informa qual está ativa. Estilo
 * espelha o TabsTrafego.
 */
export default function AbasArea({
  itens,
}: {
  itens: { label: string; href: string; ativo: boolean }[]
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {itens.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="no-ds hover:brightness-110 transition"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "none",
            textDecoration: "none",
            ...(it.ativo
              ? {
                  background: "var(--accent)",
                  color: "#000",
                  border: "1px solid var(--accent)",
                  boxShadow: "0 0 16px rgba(201,149,58,0.22)",
                }
              : {
                  background: "rgba(201,149,58,0.08)",
                  color: "var(--accent)",
                  border: "1px solid rgba(201,149,58,0.45)",
                }),
          }}
        >
          {it.label}
        </Link>
      ))}
    </div>
  )
}
