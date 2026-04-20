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

-- Multi-store / account / billing / admin foundations
create table if not exists ck_accounts (
  id text primary key,
  name text not null,
  owner_email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ck_stores (
  id text primary key,
  slug text not null unique,
  name text not null,
  store_code text not null unique,
  pin_code text not null,
  trial_days integer not null default 45,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ck_account_stores (
  account_id text not null references ck_accounts(id) on delete cascade,
  store_id text not null references ck_stores(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (account_id, store_id)
);

create table if not exists ck_users (
  id text primary key,
  account_id text not null references ck_accounts(id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'manager',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ck_subscriptions (
  id text primary key default gen_random_uuid()::text,
  account_id text not null references ck_accounts(id) on delete cascade,
  store_id text not null references ck_stores(id) on delete cascade,
  plan_code text not null default 'ordering_usage',
  status text not null default 'trialing',
  is_free boolean not null default false,
  price_cents integer not null default 4900,
  currency text not null default 'usd',
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, store_id, plan_code)
);

create table if not exists ck_payment_events (
  id text primary key default gen_random_uuid()::text,
  account_id text not null references ck_accounts(id) on delete cascade,
  store_id text not null references ck_stores(id) on delete cascade,
  subscription_id text references ck_subscriptions(id) on delete set null,
  provider text not null default 'stripe',
  provider_payment_id text,
  amount_cents integer not null default 0,
  refunded_cents integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'succeeded',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ck_refunds (
  id text primary key default gen_random_uuid()::text,
  payment_event_id text not null references ck_payment_events(id) on delete cascade,
  account_id text not null references ck_accounts(id) on delete cascade,
  store_id text not null references ck_stores(id) on delete cascade,
  amount_cents integer not null default 0,
  reason text default '',
  status text not null default 'succeeded',
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists ck_audit_logs (
  id text primary key default gen_random_uuid()::text,
  store_id text references ck_stores(id) on delete set null,
  actor text not null default 'system',
  event_type text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ck_system_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists ck_price_book (
  id text primary key default gen_random_uuid()::text,
  plan_code text not null unique,
  price_cents integer not null default 4900,
  currency text not null default 'usd',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into ck_system_settings (id, settings)
values ('default', jsonb_build_object(
  'admin_pin', '9090',
  'ordering_usage_price_cents', 4900,
  'trial_days', 45,
  'stripe_mode', 'test',
  'stripe_publishable_key', '',
  'stripe_secret_key', '',
  'stripe_webhook_secret', '',
  'stripe_price_id', '',
  'stripe_product_id', ''
))
on conflict (id) do nothing;

insert into ck_price_book (plan_code, price_cents, currency, active)
values ('ordering_usage', 4900, 'usd', true)
on conflict (plan_code) do nothing;

-- Enable Row Level Security (open for single-user internal tool)
alter table ck_items enable row level security;
alter table ck_sessions enable row level security;
alter table ck_counts enable row level security;
alter table ck_orders enable row level security;
alter table ck_order_items enable row level security;
alter table ck_layout enable row level security;
alter table ck_accounts enable row level security;
alter table ck_stores enable row level security;
alter table ck_account_stores enable row level security;
alter table ck_users enable row level security;
alter table ck_subscriptions enable row level security;
alter table ck_payment_events enable row level security;
alter table ck_refunds enable row level security;
alter table ck_audit_logs enable row level security;
alter table ck_system_settings enable row level security;
alter table ck_price_book enable row level security;

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
  if not exists (select 1 from pg_policies where tablename='ck_accounts' and policyname='allow_all') then
    execute 'create policy allow_all on ck_accounts for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_stores' and policyname='allow_all') then
    execute 'create policy allow_all on ck_stores for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_account_stores' and policyname='allow_all') then
    execute 'create policy allow_all on ck_account_stores for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_users' and policyname='allow_all') then
    execute 'create policy allow_all on ck_users for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_subscriptions' and policyname='allow_all') then
    execute 'create policy allow_all on ck_subscriptions for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_payment_events' and policyname='allow_all') then
    execute 'create policy allow_all on ck_payment_events for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_refunds' and policyname='allow_all') then
    execute 'create policy allow_all on ck_refunds for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_audit_logs' and policyname='allow_all') then
    execute 'create policy allow_all on ck_audit_logs for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_system_settings' and policyname='allow_all') then
    execute 'create policy allow_all on ck_system_settings for all using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='ck_price_book' and policyname='allow_all') then
    execute 'create policy allow_all on ck_price_book for all using (true) with check (true)';
  end if;
end $$;

-- Migration: add updated_at to ck_counts (safe to re-run) for multi-device sync detection
alter table ck_counts add column if not exists updated_at timestamptz default now();
update ck_counts set updated_at = coalesce(updated_at, created_at) where updated_at is null;

-- Migration: draft/final state for count sessions (safe to re-run)
alter table ck_sessions add column if not exists status text not null default 'final';
update ck_sessions set status='final' where status is null or trim(status)='';
create index if not exists ck_sessions_status_idx on ck_sessions(status);

-- Migration: item-order math fields for case packs + reorder trigger (safe to re-run)
alter table ck_items add column if not exists order_unit text default '';
alter table ck_items add column if not exists order_pack_qty numeric default 1;
alter table ck_items add column if not exists reorder_trigger numeric;
alter table ck_items add column if not exists upc text default '';
alter table ck_items add column if not exists store_id text default 'store_1406';
alter table ck_sessions add column if not exists store_id text default 'store_1406';
alter table ck_counts add column if not exists store_id text default 'store_1406';
alter table ck_orders add column if not exists store_id text default 'store_1406';
alter table ck_order_items add column if not exists store_id text default 'store_1406';
alter table ck_layout add column if not exists store_id text default 'store_1406';
update ck_items set order_unit = coalesce(nullif(order_unit,''), unit) where order_unit is null or order_unit = '';
update ck_items set order_pack_qty = 1 where order_pack_qty is null or order_pack_qty <= 0;
update ck_items set upc = '' where upc is null;
update ck_items set store_id = 'store_1406' where store_id is null or store_id = '';
update ck_sessions set store_id = 'store_1406' where store_id is null or store_id = '';
update ck_counts set store_id = 'store_1406' where store_id is null or store_id = '';
update ck_orders set store_id = 'store_1406' where store_id is null or store_id = '';
update ck_order_items set store_id = 'store_1406' where store_id is null or store_id = '';
update ck_layout set store_id = 'store_1406' where store_id is null or store_id = '';

insert into ck_accounts (id, name, owner_email, status)
values ('acct_1406', 'Store 1406', null, 'active')
on conflict (id) do nothing;

insert into ck_stores (id, slug, name, store_code, pin_code, trial_days, status)
values ('store_1406', 'store1406', 'Store 1406', '1406', '1406', 45, 'active')
on conflict (id) do nothing;

insert into ck_account_stores (account_id, store_id, role)
values ('acct_1406', 'store_1406', 'owner')
on conflict (account_id, store_id) do nothing;

insert into ck_subscriptions (
  account_id, store_id, plan_code, status, is_free, price_cents, currency, trial_started_at, trial_ends_at
) values (
  'acct_1406', 'store_1406', 'ordering_usage', 'trialing', false, 4900, 'usd', now(), now() + interval '45 days'
)
on conflict (account_id, store_id, plan_code) do nothing;
