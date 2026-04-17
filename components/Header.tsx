import Link from "next/link"
import { sairAction } from "@/app/login/actions"
import NavTabs from "./NavTabs"

export default function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header
      className="sticky top-0 z-20"
      style={{
        background: "#0a0a0a",
        borderBottom: "0.5px solid #111111",
        height: 50,
      }}
    >
      <div className="h-full px-6 flex items-center justify-between gap-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span
            className="font-serif italic"
            style={{
              fontSize: 20,
              color: "#C9953A",
              lineHeight: 1,
              fontWeight: 400,
            }}
          >
            Λ
          </span>
          <div className="leading-none">
            <p
              style={{
                fontSize: 11,
                letterSpacing: "1px",
                color: "#d0d0d0",
                fontWeight: 500,
              }}
            >
              ANÔMALO HUB
            </p>
            <p
              style={{
                fontSize: 8,
                letterSpacing: "2px",
                color: "#242424",
                marginTop: 2,
                fontWeight: 400,
              }}
            >
              PAINEL DE METAS
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
                fontSize: 9,
                letterSpacing: "2px",
                color: "#1e1e1e",
                textTransform: "uppercase",
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
