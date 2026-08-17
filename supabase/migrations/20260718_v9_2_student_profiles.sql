alter table public.students add column if not exists avatar_id integer default 1 check (avatar_id between 1 and 24);
alter table public.student_profiles add column if not exists recognition_data jsonb not null default '{}'::jsonb;
create table if not exists public.student_information_cards (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null default auth.uid(), label text not null,
 group_name text not null check (group_name in ('seating','recognition')), field_type text not null check (field_type in ('checkbox','text','number','date','phone','select')),
 options jsonb not null default '[]'::jsonb, sort_order integer not null default 0, created_at timestamptz not null default now()
);
alter table public.student_information_cards enable row level security;
drop policy if exists "teacher manages own information cards" on public.student_information_cards;
create policy "teacher manages own information cards" on public.student_information_cards for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
