create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  email text,
  coupon_code text not null default 'WELCOME10',
  source text not null default 'popup',
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

revoke all on public.leads from anon, authenticated;
grant insert on public.leads to anon;

drop policy if exists "Allow popup lead submissions" on public.leads;
create policy "Allow popup lead submissions"
on public.leads
for insert
to anon
with check (
  source = 'popup'
  and coalesce(nullif(trim(phone), ''), nullif(trim(email), '')) is not null
);

create index if not exists leads_source_created_at_idx
on public.leads (source, created_at desc);

create index if not exists leads_phone_idx
on public.leads (phone);

create index if not exists leads_email_idx
on public.leads (email);
