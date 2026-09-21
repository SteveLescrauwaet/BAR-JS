-- JS Dottignies Bar - ajoute le type de sortie 'Prélèvement caisse trésorier'
-- À exécuter une seule fois dans Supabase > SQL Editor sur une base déjà créée.

alter table public.cash_outs
  drop constraint if exists cash_outs_type_check;

alter table public.cash_outs
  add constraint cash_outs_type_check
  check (type in ('Arbitre officiel','Arbitre non officiel','Prélèvement caisse trésorier'));
