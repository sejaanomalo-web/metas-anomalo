"use client"

import { useState } from "react"

const PLATAFORMAS = ["Google Ads", "LinkedIn Ads", "TikTok Ads"]

export default function OutrasPlataformas() {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.4)",
          fontWeight: 500,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          padding: "6px 12px",
          borderRadius: 8,
          border: "0.5px solid rgba(255,255,255,0.08)",
          background: "transparent",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
        className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
      >
        Outras plataformas
        <span
          style={{
            display: "inline-block",
            transition: "transform 0.2s ease",
            transform: aberto ? "rotate(180deg)" : "rotate(0deg)",
            fontSize: 10,
          }}
        >
          ▾
        </span>
      </button>

      {aberto && (
        <div
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.02)",
            border: "0.5px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <p
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            Outras plataformas
          </p>
          <div className="flex flex-wrap gap-2">
            {PLATAFORMAS.map((p) => (
              <div
                key={p}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.45)",
                    fontWeight: 500,
                  }}
                >
                  {p}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    background: "rgba(255,255,255,0.15)",
                    padding: "2px 6px",
                    borderRadius: 999,
                    color: "rgba(255,255,255,0.55)",
                    fontWeight: 500,
                  }}
                >
                  Em breve
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
