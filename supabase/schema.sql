-- JS DOTTIGNIES BAR • PWA / Supabase
-- Execute this file ONCE in Supabase > SQL Editor.
-- It creates the data model, RLS policies, realtime publication and secure RPCs.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles / roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'cashier' check (role in ('cashier','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,email,display_name,role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''),'@',1)),
    'cashier'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill profiles for users that already existed before this script was installed.
insert into public.profiles(id,email,display_name,role)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email,''),'@',1)), 'cashier'
from auth.users u
on conflict (id) do update
set email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  name text primary key,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null references public.categories(name) on update cascade,
  sale_price numeric(10,2) not null default 0 check (sale_price >= 0),
  cost_price numeric(10,2) not null default 0 check (cost_price >= 0),
  stock integer not null default 20 check (stock >= 0),
  starting_stock integer not null default 20 check (starting_stock >= 0),
  stock_tracked boolean not null default true,
  image_path text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
before update on public.products
for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Sales / history
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  method text not null check (method in ('Espèces','Carte','Offert','Conso arbitre')),
  total numeric(10,2) not null default 0,
  cost numeric(10,2) not null default 0,
  commercial_value numeric(10,2) not null default 0,
  offered_by text not null default '',
  referee_name text not null default '',
  device_label text not null default '',
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_sale_price numeric(10,2) not null default 0,
  unit_cost_price numeric(10,2) not null default 0
);

create index if not exists sale_lines_sale_id_idx on public.sale_lines(sale_id);
create index if not exists sales_created_at_idx on public.sales(created_at desc);

-- ---------------------------------------------------------------------------
-- Cash outs (referee payments)
-- ---------------------------------------------------------------------------
create table if not exists public.cash_outs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('Arbitre officiel','Arbitre non officiel')),
  person_name text not null,
  amount numeric(10,2) not null check (amount >= 0),
  team text not null,
  match_time text not null,
  device_label text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists cash_outs_created_at_idx on public.cash_outs(created_at desc);

-- ---------------------------------------------------------------------------
-- Stock movements
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  movement_type text not null,
  quantity integer not null,
  stock_after integer not null,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists stock_movements_created_at_idx on public.stock_movements(created_at desc);
create index if not exists stock_movements_product_id_idx on public.stock_movements(product_id);

-- ---------------------------------------------------------------------------
-- Opening cash float
-- ---------------------------------------------------------------------------
create table if not exists public.cash_floats (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  counts jsonb not null default '{}'::jsonb,
  total numeric(10,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists cash_floats_touch_updated_at on public.cash_floats;
create trigger cash_floats_touch_updated_at
before update on public.cash_floats
for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Private settings (never readable from the browser)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  singleton boolean primary key default true check (singleton = true),
  admin_pin_hash text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(singleton, admin_pin_hash)
values (true, extensions.crypt('2026', extensions.gen_salt('bf')))
on conflict (singleton) do nothing;

-- ---------------------------------------------------------------------------
-- Secure functions
-- ---------------------------------------------------------------------------
create or replace function public.verify_admin_pin(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select admin_pin_hash = extensions.crypt(coalesce(p_pin,''), admin_pin_hash)
       from public.app_settings where singleton = true),
    false
  );
$$;

create or replace function public.admin_set_pin(p_new_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès administrateur requis';
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Le code doit contenir 4 à 8 chiffres';
  end if;
  update public.app_settings
     set admin_pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
         updated_at = now()
   where singleton = true;
  return true;
end;
$$;

create or replace function public.create_sale(
  p_method text,
  p_lines jsonb,
  p_offered_by text default '',
  p_referee_name text default '',
  p_admin_pin text default null,
  p_device_label text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_qty integer;
  v_commercial numeric(10,2) := 0;
  v_cost numeric(10,2) := 0;
  v_recorded_total numeric(10,2) := 0;
  v_sale_id uuid;
  v_stock_after integer;
  v_movement_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  if p_method not in ('Espèces','Carte','Offert','Conso arbitre') then
    raise exception 'Mode de paiement invalide';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Commande vide';
  end if;

  if p_method = 'Offert' then
    if not public.verify_admin_pin(p_admin_pin) then
      raise exception 'Code administrateur incorrect';
    end if;
    if btrim(coalesce(p_offered_by,'')) = '' then
      raise exception 'Le nom de la personne qui autorise l''offert est requis';
    end if;
  end if;

  if p_method = 'Conso arbitre' and btrim(coalesce(p_referee_name,'')) = '' then
    raise exception 'Le nom de l''arbitre est requis';
  end if;

  -- First pass: lock products, validate stock, calculate snapshot totals.
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    begin
      v_product_id := (v_line->>'product_id')::uuid;
      v_qty := (v_line->>'quantity')::integer;
    exception when others then
      raise exception 'Ligne de commande invalide';
    end;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantité invalide';
    end if;

    select * into v_product
      from public.products
     where id = v_product_id and active = true
     for update;

    if not found then
      raise exception 'Produit introuvable ou inactif';
    end if;

    if v_product.stock_tracked and v_product.stock < v_qty then
      raise exception 'Stock insuffisant pour % (% disponible)', v_product.name, v_product.stock;
    end if;

    v_commercial := v_commercial + (v_product.sale_price * v_qty);
    v_cost := v_cost + (v_product.cost_price * v_qty);
  end loop;

  if p_method in ('Offert','Conso arbitre') then
    v_recorded_total := 0;
  else
    v_recorded_total := v_commercial;
  end if;

  insert into public.sales(
    method,total,cost,commercial_value,offered_by,referee_name,device_label,created_by
  ) values (
    p_method,
    v_recorded_total,
    v_cost,
    v_commercial,
    case when p_method='Offert' then btrim(coalesce(p_offered_by,'')) else '' end,
    case when p_method='Conso arbitre' then btrim(coalesce(p_referee_name,'')) else '' end,
    coalesce(p_device_label,''),
    auth.uid()
  ) returning id into v_sale_id;

  if p_method = 'Offert' then
    v_movement_type := 'Offert';
  elsif p_method = 'Conso arbitre' then
    v_movement_type := 'Conso arbitre';
  else
    v_movement_type := 'Vente';
  end if;

  -- Second pass: write snapshots and decrement stock atomically.
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::integer;

    select * into v_product
      from public.products
     where id = v_product_id
     for update;

    insert into public.sale_lines(
      sale_id,product_id,product_name,quantity,unit_sale_price,unit_cost_price
    ) values (
      v_sale_id,v_product.id,v_product.name,v_qty,v_product.sale_price,v_product.cost_price
    );

    if v_product.stock_tracked then
      update public.products
         set stock = stock - v_qty
       where id = v_product.id
       returning stock into v_stock_after;

      insert into public.stock_movements(
        product_id,product_name,movement_type,quantity,stock_after,note,created_by
      ) values (
        v_product.id,
        v_product.name,
        v_movement_type,
        -v_qty,
        v_stock_after,
        'Transaction ' || v_sale_id::text,
        auth.uid()
      );
    end if;
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'method', p_method,
    'total', v_recorded_total,
    'commercial_value', v_commercial,
    'cost', v_cost
  );
end;
$$;

create or replace function public.admin_adjust_stock(
  p_product_id uuid,
  p_mode text,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_old integer;
  v_after integer;
  v_delta integer;
  v_type text;
begin
  if not public.is_admin() then
    raise exception 'Accès administrateur requis';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantité invalide';
  end if;

  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Produit introuvable'; end if;
  v_old := v_product.stock;

  if p_mode in ('set_start','reset_start') then
    update public.products
       set stock=p_quantity, starting_stock=p_quantity, stock_tracked=true
     where id=p_product_id
     returning stock into v_after;
    v_delta := p_quantity - v_old;
    v_type := case when p_mode='set_start' then 'Stock de départ' else 'Redéfinition stock de départ' end;

  elsif p_mode='restock' then
    if p_quantity <= 0 then raise exception 'La quantité achetée doit être positive'; end if;
    if v_product.stock_tracked then
      update public.products set stock=stock+p_quantity where id=p_product_id returning stock into v_after;
      v_delta := p_quantity;
      v_type := 'Achat';
    else
      update public.products
         set stock=p_quantity, starting_stock=p_quantity, stock_tracked=true
       where id=p_product_id returning stock into v_after;
      v_delta := p_quantity;
      v_type := 'Stock de départ';
    end if;

  elsif p_mode='correct' then
    update public.products
       set stock=p_quantity,
           starting_stock=case when stock_tracked=false or starting_stock=0 then p_quantity else starting_stock end,
           stock_tracked=true
     where id=p_product_id
     returning stock into v_after;
    v_delta := p_quantity - v_old;
    v_type := 'Correction';
  else
    raise exception 'Mode de stock invalide';
  end if;

  insert into public.stock_movements(
    product_id,product_name,movement_type,quantity,stock_after,created_by
  ) values (
    v_product.id,v_product.name,v_type,v_delta,v_after,auth.uid()
  );

  return jsonb_build_object('stock',v_after,'delta',v_delta,'type',v_type);
end;
$$;

create or replace function public.admin_delete_sale(p_sale_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line record;
  v_product public.products%rowtype;
  v_after integer;
begin
  if not public.is_admin() then
    raise exception 'Accès administrateur requis';
  end if;

  if not exists(select 1 from public.sales where id=p_sale_id) then
    return false;
  end if;

  for v_line in
    select * from public.sale_lines where sale_id=p_sale_id
  loop
    if v_line.product_id is not null then
      select * into v_product from public.products where id=v_line.product_id for update;
      if found and v_product.stock_tracked then
        update public.products
           set stock=stock+v_line.quantity
         where id=v_product.id
         returning stock into v_after;

        insert into public.stock_movements(
          product_id,product_name,movement_type,quantity,stock_after,note,created_by
        ) values (
          v_product.id,v_product.name,'Annulation transaction',v_line.quantity,v_after,
          'Suppression transaction ' || p_sale_id::text,auth.uid()
        );
      end if;
    end if;
  end loop;

  delete from public.sales where id=p_sale_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.cash_outs enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cash_floats enable row level security;
alter table public.app_settings enable row level security;

-- Profiles
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
for select to authenticated
using (id=auth.uid() or public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Categories
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
for select to authenticated using (true);

drop policy if exists categories_admin_insert on public.categories;
create policy categories_admin_insert on public.categories
for insert to authenticated with check (public.is_admin());

drop policy if exists categories_admin_update on public.categories;
create policy categories_admin_update on public.categories
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists categories_admin_delete on public.categories;
create policy categories_admin_delete on public.categories
for delete to authenticated using (public.is_admin());

-- Products
drop policy if exists products_read on public.products;
create policy products_read on public.products
for select to authenticated using (true);

drop policy if exists products_admin_insert on public.products;
create policy products_admin_insert on public.products
for insert to authenticated with check (public.is_admin());

drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_admin_delete on public.products;
create policy products_admin_delete on public.products
for delete to authenticated using (public.is_admin());

-- Sales are only directly readable by admins. Cashiers create them through RPC.
drop policy if exists sales_admin_read on public.sales;
create policy sales_admin_read on public.sales
for select to authenticated using (public.is_admin());

drop policy if exists sale_lines_admin_read on public.sale_lines;
create policy sale_lines_admin_read on public.sale_lines
for select to authenticated using (public.is_admin());

-- Cash-outs: staff can insert/read; only admins delete/update.
drop policy if exists cash_outs_read on public.cash_outs;
create policy cash_outs_read on public.cash_outs
for select to authenticated using (true);

drop policy if exists cash_outs_insert on public.cash_outs;
create policy cash_outs_insert on public.cash_outs
for insert to authenticated with check (auth.uid() is not null and created_by=auth.uid());

drop policy if exists cash_outs_admin_update on public.cash_outs;
create policy cash_outs_admin_update on public.cash_outs
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists cash_outs_admin_delete on public.cash_outs;
create policy cash_outs_admin_delete on public.cash_outs
for delete to authenticated using (public.is_admin());

-- Stock history only for admins.
drop policy if exists stock_movements_admin_read on public.stock_movements;
create policy stock_movements_admin_read on public.stock_movements
for select to authenticated using (public.is_admin());

-- Cash float only for admins.
drop policy if exists cash_floats_admin_select on public.cash_floats;
create policy cash_floats_admin_select on public.cash_floats
for select to authenticated using (public.is_admin());

drop policy if exists cash_floats_admin_insert on public.cash_floats;
create policy cash_floats_admin_insert on public.cash_floats
for insert to authenticated with check (public.is_admin());

drop policy if exists cash_floats_admin_update on public.cash_floats;
create policy cash_floats_admin_update on public.cash_floats
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists cash_floats_admin_delete on public.cash_floats;
create policy cash_floats_admin_delete on public.cash_floats
for delete to authenticated using (public.is_admin());

-- No client policy is created for app_settings: PIN hash stays private.

-- Explicit grants for the Data API (RLS still applies after these grants).
revoke all on public.app_settings from anon, authenticated;
revoke all on public.sales from anon;
revoke all on public.sale_lines from anon;
revoke all on public.stock_movements from anon;
revoke all on public.products from anon;
revoke all on public.categories from anon;
revoke all on public.cash_outs from anon;
revoke all on public.cash_floats from anon;
revoke all on public.profiles from anon;

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select,insert,update,delete on public.categories to authenticated;
grant select,insert,update,delete on public.products to authenticated;
grant select on public.sales to authenticated;
grant select on public.sale_lines to authenticated;
grant select,insert,update,delete on public.cash_outs to authenticated;
grant select on public.stock_movements to authenticated;
grant select,insert,update,delete on public.cash_floats to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.verify_admin_pin(text) to authenticated;
grant execute on function public.admin_set_pin(text) to authenticated;
grant execute on function public.create_sale(text,jsonb,text,text,text,text) to authenticated;
grant execute on function public.admin_adjust_stock(uuid,text,integer) to authenticated;
grant execute on function public.admin_delete_sale(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for product photos
-- ---------------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public=true,
    file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists product_images_admin_insert on storage.objects;
create policy product_images_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id='product-images' and public.is_admin());

drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update on storage.objects
for update to authenticated
using (bucket_id='product-images' and public.is_admin())
with check (bucket_id='product-images' and public.is_admin());

drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete on storage.objects
for delete to authenticated
using (bucket_id='product-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime: small club workload -> Postgres Changes is simple and sufficient.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='products'
  ) then alter publication supabase_realtime add table public.products; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='categories'
  ) then alter publication supabase_realtime add table public.categories; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cash_outs'
  ) then alter publication supabase_realtime add table public.cash_outs; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sales'
  ) then alter publication supabase_realtime add table public.sales; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cash_floats'
  ) then alter publication supabase_realtime add table public.cash_floats; end if;
end $$;
