import { corAvatar, iniciais, textoSobre } from "@/lib/workspace-cores"

/**
 * Avatar de iniciais no estilo do Asana: círculo com cor estável por pessoa.
 * Não há upload de foto no sistema — as iniciais são a identidade visual,
 * exatamente como o Asana faz com quem não tem foto.
 */
export default function Avatar({
  nome,
  tamanho = 24,
  title,
}: {
  nome: string | null | undefined
  tamanho?: number
  title?: string
}) {
  if (!nome) {
    // Sem responsável: círculo tracejado vazio, como o "No assignee" do Asana.
    return (
      <span
        aria-hidden="true"
        style={{
          width: tamanho,
          height: tamanho,
          borderRadius: "50%",
          border: "1px dashed var(--text-4)",
          display: "inline-flex",
          flexShrink: 0,
        }}
      />
    )
  }
  const bg = corAvatar(nome)
  return (
    <span
      title={title ?? nome}
      aria-hidden="true"
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: "50%",
        background: bg,
        color: textoSobre(bg),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(8, Math.round(tamanho * 0.42)),
        fontWeight: 700,
        letterSpacing: "0.02em",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {iniciais(nome)}
    </span>
  )
}
