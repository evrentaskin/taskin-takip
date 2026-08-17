-- V9.5.5 Mobil kayıt düzeltmesi: RPC artık tüm büyük liste yerine yalnızca güncellenen denemeyi döndürür.
-- V9.5: Öğrencinin yalnızca kendi online deneme kaydını güvenli ve kalıcı yazması.
-- Öğretmen RLS kuralları ve öğretmen ekranları değiştirilmez.

create or replace function public.current_student_identity()
returns table(student_id uuid, student_number integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.student_number
  from public.students s
  where s.auth_user_id = auth.uid()
    and coalesce(s.is_active, true) = true
  limit 1;
$$;

revoke all on function public.current_student_identity() from public;
grant execute on function public.current_student_identity() to authenticated;

create or replace function public.save_my_science_online_attempt(
  p_exam_id text,
  p_attempt jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student_number integer;
  v_payload jsonb;
  v_exam_index integer;
  v_exam jsonb;
  v_old_attempt jsonb;
  v_finished_before boolean;
begin
  select student_id, student_number into v_student_id, v_student_number
  from public.current_student_identity();

  if v_student_id is null then
    raise exception 'Öğrenci hesabı bulunamadı.';
  end if;

  select payload into v_payload
  from public.shared_app_state
  where state_key = 'exams-v1'
  for update;

  if v_payload is null or jsonb_typeof(v_payload) <> 'array' then
    raise exception 'Online deneme verisi bulunamadı.';
  end if;

  select ordinality - 1, value into v_exam_index, v_exam
  from jsonb_array_elements(v_payload) with ordinality
  where value->>'id' = p_exam_id
    and value->>'kind' = 'online'
  limit 1;

  if v_exam_index is null then
    raise exception 'Online deneme bulunamadı.';
  end if;

  v_old_attempt := coalesce(v_exam->'attempts'->(v_student_id::text), '{}'::jsonb);
  v_finished_before := coalesce((v_old_attempt->>'finishedAt') <> '', false)
                    or coalesce((v_old_attempt->>'locked')::boolean, false);

  if v_finished_before then
    raise exception 'Bu deneme daha önce kaydedilmiş ve kilitlenmiştir.';
  end if;

  -- Kimlik alanı istemciden alınmaz. Öğrenci yalnızca kendi anahtarına yazabilir.
  p_attempt := coalesce(p_attempt, '{}'::jsonb)
    || jsonb_build_object('studentId', v_student_id::text, 'studentNumber', v_student_number);

  v_exam := jsonb_set(
    v_exam,
    array['attempts', v_student_id::text],
    p_attempt,
    true
  );
  v_payload := jsonb_set(v_payload, array[v_exam_index::text], v_exam, false);

  update public.shared_app_state
  set payload = v_payload,
      updated_by = auth.uid(),
      updated_at = now()
  where state_key = 'exams-v1';

  return v_exam;
end;
$$;

revoke all on function public.save_my_science_online_attempt(text, jsonb) from public;
grant execute on function public.save_my_science_online_attempt(text, jsonb) to authenticated;

create or replace function public.save_my_lgs_online_attempt(
  p_exam_id text,
  p_participant jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student_number integer;
  v_payload jsonb;
  v_exam_index integer;
  v_exam jsonb;
  v_participants jsonb;
  v_old_participant jsonb;
  v_finished_before boolean;
begin
  select student_id, student_number into v_student_id, v_student_number
  from public.current_student_identity();

  if v_student_id is null then
    raise exception 'Öğrenci hesabı bulunamadı.';
  end if;

  select payload into v_payload
  from public.shared_app_state
  where state_key = 'lgs-online-exams-v1'
  for update;

  if v_payload is null or jsonb_typeof(v_payload) <> 'array' then
    raise exception 'LGS online deneme verisi bulunamadı. Öğretmen panelini bir kez açıp denemeyi kaydedin.';
  end if;

  select ordinality - 1, value into v_exam_index, v_exam
  from jsonb_array_elements(v_payload) with ordinality
  where value->>'id' = p_exam_id
  limit 1;

  if v_exam_index is null then
    raise exception 'LGS online deneme bulunamadı.';
  end if;

  v_participants := coalesce(v_exam->'participants', '[]'::jsonb);
  select value into v_old_participant
  from jsonb_array_elements(v_participants)
  where value->>'studentId' = v_student_id::text
     or value->>'studentNumber' = v_student_number::text
  limit 1;

  v_finished_before := coalesce((v_old_participant->>'finishedAt') <> '', false)
                    or coalesce((v_old_participant->>'locked')::boolean, false);

  if v_finished_before then
    raise exception 'Bu deneme daha önce kaydedilmiş ve kilitlenmiştir.';
  end if;

  p_participant := coalesce(p_participant, '{}'::jsonb)
    || jsonb_build_object('studentId', v_student_id::text, 'studentNumber', v_student_number);

  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_participants
  from jsonb_array_elements(v_participants)
  where not (
    value->>'studentId' = v_student_id::text
    or value->>'studentNumber' = v_student_number::text
  );
  v_participants := v_participants || jsonb_build_array(p_participant);

  v_exam := jsonb_set(v_exam, '{participants}', v_participants, true);
  v_payload := jsonb_set(v_payload, array[v_exam_index::text], v_exam, false);

  update public.shared_app_state
  set payload = v_payload,
      updated_by = auth.uid(),
      updated_at = now()
  where state_key = 'lgs-online-exams-v1';

  return v_exam;
end;
$$;

revoke all on function public.save_my_lgs_online_attempt(text, jsonb) from public;
grant execute on function public.save_my_lgs_online_attempt(text, jsonb) to authenticated;
