-- V10.0.6.48 — Giriş sayacı yerine gerçek öğrenci aktiflik takibi.
-- Oturumu açık kalan öğrenci uygulamayı açtığında / online denemeyi kullandığında aktif sayılır.

create table if not exists public.student_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  active_at timestamptz not null default now(),
  activity_type text not null default 'app_active',
  device_type text not null default 'bilgisayar'
    check (device_type in ('telefon', 'tablet', 'bilgisayar')),
  user_agent text
);

create index if not exists student_activity_events_active_at_idx
  on public.student_activity_events (active_at desc);
create index if not exists student_activity_events_user_time_idx
  on public.student_activity_events (user_id, active_at desc);

alter table public.student_activity_events enable row level security;

drop policy if exists "Kullanıcı kendi aktifliğini kaydeder" on public.student_activity_events;
drop policy if exists "Öğretmen aktiflik kayıtlarını görür" on public.student_activity_events;
drop policy if exists "Kullanıcı kendi aktiflik kayıtlarını görür" on public.student_activity_events;

create policy "Kullanıcı kendi aktifliğini kaydeder"
on public.student_activity_events for insert to authenticated
with check (user_id = auth.uid());

create policy "Öğretmen aktiflik kayıtlarını görür"
on public.student_activity_events for select to authenticated
using (public.is_teacher());

create policy "Kullanıcı kendi aktiflik kayıtlarını görür"
on public.student_activity_events for select to authenticated
using (user_id = auth.uid());

grant select, insert on public.student_activity_events to authenticated;
