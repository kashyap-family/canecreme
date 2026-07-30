-- CaneCreme abandoned checkout tracking
-- Captures checkout attempts with contact/cart data so the admin panel can follow up.

create table if not exists public.abandoned_checkouts (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  shipping_address jsonb not null default '{}'::jsonb,
  cart_items jsonb not null default '[]'::jsonb,
  cart_total numeric(10, 2) not null default 0,
  delivery_charge numeric(10, 2) not null default 0,
  payment_method text,
  status text not null default 'active',
  last_step text,
  order_id uuid references public.orders(id) on delete set null,
  page_url text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint abandoned_checkouts_status_check
    check (status in ('active', 'completed', 'expired')),
  constraint abandoned_checkouts_cart_items_array_check
    check (jsonb_typeof(cart_items) = 'array')
);

create index if not exists abandoned_checkouts_status_updated_idx
  on public.abandoned_checkouts (status, updated_at desc);

create index if not exists abandoned_checkouts_customer_phone_idx
  on public.abandoned_checkouts (customer_phone)
  where customer_phone is not null;

create index if not exists abandoned_checkouts_session_idx
  on public.abandoned_checkouts (session_id);

alter table public.abandoned_checkouts enable row level security;

revoke all on public.abandoned_checkouts from anon, authenticated;
