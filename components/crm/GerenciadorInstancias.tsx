"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { EmpresaMeta } from "@/lib/data"
import type { CrmInstanciaRow } from "@/lib/crm-instancias-actions"
import {
  criarInstanciaAction,
  gerarQrAction,
  gerarCodigoPareamentoAction,
  reiniciarInstanciaAction,
  buscarStatusInstanciaAction,
  desativarInstanciaAction,
  reativarInstanciaAction,
  atualizarCorInstanciaAction,
  excluirInstanciaAction,
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
  const [aviso, setAviso] = useState<string | null>(null)
  const [corAberta, setCorAberta] = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState(false)
  const [qrLocal, setQrLocal] = useState<string | null>(null)
  const [pairingLocal, setPairingLocal] = useState<string | null>(null)
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [numeroCodigo, setNumeroCodigo] = useState(instancia.numero_e164 ?? "")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const empresaNome =
    empresas.find((e) => e.slug === instancia.empresa_slug)?.nome ??
    instancia.empresa_slug
  const nomeExibido = instancia.display_nome || instancia.instance_name
  const qrExibido = qrLocal ?? instancia.ultimo_qr
  const pairingExibido = pairingLocal ?? instancia.ultimo_pairing_code

  function pararPolling() {
    if (pollRef.current) clearInterval(pollRef.current)
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    pollRef.current = null
    pollTimeoutRef.current = null
  }

  // Enquanto aguarda o usuário escanear/digitar o código, consulta o status
  // a cada poucos segundos — não dá pra confiar só no Realtime do Supabase
  // (silenciosamente desligado se faltar env var) nem num único
  // router.refresh() logo após o clique (o QR muitas vezes só existe alguns
  // instantes depois, quando o webhook da Evolution confirma).
  function iniciarPolling() {
    pararPolling()
    pollRef.current = setInterval(async () => {
      const status = await buscarStatusInstanciaAction(instancia.id)
      if (!status) return
      if (status.status_conexao === "conectado") {
        pararPolling()
        setQrLocal(null)
        setPairingLocal(null)
        setAviso(null)
        router.refresh()
        return
      }
      setQrLocal(status.ultimo_qr)
      setPairingLocal(status.ultimo_pairing_code)
    }, 2500)
    pollTimeoutRef.current = setTimeout(pararPolling, 45_000)
  }

  useEffect(() => () => pararPolling(), [])

  // Segurança extra: se a prop virar "conectado" por qualquer outro caminho
  // (Realtime, ou o refresh de uma ação irmã), limpa o QR/código locais e
  // para de sondar — sem isso a imagem antiga podia ficar presa na tela.
  useEffect(() => {
    if (instancia.status_conexao === "conectado") {
      pararPolling()
      setQrLocal(null)
      setPairingLocal(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instancia.status_conexao])

  function aplicarResultadoQr(r: {
    ok: boolean
    erro?: string
    qrBase64?: string
    pairingCode?: string
  }) {
    if (!r.ok) {
      setErro(r.erro ?? "Erro")
      setAviso(null)
      return
    }
    setErro(null)
    setAviso(r.erro ?? null)
    if (r.qrBase64) {
      setQrLocal(r.qrBase64)
      setPairingLocal(null)
    }
    if (r.pairingCode) {
      setPairingLocal(r.pairingCode)
      setQrLocal(null)
    }
    if (r.qrBase64 || r.pairingCode) iniciarPolling()
  }

  async function gerarQr() {
    const fd = new FormData()
    fd.set("id", instancia.id)
    const r = await gerarQrAction(fd)
    aplicarResultadoQr(r)
    router.refresh()
  }

  async function gerarCodigo() {
    const digitos = numeroCodigo.replace(/\D/g, "")
    if (digitos.length < 10) {
      setErro("Informe o número com DDD (ex: 45999999999).")
      return
    }
    const fd = new FormData()
    fd.set("id", instancia.id)
    fd.set("numero", digitos)
    const r = await gerarCodigoPareamentoAction(fd)
    aplicarResultadoQr(r)
    router.refresh()
  }

  async function reiniciar() {
    setQrLocal(null)
    setPairingLocal(null)
    const fd = new FormData()
    fd.set("id", instancia.id)
    const r = await reiniciarInstanciaAction(fd)
    aplicarResultadoQr(r)
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

  async function excluir() {
    const fd = new FormData()
    fd.set("id", instancia.id)
    const r = await excluirInstanciaAction(fd)
    if (r.ok) {
      setConfirmarExcluir(false)
      router.refresh()
    } else {
      setErro(r.erro ?? "Erro ao excluir")
    }
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
            <>
              <button
                type="button"
                onClick={() => startTransition(() => gerarQr())}
                disabled={pending}
                className="btn-gold-filled"
                style={{ fontSize: 11, padding: "6px 10px", opacity: pending ? 0.5 : 1 }}
              >
                {pending ? "Gerando..." : "Gerar QR"}
              </button>
              <button
                type="button"
                onClick={() => startTransition(() => reiniciar())}
                disabled={pending}
                title="Desloga e recria a instância na Evolution do zero — use quando o QR trava e não sai do lugar"
                style={{
                  fontSize: 11,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "0.5px solid rgba(255,255,255,0.18)",
                  color: "var(--text-2, #ddd)",
                  opacity: pending ? 0.5 : 1,
                }}
              >
                {pending ? "..." : "↻ Recarregar/Reiniciar"}
              </button>
            </>
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
          <button
            type="button"
            onClick={() => setConfirmarExcluir(true)}
            disabled={pending}
            title="Excluir instância"
            aria-label="Excluir instância"
            style={{ fontSize: 14, color: "var(--danger)", padding: "6px 6px" }}
          >
            🗑
          </button>
        </div>
      </div>

      {confirmarExcluir && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            border: "0.5px solid rgba(226,75,74,0.4)",
            background: "rgba(226,75,74,0.08)",
          }}
        >
          <p style={{ fontSize: 12, color: "var(--text-2, #ddd)", marginBottom: 4 }}>
            Excluir <strong>{nomeExibido}</strong> definitivamente?
          </p>
          <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>
            Desconecta o número na Evolution e remove a instância. O histórico de
            mensagens é preservado, mas para usar o número de novo será preciso
            reconectar o QR do zero. Esta ação não pode ser desfeita.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => startTransition(() => excluir())}
              disabled={pending}
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "#fff",
                background: "var(--danger)",
                borderRadius: 8,
                padding: "6px 14px",
                opacity: pending ? 0.5 : 1,
              }}
            >
              {pending ? "Excluindo..." : "Sim, excluir"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmarExcluir(false)}
              disabled={pending}
              style={{ fontSize: 11, color: "var(--text-3)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {corAberta && (
        <div style={{ marginTop: 12 }}>
          <SeletorCor corAtual={instancia.cor} onEscolher={mudarCor} />
        </div>
      )}

      {!inativa && instancia.status_conexao !== "conectado" && qrExibido && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <img
            src={qrExibido}
            alt={`QR code de ${instancia.instance_name}`}
            style={{ maxWidth: 240, margin: "0 auto", borderRadius: 8 }}
          />
          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
            Escaneie no WhatsApp do celular (Aparelhos conectados → Conectar
            aparelho). Atualiza sozinho quando conectar.
          </p>
        </div>
      )}

      {!inativa && instancia.status_conexao !== "conectado" && pairingExibido && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <p
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "4px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "var(--gold, #C9953A)",
            }}
          >
            {pairingExibido}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
            No WhatsApp do celular: Aparelhos conectados → Conectar aparelho →
            Conectar com número de telefone → digite este código. Atualiza
            sozinho quando conectar.
          </p>
        </div>
      )}

      {!inativa && instancia.status_conexao !== "conectado" && (
        <div style={{ marginTop: 12 }}>
          {!mostrarCodigo ? (
            <button
              type="button"
              onClick={() => setMostrarCodigo(true)}
              style={{ fontSize: 11, color: "var(--text-3)", textDecoration: "underline" }}
            >
              QR não funciona? Entrar com código no WhatsApp →
            </button>
          ) : (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                border: "0.5px solid rgba(255,255,255,0.1)",
              }}
            >
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>
                Informe o número (com DDD) que vai ser conectado — a Evolution gera
                um código curto pra digitar no WhatsApp, sem precisar escanear nada.
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={numeroCodigo}
                  onChange={(e) => setNumeroCodigo(e.target.value)}
                  placeholder="Ex: 45999999999"
                  className="glass-input"
                  style={{ fontSize: 12, padding: "6px 10px", flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  onClick={() => startTransition(() => gerarCodigo())}
                  disabled={pending}
                  className="btn-gold-filled"
                  style={{ fontSize: 11, padding: "6px 10px", opacity: pending ? 0.5 : 1, flexShrink: 0 }}
                >
                  {pending ? "..." : "Gerar código"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {aviso && (
        <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 8 }}>{aviso}</p>
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
