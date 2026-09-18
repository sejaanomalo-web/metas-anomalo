import type { ChavePermissao, PapelUsuario, Permissoes } from "./auth"

/**
 * Espelho CLIENT-SAFE do RBAC de lib/auth.ts.
 *
 * lib/auth importa next/headers e o client de serviço do Supabase — importar
 * de lá num componente "use client" quebra o build. Por isso os rótulos e os
 * presets vivem aqui, e quem renderiza checkbox de permissão (Gerenciador de
 * usuários, Meu nível de acesso) importa deste arquivo.
 *
 * Manter sincronizado com PRESETS_PERMISSOES / CHAVES_PERMISSAO em lib/auth.ts
 * — a fonte da verdade continua sendo o server, que nunca lê este arquivo.
 */
export const CHAVES_UI: {
  chave: ChavePermissao
  rotulo: string
  descricao: string
}[] = [
  {
    chave: "dashboard_principal",
    rotulo: "Dashboard",
    descricao: "/dashboard (visão consolidada do Hub)",
  },
  {
    chave: "dashboard_empresas",
    rotulo: "Metas",
    descricao: "/dashboard/metas (metas das empresas do Hub)",
  },
  {
    chave: "dashboard_empresa_detalhe",
    rotulo: "Empresa (detalhe)",
    descricao: "/dashboard/[empresa] (página individual)",
  },
  {
    chave: "dashboard_trafego",
    rotulo: "Tráfego pago",
    descricao: "/dashboard/trafego + /dashboard/[empresa]/trafego",
  },
  {
    chave: "dashboard_comercial",
    rotulo: "Comercial",
    descricao: "/dashboard/comercial (funil + relatórios do comercial)",
  },
  {
    chave: "dashboard_financeiro",
    rotulo: "Financeiro",
    descricao: "/dashboard/financeiro (caixa, lançamentos, recorrentes)",
  },
  {
    chave: "formularios",
    rotulo: "Formulários",
    descricao: "/dashboard/formularios (acesso à aba)",
  },
  {
    chave: "formulario_comercial",
    rotulo: "Form · Comercial",
    descricao: "Seção Comercial do formulário (relatório diário)",
  },
  {
    chave: "formulario_trafego",
    rotulo: "Form · Tráfego",
    descricao: "Seção Tráfego Pago do formulário (dados reais)",
  },
  {
    chave: "configuracoes",
    rotulo: "Configurações",
    descricao: "/dashboard/configuracoes",
  },
  {
    chave: "gerenciar_usuarios",
    rotulo: "Gerenciar usuários",
    descricao: "Criar / editar / desativar usuários",
  },
  {
    chave: "ver_notificacoes",
    rotulo: "Notificações",
    descricao: "Sino flutuante (push + in-app)",
  },
  {
    chave: "crm",
    rotulo: "CRM",
    descricao: "/dashboard/crm (leads, WhatsApp, Kanban, calendário)",
  },
  {
    chave: "workspace",
    rotulo: "Workspace",
    descricao: "/dashboard/workspace (tarefas, calendário, clientes)",
  },
  {
    chave: "leads",
    rotulo: "Leads do Meta",
    descricao: "/dashboard/leads (link do cliente + formulários)",
  },
]

export const PRESET_ADMIN: Permissoes = {
  dashboard_principal: true,
  dashboard_empresas: true,
  dashboard_empresa_detalhe: true,
  dashboard_trafego: true,
  dashboard_comercial: true,
  dashboard_financeiro: true,
  formularios: true,
  formulario_comercial: true,
  formulario_trafego: true,
  configuracoes: true,
  gerenciar_usuarios: true,
  ver_notificacoes: true,
  crm: true,
  workspace: true,
  leads: true,
}

export const PRESET_GESTOR: Permissoes = {
  dashboard_principal: false,
  dashboard_empresas: false,
  dashboard_empresa_detalhe: false,
  dashboard_trafego: true,
  dashboard_comercial: false,
  dashboard_financeiro: false,
  formularios: true,
  formulario_comercial: false,
  formulario_trafego: true,
  configuracoes: true,
  gerenciar_usuarios: false,
  ver_notificacoes: true,
  crm: false,
  workspace: false,
  leads: true,
}

export const PRESET_COMERCIAL: Permissoes = {
  dashboard_principal: false,
  dashboard_empresas: false,
  dashboard_empresa_detalhe: false,
  dashboard_trafego: false,
  dashboard_comercial: true,
  dashboard_financeiro: false,
  formularios: true,
  formulario_comercial: true,
  formulario_trafego: false,
  configuracoes: true,
  gerenciar_usuarios: false,
  ver_notificacoes: true,
  crm: true,
  workspace: false,
  leads: false,
}

export const PRESET_CUSTOM: Permissoes = {
  dashboard_principal: false,
  dashboard_empresas: false,
  dashboard_empresa_detalhe: false,
  dashboard_trafego: false,
  dashboard_comercial: false,
  dashboard_financeiro: false,
  formularios: false,
  formulario_comercial: false,
  formulario_trafego: false,
  configuracoes: false,
  gerenciar_usuarios: false,
  ver_notificacoes: false,
  crm: false,
  workspace: false,
  leads: false,
}

export function presetDoPapel(papel: PapelUsuario): Permissoes {
  if (papel === "admin") return PRESET_ADMIN
  if (papel === "gestor_trafego") return PRESET_GESTOR
  if (papel === "comercial") return PRESET_COMERCIAL
  return PRESET_CUSTOM
}

export function rotuloPapel(papel: PapelUsuario): string {
  if (papel === "admin") return "Admin"
  if (papel === "gestor_trafego") return "Gestor de tráfego"
  if (papel === "comercial") return "Comercial"
  return "Personalizado"
}
