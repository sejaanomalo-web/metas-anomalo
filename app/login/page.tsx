import Image from "next/image"
import { redirect } from "next/navigation"
import logo from "@/public/logo-anomalo.png"
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
          <Image
            src={logo}
            alt="Anômalo Hub"
            height={56}
            style={{ height: 56, width: "auto" }}
            priority
          />
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.3px",
              marginTop: 22,
            }}
          >
            Anômalo Hub
          </h1>
          <div
            className="gold-divider"
            style={{ marginTop: 10, marginBottom: 8 }}
          />
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 300,
            }}
          >
            Painel de Metas
          </p>
        </div>

        <form action={entrarAction} className="glass" style={{ padding: 24 }}>
          <label className="block">
            <span
              style={{
                fontSize: 9,
                letterSpacing: "2px",
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              Senha de acesso
            </span>
            <input
              type="password"
              name="senha"
              autoFocus
              required
              className="glass-input"
              style={{
                marginTop: 10,
                width: "100%",
                padding: "12px 14px",
                fontSize: 14,
                fontWeight: 400,
              }}
              placeholder="••••••••"
            />
          </label>

          {comErro && (
            <p style={{ fontSize: 12, color: "#e24b4a", marginTop: 12 }}>
              Senha incorreta. Tente novamente.
            </p>
          )}

          <button
            type="submit"
            className="btn-gold-solid"
            style={{
              marginTop: 16,
              width: "100%",
              padding: "12px 0",
              fontSize: 12,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            Entrar
          </button>
        </form>

        <p
          className="mt-8 text-center"
          style={{
            fontSize: 10,
            letterSpacing: "1.5px",
            color: "rgba(255,255,255,0.2)",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          Acesso interno restrito · Grupo Anômalo Hub
        </p>
      </div>
    </main>
  )
}
