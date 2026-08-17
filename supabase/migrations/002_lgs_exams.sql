create table if not exists public.lgs_exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  exam_date date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lgs_results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.lgs_exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  student_number integer not null,
  student_name text not null,
  class_text text,
  turkish_correct numeric not null, turkish_net numeric not null,
  history_correct numeric not null, history_net numeric not null,
  religion_correct numeric not null, religion_net numeric not null,
  english_correct numeric not null, english_net numeric not null,
  math_correct numeric not null, math_net numeric not null,
  science_correct numeric not null, science_net numeric not null,
  total_correct numeric not null, total_net numeric not null,
  score numeric not null, rank integer not null,
  created_at timestamptz not null default now(),
  unique (exam_id, student_id)
);

drop trigger if exists lgs_exams_set_updated_at on public.lgs_exams;
create trigger lgs_exams_set_updated_at before update on public.lgs_exams
for each row execute function public.set_updated_at();

create index if not exists lgs_results_exam_id_idx on public.lgs_results(exam_id);
create index if not exists lgs_results_student_id_idx on public.lgs_results(student_id);
create index if not exists lgs_results_rank_idx on public.lgs_results(exam_id, rank);

alter table public.lgs_exams enable row level security;
alter table public.lgs_results enable row level security;

drop policy if exists "Öğretmen LGS denemelerini görür" on public.lgs_exams;
drop policy if exists "Öğrenci LGS denemelerini görür" on public.lgs_exams;
drop policy if exists "Öğretmen LGS sonuçlarını görür" on public.lgs_results;
drop policy if exists "Öğrenci kendi LGS sonucunu görür" on public.lgs_results;

create policy "Öğretmen LGS denemelerini görür" on public.lgs_exams
for select to authenticated using (public.is_teacher());

create policy "Öğrenci LGS denemelerini görür" on public.lgs_exams
for select to authenticated using (
  exists (
    select 1 from public.lgs_results r
    join public.students s on s.id = r.student_id
    where r.exam_id = lgs_exams.id and s.auth_user_id = auth.uid()
  )
);

create policy "Öğretmen LGS sonuçlarını görür" on public.lgs_results
for select to authenticated using (public.is_teacher());

create policy "Öğrenci kendi LGS sonucunu görür" on public.lgs_results
for select to authenticated using (
  exists (
    select 1 from public.students s
    where s.id = lgs_results.student_id and s.auth_user_id = auth.uid()
  )
);
