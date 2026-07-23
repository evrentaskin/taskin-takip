import { useState } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import { supabase } from '../services/supabase'

const USER_DOMAIN = 'taskin.local'

function detectDeviceType() {
  const ua = navigator.userAgent || ''
  if (/tablet|ipad/i.test(ua)) return 'tablet'
  if (/mobile|android|iphone|ipod/i.test(ua)) return 'telefon'
  return 'bilgisayar'
}

async function recordSuccessfulLogin(userId) {
  if (!userId) return
  try {
    await supabase.from('student_login_events').insert({
      user_id: userId,
      device_type: detectDeviceType(),
      user_agent: (navigator.userAgent || '').slice(0, 500)
    })
  } catch {
    // Giriş kaydı tablosu henüz kurulmamış olsa bile oturum açmayı engelleme.
  }
}

export default function LoginPage() {
  const [login, setLogin] = useState(() => localStorage.getItem('taskin_remembered_login') || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('taskin_remember_me') !== 'false')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')

    localStorage.setItem('taskin_remember_me', String(rememberMe))
    if (rememberMe) localStorage.setItem('taskin_remembered_login', login.trim())
    else localStorage.removeItem('taskin_remembered_login')

    const trimmed = login.trim().toLowerCase()
    const email = trimmed.includes('@') ? trimmed : `${trimmed}@${USER_DOMAIN}`

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Kullanıcı adı/e-posta veya şifre hatalı.')
    else await recordSuccessfulLogin(data?.user?.id)
    setBusy(false)
  }

  return (
    <Box className="login-page">
      <Box className="login-card">
        <img className="login-brand-logo" src="/taskin-logo-full.png" alt="TAŞKIN logosu" />
        <Typography color="text.secondary" sx={{ mb: 3, mt: .5 }}>Eğitim yönetimi ve öğrenci gelişimi</Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={submit} autoComplete="off">
          <Stack spacing={2}>
            <TextField
              label="Kullanıcı adı veya e-posta"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
              autoComplete="off"
              inputProps={{ autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false, 'data-form-type': 'other' }}
            />
            <TextField
              label="Şifre"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              inputProps={{ autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false, 'data-form-type': 'other' }}
            />
            <FormControlLabel
              control={<Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />}
              label="Beni hatırla"
              sx={{ alignSelf: 'flex-start', my: -0.5 }}
            />
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {busy ? <CircularProgress size={24} /> : 'Giriş Yap'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
