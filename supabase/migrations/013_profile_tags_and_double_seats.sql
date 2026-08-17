-- V9.2 - Dinamik öğrenci etiketleri başlangıcı
-- Her öğretmen için önerilen etiketler yalnızca bir kez oluşturulur.
create table if not exists public.student_profile_tag_initialization (
  teacher_id uuid primary key references auth.users(id) on delete cascade,
  initialized_at timestamptz not null default now()
);

alter table public.student_profile_tag_initialization enable row level security;

drop policy if exists "teacher reads own tag initialization" on public.student_profile_tag_initialization;
create policy "teacher reads own tag initialization"
on public.student_profile_tag_initialization for select to authenticated
using (teacher_id = auth.uid());

drop policy if exists "teacher creates own tag initialization" on public.student_profile_tag_initialization;
create policy "teacher creates own tag initialization"
on public.student_profile_tag_initialization for insert to authenticated
with check (teacher_id = auth.uid());

create or replace function public.initialize_student_profile_tags()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadı.';
  end if;

  if not exists (
    select 1 from public.student_profile_tag_initialization
    where teacher_id = auth.uid()
  ) then
    insert into public.student_profile_tags (teacher_id, label)
    values
      (auth.uid(), 'Gözlüklü'),
      (auth.uid(), 'Kısa boylu'),
      (auth.uid(), 'Uzun boylu'),
      (auth.uid(), 'Çok konuşuyor'),
      (auth.uid(), 'Çalışkan'),
      (auth.uid(), 'Ders desteğine ihtiyacı var'),
      (auth.uid(), 'Ön sırada oturmalı')
    on conflict do nothing;

    insert into public.student_profile_tag_initialization (teacher_id)
    values (auth.uid())
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.initialize_student_profile_tags() to authenticated;
