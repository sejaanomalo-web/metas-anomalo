import Link from "next/link"
import { sairAction } from "@/app/login/actions"
import NavTabs from "./NavTabs"

export default function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header
      className="sticky top-0 z-20"
      style={{
        background: "#0a0a0a",
        borderBottom: "0.5px solid #141414",
        height: 58,
      }}
    >
      <div className="h-full px-6 flex items-center justify-between gap-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span
            style={{
              fontSize: 20,
              color: "#C9953A",
              lineHeight: 1,
              fontWeight: 500,
            }}
          >
            Λ
          </span>
          <div className="leading-tight">
            <p
              style={{
                fontSize: 14,
                letterSpacing: "0.5px",
                color: "#fff",
                fontWeight: 500,
              }}
            >
              ANÔMALO HUB
            </p>
            <p
              style={{
                fontSize: 12,
                color: "#666",
                fontWeight: 400,
              }}
            >
              Painel de Metas
            </p>
          </div>
        </Link>

        <NavTabs />

        <div className="flex items-center gap-3">
          {children}
          <form action={sairAction}>
            <button
              type="submit"
              style={{
                fontSize: 11,
                color: "#666",
                fontWeight: 400,
              }}
              className="hover:text-[#C9953A] transition"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
