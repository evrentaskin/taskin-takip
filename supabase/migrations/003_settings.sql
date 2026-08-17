create table if not exists public.teacher_active_classes (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id)
);

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  term_name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_terms_date_check check (end_date >= start_date)
);

drop trigger if exists academic_terms_set_updated_at on public.academic_terms;
create trigger academic_terms_set_updated_at
before update on public.academic_terms
for each row execute function public.set_updated_at();

create unique index if not exists academic_terms_one_active_per_teacher
on public.academic_terms(teacher_id)
where is_active = true;

alter table public.teacher_active_classes enable row level security;
alter table public.academic_terms enable row level security;

drop policy if exists "Öğretmen aktif sınıflarını görür" on public.teacher_active_classes;
drop policy if exists "Öğretmen aktif sınıflarını ekler" on public.teacher_active_classes;
drop policy if exists "Öğretmen aktif sınıflarını siler" on public.teacher_active_classes;

create policy "Öğretmen aktif sınıflarını görür"
on public.teacher_active_classes for select to authenticated
using (teacher_id = auth.uid() and public.is_teacher());

create policy "Öğretmen aktif sınıflarını ekler"
on public.teacher_active_classes for insert to authenticated
with check (teacher_id = auth.uid() and public.is_teacher());

create policy "Öğretmen aktif sınıflarını siler"
on public.teacher_active_classes for delete to authenticated
using (teacher_id = auth.uid() and public.is_teacher());

drop policy if exists "Öğretmen dönemlerini görür" on public.academic_terms;
drop policy if exists "Öğretmen dönem ekler" on public.academic_terms;
drop policy if exists "Öğretmen dönem günceller" on public.academic_terms;
drop policy if exists "Öğretmen dönem siler" on public.academic_terms;

create policy "Öğretmen dönemlerini görür"
on public.academic_terms for select to authenticated
using (teacher_id = auth.uid() and public.is_teacher());

create policy "Öğretmen dönem ekler"
on public.academic_terms for insert to authenticated
with check (teacher_id = auth.uid() and public.is_teacher());

create policy "Öğretmen dönem günceller"
on public.academic_terms for update to authenticated
using (teacher_id = auth.uid() and public.is_teacher())
with check (teacher_id = auth.uid() and public.is_teacher());

create policy "Öğretmen dönem siler"
on public.academic_terms for delete to authenticated
using (teacher_id = auth.uid() and public.is_teacher());
