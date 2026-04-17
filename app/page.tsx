import { redirect } from "next/navigation"
import { estaAutenticado } from "@/lib/auth"

export default function Home() {
  if (estaAutenticado()) {
    redirect("/dashboard")
  }
  redirect("/login")
}
