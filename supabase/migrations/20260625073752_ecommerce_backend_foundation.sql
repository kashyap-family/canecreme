-- CaneCreme e-commerce backend foundation
-- Additive migration: this keeps the existing static storefront working while
-- adding the operational tables needed for inventory, payment, shipment, and
-- audit tracking.

create extension if not exists pgcrypto;

alter table if exists public.products
  add column if not exists sku text,
  add column if not exists category text,
  add column if not exists delivery_type text not null default 'pan_india',
  add column if not exists low_stock_threshold integer not null default 5,
  add column if not exists reserved_stock integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.products
  add constraint products_delivery_type_check
  check (delivery_type in ('pan_india', 'delhi_only'))
  not valid;

alter table if exists public.products validate constraint products_delivery_type_check;

create unique index if not exists products_sku_key
  on public.products (sku)
  where sku is not null;

create index if not exists products_active_category_idx
  on public.products (is_active, category);

alter table if exists public.orders
  add column if not exists order_number text,
  add column if not exists payment_method text,
  add column if not exists delivery_charge numeric(10, 2) not null default 0,
  add column if not exists discount_amount numeric(10, 2) not null default 0,
  add column if not exists coupon_code text,
  add column if not exists razorpay_order_id text,
  add column if not exists shipping_partner text,
  add column if not exists shipping_awb text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists internal_notes text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists orders_order_number_key
  on public.orders (order_number)
  where order_number is not null;

create index if not exists orders_customer_phone_idx
  on public.orders (customer_phone);

create index if not exists orders_status_created_at_idx
  on public.orders (order_status, created_at desc);

create index if not exists orders_payment_status_created_at_idx
  on public.orders (payment_status, created_at desc);

alter table if exists public.order_items
  add column if not exists product_name text,
  add column if not exists sku text,
  add column if not exists line_total numeric(10, 2),
  add column if not exists created_at timestamptz not null default now();

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  movement_type text not null check (movement_type in ('stock_in', 'reserve', 'release', 'sale', 'adjustment', 'return')),
  quantity integer not null check (quantity <> 0),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_product_created_idx
  on public.inventory_movements (product_id, created_at desc);

create index if not exists inventory_movements_order_idx
  on public.inventory_movements (order_id);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  event_type text not null,
  amount numeric(10, 2),
  currency text not null default 'INR',
  status text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_order_created_idx
  on public.payment_events (order_id, created_at desc);

create index if not exists payment_events_provider_payment_idx
  on public.payment_events (provider, provider_payment_id);

create table if not exists public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  provider text not null default 'rapidshyp',
  provider_order_id text,
  awb text,
  event_type text not null,
  status text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shipment_events_order_created_idx
  on public.shipment_events (order_id, created_at desc);

create index if not exists shipment_events_awb_idx
  on public.shipment_events (awb)
  where awb is not null;

create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_log_created_idx
  on public.admin_activity_log (created_at desc);

alter table public.inventory_movements enable row level security;
alter table public.payment_events enable row level security;
alter table public.shipment_events enable row level security;
alter table public.admin_activity_log enable row level security;

-- No public policies are intentionally created for operational tables.
-- Current Edge Functions use SERVICE_ROLE_KEY server-side for private admin work.
