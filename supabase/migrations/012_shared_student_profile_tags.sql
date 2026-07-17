-- V9.1 - Öğretmene ait ortak öğrenci profil etiketleri
create table if not exists public.student_profile_tags (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 60),
  created_at timestamptz not null default now()
);

create unique index if not exists student_profile_tags_teacher_label_ci
  on public.student_profile_tags (teacher_id, lower(trim(label)));

alter table public.student_profile_tags enable row level security;

drop policy if exists "teacher reads own profile tags" on public.student_profile_tags;
create policy "teacher reads own profile tags"
on public.student_profile_tags for select to authenticated
using (teacher_id = auth.uid());

drop policy if exists "teacher creates own profile tags" on public.student_profile_tags;
create policy "teacher creates own profile tags"
on public.student_profile_tags for insert to authenticated
with check (teacher_id = auth.uid());

drop policy if exists "teacher deletes own profile tags" on public.student_profile_tags;
create policy "teacher deletes own profile tags"
on public.student_profile_tags for delete to authenticated
using (teacher_id = auth.uid());

-- Etiketi katalogdan ve öğretmenin aktif sınıflarındaki öğrenci profillerinden birlikte kaldırır.
create or replace function public.delete_student_profile_tag(p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  select label into v_label
  from public.student_profile_tags
  where id = p_tag_id and teacher_id = auth.uid();

  if v_label is null then
    raise exception 'Etiket bulunamadı veya bu etiketi silme yetkiniz yok.';
  end if;

  update public.student_profiles sp
  set tags = array_remove(coalesce(sp.tags, '{}'::text[]), v_label),
      updated_at = now()
  where sp.student_id in (
    select s.id
    from public.students s
    join public.teacher_active_classes tac on tac.class_id = s.class_id
    where tac.teacher_id = auth.uid()
  );

  delete from public.student_profile_tags
  where id = p_tag_id and teacher_id = auth.uid();
end;
$$;

grant execute on function public.delete_student_profile_tag(uuid) to authenticated;
