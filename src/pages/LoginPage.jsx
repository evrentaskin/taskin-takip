import { useState } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material'
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
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')

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
        <img className="login-brand-logo" src="/taskin-takip-sistemi-logo.png" alt="Taşkın Takip Sistemi logosu" />
        <Typography variant="h4" fontWeight={950}>TAŞKIN</Typography>
        <Typography fontWeight={800} color="success.main">TAKİP SİSTEMİ</Typography>
        <Typography color="text.secondary" sx={{ mb: 3, mt: .5 }}>Öğrenciyi takip et • Gelişimi görünür kıl</Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={submit}>
          <Stack spacing={2}>
            <TextField
              label="Kullanıcı adı veya e-posta"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />
            <TextField
              label="Şifre"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
