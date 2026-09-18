-- "Meu nível de acesso": o admin passa a poder simplificar a PRÓPRIA visão
-- do sistema (ver menos interfaces) sem que ninguém precise rebaixá-lo.
--
-- Decisão de modelagem: o papel continua 'admin' na linha. O que muda é a
-- VISÃO — uma preferência pessoal, não uma mudança de cargo. Isso mantém:
--   • o roster do time (lib/time.ts lê usuarios.papel) intacto;
--   • as notificações por papel_alvo (lib/notificacoes.ts) chegando;
--   • a volta ao acesso completo sempre possível (o app checa papelReal
--     = 'admin' pra liberar o card que restaura, em lib/usuarios-actions.ts).
--
-- visao NULL = acesso completo (estado de todo mundo hoje).
-- visao_permissoes só é lido quando visao = 'custom'.
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS visao text;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS visao_permissoes jsonb;

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_visao_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_visao_check
  CHECK (
    visao IS NULL
    OR visao IN ('gestor_trafego', 'comercial', 'custom')
  );

COMMENT ON COLUMN public.usuarios.visao IS
  'Visão simplificada escolhida pelo próprio admin (NULL = acesso completo). Não altera o papel.';
COMMENT ON COLUMN public.usuarios.visao_permissoes IS
  'Permissões da visão quando visao = custom. Ignorado nos demais casos.';
