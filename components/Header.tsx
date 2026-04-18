import Image from "next/image"
import Link from "next/link"
import logo from "@/public/logo-anomalo.png"
import { sairAction } from "@/app/login/actions"

export default function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-gold/20 bg-bg/90 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image
            src={logo}
            alt="Anômalo Hub"
            height={32}
            style={{ height: 32, width: "auto" }}
            priority
          />
          <div className="hidden sm:block">
            <p className="text-sm tracking-widest text-gold uppercase font-medium">
              Anômalo Hub
            </p>
            <p className="text-xs text-neutral-500 -mt-0.5">
              Painel de Metas
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          {children}
          <form action={sairAction}>
            <button
              type="submit"
              className="text-xs uppercase tracking-widest text-neutral-500 hover:text-gold transition"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
