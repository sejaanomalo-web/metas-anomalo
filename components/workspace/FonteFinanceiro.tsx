"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * Liga/desliga a fonte "financeiro" na agenda.
 *
 * Existe porque nem todo dia a pergunta é sobre dinheiro: quem está olhando a
 * semana de trabalho às vezes quer só as tarefas. Sem o botão, a única saída
 * seria não mostrar os vencimentos a ninguém.
 *
 * O estado vive na URL (?fin=0), como o resto dos filtros da agenda — assim
 * ele sobrevive a abrir uma tarefa e voltar, e é compartilhável.
 */
export default function FonteFinanceiro({ ativa }: { ativa: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function alternar() {
    const p = new URLSearchParams(searchParams?.toString() ?? "")
    if (ativa) p.set("fin", "0")
    else p.delete("fin")
    const qs = p.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={
        ativa
          ? "Esconder os vencimentos do financeiro"
          : "Mostrar as contas a pagar e a receber junto das tarefas"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 12px",
        borderRadius: 9999,
        border: `1px solid ${ativa ? "rgba(201,149,58,0.55)" : "rgba(255,255,255,0.12)"}`,
        background: ativa ? "rgba(201,149,58,0.14)" : "transparent",
        color: ativa ? "var(--accent)" : "var(--text-3)",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.3px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: ativa ? "var(--accent)" : "var(--text-4)",
        }}
      />
      Vencimentos
    </button>
  )
}
