import Image from "next/image"
import Link from "next/link"
import logo from "@/public/logo-anomalo.png"
import { sairAction } from "@/app/login/actions"
import ThemeToggle from "@/components/ThemeToggle"

export default function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="glass-header sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image
            src={logo}
            alt="Anômalo Hub"
            height={32}
            style={{ height: 32, width: "auto" }}
            priority
          />
          <div className="hidden sm:block leading-tight">
            <p
              style={{
                fontSize: 13,
                letterSpacing: "0.5px",
                color: "#C9953A",
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              Anômalo Hub
            </p>
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
                fontWeight: 300,
                marginTop: 2,
              }}
            >
              Painel de Metas
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {children}
          <ThemeToggle />
          <Link
            href="/dashboard/configuracoes"
            aria-label="Configurações"
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.3)",
              lineHeight: 1,
              padding: "4px 6px",
            }}
            className="hover:text-[#C9953A] transition"
          >
            ⚙
          </Link>
          <form action={sairAction}>
            <button
              type="submit"
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
                fontWeight: 500,
                letterSpacing: "0.5px",
              }}
              className="hover:text-[#C9953A] transition uppercase"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
