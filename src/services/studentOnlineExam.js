import { supabase } from './supabase'

const MOBILE_RPC_TIMEOUT_MS = 20000
const MAX_ATTEMPTS = 3

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function ensureActiveSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (data?.session?.access_token) return data.session

  const refreshed = await supabase.auth.refreshSession()
  if (refreshed.error) throw refreshed.error
  if (!refreshed.data?.session?.access_token) {
    throw new Error('Oturum doğrulanamadı. Çıkış yapıp tekrar giriş yapın.')
  }
  return refreshed.data.session
}

async function rpcWithTimeout(name, params) {
  let timeoutId
  try {
    return await Promise.race([
      supabase.rpc(name, params),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Kayıt isteği zaman aşımına uğradı.')), MOBILE_RPC_TIMEOUT_MS)
      })
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function saveWithRetry(name, params) {
  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await ensureActiveSession()
      const { data, error } = await rpcWithTimeout(name, params)
      if (error) throw error
      return data
    } catch (error) {
      lastError = error
      if (attempt < MAX_ATTEMPTS) {
        try { await supabase.auth.refreshSession() } catch {}
        await wait(700 * attempt)
      }
    }
  }
  throw lastError || new Error('Bulut kaydı başarısız oldu.')
}

export async function saveMyScienceOnlineAttempt(examId, attempt) {
  return saveWithRetry('save_my_science_online_attempt', {
    p_exam_id: String(examId),
    p_attempt: attempt
  })
}

export async function saveMyLgsOnlineAttempt(examId, participant) {
  return saveWithRetry('save_my_lgs_online_attempt', {
    p_exam_id: String(examId),
    p_participant: participant
  })
}
