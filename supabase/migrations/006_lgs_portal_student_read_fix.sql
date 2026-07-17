-- V7 LGS öğrenci paneli hedef puanı ve çalışma programı güvenli okuma düzeltmesi
create or replace function public.get_my_lgs_portal_settings()
returns table (
  student_id uuid,
  target_score numeric,
  target_history jsonb,
  study_plan jsonb,
  study_plan_generated_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.student_id, p.target_score, p.target_history, p.study_plan,
         p.study_plan_generated_at, p.updated_at
  from public.lgs_student_portal_settings p
  join public.students s on s.id = p.student_id
  where s.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_my_lgs_portal_settings() from public;
grant execute on function public.get_my_lgs_portal_settings() to authenticated;
