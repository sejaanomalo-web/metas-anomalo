-- Alinha o CHECK de usuarios.papel ao PapelUsuario de lib/auth.ts
-- (admin | gestor_trafego | comercial | custom).
--
-- Motivo: a UI/actions já oferecem e gravam papel='comercial'
-- (lib/usuarios-actions.ts, components/GerenciadorUsuarios.tsx), mas o
-- CHECK antigo só aceitava admin/gestor_trafego/custom — qualquer cadastro
-- comercial estourava "usuarios_papel_check".
--
-- Aditivo e seguro: nenhuma linha existente viola (hoje só admin/gestor_trafego).
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_papel_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_papel_check
  CHECK (papel IN ('admin', 'gestor_trafego', 'comercial', 'custom'));
