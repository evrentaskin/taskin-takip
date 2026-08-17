import { supabase } from './supabase'

export async function readSharedState(key, fallback = []) {
  const { data, error } = await supabase
    .from('shared_app_state')
    .select('payload,updated_at')
    .eq('state_key', key)
    .maybeSingle()
  if (error) throw error
  return { payload: data?.payload ?? fallback, updatedAt: data?.updated_at ?? null }
}

export async function writeSharedState(key, payload) {
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) throw new Error('Oturum bulunamadı.')

  // Öğretmen ekranındaki eski exams-v1 kopyası, öğrencilerin RPC ile yaptığı
  // yeni online kayıtları ezmesin. Sunucu en güncel attempts alanlarını korur.
  if (key === 'exams-v1') {
    const { data, error } = await supabase.rpc('write_teacher_exams_state', {
      p_payload: payload
    })
    if (error) throw error
    return data
  }

  const { error } = await supabase.from('shared_app_state').upsert({
    state_key: key,
    payload,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  }, { onConflict: 'state_key' })
  if (error) throw error
}
