"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { EmpresaMeta } from "@/lib/data"
import type { CrmInstanciaRow } from "@/lib/crm-instancias-actions"
import {
  criarInstanciaAction,
  gerarQrAction,
  desativarInstanciaAction,
  reativarInstanciaAction,
  atualizarCorInstanciaAction,
} from "@/lib/crm-instancias-actions"
import { CORES_INSTANCIA } from "@/lib/crm-cores"
import IconBadge from "@/components/ui/IconBadge"
import Avatar from "@/components/crm/Avatar"

const STATUS_LABEL: Record<CrmInstanciaRow["status_conexao"], string> = {
  conectado: "Conectado",
  qrcode: "Aguardando QR",
  desconectado: "Desconectado",
  desconhecido: "Não iniciado",
}

const STATUS_ICONBADGE: Record<
  CrmInstanciaRow["status_conexao"],
  "success" | "warning" | "danger" | "neutral"
> = {
  conectado: "success",
  qrcode: "warning",
  desconectado: "danger",
  desconhecido: "neutral",
}

export default function GerenciadorInstancias({
  instancias,
  empresas,
}: {
  instancias: CrmInstanciaRow[]
  empresas: EmpresaMeta[]
}) {
  const [formAberto, setFormAberto] = useState(false)
  const ativas = instancias.filter((i) => i.ativo)
  const inativas = instancias.filter((i) => !i.ativo)

  return (
    <div className="space-y-6">
      {!formAberto && (
        <button
          type="button"
          onClick={() => setFormAberto(true)}
          className="btn-gold-filled uppercase"
        >
          + Nova instância
        </button>
      )}

      {formAberto && <FormNovaInstancia empresas={empresas} onClose={() => setFormAberto(false)} />}

      {ativas.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>
          Nenhuma instância cadastrada ainda.
        </p>
      ) : (
        <div className="space-y-3">
          {ativas.map((inst) => (
            <LinhaInstancia key={inst.id} instancia={inst} empresas={empresas} />
          ))}
        </div>
      )}

      {inativas.length > 0 && (
        <div>
          <p
            style={{
              fontSize: 9,
              letterSpacing: "2px",
              color: "var(--text-4)",
              textTransform: "uppercase",
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            Desativadas ({inativas.length})
          </p>
          <div className="space-y-3">
            {inativas.map((inst) => (
              <LinhaInstancia key={inst.id} instancia={inst} empresas={empresas} inativa />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SeletorCor({
  corAtual,
  onEscolher,
}: {
  corAtual: string
  onEscolher: (cor: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {CORES_INSTANCIA.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onEscolher(c)}
          aria-label={`Cor ${c}`}
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: c,
            border:
              c.toLowerCase() === corAtual.toLowerCase()
                ? "2px solid #fff"
                : "1px solid rgba(255,255,255,0.25)",
            boxShadow:
              c.toLowerCase() === corAtual.toLowerCase()
                ? "0 0 0 2px rgba(0,0,0,0.4)"
                : "none",
          }}
        />
      ))}
    </div>
  )
}

function FormNovaInstancia({
  empresas,
  onClose,
}: {
  empresas: EmpresaMeta[]
  onClose: () => void
}) {
  const [empresaSlug, setEmpresaSlug] = useState(empresas[0]?.slug ?? "")
  const [instanceName, setInstanceName] = useState("")
  const [numero, setNumero] = useState("")
  const [displayNome, setDisplayNome] = useState("")
  const [cor, setCor] = useState(CORES_INSTANCIA[0])
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  async function salvar() {
    const fd = new FormData()
    fd.set("empresa_slug", empresaSlug)
    fd.set("instance_name", instanceName)
    fd.set("numero_e164", numero)
    fd.set("display_nome", displayNome)
    fd.set("cor", cor)
    const r = await criarInstanciaAction(fd)
    if (r.ok) {
      setStatus(r.erro ? `Criada, com aviso: ${r.erro}` : "Criada ✓")
      router.refresh()
      if (!r.erro) setTimeout(onClose, 900)
    } else {
      setStatus(r.erro ?? "Erro")
    }
  }

  return (
    <div
      className="glass"
      style={{ padding: 18, maxWidth: 480 }}
    >
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontSize: 14, fontWeight: 600 }}>Nova instância</p>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: 10,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          Cancelar
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <LabelSmall>Empresa</LabelSmall>
          <select
            value={empresaSlug}
            onChange={(e) => setEmpresaSlug(e.target.value)}
            className="glass-input"
            style={{ marginTop: 6, width: "100%", padding: "8px 12px", fontSize: 13 }}
          >
            {empresas.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <LabelSmall>Nome da instância (identificador técnico)</LabelSmall>
          <input
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            maxLength={60}
            placeholder="Ex: tato-comercial"
            className="glass-input"
            style={{ marginTop: 6, width: "100%", padding: "8px 12px", fontSize: 13 }}
          />
        </label>

        <label className="block">
          <LabelSmall>Número (opcional, com DDD)</LabelSmall>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Ex: 45999999999"
            className="glass-input"
            style={{ marginTop: 6, width: "100%", padding: "8px 12px", fontSize: 13 }}
          />
        </label>

        <label className="block">
          <LabelSmall>Nome de exibição (opcional)</LabelSmall>
          <input
            value={displayNome}
            onChange={(e) => setDisplayNome(e.target.value)}
            maxLength={60}
            placeholder="Ex: Comercial Tato"
            className="glass-input"
            style={{ marginTop: 6, width: "100%", padding: "8px 12px", fontSize: 13 }}
          />
        </label>

        <div>
          <LabelSmall>Cor de identificação</LabelSmall>
          <div style={{ marginTop: 8 }}>
            <SeletorCor corAtual={cor} onEscolher={setCor} />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => startTransition(() => salvar())}
            disabled={pending || !empresaSlug || !instanceName.trim()}
            className="btn-gold-filled uppercase"
            style={{ opacity: pending || !empresaSlug || !instanceName.trim() ? 0.5 : 1 }}
          >
            {pending ? "Criando..." : "Criar instância"}
          </button>
          {status && (
            <span
              style={{
                fontSize: 11,
                color: status.includes("✓") ? "var(--success)" : "var(--warning)",
              }}
            >
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function LinhaInstancia({
  instancia,
  empresas,
  inativa,
}: {
  instancia: CrmInstanciaRow
  empresas: EmpresaMeta[]
  inativa?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [corAberta, setCorAberta] = useState(false)
  const router = useRouter()
  const empresaNome =
    empresas.find((e) => e.slug === instancia.empresa_slug)?.nome ??
    instancia.empresa_slug
  const nomeExibido = instancia.display_nome || instancia.instance_name

  async function gerarQr() {
    const fd = new FormData()
    fd.set("id", instancia.id)
    const r = await gerarQrAction(fd)
    setErro(r.ok ? null : r.erro ?? "Erro ao gerar QR")
    router.refresh()
  }

  async function alternarAtivo() {
    const fd = new FormData()
    fd.set("id", instancia.id)
    const r = inativa
      ? await reativarInstanciaAction(fd)
      : await desativarInstanciaAction(fd)
    setErro(r.ok ? null : r.erro ?? "Erro")
    router.refresh()
  }

  async function mudarCor(cor: string) {
    const fd = new FormData()
    fd.set("id", instancia.id)
    fd.set("cor", cor)
    await atualizarCorInstanciaAction(fd)
    setCorAberta(false)
    router.refresh()
  }

  return (
    <div
      style={{
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderLeft: `3px solid ${instancia.cor}`,
        borderRadius: 10,
        padding: 14,
        opacity: inativa ? 0.6 : 1,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div style={{ position: "relative" }}>
            <Avatar nome={nomeExibido} cor={instancia.cor} size={36} />
            <span
              title={STATUS_LABEL[instancia.status_conexao]}
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: "2px solid var(--surface-1)",
                background:
                  instancia.status_conexao === "conectado"
                    ? "var(--success)"
                    : instancia.status_conexao === "qrcode"
                    ? "var(--warning)"
                    : instancia.status_conexao === "desconectado"
                    ? "var(--danger)"
                    : "rgba(255,255,255,0.3)",
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p style={{ fontSize: 13, fontWeight: 500 }} className="truncate">
                {nomeExibido}
              </p>
              {!inativa && (
                <button
                  type="button"
                  onClick={() => setCorAberta((v) => !v)}
                  title="Mudar cor"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: instancia.cor,
                    border: "1px solid rgba(255,255,255,0.3)",
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-3)" }} className="truncate">
              {empresaNome} · {instancia.instance_name}
              {instancia.numero_e164 ? ` · ${instancia.numero_e164}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            style={{
              fontSize: 11,
              color:
                instancia.status_conexao === "conectado"
                  ? "var(--success)"
                  : "var(--text-3)",
            }}
          >
            {STATUS_LABEL[instancia.status_conexao]}
          </span>
          {!inativa && instancia.status_conexao !== "conectado" && (
            <button
              type="button"
              onClick={() => startTransition(() => gerarQr())}
              disabled={pending}
              className="btn-gold-filled"
              style={{ fontSize: 11, padding: "6px 10px", opacity: pending ? 0.5 : 1 }}
            >
              {pending ? "Gerando..." : "Gerar QR"}
            </button>
          )}
          <button
            type="button"
            onClick={() => startTransition(() => alternarAtivo())}
            disabled={pending}
            style={{
              fontSize: 10,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              color: inativa ? "var(--gold, #C9953A)" : "var(--text-3)",
              padding: "6px 8px",
            }}
          >
            {inativa ? "Reativar" : "Desativar"}
          </button>
        </div>
      </div>

      {corAberta && (
        <div style={{ marginTop: 12 }}>
          <SeletorCor corAtual={instancia.cor} onEscolher={mudarCor} />
        </div>
      )}

      {!inativa && instancia.status_conexao === "qrcode" && instancia.ultimo_qr && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <img
            src={instancia.ultimo_qr}
            alt={`QR code de ${instancia.instance_name}`}
            style={{ maxWidth: 240, margin: "0 auto", borderRadius: 8 }}
          />
          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
            Escaneie no WhatsApp do celular (Aparelhos conectados → Conectar
            aparelho). Atualiza sozinho quando conectar.
          </p>
        </div>
      )}

      {erro && (
        <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 8 }}>{erro}</p>
      )}
    </div>
  )
}

function LabelSmall({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "2px",
        color: "var(--text-4)",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  )
}
