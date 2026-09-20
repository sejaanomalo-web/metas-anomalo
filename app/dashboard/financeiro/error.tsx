"use client"

import { useEffect } from "react"
import Link from "next/link"
import * as Sentry from "@sentry/nextjs"

/**
 * Boundary do módulo financeiro.
 *
 * Existe por um motivo específico: as migrações deste projeto são aplicadas à
 * mão no SQL Editor, então existe uma janela em que o código novo já está no
 * ar e a coluna ainda não. Sem esta tela, o usuário veria a página em branco
 * do Next e não teria como saber que basta aplicar um arquivo SQL.
 *
 * A boundary é do MÓDULO, não da aplicação: o resto do sistema continua
 * navegável enquanto o financeiro está com problema.
 */
export default function ErroFinanceiro({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const texto = error?.message ?? ""
  // Os códigos que o Postgres devolve quando o schema está atrás do código.
  const pareceSchema = /42703|23502|42883|42P01|PGRST204|column .* does not exist/i.test(
    texto
  )

  return (
    <main
      className="mx-auto px-4 md:px-8 py-10"
      style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>Financeiro</p>
        <h1 style={{ fontSize: 30, marginTop: 6 }}>
          {pareceSchema ? "Falta aplicar uma migração" : "Algo quebrou aqui"}
        </h1>
      </div>

      {pareceSchema ? (
        <div
          className="glass"
          style={{ padding: "20px 24px", fontSize: 14, lineHeight: 1.65 }}
        >
          <p>
            O código do financeiro já está atualizado, mas o banco ainda não tem
            as colunas ou funções que ele usa.
          </p>
          <p style={{ marginTop: 12 }}>
            Abra o <strong>SQL Editor do Supabase</strong> e rode, em ordem, os
            arquivos de <code>supabase/migrations/</code> que ainda não foram
            aplicados — começando pelos que têm <code>financeiro</code> no nome.
            Todos são idempotentes: rodar de novo um que já passou não faz nada.
          </p>
        </div>
      ) : (
        <div
          className="glass"
          style={{ padding: "20px 24px", fontSize: 14, lineHeight: 1.65 }}
        >
          <p>
            Nenhum dado foi perdido — esta tela só faz leitura. O erro já foi
            registrado no monitoramento.
          </p>
        </div>
      )}

      {texto && (
        <details
          style={{
            fontSize: 12,
            color: "var(--text-3)",
            background: "var(--surface-2)",
            borderRadius: 8,
            padding: "12px 16px",
          }}
        >
          <summary style={{ cursor: "pointer" }}>Detalhe técnico</summary>
          <pre
            style={{
              marginTop: 10,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 11,
            }}
          >
            {texto}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        </details>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={reset} className="btn-gold-filled">
          Tentar de novo
        </button>
        <Link
          href="/dashboard"
          style={{
            padding: "10px 16px",
            border: "0.5px solid rgba(255,255,255,0.18)",
            borderRadius: 6,
            color: "var(--text-2)",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Ir para o painel
        </Link>
      </div>
    </main>
  )
}
