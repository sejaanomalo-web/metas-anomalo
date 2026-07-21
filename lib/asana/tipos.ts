// =============================================================================
// Asana — formas dos objetos que a importação lê. Somente leitura.
// =============================================================================
//
// Tipos deliberadamente FROUXOS: todo objeto carrega os campos que sabemos
// interpretar e o resto continua no payload cru em ws_import_raw. O contrato
// do plano é raw-first — nunca perder um campo só porque o TypeScript não o
// conhecia no dia em que este arquivo foi escrito.

/** Todo recurso do Asana tem gid + resource_type. */
export interface AsanaRecurso {
  gid: string
  resource_type?: string
  name?: string
  [extra: string]: unknown
}

export interface AsanaUsuario extends AsanaRecurso {
  name?: string
  email?: string
}

export interface AsanaProjeto extends AsanaRecurso {
  name?: string
  archived?: boolean
  color?: string | null
  notes?: string
  html_notes?: string
  public?: boolean
  default_view?: string
  owner?: AsanaUsuario | null
  members?: AsanaUsuario[]
  created_at?: string
  modified_at?: string
  custom_field_settings?: AsanaCustomFieldSetting[]
}

export interface AsanaSecao extends AsanaRecurso {
  name?: string
  project?: AsanaRecurso
  created_at?: string
}

export interface AsanaCustomFieldSetting {
  gid?: string
  custom_field?: AsanaCustomField
  is_important?: boolean
  project?: AsanaRecurso
}

export interface AsanaEnumOption extends AsanaRecurso {
  name?: string
  color?: string | null
  enabled?: boolean
}

export interface AsanaCustomField extends AsanaRecurso {
  name?: string
  description?: string
  /** text | number | enum | multi_enum | date | people | ... */
  type?: string
  resource_subtype?: string
  enum_options?: AsanaEnumOption[]
  enum_value?: AsanaEnumOption | null
  multi_enum_values?: AsanaEnumOption[]
  people_value?: AsanaUsuario[]
  number_value?: number | null
  text_value?: string | null
  date_value?: { date?: string | null; date_time?: string | null } | null
  display_value?: string | null
  precision?: number
  format?: string
  currency_code?: string | null
}

export interface AsanaMembership {
  project?: AsanaRecurso
  section?: AsanaRecurso
}

export interface AsanaTarefa extends AsanaRecurso {
  name?: string
  notes?: string
  html_notes?: string
  completed?: boolean
  completed_at?: string | null
  completed_by?: AsanaUsuario | null
  assignee?: AsanaUsuario | null
  created_by?: AsanaUsuario | null
  followers?: AsanaUsuario[]
  /** Data pura, sem horário. */
  due_on?: string | null
  /** Instante exato — só 8 tarefas do snapshot usam. */
  due_at?: string | null
  start_on?: string | null
  start_at?: string | null
  created_at?: string
  modified_at?: string
  parent?: AsanaRecurso | null
  memberships?: AsanaMembership[]
  projects?: AsanaRecurso[]
  resource_subtype?: string
  approval_status?: string | null
  custom_fields?: AsanaCustomField[]
  num_subtasks?: number
}

export interface AsanaComentario extends AsanaRecurso {
  /** 'comment' (o que importa) ou 'system' (evento gerado pelo Asana). */
  resource_subtype?: string
  type?: string
  text?: string
  html_text?: string
  created_at?: string
  created_by?: AsanaUsuario | null
  is_pinned?: boolean
  is_edited?: boolean
}

export interface AsanaAnexo extends AsanaRecurso {
  name?: string
  /** 'asana' = binário hospedado lá; qualquer outro = link externo. */
  resource_subtype?: string
  host?: string
  download_url?: string | null
  view_url?: string | null
  permanent_url?: string | null
  created_at?: string
  size?: number | null
  parent?: AsanaRecurso | null
}

/** Snapshot completo — o que o extrator entrega pro staging. */
export interface SnapshotAsana {
  lidoEm: string
  workspaces: AsanaRecurso[]
  equipes: AsanaRecurso[]
  usuarios: AsanaUsuario[]
  projetos: AsanaProjeto[]
  secoes: AsanaSecao[]
  camposDefinicoes: AsanaCustomField[]
  /** Chave = project gid. Serve pra ligar definição ↔ contexto. */
  camposPorProjeto: Record<string, string[]>
  tarefas: AsanaTarefa[]
  subtarefas: AsanaTarefa[]
  comentariosPorTarefa: Record<string, AsanaComentario[]>
  anexos: AsanaAnexo[]
}
