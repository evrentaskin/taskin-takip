create table if not exists public.lgs_student_portal_settings (
  student_id uuid primary key references public.students(id) on delete cascade,
  target_score numeric,
  target_history jsonb not null default '[]'::jsonb,
  study_plan jsonb not null default '[]'::jsonb,
  study_plan_generated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.lgs_student_portal_settings enable row level security;

drop policy if exists "Öğretmen LGS öğrenci ayarlarını yönetir" on public.lgs_student_portal_settings;
drop policy if exists "Öğrenci kendi LGS ayarlarını görür" on public.lgs_student_portal_settings;
drop policy if exists "Öğrenci kendi çalışma programını günceller" on public.lgs_student_portal_settings;

create policy "Öğretmen LGS öğrenci ayarlarını yönetir"
on public.lgs_student_portal_settings for all to authenticated
using (public.is_teacher()) with check (public.is_teacher());

create policy "Öğrenci kendi LGS ayarlarını görür"
on public.lgs_student_portal_settings for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = lgs_student_portal_settings.student_id and s.auth_user_id = auth.uid()
));

create policy "Öğrenci kendi çalışma programını günceller"
on public.lgs_student_portal_settings for update to authenticated
using (exists (
  select 1 from public.students s
  where s.id = lgs_student_portal_settings.student_id and s.auth_user_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = lgs_student_portal_settings.student_id and s.auth_user_id = auth.uid()
));
