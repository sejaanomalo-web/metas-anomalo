// Service Worker do Anômalo Hub.
//
// Responsável por:
//   1. Receber push events do Web Push e mostrar notificações nativas
//   2. Tratar clique na notificação (foco/abertura do app)
//
// Não faz caching offline (não é o objetivo). Cache offline ficaria
// numa fase futura se quisermos suportar "app fora de cobertura".

self.addEventListener("install", () => {
  // Ativa imediatamente sem esperar SW antigo encerrar
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  // Reivindica clients abertos pra controlar todas as abas existentes
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { titulo: "Anômalo Hub", mensagem: event.data.text() }
  }

  const titulo = payload.titulo || "Anômalo Hub"
  const opcoes = {
    body: payload.mensagem || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || undefined, // notifs com mesma tag colapsam
    data: {
      url: payload.url || "/dashboard",
      notificacaoUsuarioId: payload.notificacaoUsuarioId,
    },
    // No iOS, o "actions" é ignorado; em Android/desktop abre botões
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(titulo, opcoes))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/dashboard"
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((lista) => {
        // Se já tem aba aberta do app, foca nela e navega
        for (const c of lista) {
          if ("focus" in c) {
            c.focus()
            if ("navigate" in c) c.navigate(url)
            return
          }
        }
        // Senão, abre uma nova
        if (self.clients.openWindow) return self.clients.openWindow(url)
      })
  )
})
