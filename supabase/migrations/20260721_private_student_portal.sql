create or replace function public.submit_private_exam_attempt(
  p_assignment_id text,
  p_answers jsonb,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_students jsonb;
  v_student jsonb;
  v_student_index integer;
  v_assignment_index integer;
  v_private_id text;
  v_username text;
  v_updated jsonb;
begin
  select payload into v_state from public.shared_app_state where state_key='private-lessons-v1' for update;
  if v_state is null then raise exception 'Özel ders verisi bulunamadı.'; end if;
  v_students := coalesce(v_state->'students','[]'::jsonb);
  v_private_id := coalesce(auth.jwt()->'user_metadata'->>'private_student_id','');
  v_username := split_part(coalesce(auth.jwt()->>'email',''),'@',1);

  select ord-1, item into v_student_index, v_student
  from jsonb_array_elements(v_students) with ordinality t(item,ord)
  where (v_private_id<>'' and item->>'id'=v_private_id)
     or lower(coalesce(item->>'username',''))=lower(v_username)
  limit 1;
  if v_student is null then raise exception 'Öğrenci kaydı bulunamadı.'; end if;

  select ord-1 into v_assignment_index
  from jsonb_array_elements(coalesce(v_student->'examAssignments','[]'::jsonb)) with ordinality t(item,ord)
  where item->>'id'=p_assignment_id limit 1;
  if v_assignment_index is null then raise exception 'Deneme ataması bulunamadı.'; end if;

  v_student := jsonb_set(v_student, array['examAssignments',v_assignment_index::text,'answers'],coalesce(p_answers,'{}'::jsonb),true);
  v_student := jsonb_set(v_student, array['examAssignments',v_assignment_index::text,'result'],coalesce(p_result,'{}'::jsonb),true);
  v_student := jsonb_set(v_student, array['examAssignments',v_assignment_index::text,'status'],'"completed"'::jsonb,true);
  v_student := jsonb_set(v_student, array['examAssignments',v_assignment_index::text,'finishedAt'],to_jsonb(now()::text),true);
  v_students := jsonb_set(v_students,array[v_student_index::text],v_student,true);
  v_updated := jsonb_set(v_state,'{students}',v_students,true);
  update public.shared_app_state set payload=v_updated,updated_at=now(),updated_by=auth.uid() where state_key='private-lessons-v1';
  return jsonb_build_object('payload',v_updated);
end;
$$;
grant execute on function public.submit_private_exam_attempt(text,jsonb,jsonb) to authenticated;
