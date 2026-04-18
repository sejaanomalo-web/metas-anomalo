import { redirect } from "next/navigation"
import { estaAutenticado } from "@/lib/auth"
import { entrarAction } from "./actions"

export default function LoginPage({
  searchParams,
}: {
  searchParams: { erro?: string }
}) {
  if (estaAutenticado()) {
    redirect("/dashboard")
  }

  const comErro = searchParams?.erro === "1"

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <span
            style={{
              fontSize: 48,
              color: "#C9953A",
              lineHeight: 1,
              fontWeight: 500,
            }}
          >
            Λ
          </span>
          <p
            style={{
              fontSize: 14,
              letterSpacing: "0.5px",
              color: "#fff",
              fontWeight: 500,
              textTransform: "uppercase",
              marginTop: 18,
            }}
          >
            Anômalo Hub
          </p>
          <p
            style={{
              fontSize: 12,
              color: "#666",
              marginTop: 6,
              fontWeight: 400,
            }}
          >
            Painel de Metas
          </p>
        </div>

        <form
          action={entrarAction}
          className="card-surface"
          style={{ padding: 24 }}
        >
          <label className="block">
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.5px",
                color: "#666",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Senha de acesso
            </span>
            <input
              type="password"
              name="senha"
              autoFocus
              required
              style={{
                marginTop: 10,
                width: "100%",
                background: "#111",
                border: "0.5px solid #1e1e1e",
                padding: "10px 14px",
                color: "#ccc",
                fontSize: 14,
                borderRadius: 4,
                outline: "none",
                fontWeight: 400,
              }}
              placeholder="••••••••"
            />
          </label>

          {comErro && (
            <p
              style={{
                fontSize: 12,
                color: "#e24b4a",
                marginTop: 12,
                fontWeight: 400,
              }}
            >
              Senha incorreta. Tente novamente.
            </p>
          )}

          <button
            type="submit"
            style={{
              marginTop: 16,
              width: "100%",
              background: "#C9953A",
              color: "#080808",
              padding: "10px 0",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 4,
            }}
            className="hover:brightness-110 transition"
          >
            Entrar
          </button>
        </form>

        <p
          className="mt-6 text-center"
          style={{
            fontSize: 11,
            color: "#444",
            fontWeight: 400,
          }}
        >
          Acesso interno restrito · Grupo Anômalo Hub
        </p>
      </div>
    </main>
  )
}
