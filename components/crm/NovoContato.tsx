"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { criarLeadManualAction } from "@/lib/crm-leads-actions"
import type { CrmInstanciaRow } from "@/lib/crm-instancias-actions"

/** Espelha normalizarTelefone de lib/crm-leads-actions.ts — só pra pré-visualização
 *  no form (a normalização de verdade acontece no server). */
function previaTelefone(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "")
  if (digitos.length < 8) return "número muito curto"
  if (digitos.length <= 11) return `55${digitos}`
  return digitos
}

/**
 * Botão "+ Novo contato" da sidebar de Conversas — cria um lead manual
 * (fora do fluxo de mensagem recebida). O contato passa a existir no CRM na
 * hora; só vira uma conversa de verdade no WhatsApp do celular quando a
 * PRIMEIRA mensagem é mandada (por isso já leva direto pra thread dele ao
 * salvar — é só digitar e enviar).
 */
export default function NovoContato({
  instancias,
}: {
  instancias: CrmInstanciaRow[]
}) {
  const ativas = instancias.filter((i) => i.ativo)
  const [aberto, setAberto] = useState(false)
  const [instanciaId, setInstanciaId] = useState(ativas[0]?.id ?? "")
  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [email, setEmail] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function fechar() {
    setAberto(false)
    setNome("")
    setTelefone("")
    setEmail("")
    setErro(null)
  }

  function salvar() {
    if (!instanciaId) {
      setErro("Conecte um número em Conexões antes de criar um contato.")
      return
    }
    if (!nome.trim() || !telefone.trim()) {
      setErro("Preencha nome e telefone.")
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set("instancia_id", instanciaId)
      fd.set("nome", nome.trim())
      fd.set("telefone", telefone.trim())
      fd.set("email", email.trim())
      const r = await criarLeadManualAction(fd)
      if (!r.ok) {
        setErro(r.erro ?? "Erro ao criar contato")
        return
      }
      fechar()
      if (r.id) router.push(`/dashboard/crm?view=conversas&lead=${r.id}`)
      router.refresh()
    })
  }

  if (ativas.length === 0) return null

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--gold, #C9953A)",
          padding: "4px 8px",
        }}
      >
        ＋ Novo contato
      </button>

      {aberto && (
        <>
          <button
            type="button"
            aria-label="Fechar"
            onClick={fechar}
            style={{ position: "fixed", inset: 0, zIndex: 15, cursor: "default" }}
          />
          <div
            className="glass"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 6,
              padding: 12,
              width: 260,
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <p
              style={{
                fontSize: 9,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--text-4)",
                fontWeight: 500,
              }}
            >
              Novo contato
            </p>

            {ativas.length > 1 && (
              <select
                value={instanciaId}
                onChange={(e) => setInstanciaId(e.target.value)}
                className="glass-input"
                style={{ fontSize: 12, padding: "6px 8px" }}
              >
                {ativas.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.display_nome ?? i.empresa_slug}
                    {i.numero_e164 ? ` · ${i.numero_e164}` : ""}
                  </option>
                ))}
              </select>
            )}

            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome"
              maxLength={80}
              autoFocus
              className="glass-input"
              style={{ fontSize: 12, padding: "6px 8px" }}
            />
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="Telefone (com DDD)"
              inputMode="tel"
              maxLength={20}
              className="glass-input"
              style={{ fontSize: 12, padding: "6px 8px" }}
            />
            {/* Sem DDI (10/11 dígitos) ganha o 55 na frente — mostra o
                resultado pra dar chance de corrigir um número que já veio
                com código de país diferente (ex: número dos EUA também tem
                11 dígitos e seria confundido com um BR sem DDI). */}
            {telefone.trim() && (
              <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: -4 }}>
                Vai salvar como: {previaTelefone(telefone)}
              </p>
            )}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail (opcional)"
              type="email"
              maxLength={120}
              className="glass-input"
              style={{ fontSize: 12, padding: "6px 8px" }}
            />

            {erro && <p style={{ fontSize: 11, color: "var(--danger)" }}>{erro}</p>}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={salvar}
                disabled={pending}
                className="btn-gold-filled"
                style={{ fontSize: 11, padding: "5px 10px", opacity: pending ? 0.5 : 1 }}
              >
                {pending ? "Criando..." : "Criar"}
              </button>
              <button
                type="button"
                onClick={fechar}
                style={{ fontSize: 11, color: "var(--text-3)" }}
              >
                Cancelar
              </button>
            </div>

            <p style={{ fontSize: 10, color: "var(--text-4)" }}>
              Só vira conversa de verdade no WhatsApp do celular depois que você
              mandar a primeira mensagem.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
