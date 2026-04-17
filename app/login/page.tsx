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
            className="font-serif italic"
            style={{
              fontSize: 64,
              color: "#C9953A",
              lineHeight: 1,
              fontWeight: 400,
            }}
          >
            Λ
          </span>
          <p
            className="mt-6"
            style={{
              fontSize: 13,
              letterSpacing: "2px",
              color: "#d0d0d0",
              fontWeight: 500,
              textTransform: "uppercase",
            }}
          >
            Anômalo Hub
          </p>
          <p
            style={{
              fontSize: 9,
              letterSpacing: "3px",
              color: "#242424",
              marginTop: 4,
              textTransform: "uppercase",
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
                fontSize: 9,
                letterSpacing: "2px",
                color: "#242424",
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
              className="font-mono"
              style={{
                marginTop: 10,
                width: "100%",
                background: "#111",
                border: "0.5px solid #1e1e1e",
                padding: "10px 14px",
                color: "#888",
                fontSize: 13,
                borderRadius: 4,
                outline: "none",
                fontWeight: 300,
              }}
              placeholder="••••••••"
            />
          </label>

          {comErro && (
            <p
              style={{
                fontSize: 11,
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
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
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
            fontSize: 8,
            color: "#242424",
            letterSpacing: "2px",
            textTransform: "uppercase",
          }}
        >
          Acesso interno restrito · Grupo Anômalo Hub
        </p>
      </div>
    </main>
  )
}
