-- CK Inventory — Supabase Schema Setup
-- Run this once in your Supabase SQL Editor (https://supabase.com/dashboard/project/lzhawmvgkylumwcseltb/sql)

create table if not exists ck_items (
  id text primary key,
  name text not null,
  cat_l1 text not null default '',
  cat_l2 text not null default '',
  par numeric not null default 1,
  unit text not null default 'cs',
  code text not null default '',
  upc text not null default '',
  order_unit text not null default '',
  order_pack_qty numeric not null default 1,
  reorder_trigger numeric,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists ck_sessions (
  id text primary key,
  counted_at timestamptz not null,
  notes text default '',
  created_at timestamptz default now()
);

create table if not exists ck_counts (
  id text primary key default gen_random_uuid()::text,
  session_id text not null references ck_sessions(id) on delete cascade,
  item_id text not null references ck_items(id) on delete cascade,
  count numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(session_id, item_id)
);

create table if not exists ck_orders (
  id text primary key,
  ordered_at timestamptz not null,
  session_id text references ck_sessions(id),
  status text not null default 'pending',
  received_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists ck_order_items (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references ck_orders(id) on delete cascade,
  item_id text not null references ck_items(id) on delete cascade,
  recommended numeric not null default 0,
  received numeric,
  created_at timestamptz default now(),
  unique(order_id, item_id)
);

-- Category / subcategory / item order within groups (Count tab + Setup reorder UI)
create table if not exists ck_layout (
  id text primary key,
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into ck_layout (id, layout) values ('global', '{}'::jsonb)
  on conflict (id) do nothing;

-- Enable Row Level Security (open for single-user internal tool)
alter table ck_items enable row level security;
alter table ck_sessions enable row level security;
alter table ck_counts enable row level security;
alter table ck_orders enable row level security;
alter table ck_order_items enable row level security;
alter table ck_layout enable row level security;

-- Allow all operations via anon key
do $$ begin
  if not exists (select 1 from pg_policies where tablename='ck_items' and policyname='allow_all') then
    execute 'create policy allow_all on ck_items for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_sessions' and policyname='allow_all') then
    execute 'create policy allow_all on ck_sessions for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_counts' and policyname='allow_all') then
    execute 'create policy allow_all on ck_counts for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_orders' and policyname='allow_all') then
    execute 'create policy allow_all on ck_orders for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_order_items' and policyname='allow_all') then
    execute 'create policy allow_all on ck_order_items for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_layout' and policyname='allow_all') then
    execute 'create policy allow_all on ck_layout for all using (true) with check (true)';
  end if;
end $$;

-- Migration: add updated_at to ck_counts (safe to re-run) for multi-device sync detection
alter table ck_counts add column if not exists updated_at timestamptz default now();
update ck_counts set updated_at = coalesce(updated_at, created_at) where updated_at is null;

-- Migration: item-order math fields for case packs + reorder trigger (safe to re-run)
alter table ck_items add column if not exists order_unit text default '';
alter table ck_items add column if not exists order_pack_qty numeric default 1;
alter table ck_items add column if not exists reorder_trigger numeric;
alter table ck_items add column if not exists upc text default '';
update ck_items set order_unit = coalesce(nullif(order_unit,''), unit) where order_unit is null or order_unit = '';
update ck_items set order_pack_qty = 1 where order_pack_qty is null or order_pack_qty <= 0;
update ck_items set upc = '' where upc is null;
