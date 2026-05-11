import Image from "next/image"
import Link from "next/link"
import logo from "@/public/logo-anomalo.png"
import { sairAction } from "@/app/login/actions"

export default function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="glass-header sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image
            src={logo}
            alt="Anômalo Hub"
            height={28}
            style={{ height: 28, width: "auto" }}
            priority
          />
          <div className="hidden sm:block leading-tight">
            <p
              style={{
                fontSize: 14,
                color: "#C9953A",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
              }}
            >
              Anômalo Hub
            </p>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                fontWeight: 400,
                marginTop: 2,
                lineHeight: 1.2,
              }}
            >
              Painel de Metas
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {children}
          <Link
            href="/dashboard/configuracoes"
            aria-label="Configurações"
            style={{
              fontSize: 18,
              color: "var(--text-3)",
              lineHeight: 1,
              padding: "4px 6px",
            }}
            className="hover:text-[#C9953A] transition no-ds"
          >
            ⚙
          </Link>
          <form action={sairAction}>
            <button
              type="submit"
              className="ds-btn"
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                fontWeight: 600,
              }}
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
