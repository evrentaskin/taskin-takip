import { supabase } from './supabase'

export async function saveMyScienceOnlineAttempt(examId, attempt) {
  const { data, error } = await supabase.rpc('save_my_science_online_attempt', {
    p_exam_id: String(examId),
    p_attempt: attempt
  })
  if (error) throw error
  return Array.isArray(data) ? data : (data || [])
}

export async function saveMyLgsOnlineAttempt(examId, participant) {
  const { data, error } = await supabase.rpc('save_my_lgs_online_attempt', {
    p_exam_id: String(examId),
    p_participant: participant
  })
  if (error) throw error
  return Array.isArray(data) ? data : (data || [])
}
