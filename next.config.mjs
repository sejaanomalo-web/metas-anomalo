/** @type {import('next').NextConfig} */

// Headers de segurança aplicados a TODAS as respostas. Conjunto conservador
// (não inclui Content-Security-Policy, que exige testes por causa dos estilos
// inline do app — fica como passo separado). Nada aqui muda o que o usuário vê.
const securityHeaders = [
  // Impede o browser de "adivinhar" o content-type (anti MIME-sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // O painel nunca é embutido em iframe — bloqueia clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // Não vaza a URL completa pra origens externas.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga APIs sensíveis que o app não usa.
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=()",
  },
  // Força HTTPS por 1 ano (Vercel já serve TLS).
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
]

const nextConfig = {
  reactStrictMode: true,
  // Não anuncia "X-Powered-By: Next.js".
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
