import { supabase } from './supabase'

const ACTIVITY_THROTTLE_MS = 2 * 60 * 1000

function detectDeviceType() {
  const ua = navigator.userAgent || ''
  if (/tablet|ipad/i.test(ua)) return 'tablet'
  if (/mobile|android|iphone|ipod/i.test(ua)) return 'telefon'
  return 'bilgisayar'
}

function throttleKey(userId) {
  return `taskin-student-last-active-${userId}`
}

/**
 * Öğrencinin uygulamada gerçekten aktif olduğunu kaydeder.
 * Yeni student_activity_events tablosu kurulmamışsa eski login tablosuna
 * güvenli bir geri dönüş yapar; böylece sürüm yayınlanır yayınlanmaz çalışır.
 */
export async function recordStudentActivity(activityType = 'app_active', { force = false } = {}) {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data?.session?.user?.id) return false

    const userId = data.session.user.id
    const now = Date.now()
    const key = throttleKey(userId)
    const previous = Number(localStorage.getItem(key) || 0)
    if (!force && previous && now - previous < ACTIVITY_THROTTLE_MS) return true

    const payload = {
      user_id: userId,
      activity_type: String(activityType || 'app_active').slice(0, 60),
      device_type: detectDeviceType(),
      user_agent: (navigator.userAgent || '').slice(0, 500)
    }

    const activityResult = await supabase.from('student_activity_events').insert(payload)
    if (!activityResult.error) {
      localStorage.setItem(key, String(now))
      return true
    }

    // Migration henüz çalıştırılmadıysa eski tabloyu aktiflik olayı için kullan.
    const loginFallback = await supabase.from('student_login_events').insert({
      user_id: userId,
      device_type: payload.device_type,
      user_agent: payload.user_agent
    })
    if (!loginFallback.error) {
      localStorage.setItem(key, String(now))
      return true
    }
  } catch {
    // Aktiflik kaydı hiçbir zaman öğrenci panelini engellememeli.
  }
  return false
}
