"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { DadosReais, PapelPreenchedor } from "@/lib/supabase"
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
  const [clientesAtivos, setClientesAtivos] = useState<string>(
    empresa.atual?.clientes_ativos?.toString() ?? ""
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
    if (ehPago) {
      fd.set("investimento_real", investimento)
      fd.set("criativos_entregues", criativos)
      fd.set("clientes_ativos", clientesAtivos)
    }
    fd.set("leads_real", leads)
    fd.set("reunioes_real", reunioes)
    fd.set("contratos_real", contratos)
    fd.set("faturamento_real", faturamento)
    fd.set("observacoes", observacoes)
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
        {ehPago && (
          <CampoNumero
            label="Investimento (R$)"
            valor={investimento}
            atual={empresa.atual?.investimento_real ?? null}
            tipoAtual="moeda"
            onChange={setInvestimento}
            step="0.01"
          />
        )}
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
        {ehPago && (
          <CampoNumero
            label="Criativos entregues"
            valor={criativos}
            atual={empresa.atual?.criativos_entregues ?? null}
            tipoAtual="numero"
            onChange={setCriativos}
          />
        )}
        {ehPago && (
          <CampoNumero
            label="Clientes ativos (snapshot)"
            valor={clientesAtivos}
            atual={empresa.atual?.clientes_ativos ?? null}
            tipoAtual="numero"
            onChange={setClientesAtivos}
            semMonotonicidade
          />
        )}
      </div>

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
