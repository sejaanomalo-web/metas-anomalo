"use client"

import { useEffect, useState } from "react"

type Estado =
  | "carregando"
  | "nao_suportado"
  | "negado"
  | "inativo"
  | "ativando"
  | "ativo"
  | "erro"

/**
 * Botão que registra Web Push pro usuário atual. Mostra estado:
 *   • carregando: verificando suporte/permissão inicial
 *   • nao_suportado: navegador sem SW/Push (ex: iOS Safari fora de PWA)
 *   • negado: usuário negou permissão (precisa resetar no nav)
 *   • inativo: tudo pronto, falta clicar pra ativar
 *   • ativando: registrando subscription
 *   • ativo: já tem subscription registrada neste dispositivo
 *   • erro: deu ruim, mostra mensagem
 *
 * No iOS, push só funciona quando o site foi adicionado à Tela de
 * Início (modo standalone). Senão, mostra dica.
 */
export default function AtivarNotificacoes({
  vapidPublicKey,
}: {
  vapidPublicKey: string
}) {
  const [estado, setEstado] = useState<Estado>("carregando")
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [standaloneIOS, setStandaloneIOS] = useState<boolean | null>(null)

  useEffect(() => {
    void checarEstado()
    setStandaloneIOS(detectarStandaloneIOS())
  }, [])

  async function checarEstado() {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado("nao_suportado")
      return
    }
    if (Notification.permission === "denied") {
      setEstado("negado")
      return
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js")
      const sub = await reg?.pushManager.getSubscription()
      setEstado(sub ? "ativo" : "inativo")
    } catch (e) {
      console.error("[push] checar estado erro", e)
      setEstado("inativo")
    }
  }

  async function ativar() {
    if (!vapidPublicKey) {
      setEstado("erro")
      setMensagem("VAPID_PUBLIC_KEY não configurado no servidor.")
      return
    }
    setEstado("ativando")
    setMensagem(null)
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      })
      await navigator.serviceWorker.ready

      const permissao = await Notification.requestPermission()
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "negado" : "inativo")
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      const resp = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.erro ?? "falha no servidor")
      }
      setEstado("ativo")
    } catch (e) {
      console.error("[push] ativar erro", e)
      setEstado("erro")
      setMensagem(e instanceof Error ? e.message : String(e))
    }
  }

  async function desativar() {
    setEstado("ativando")
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js")
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setEstado("inativo")
    } catch (e) {
      console.error("[push] desativar erro", e)
      setEstado("erro")
      setMensagem(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="glass" style={{ padding: 24 }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p
          style={{
            fontSize: 11,
            letterSpacing: "1px",
            color: "#fff",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Notificações push
        </p>
        <StatusBadge estado={estado} />
      </div>
      <p
        style={{
          fontSize: 12,
          color: "rgba(0,0,0,0.45)",
          fontWeight: 300,
          marginTop: 4,
          marginBottom: 14,
        }}
      >
        🔔 Receba notificação nativa neste dispositivo quando houver
        nova venda ou lembrete diário.
      </p>

      <CorpoEstado
        estado={estado}
        mensagem={mensagem}
        standaloneIOS={standaloneIOS}
        onAtivar={ativar}
        onDesativar={desativar}
      />
    </div>
  )
}

function StatusBadge({ estado }: { estado: Estado }) {
  const map: Record<Estado, { label: string; cor: string }> = {
    carregando: { label: "...", cor: "rgba(0,0,0,0.35)" },
    nao_suportado: { label: "indisponível", cor: "rgba(0,0,0,0.35)" },
    negado: { label: "negado", cor: "#e24b4a" },
    inativo: { label: "inativo", cor: "rgba(0,0,0,0.55)" },
    ativando: { label: "ativando", cor: "#4c4e54" },
    ativo: { label: "ativo", cor: "#4caf50" },
    erro: { label: "erro", cor: "#e24b4a" },
  }
  const { label, cor } = map[estado]
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "2px",
        color: cor,
        textTransform: "uppercase",
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  )
}

function CorpoEstado({
  estado,
  mensagem,
  standaloneIOS,
  onAtivar,
  onDesativar,
}: {
  estado: Estado
  mensagem: string | null
  standaloneIOS: boolean | null
  onAtivar: () => void
  onDesativar: () => void
}) {
  const ehIOSWebPage =
    standaloneIOS === false &&
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod/.test(navigator.userAgent)

  if (estado === "carregando") {
    return null
  }

  if (estado === "nao_suportado") {
    if (ehIOSWebPage) {
      return (
        <Aviso>
          No iPhone, push só funciona quando você adiciona o site à
          Tela de Início (Compartilhar → Adicionar à Tela de Início).
          Depois, abra o ícone da tela inicial e tente novamente aqui.
        </Aviso>
      )
    }
    return <Aviso>Seu navegador não suporta Web Push.</Aviso>
  }

  if (estado === "negado") {
    return (
      <Aviso>
        Permissão de notificação negada. Vá nas configurações do site
        no navegador, libere notificações e recarregue esta página.
      </Aviso>
    )
  }

  if (estado === "ativo") {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onDesativar}
          style={{
            padding: "9px 16px",
            fontSize: 11,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "rgba(0,0,0,0.55)",
            border: "0.5px solid rgba(0,0,0,0.15)",
            borderRadius: 6,
            background: "transparent",
            fontWeight: 500,
            cursor: "pointer",
          }}
          className="hover:text-[#e24b4a] hover:border-[#e24b4a55] transition"
        >
          Desativar neste dispositivo
        </button>
        <span
          style={{
            fontSize: 11,
            color: "rgba(0,0,0,0.45)",
            fontWeight: 300,
          }}
        >
          Você recebe push aqui · pode ativar em outros dispositivos
          também
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={onAtivar}
        disabled={estado === "ativando"}
        className="btn-gold-filled uppercase"
        style={{ opacity: estado === "ativando" ? 0.6 : 1 }}
      >
        {estado === "ativando" ? "Ativando..." : "Ativar notificações"}
      </button>
      {estado === "erro" && mensagem && (
        <span style={{ fontSize: 11, color: "#e24b4a" }}>{mensagem}</span>
      )}
    </div>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12,
        color: "rgba(0,0,0,0.55)",
        lineHeight: 1.55,
        fontWeight: 400,
      }}
    >
      {children}
    </p>
  )
}

function detectarStandaloneIOS(): boolean {
  if (typeof window === "undefined") return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  // iOS Safari expõe navigator.standalone quando rodando como PWA
  if (typeof nav.standalone === "boolean") return nav.standalone
  return window.matchMedia("(display-mode: standalone)").matches
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // VAPID public key vem em base64url; o pushManager precisa de Uint8Array
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) buf[i] = raw.charCodeAt(i)
  return buf
}
