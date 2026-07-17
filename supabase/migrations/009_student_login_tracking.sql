create table if not exists public.student_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  device_type text not null default 'bilgisayar'
    check (device_type in ('telefon', 'tablet', 'bilgisayar')),
  user_agent text
);

create index if not exists student_login_events_logged_in_at_idx
  on public.student_login_events (logged_in_at desc);
create index if not exists student_login_events_user_time_idx
  on public.student_login_events (user_id, logged_in_at desc);

alter table public.student_login_events enable row level security;

drop policy if exists "Kullanıcı kendi girişini kaydeder" on public.student_login_events;
drop policy if exists "Öğretmen giriş kayıtlarını görür" on public.student_login_events;
drop policy if exists "Kullanıcı kendi giriş kayıtlarını görür" on public.student_login_events;

create policy "Kullanıcı kendi girişini kaydeder"
on public.student_login_events for insert to authenticated
with check (user_id = auth.uid());

create policy "Öğretmen giriş kayıtlarını görür"
on public.student_login_events for select to authenticated
using (public.is_teacher());

create policy "Kullanıcı kendi giriş kayıtlarını görür"
on public.student_login_events for select to authenticated
using (user_id = auth.uid());

grant select, insert on public.student_login_events to authenticated;
