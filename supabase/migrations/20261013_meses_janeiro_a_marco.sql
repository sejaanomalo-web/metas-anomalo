-- O seletor de período passou a oferecer Janeiro–Dezembro (antes só
-- Abril–Dezembro). As duas tabelas legadas abaixo ainda travavam `mes` no
-- CHECK antigo: salvar dado real de Janeiro/Fevereiro/Março dava erro 23514.
-- Rode uma vez no SQL Editor do Supabase. Idempotente.

alter table public.dados_reais drop constraint if exists dados_reais_mes_check;
alter table public.dados_reais add constraint dados_reais_mes_check check (
  mes in ('Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
          'Agosto','Setembro','Outubro','Novembro','Dezembro')
);

do $$
begin
  if to_regclass('public.comissionamento') is not null then
    alter table public.comissionamento drop constraint if exists comissionamento_mes_check;
    alter table public.comissionamento add constraint comissionamento_mes_check check (
      mes in ('Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
              'Agosto','Setembro','Outubro','Novembro','Dezembro')
    );
  end if;
end $$;
