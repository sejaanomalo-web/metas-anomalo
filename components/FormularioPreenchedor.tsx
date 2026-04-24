"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type {
  CriativoDetalhe,
  DadosReais,
  PapelPreenchedor,
} from "@/lib/supabase"
import { submeterFormularioAction } from "@/lib/preenchedores"
import { type TipoFunil, formatBRL, formatNumero } from "@/lib/data"

interface EmpresaForm {
  db: string
  nome: string
  tipo: TipoFunil
  atual: DadosReais | null
}

interface Props {
  token: string
  papel: PapelPreenchedor
  empresas: EmpresaForm[]
}

export default function FormularioPreenchedor({
  token,
  papel,
  empresas,
}: Props) {
  return (
    <div className="space-y-5">
      {empresas.map((e) => (
        <CardEmpresa
          key={e.db}
          token={token}
          papel={papel}
          empresa={e}
        />
      ))}
    </div>
  )
}

type TipoEmpresaUI =
  | "leads-reunioes-contratos"
  | "hato"
  | "aton"
  | "diego"

function rotulosDoTipo(tipo: TipoEmpresaUI) {
  if (tipo === "aton") {
    return {
      reunioes: "Orçamentos",
      contratos: "Vendas",
    }
  }
  if (tipo === "hato") {
    return {
      reunioes: "Vendas influenciador",
      contratos: "Vendas",
    }
  }
  return {
    reunioes: "Reuniões",
    contratos: "Contratos",
  }
}

function CardEmpresa({
  token,
  papel,
  empresa,
}: {
  token: string
  papel: PapelPreenchedor
  empresa: EmpresaForm
}) {
  const ehPago = papel === "gestor_trafego"
  const tipo = (empresa.tipo as TipoEmpresaUI) ?? "leads-reunioes-contratos"
  const rots = rotulosDoTipo(tipo)

  // Estados locais = valor "proposto" pelo preenchedor. Inicializa com o
  // atual (pré-preenchimento).
  const [investimento, setInvestimento] = useState<string>(
    empresa.atual?.investimento_real?.toString() ?? ""
  )
  const [leads, setLeads] = useState<string>(
    empresa.atual?.leads_real?.toString() ?? ""
  )
  const [reunioes, setReunioes] = useState<string>(
    empresa.atual?.reunioes_real?.toString() ?? ""
  )
  const [contratos, setContratos] = useState<string>(
    empresa.atual?.contratos_real?.toString() ?? ""
  )
  const [faturamento, setFaturamento] = useState<string>(
    empresa.atual?.faturamento_real?.toString() ?? ""
  )
  const [criativos, setCriativos] = useState<string>(
    empresa.atual?.criativos_entregues?.toString() ?? ""
  )
  const [criativosUsados, setCriativosUsados] = useState<string>(
    empresa.atual?.criativos_usados?.toString() ?? ""
  )
  const [cpl, setCpl] = useState<string>(
    empresa.atual?.cpl_real?.toString() ?? ""
  )
  const [cpa, setCpa] = useState<string>(
    empresa.atual?.cpa_real?.toString() ?? ""
  )
  const [criativosDetalhe, setCriativosDetalhe] = useState<CriativoDetalhe[]>(
    Array.isArray(empresa.atual?.criativos_detalhe)
      ? (empresa.atual?.criativos_detalhe as CriativoDetalhe[])
      : []
  )
  const [observacoes, setObservacoes] = useState<string>(
    empresa.atual?.observacoes ?? ""
  )

  const [pending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<
    { tipo: "ok" | "erro"; msg: string } | null
  >(null)
  const router = useRouter()

  function submeter() {
    setResultado(null)
    const fd = new FormData()
    fd.set("token", token)
    fd.set("empresa", empresa.db)
    fd.set("leads_real", leads)
    fd.set("observacoes", observacoes)
    if (ehPago) {
      fd.set("investimento_real", investimento)
      fd.set("criativos_entregues", criativos)
      fd.set("criativos_usados", criativosUsados)
      fd.set("cpl_real", cpl)
      fd.set("cpa_real", cpa)
      fd.set(
        "criativos_detalhe",
        JSON.stringify(
          criativosDetalhe.filter(
            (c) => c.nome.trim() !== "" || c.publico.trim() !== ""
          )
        )
      )
    } else {
      fd.set("reunioes_real", reunioes)
      fd.set("contratos_real", contratos)
      fd.set("faturamento_real", faturamento)
    }
    startTransition(async () => {
      const r = await submeterFormularioAction(fd)
      if (!r.ok) {
        setResultado({ tipo: "erro", msg: r.erro ?? "Erro ao enviar." })
        return
      }
      setResultado({ tipo: "ok", msg: "Enviado ✓" })
      router.refresh()
      setTimeout(() => setResultado(null), 2500)
    })
  }

  return (
    <div
      className="glass"
      style={{ padding: 18, borderRadius: 14 }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#ffffff",
              lineHeight: 1.2,
            }}
          >
            {empresa.nome}
          </p>
          <p
            style={{
              fontSize: 10,
              letterSpacing: "1.5px",
              color: ehPago ? "#C9953A" : "#8cb4dc",
              textTransform: "uppercase",
              fontWeight: 600,
              marginTop: 3,
            }}
          >
            {ehPago ? "Tráfego pago" : "Prospecção orgânica"}
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2"
        style={{ gap: 12, marginTop: 16 }}
      >
        {ehPago ? (
          <>
            <CampoNumero
              label="Investimento (R$)"
              valor={investimento}
              atual={empresa.atual?.investimento_real ?? null}
              tipoAtual="moeda"
              onChange={setInvestimento}
              step="0.01"
            />
            <CampoNumero
              label="Leads"
              valor={leads}
              atual={empresa.atual?.leads_real ?? null}
              tipoAtual="numero"
              onChange={setLeads}
            />
            <CampoNumero
              label="CPL (R$)"
              valor={cpl}
              atual={empresa.atual?.cpl_real ?? null}
              tipoAtual="moeda"
              onChange={setCpl}
              step="0.01"
              semMonotonicidade
            />
            <CampoNumero
              label="CPA (R$)"
              valor={cpa}
              atual={empresa.atual?.cpa_real ?? null}
              tipoAtual="moeda"
              onChange={setCpa}
              step="0.01"
              semMonotonicidade
            />
            <CampoNumero
              label="Criativos disponíveis"
              valor={criativos}
              atual={empresa.atual?.criativos_entregues ?? null}
              tipoAtual="numero"
              onChange={setCriativos}
            />
            <CampoNumero
              label="Criativos usados"
              valor={criativosUsados}
              atual={empresa.atual?.criativos_usados ?? null}
              tipoAtual="numero"
              onChange={setCriativosUsados}
            />
          </>
        ) : (
          <>
            <CampoNumero
              label="Leads"
              valor={leads}
              atual={empresa.atual?.leads_real ?? null}
              tipoAtual="numero"
              onChange={setLeads}
            />
            <CampoNumero
              label={rots.reunioes}
              valor={reunioes}
              atual={empresa.atual?.reunioes_real ?? null}
              tipoAtual="numero"
              onChange={setReunioes}
            />
            <CampoNumero
              label={rots.contratos}
              valor={contratos}
              atual={empresa.atual?.contratos_real ?? null}
              tipoAtual="numero"
              onChange={setContratos}
            />
            <CampoNumero
              label="Faturamento (R$)"
              valor={faturamento}
              atual={empresa.atual?.faturamento_real ?? null}
              tipoAtual="moeda"
              onChange={setFaturamento}
              step="0.01"
            />
          </>
        )}
      </div>

      {ehPago && (
        <DetalheCriativos
          itens={criativosDetalhe}
          onChange={setCriativosDetalhe}
        />
      )}

      <label className="block" style={{ marginTop: 12 }}>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "2px",
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Observações do dia
        </span>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={2}
          className="glass-input"
          style={{
            marginTop: 6,
            width: "100%",
            padding: "10px 12px",
            fontSize: 13,
          }}
          placeholder="—"
        />
      </label>

      <div
        className="flex items-center gap-3 flex-wrap"
        style={{ marginTop: 14 }}
      >
        <button
          type="button"
          onClick={submeter}
          disabled={pending}
          className="btn-gold-filled uppercase"
          style={{ opacity: pending ? 0.5 : 1 }}
        >
          {pending ? "Enviando..." : "Enviar"}
        </button>
        {resultado && (
          <span
            style={{
              fontSize: 12,
              color: resultado.tipo === "ok" ? "#4caf50" : "#e24b4a",
            }}
          >
            {resultado.msg}
          </span>
        )}
      </div>
    </div>
  )
}

function CampoNumero({
  label,
  valor,
  atual,
  tipoAtual,
  onChange,
  step,
  semMonotonicidade,
}: {
  label: string
  valor: string
  atual: number | null
  tipoAtual: "moeda" | "numero"
  onChange: (v: string) => void
  step?: string
  semMonotonicidade?: boolean
}) {
  const valorNum = valor === "" ? null : Number(valor.replace(",", "."))
  const abaixoDoAtual =
    !semMonotonicidade &&
    atual !== null &&
    valorNum !== null &&
    !Number.isNaN(valorNum) &&
    valorNum < atual

  return (
    <label className="block">
      <span
        style={{
          fontSize: 9,
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="glass-input"
        style={{
          marginTop: 6,
          width: "100%",
          padding: "10px 12px",
          fontSize: 15,
          fontWeight: 500,
          borderColor: abaixoDoAtual ? "rgba(226,75,74,0.5)" : undefined,
        }}
        placeholder="—"
      />
      <span
        style={{
          fontSize: 10,
          color: abaixoDoAtual
            ? "#e24b4a"
            : atual !== null
            ? "rgba(201,149,58,0.6)"
            : "rgba(255,255,255,0.3)",
          fontWeight: 400,
          marginTop: 4,
          display: "block",
        }}
      >
        {atual === null
          ? "sem valor registrado ainda"
          : abaixoDoAtual
          ? `Abaixo do total atual (${
              tipoAtual === "moeda" ? formatBRL(atual) : formatNumero(atual)
            })`
          : `Atual: ${
              tipoAtual === "moeda" ? formatBRL(atual) : formatNumero(atual)
            }${semMonotonicidade ? " · pode subir ou descer" : ""}`}
      </span>
    </label>
  )
}

function DetalheCriativos({
  itens,
  onChange,
}: {
  itens: CriativoDetalhe[]
  onChange: (v: CriativoDetalhe[]) => void
}) {
  function atualizar(idx: number, patch: Partial<CriativoDetalhe>) {
    onChange(itens.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }
  function remover(idx: number) {
    onChange(itens.filter((_, i) => i !== idx))
  }
  function adicionar() {
    onChange([...itens, { nome: "", publico: "" }])
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 8 }}
      >
        <span
          style={{
            fontSize: 9,
            letterSpacing: "2px",
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Criativos rodados · nome e público
        </span>
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
            fontWeight: 400,
          }}
        >
          {itens.length}{" "}
          {itens.length === 1 ? "criativo" : "criativos"}
        </span>
      </div>

      <div className="space-y-2">
        {itens.map((c, i) => (
          <div
            key={i}
            className="flex items-center gap-2"
            style={{
              padding: 2,
            }}
          >
            <div
              className="flex-1"
              style={{ position: "relative" }}
            >
              <TagBadge>criativo</TagBadge>
              <input
                value={c.nome}
                onChange={(e) => atualizar(i, { nome: e.target.value })}
                className="glass-input"
                style={{
                  width: "100%",
                  padding: "9px 12px 9px 80px",
                  fontSize: 13,
                }}
                placeholder="Ex: Reels V1"
              />
            </div>
            <span
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.25)",
                flexShrink: 0,
              }}
            >
              →
            </span>
            <div
              className="flex-1"
              style={{ position: "relative" }}
            >
              <TagBadge>público</TagBadge>
              <input
                value={c.publico}
                onChange={(e) => atualizar(i, { publico: e.target.value })}
                className="glass-input"
                style={{
                  width: "100%",
                  padding: "9px 12px 9px 76px",
                  fontSize: 13,
                }}
                placeholder="Ex: Frio 25-45"
              />
            </div>
            <button
              type="button"
              onClick={() => remover(i)}
              aria-label="Remover criativo"
              style={{
                color: "rgba(255,255,255,0.3)",
                padding: "6px 8px",
                fontSize: 16,
                lineHeight: 1,
                flexShrink: 0,
              }}
              className="hover:text-[#e24b4a] transition"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={adicionar}
        style={{
          marginTop: 8,
          width: "100%",
          padding: "8px 0",
          border: "0.5px dashed rgba(201,149,58,0.3)",
          borderRadius: 8,
          fontSize: 11,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "rgba(201,149,58,0.7)",
          fontWeight: 500,
          background: "transparent",
        }}
        className="hover:text-[#C9953A] hover:border-[#C9953A55] transition"
      >
        + Adicionar criativo
      </button>
    </div>
  )
}

function TagBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        position: "absolute",
        left: 8,
        top: "50%",
        transform: "translateY(-50%)",
        fontSize: 8,
        letterSpacing: "1.2px",
        textTransform: "uppercase",
        color: "rgba(201,149,58,0.8)",
        fontWeight: 600,
        background: "rgba(201,149,58,0.1)",
        padding: "2px 7px",
        borderRadius: 999,
        border: "0.5px solid rgba(201,149,58,0.2)",
        pointerEvents: "none",
      }}
    >
      {children}
    </span>
  )
}
