import { useEffect, useState } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
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
  const [installAvailable, setInstallAvailable] = useState(() => Boolean(window.__taskinDeferredInstallPrompt))
  const [installHelpOpen, setInstallHelpOpen] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installMessage, setInstallMessage] = useState('')
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

  useEffect(() => {
    const available = () => setInstallAvailable(Boolean(window.__taskinDeferredInstallPrompt))
    const didInstall = () => {
      setInstalled(true)
      setInstalling(false)
      setInstallAvailable(false)
      setInstallMessage('TAŞKIN telefona başarıyla yüklendi.')
    }
    window.addEventListener('taskin-install-available', available)
    window.addEventListener('taskin-app-installed', didInstall)
    return () => {
      window.removeEventListener('taskin-install-available', available)
      window.removeEventListener('taskin-app-installed', didInstall)
    }
  }, [])

  async function installApp() {
    const promptEvent = window.__taskinDeferredInstallPrompt
    if (promptEvent) {
      try {
        setInstallMessage('')
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice

        // ÖNEMLİ: userChoice=accepted yalnızca kullanıcının “Yükle”ye bastığını
        // söyler; kurulumun gerçekten tamamlandığını söylemez. Gerçek kurulum
        // yalnızca `appinstalled` olayı geldiğinde onaylanır.
        if (choice?.outcome === 'accepted') {
          setInstalling(true)
          setInstallMessage('Kurulum başlatıldı. TAŞKIN ana ekrana ekleniyor…')

          window.setTimeout(() => {
            const reallyInstalled =
              window.matchMedia?.('(display-mode: standalone)').matches ||
              window.navigator.standalone === true

            if (!reallyInstalled) {
              setInstalling(false)
              setInstallMessage('Kurulum tamamlanamadı. Aşağıdaki adımlarla ana ekrana ekleyebilirsin.')
              setInstallHelpOpen(true)
            }
          }, 10000)
        } else {
          setInstalling(false)
          setInstallMessage('Kurulum iptal edildi.')
        }

        // beforeinstallprompt tek kullanımlıktır. Yeni olay gelirse main.jsx
        // tekrar window.__taskinDeferredInstallPrompt değerini doldurur.
        window.__taskinDeferredInstallPrompt = null
        setInstallAvailable(false)
        return
      } catch {
        setInstalling(false)
        setInstallMessage('Otomatik kurulum açılamadı. Aşağıdaki adımları kullanabilirsin.')
      }
    }
    setInstallHelpOpen(true)
  }

  const ua = navigator.userAgent || ''
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  const isAndroid = /android/i.test(ua)
  const isSamsungBrowser = /samsungbrowser/i.test(ua)
  const isEdgeAndroid = /edga/i.test(ua)
  const isOperaAndroid = /opr\//i.test(ua)
  const isMiuiBrowser = /miuibrowser/i.test(ua)
  const isHuaweiBrowser = /huaweibrowser/i.test(ua)
  const isChromeAndroid = isAndroid && /chrome\//i.test(ua) && !isSamsungBrowser && !isEdgeAndroid && !isOperaAndroid && !isMiuiBrowser && !isHuaweiBrowser
  const isInAppBrowser = /(wv\)|; wv|whatsapp|instagram|fban|fbav|messenger)/i.test(ua)

  function openInChrome() {
    const current = new URL(window.location.href)
    const cleanPath = `${current.host}${current.pathname}${current.search}${current.hash}`
    const intentUrl = `intent://${cleanPath}#Intent;scheme=${current.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(current.href)};end`

    // Android'de Chrome yüklüyse doğrudan Chrome'a geçmeyi dener.
    // Chrome yoksa intent içindeki fallback mevcut bağlantıya geri döner.
    window.location.href = intentUrl
  }

  async function copyAppLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setInstallMessage('TAŞKIN bağlantısı kopyalandı. Chrome’u açıp adres çubuğuna yapıştırabilirsin.')
    } catch {
      setInstallMessage(`Bağlantı: ${window.location.href}`)
    }
  }

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
            {!installed && (
              <Button
                type="button"
                variant="outlined"
                size="large"
                onClick={installApp}
                className="pwa-install-button"
                disabled={installing}
              >
                {installing ? '⏳ TAŞKIN Yükleniyor…' : "📱 TAŞKIN'ı Telefona Yükle"}
              </Button>
            )}
            {installMessage && (
              <Alert severity={installed ? 'success' : installing ? 'info' : 'warning'} sx={{ textAlign: 'left' }}>
                {installMessage}
              </Alert>
            )}
          </Stack>
        </Box>

        <Dialog open={installHelpOpen} onClose={() => setInstallHelpOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>TAŞKIN'ı ana ekrana ekle</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: .5 }}>
              {isIOS ? (
                <>
                  <Typography><b>iPhone / iPad:</b></Typography>
                  <Typography>1. Bu bağlantıyı <b>Safari</b> ile aç.</Typography>
                  <Typography>2. <b>Paylaş</b> simgesine dokun.</Typography>
                  <Typography>3. <b>Ana Ekrana Ekle → Ekle</b> seç.</Typography>
                </>
              ) : isSamsungBrowser ? (
                <>
                  <Typography><b>Samsung Internet:</b></Typography>
                  <Typography><b>☰ Menü → Sayfa ekle → Ana ekran</b> adımlarını kullan.</Typography>
                  <Divider />
                  <Typography variant="body2" color="text.secondary">Bu seçenek görünmüyorsa aşağıdaki <b>Chrome'da Aç</b> düğmesini kullan.</Typography>
                </>
              ) : isChromeAndroid ? (
                <>
                  <Typography><b>Google Chrome:</b></Typography>
                  <Typography>Sağ üst <b>⋮ → Ana ekrana ekle</b> veya <b>Uygulamayı yükle → Yükle</b>.</Typography>
                  <Typography variant="body2" color="text.secondary">Chrome bazı telefonlarda “Ana ekrana ekle” yerine “Uygulamayı yükle” yazar.</Typography>
                </>
              ) : isAndroid ? (
                <>
                  <Alert severity="info">Bu tarayıcı TAŞKIN'ı doğrudan ana ekrana ekleme seçeneğini göstermeyebilir.</Alert>
                  <Typography><b>En kolay yöntem:</b> bağlantıyı Google Chrome'da açıp <b>⋮ → Ana ekrana ekle / Uygulamayı yükle</b> seç.</Typography>
                  {isInAppBrowser && <Typography variant="body2"><b>Not:</b> Bağlantı WhatsApp/Instagram gibi bir uygulamanın içinde açılmış görünüyor.</Typography>}
                </>
              ) : (
                <Typography>Tarayıcı menüsünden <b>Uygulamayı yükle</b> veya <b>Ana ekrana ekle</b> seçeneğini kullan.</Typography>
              )}

              {isAndroid && !isChromeAndroid && (
                <Button variant="contained" onClick={openInChrome} fullWidth>
                  🌐 Chrome'da Aç
                </Button>
              )}

              {(isAndroid && !isChromeAndroid) && (
                <Button variant="outlined" onClick={copyAppLink} fullWidth>
                  🔗 Bağlantıyı Kopyala
                </Button>
              )}

              {isAndroid && (
                <Typography variant="caption" color="text.secondary">
                  Simge eklenmiyorsa telefonda <b>Ana ekran düzeni kilitli</b> ayarını kapat. Kurulum tamamlandığında TAŞKIN yeni logosuyla ana ekranda görünür.
                </Typography>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setInstallHelpOpen(false)}>Kapat</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  )
}
