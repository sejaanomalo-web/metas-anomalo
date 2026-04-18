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
            height={48}
            style={{ height: 48, width: "auto" }}
            priority
          />
          <h1 className="mt-6 text-xl font-medium tracking-tight text-white">
            Anômalo Hub
          </h1>
          <p className="mt-1 text-sm text-neutral-400">Painel de Metas</p>
        </div>

        <form action={entrarAction} className="card p-6 space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-neutral-400">
              Senha de acesso
            </span>
            <input
              type="password"
              name="senha"
              autoFocus
              required
              className="mt-2 w-full rounded-lg bg-black/60 border border-neutral-800 focus:border-gold focus:outline-none px-3 py-2 text-white placeholder-neutral-600"
              placeholder="••••••••"
            />
          </label>

          {comErro && (
            <p className="text-sm text-red-400">Senha incorreta. Tente novamente.</p>
          )}

          <button
            type="submit"
            className="w-full gold-gradient text-black font-medium rounded-lg py-2.5 transition hover:brightness-110"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-neutral-600">
          Acesso interno restrito · Grupo Anômalo Hub
        </p>
      </div>
    </main>
  )
}
