"use server"

import { redirect } from "next/navigation"
import { criarSessao, destruirSessao, validarSenha } from "@/lib/auth"

export async function entrarAction(formData: FormData) {
  const senha = String(formData.get("senha") ?? "")

  if (!validarSenha(senha)) {
    redirect("/login?erro=1")
  }

  criarSessao()
  redirect("/dashboard")
}

export async function sairAction() {
  destruirSessao()
  redirect("/login")
}
