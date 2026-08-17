-- Abandoned checkout recovery offers.
-- Coupons are created and validated only through Edge Functions using the service role.

alter table public.abandoned_checkouts
  add column if not exists recovery_status text not null default 'not_contacted',
  add column if not exists recovery_offer_id uuid,
  add column if not exists recovered_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'abandoned_checkouts_recovery_status_check'
  ) then
    alter table public.abandoned_checkouts
      add constraint abandoned_checkouts_recovery_status_check
      check (recovery_status in (
        'not_contacted',
        'offer_created',
        'whatsapp_opened',
        'contacted',
        'recovered',
        'expired'
      ));
  end if;
end $$;

create table if not exists public.abandoned_checkout_offers (
  id uuid primary key default gen_random_uuid(),
  abandoned_checkout_id uuid not null references public.abandoned_checkouts(id) on delete cascade,
  customer_phone text,
  customer_email text,
  offer_key text not null,
  offer_label text not null,
  offer_type text not null,
  offer_value numeric(10, 2) not null default 0,
  coupon_code text not null unique,
  checkout_link text,
  status text not null default 'offer_created',
  expires_at timestamptz not null,
  used_at timestamptz,
  used_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint abandoned_checkout_offers_offer_key_check
    check (offer_key in ('percent_5', 'percent_10', 'amount_50', 'free_shipping', 'no_offer')),
  constraint abandoned_checkout_offers_offer_type_check
    check (offer_type in ('percent', 'amount', 'free_shipping', 'none')),
  constraint abandoned_checkout_offers_status_check
    check (status in ('offer_created', 'whatsapp_opened', 'contacted', 'recovered', 'expired')),
  constraint abandoned_checkout_offers_once_per_checkout_offer
    unique (abandoned_checkout_id, offer_key)
);

create index if not exists abandoned_checkout_offers_checkout_idx
  on public.abandoned_checkout_offers (abandoned_checkout_id, created_at desc);

create index if not exists abandoned_checkout_offers_coupon_idx
  on public.abandoned_checkout_offers (coupon_code);

create index if not exists abandoned_checkout_offers_status_expires_idx
  on public.abandoned_checkout_offers (status, expires_at);

alter table public.abandoned_checkout_offers enable row level security;

revoke all on public.abandoned_checkout_offers from anon, authenticated;
