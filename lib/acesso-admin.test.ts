/**
 * Papel real × visão: quem é admin de um módulo e quais módulos aparecem.
 * Rodar: `npm run test`.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import type { ChavePermissao, Permissoes } from "./auth"
import { ehAdminNoModulo, moduloVisivel, type UsuarioParaAcesso } from "./acesso-admin"
import { PRESET_ADMIN, PRESET_COMERCIAL, PRESET_CUSTOM, PRESET_GESTOR } from "./permissoes-ui"

/** Como lib/auth.ts › permissoesDaVisao monta a visão "Escolher as
 *  interfaces": parte do custom zerado e força 'configuracoes'. */
function visaoCustom(ligadas: ChavePermissao[]): Permissoes {
  const p: Permissoes = { ...PRESET_CUSTOM }
  for (const c of ligadas) p[c] = true
  return { ...p, configuracoes: true }
}

const MODULOS_DO_MENU: ChavePermissao[] = [
  "dashboard_principal",
  "dashboard_empresas",
  "dashboard_trafego",
  "dashboard_comercial",
  "crm",
  "dashboard_financeiro",
  "workspace",
  "leads",
  "configuracoes",
]

const adminCompleto: UsuarioParaAcesso = { papel: "admin", papelReal: "admin", permissoes: PRESET_ADMIN }
const adminFinanceiroWorkspace: UsuarioParaAcesso = {
  papel: "custom",
  papelReal: "admin",
  permissoes: visaoCustom(["dashboard_financeiro", "workspace"]),
}
const adminSemWorkspace: UsuarioParaAcesso = {
  papel: "custom",
  papelReal: "admin",
  permissoes: visaoCustom(["dashboard_financeiro"]),
}
const comumComWorkspace: UsuarioParaAcesso = {
  papel: "custom",
  papelReal: "custom",
  permissoes: { ...PRESET_CUSTOM, workspace: true, dashboard_financeiro: true, configuracoes: true },
}
const comercialSemWorkspace: UsuarioParaAcesso = { papel: "comercial", papelReal: "comercial", permissoes: PRESET_COMERCIAL }

test("admin com acesso completo: vê tudo e administra o Workspace", () => {
  for (const m of MODULOS_DO_MENU) assert.equal(moduloVisivel(adminCompleto, m), true, m)
  assert.equal(ehAdminNoModulo(adminCompleto, "workspace"), true)
})

test("admin com visão personalizada: menu mostra só Financeiro, Workspace e Configurações", () => {
  const visiveis = MODULOS_DO_MENU.filter((m) => moduloVisivel(adminFinanceiroWorkspace, m))
  assert.deepEqual(visiveis, ["dashboard_financeiro", "workspace", "configuracoes"])
})

test("admin com visão personalizada continua admin do Workspace (Reuniões/Integrações)", () => {
  assert.equal(ehAdminNoModulo(adminFinanceiroWorkspace, "workspace"), true)
})

test("admin com visão personalizada NÃO vira admin de módulo que ocultou", () => {
  for (const m of ["dashboard_comercial", "dashboard_trafego", "crm", "leads"] as ChavePermissao[]) {
    assert.equal(ehAdminNoModulo(adminFinanceiroWorkspace, m), false, m)
  }
  assert.equal(ehAdminNoModulo(adminSemWorkspace, "workspace"), false)
})

test("admin nas visões prontas (gestor/comercial) segue as chaves da visão", () => {
  const gestor = { papel: "gestor_trafego", papelReal: "admin", permissoes: { ...PRESET_GESTOR, configuracoes: true } } as const
  assert.equal(ehAdminNoModulo(gestor, "workspace"), false)
  assert.equal(moduloVisivel(gestor, "dashboard_trafego"), true)
})

test("usuário comum com acesso ao Workspace vê o módulo mas NÃO administra", () => {
  assert.equal(moduloVisivel(comumComWorkspace, "workspace"), true)
  assert.equal(ehAdminNoModulo(comumComWorkspace, "workspace"), false)
  assert.equal(ehAdminNoModulo(comumComWorkspace, "dashboard_financeiro"), false)
})

test("usuário sem acesso ao Workspace: nem vê nem administra", () => {
  assert.equal(moduloVisivel(comercialSemWorkspace, "workspace"), false)
  assert.equal(ehAdminNoModulo(comercialSemWorkspace, "workspace"), false)
})

test("sem sessão: nada", () => {
  assert.equal(moduloVisivel(null, "workspace"), false)
  assert.equal(ehAdminNoModulo(null, "workspace"), false)
})

test("papel efetivo 'admin' sem papel real admin não passa (fail-closed)", () => {
  // Não acontece pelo getUsuarioAtual, mas a regra não pode depender disso.
  assert.equal(ehAdminNoModulo({ papel: "admin", papelReal: "custom", permissoes: PRESET_ADMIN }, "workspace"), false)
})
