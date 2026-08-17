create table if not exists public.shared_app_state (
  state_key text primary key,
  payload jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.shared_app_state enable row level security;

drop policy if exists "Giriş yapanlar ortak uygulama verisini okur" on public.shared_app_state;
drop policy if exists "Öğretmen ortak uygulama verisini ekler" on public.shared_app_state;
drop policy if exists "Öğretmen ortak uygulama verisini günceller" on public.shared_app_state;

create policy "Giriş yapanlar ortak uygulama verisini okur"
on public.shared_app_state for select to authenticated
using (true);

create policy "Öğretmen ortak uygulama verisini ekler"
on public.shared_app_state for insert to authenticated
with check (public.is_teacher() and updated_by = auth.uid());

create policy "Öğretmen ortak uygulama verisini günceller"
on public.shared_app_state for update to authenticated
using (public.is_teacher())
with check (public.is_teacher() and updated_by = auth.uid());

grant select, insert, update on public.shared_app_state to authenticated;
