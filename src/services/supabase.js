import { createClient } from '@supabase/supabase-js'

const REMEMBER_KEY = 'taskin_remember_me'

const authStorage = {
  getItem(key) {
    const remember = localStorage.getItem(REMEMBER_KEY) !== 'false'
    const primary = remember ? localStorage : sessionStorage
    const secondary = remember ? sessionStorage : localStorage
    return primary.getItem(key) ?? secondary.getItem(key)
  },
  setItem(key, value) {
    const remember = localStorage.getItem(REMEMBER_KEY) !== 'false'
    const primary = remember ? localStorage : sessionStorage
    const secondary = remember ? sessionStorage : localStorage
    primary.setItem(key, value)
    secondary.removeItem(key)
  },
  removeItem(key) {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  }
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: authStorage
    }
  }
)
