create table if not exists public.student_profiles (
  student_id uuid primary key references public.students(id) on delete cascade,
  gender text check (gender in ('female','male') or gender is null),
  wears_glasses boolean not null default false,
  height_group text check (height_group in ('short','normal','tall')) default 'normal',
  talkative boolean not null default false,
  hardworking boolean not null default false,
  needs_support boolean not null default false,
  front_row boolean not null default false,
  notes text not null default '',
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.seating_plans (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null default 'Normal Düzen',
  orientation text not null default 'landscape' check (orientation in ('portrait','landscape')),
  columns jsonb not null default '[5,5,5,5]'::jsonb,
  seats jsonb not null default '{}'::jsonb,
  locked_students jsonb not null default '[]'::jsonb,
  school_name text not null default '',
  school_year text not null default '',
  updated_at timestamptz not null default now(),
  unique (teacher_id, class_id, name)
);

alter table public.student_profiles enable row level security;
alter table public.seating_plans enable row level security;

drop policy if exists "authenticated manage student profiles" on public.student_profiles;
create policy "authenticated manage student profiles" on public.student_profiles
for all to authenticated using (true) with check (true);
drop policy if exists "teacher manage own seating plans" on public.seating_plans;
create policy "teacher manage own seating plans" on public.seating_plans
for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
