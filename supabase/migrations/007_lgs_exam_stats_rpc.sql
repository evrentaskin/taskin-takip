create or replace function public.get_my_lgs_exam_stats()
returns table (
  exam_id uuid,
  average_score numeric,
  max_score numeric,
  min_score numeric,
  participant_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    r.exam_id,
    avg(r.score)::numeric as average_score,
    max(r.score)::numeric as max_score,
    min(r.score)::numeric as min_score,
    count(*)::bigint as participant_count
  from public.lgs_results r
  join public.students me on me.auth_user_id = auth.uid()
  join public.students peer on peer.id = r.student_id and peer.class_id = me.class_id
  where r.score is not null
  group by r.exam_id;
$$;

grant execute on function public.get_my_lgs_exam_stats() to authenticated;
