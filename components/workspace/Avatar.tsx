/* eslint-disable @next/next/no-img-element */
import { corAvatar, iniciais, textoSobre } from "@/lib/workspace-cores"

/**
 * Avatar no estilo do Asana: foto quando o usuário subiu uma (Configurações
 * do Workspace), senão círculo de iniciais com cor estável por pessoa.
 */
export default function Avatar({
  nome,
  foto,
  tamanho = 24,
  title,
}: {
  nome: string | null | undefined
  foto?: string | null
  tamanho?: number
  title?: string
}) {
  if (foto) {
    return (
      <img
        src={foto}
        alt={nome ?? "Avatar"}
        title={title ?? nome ?? undefined}
        width={tamanho}
        height={tamanho}
        style={{
          width: tamanho,
          height: tamanho,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    )
  }
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
