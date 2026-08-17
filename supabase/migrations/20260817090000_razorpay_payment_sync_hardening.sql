-- Razorpay payment sync hardening
-- Additive-only changes for idempotent payment/webhook processing.

alter table if exists public.payment_events
  add column if not exists provider_event_id text,
  add column if not exists processed_at timestamptz,
  add column if not exists error text;

create unique index if not exists payment_events_provider_event_key
  on public.payment_events (provider, provider_event_id)
  where provider_event_id is not null;

create unique index if not exists payment_events_provider_payment_event_key
  on public.payment_events (provider, provider_payment_id, event_type)
  where provider_payment_id is not null;

create unique index if not exists orders_razorpay_order_id_key
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

create index if not exists orders_payment_id_idx
  on public.orders (payment_id)
  where payment_id is not null;

create table if not exists public.order_side_effects (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  effect_type text not null check (effect_type in ('order_confirmation_email', 'rapidshyp_order')),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, effect_type)
);

create index if not exists order_side_effects_status_idx
  on public.order_side_effects (status, updated_at desc);

alter table public.order_side_effects enable row level security;
