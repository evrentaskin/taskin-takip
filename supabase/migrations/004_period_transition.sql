-- TAŞKIN AKADEMİ V6.3 - GÜVENLİ DÖNEM GEÇİŞİ
-- Eski dönem verilerini silmez; yeni dönem için yeni bir boş bağlam oluşturur.
-- LGS modülü dönemden bağımsızdır.

create table if not exists public.term_transitions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  previous_term_id uuid references public.academic_terms(id) on delete set null,
  new_term_id uuid not null references public.academic_terms(id) on delete cascade,
  transitioned_at timestamptz not null default now()
);

alter table public.term_transitions enable row level security;

drop policy if exists "Öğretmen dönem geçişlerini görür" on public.term_transitions;
create policy "Öğretmen dönem geçişlerini görür"
on public.term_transitions
for select to authenticated
using (teacher_id = auth.uid() and public.is_teacher());

create or replace function public.start_new_academic_term(
  p_term_name text,
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_previous_term_id uuid;
  v_new_term_id uuid;
begin
  if v_teacher_id is null then
    raise exception 'Oturum bulunamadı.';
  end if;

  if not public.is_teacher() then
    raise exception 'Bu işlem için öğretmen yetkisi gerekir.';
  end if;

  if trim(coalesce(p_term_name, '')) = '' then
    raise exception 'Dönem adı zorunlu.';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Başlangıç ve bitiş tarihleri zorunlu.';
  end if;

  if p_end_date < p_start_date then
    raise exception 'Bitiş tarihi başlangıç tarihinden önce olamaz.';
  end if;

  select id
  into v_previous_term_id
  from public.academic_terms
  where teacher_id = v_teacher_id
    and is_active = true
  limit 1
  for update;

  update public.academic_terms
  set is_active = false
  where teacher_id = v_teacher_id
    and is_active = true;

  insert into public.academic_terms (
    teacher_id,
    term_name,
    start_date,
    end_date,
    is_active
  )
  values (
    v_teacher_id,
    trim(p_term_name),
    p_start_date,
    p_end_date,
    true
  )
  returning id into v_new_term_id;

  insert into public.term_transitions (
    teacher_id,
    previous_term_id,
    new_term_id
  )
  values (
    v_teacher_id,
    v_previous_term_id,
    v_new_term_id
  );

  return v_new_term_id;
end;
$$;

grant execute on function public.start_new_academic_term(text, date, date) to authenticated;

-- Gelecekteki dönemlik modüller şu kurala göre bağlanacaktır:
-- normal sınıflarda her kayıt academic_term_id taşıyacak;
-- yeni dönem başladığında yeni kayıtlar yalnızca yeni aktif döneme yazılacak;
-- eski dönem verileri arşivde kalacak;
-- LGS denemeleri lgs_exams/lgs_results tablolarında dönemden bağımsız kalacaktır.
