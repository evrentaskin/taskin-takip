import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography
} from '@mui/material'
import { CalendarMonth, DeleteOutline, Download, LockReset, Person, Save, School, UploadFile } from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { isValidUsername, toAuthSafeUsername, USERNAME_HELP } from '../utils/username'
import { useSharedCloudState } from '../services/useSharedCloudState'
import { parseYearlyPlanWorkbook, YEARLY_PLAN_GRADES, YEARLY_PLAN_LOCAL_KEY, YEARLY_PLAN_STATE_KEY } from '../utils/yearlyPlan'
import StudentInformationCardsSettings from '../components/StudentInformationCardsSettings'
import StudentProfileTagsSettings from '../components/StudentProfileTagsSettings'

export default function SettingsPage() {
  const [profile, setProfile] = useState({ full_name: '', username: '' })
  const [classes, setClasses] = useState([])
  const [activeClassIds, setActiveClassIds] = useState([])
  const [term, setTerm] = useState({ term_name: '', start_date: '', end_date: '' })
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [newTermOpen, setNewTermOpen] = useState(false)
  const [newTerm, setNewTerm] = useState({ term_name: '', start_date: '', end_date: '' })
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordAgain, setNewPasswordAgain] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [yearlyPlans, setYearlyPlans, plansReady] = useSharedCloudState({
    stateKey: YEARLY_PLAN_STATE_KEY,
    localKey: YEARLY_PLAN_LOCAL_KEY,
    fallback: {},
    onError: err => setError(err?.message || 'Yıllık planlar yüklenemedi.')
  })
  const [planBusyGrade, setPlanBusyGrade] = useState('')

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    setLoading(true)
    setError('')
    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) throw new Error('Oturum bulunamadı.')

      const [profileResult, classesResult, activeClassesResult, termResult] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
        supabase.from('classes').select('id,name,sort_order,is_lgs').order('sort_order'),
        supabase.from('teacher_active_classes').select('class_id').eq('teacher_id', user.id),
        supabase.from('academic_terms')
          .select('id,term_name,start_date,end_date')
          .eq('teacher_id', user.id)
          .eq('is_active', true)
          .maybeSingle()
      ])

      if (profileResult.error) throw profileResult.error
      if (classesResult.error) throw classesResult.error
      if (activeClassesResult.error) throw activeClassesResult.error
      if (termResult.error) throw termResult.error

      setProfile({
        full_name: profileResult.data?.full_name || '',
        username: user.email?.split('@')[0] || ''
      })
      setClasses(classesResult.data ?? [])
      setActiveClassIds((activeClassesResult.data ?? []).map(item => item.class_id))
      setTerm({
        term_name: termResult.data?.term_name || '',
        start_date: termResult.data?.start_date || '',
        end_date: termResult.data?.end_date || ''
      })
    } catch (err) {
      setError(err?.message || 'Ayarlar yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }

  function toggleClass(classId) {
    setActiveClassIds(current =>
      current.includes(classId)
        ? current.filter(id => id !== classId)
        : [...current, classId]
    )
  }

  async function invokeAccount(body) {
    const { data, error } = await supabase.functions.invoke('student-account', { body })
    if (error) throw new Error(error.message)
    if (!data?.ok) throw new Error(data?.error || 'İşlem başarısız.')
    return data
  }

  async function saveAccount() {
    const username = toAuthSafeUsername(profile.username)
    if (!isValidUsername(username)) return setError(`Kullanıcı adı geçersiz. ${USERNAME_HELP}`)
    if (accountPassword && accountPassword.length < 6) return setError('Yeni şifre en az 6 karakter olmalı.')
    setSaving(true)
    setError('')
    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) throw new Error('Oturum bulunamadı.')

      const { error } = await supabase
        .from('profiles')
        .update({ full_name: profile.full_name.trim() })
        .eq('id', user.id)
      if (error) throw error

      await invokeAccount({ action: 'change_teacher_credentials', username, password: accountPassword || undefined })
      setAccountPassword('')
      setProfile(current => ({ ...current, username }))
      setMessage('Öğretmen kullanıcı adı ve hesap bilgileri kaydedildi. Yeni kullanıcı adı bir sonraki girişte kullanılacaktır.')
    } catch (err) {
      setError(err?.message || 'Hesap bilgileri kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  async function saveActiveClasses() {
    setSaving(true)
    setError('')
    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) throw new Error('Oturum bulunamadı.')

      const { error: deleteError } = await supabase
        .from('teacher_active_classes')
        .delete()
        .eq('teacher_id', user.id)

      if (deleteError) throw deleteError

      if (activeClassIds.length) {
        const { error: insertError } = await supabase
          .from('teacher_active_classes')
          .insert(activeClassIds.map(classId => ({ teacher_id: user.id, class_id: classId })))
        if (insertError) throw insertError
      }

      setMessage('Aktif sınıflar kaydedildi.')
    } catch (err) {
      setError(err?.message || 'Aktif sınıflar kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }


  async function saveTerm() {
    if (!term.term_name.trim()) return setError('Dönem adı zorunlu.')
    if (!term.start_date || !term.end_date) return setError('Başlangıç ve bitiş tarihleri zorunlu.')
    if (term.start_date > term.end_date) return setError('Bitiş tarihi başlangıç tarihinden önce olamaz.')

    setSaving(true)
    setError('')
    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) throw new Error('Oturum bulunamadı.')

      const { data: current, error: currentError } = await supabase
        .from('academic_terms')
        .select('id')
        .eq('teacher_id', user.id)
        .eq('is_active', true)
        .maybeSingle()

      if (currentError) throw currentError

      if (current?.id) {
        const { error } = await supabase
          .from('academic_terms')
          .update({
            term_name: term.term_name.trim(),
            start_date: term.start_date,
            end_date: term.end_date
          })
          .eq('id', current.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('academic_terms').insert({
          teacher_id: user.id,
          term_name: term.term_name.trim(),
          start_date: term.start_date,
          end_date: term.end_date,
          is_active: true
        })
        if (error) throw error
      }

      setMessage('Aktif dönem bilgileri kaydedildi.')
    } catch (err) {
      setError(err?.message || 'Dönem kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  async function startNewTerm() {
    if (!newTerm.term_name.trim()) return setError('Yeni dönem adı zorunlu.')
    if (!newTerm.start_date || !newTerm.end_date) return setError('Yeni dönem tarihleri zorunlu.')
    if (newTerm.start_date > newTerm.end_date) return setError('Bitiş tarihi başlangıç tarihinden önce olamaz.')

    setSaving(true)
    setError('')
    try {
      const { data, error } = await supabase.rpc('start_new_academic_term', {
        p_term_name: newTerm.term_name.trim(),
        p_start_date: newTerm.start_date,
        p_end_date: newTerm.end_date
      })

      if (error) throw error

      setNewTermOpen(false)
      setNewTerm({ term_name: '', start_date: '', end_date: '' })
      setMessage(
        'Yeni dönem başlatıldı. LGS Grubu etkilenmedi; normal sınıflarda öğrenci listeleri korundu ve dönemlik veriler yeni dönemde boş başladı.'
      )
      await loadSettings()
    } catch (err) {
      setError(err?.message || 'Yeni dönem başlatılamadı.')
    } finally {
      setSaving(false)
    }
  }


  async function uploadYearlyPlan(grade, file) {
    if (!file) return
    setError('')
    setMessage('')
    setPlanBusyGrade(grade)
    try {
      const entries = await parseYearlyPlanWorkbook(file, grade)
      setYearlyPlans(current => ({ ...(current || {}), [grade]: entries }))
      setMessage(`${grade}. sınıf yıllık planı yüklendi. ${entries.length} kazanım satırı kaydedildi.`)
    } catch (err) {
      setError(err?.message || 'Excel dosyası okunamadı.')
    } finally {
      setPlanBusyGrade('')
    }
  }

  function deleteYearlyPlan(grade) {
    if (!window.confirm(`${grade}. sınıf yıllık planını silmek istediğine emin misin?`)) return
    setYearlyPlans(current => {
      const next = { ...(current || {}) }
      delete next[grade]
      return next
    })
    setMessage(`${grade}. sınıf yıllık planı silindi.`)
  }

  async function changePassword() {
    if (newPassword.length < 6) return setError('Şifre en az 6 karakter olmalı.')
    if (newPassword !== newPasswordAgain) return setError('Şifreler aynı değil.')

    setSaving(true)
    setError('')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordOpen(false)
      setNewPassword('')
      setNewPasswordAgain('')
      setMessage('Şifre başarıyla değiştirildi.')
    } catch (err) {
      setError(err?.message || 'Şifre değiştirilemedi.')
    } finally {
      setSaving(false)
    }
  }

  const activeClassNames = useMemo(
    () => classes.filter(item => activeClassIds.includes(item.id)).map(item => item.name),
    [classes, activeClassIds]
  )

  if (loading) return <Box className="loader compact"><CircularProgress /></Box>

  return (
    <Box>
      <Box className="page-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>Ayarlar</Typography>
          <Typography color="text.secondary">Hesap, aktif sınıflar ve dönem ayarları</Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage('')} sx={{ mb: 2 }}>{message}</Alert>}

      <Box className="settings-grid">
        <Box className="glass settings-card">
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Person color="primary" />
            <Typography variant="h6" fontWeight={900}>Hesabım</Typography>
          </Stack>
          <Stack spacing={2}>
            <TextField label="Ad Soyad" value={profile.full_name}
              onChange={event => setProfile(current => ({ ...current, full_name: event.target.value }))} />
            <TextField label="Kullanıcı Adı" value={profile.username}
              onChange={event => setProfile(current => ({ ...current, username: event.target.value.replace(/\s/g, '').toLowerCase() }))}
              helperText="Kullanıcı adını yalnızca öğretmen hesabından değiştirebilirsin." />
            <TextField label="Yeni Şifre (isteğe bağlı)" type="password" value={accountPassword}
              onChange={event => setAccountPassword(event.target.value)} helperText="Boş bırakırsan mevcut şifre değişmez. En az 6 karakter." />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" startIcon={<Save />} onClick={saveAccount}
                disabled={saving || !profile.full_name.trim()}>
                Bilgileri Kaydet
              </Button>
              <Button variant="outlined" startIcon={<LockReset />} onClick={() => setPasswordOpen(true)}>
                Şifre Değiştir
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Box className="glass settings-card">
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <School color="primary" />
            <Typography variant="h6" fontWeight={900}>Aktif Sınıflar</Typography>
          </Stack>
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            Ana sayfada ve sınıf filtrelerinde gösterilecek sınıfları seçin.
          </Typography>
          <Box className="class-check-grid">
            {classes.map(item => (
              <FormControlLabel key={item.id}
                control={<Checkbox checked={activeClassIds.includes(item.id)}
                  onChange={() => toggleClass(item.id)} />}
                label={item.name}
              />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary">
            Seçili: {activeClassNames.length ? activeClassNames.join(', ') : 'Yok'}
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" startIcon={<Save />} onClick={saveActiveClasses} disabled={saving}>
              Aktif Sınıfları Kaydet
            </Button>
          </Box>
        </Box>
      </Box>

      <Box className="glass settings-card settings-term-card">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <CalendarMonth color="primary" />
          <Typography variant="h6" fontWeight={900}>Aktif Dönem</Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Dönem tarihleri rapor, puan ve filtreleme işlemlerinde kullanılacak.
        </Typography>
        <Box className="term-grid">
          <TextField label="Dönem Adı" placeholder="2026-2027 1. Dönem" value={term.term_name}
            onChange={event => setTerm(current => ({ ...current, term_name: event.target.value }))} />
          <TextField label="Başlama Tarihi" type="date" value={term.start_date}
            onChange={event => setTerm(current => ({ ...current, start_date: event.target.value }))}
            InputLabelProps={{ shrink: true }} />
          <TextField label="Bitiş Tarihi" type="date" value={term.end_date}
            onChange={event => setTerm(current => ({ ...current, end_date: event.target.value }))}
            InputLabelProps={{ shrink: true }} />
        </Box>
        <Alert severity="info" sx={{ mt: 2 }}>
          “Aktif Dönemi Kaydet” yalnızca mevcut dönemin adını ve tarihlerini günceller.
          “Yeni Dönemi Başlat” ise mevcut dönemi arşivler; LGS Grubuna dokunmaz.
          Normal sınıflarda öğrenci listeleri ve giriş hesapları korunur, dönemlik modüller yeni dönemde boş başlar.
        </Alert>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" startIcon={<Save />} onClick={saveTerm} disabled={saving}>
            Aktif Dönemi Kaydet
          </Button>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<CalendarMonth />}
            onClick={() => setNewTermOpen(true)}
            disabled={saving}
          >
            Yeni Dönemi Başlat
          </Button>
        </Stack>
      </Box>


      <StudentProfileTagsSettings
        onError={text => { setMessage(''); setError(text) }}
        onMessage={text => { setError(''); setMessage(text) }}
      />

      <StudentInformationCardsSettings
        onError={text => { setMessage(''); setError(text) }}
        onMessage={text => { setError(''); setMessage(text) }}
      />


      <Box className="glass settings-card settings-term-card">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <CalendarMonth color="primary" />
          <Typography variant="h6" fontWeight={900}>Yıllık Plan Yönetimi</Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Yalnızca dersine girdiğin sınıfların Fen Bilimleri yıllık planlarını yükle. Aynı sınıfa yeni Excel yüklediğinde eski plan güncellenir.
        </Typography>

        <Button
          component="a"
          href="/fen-yillik-plan-sablonu.xlsx"
          download="Fen_Yillik_Plan_Sablonu.xlsx"
          variant="outlined"
          startIcon={<Download />}
          sx={{ mb: 2 }}
        >
          Excel Şablonunu İndir
        </Button>

        <Box className="yearly-plan-upload-grid">
          {YEARLY_PLAN_GRADES.map(grade => {
            const count = Array.isArray(yearlyPlans?.[grade]) ? yearlyPlans[grade].length : 0
            return (
              <Box key={grade} className="yearly-plan-upload-row">
                <Box sx={{ minWidth: 100 }}>
                  <Typography fontWeight={900}>{grade}. Sınıf</Typography>
                  <Typography variant="caption" color={count ? 'success.main' : 'text.secondary'}>
                    {count ? `${count} kazanım yüklü` : 'Plan yüklenmemiş'}
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flex: 1, justifyContent: 'flex-end' }}>
                  <Button
                    component="label"
                    variant={count ? 'outlined' : 'contained'}
                    startIcon={planBusyGrade === grade ? <CircularProgress size={16} /> : <UploadFile />}
                    disabled={!plansReady || Boolean(planBusyGrade)}
                  >
                    {count ? 'Excel’i Güncelle' : 'Excel Yükle'}
                    <input
                      hidden
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={event => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        uploadYearlyPlan(grade, file)
                      }}
                    />
                  </Button>
                  {count > 0 && (
                    <Button color="error" variant="text" startIcon={<DeleteOutline />} onClick={() => deleteYearlyPlan(grade)}>
                      Sil
                    </Button>
                  )}
                </Stack>
              </Box>
            )
          })}
        </Box>
        <Alert severity="info" sx={{ mt: 2 }}>
          Excel sütunları: <b>Hafta Başlangıç</b>, <b>Hafta Bitiş</b>, <b>Ünite</b> ve <b>Kazanım</b>. Aynı haftada birden fazla kazanım varsa ayrı satırlara yazabilirsin.
        </Alert>
      </Box>


      <Dialog open={newTermOpen} onClose={() => !saving && setNewTermOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={900}>Yeni Dönemi Başlat</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="warning">
              Bu işlem mevcut dönemi arşivler. LGS Grubu etkilenmez.
              Diğer sınıflarda öğrenci listeleri ve öğrenci giriş hesapları korunur;
              ödev, deneme, artı, sınav notu, yorum, duyuru ve rapor gibi dönemlik veriler
              yeni dönemde sıfırdan başlar. Eski dönem verileri silinmez.
            </Alert>
            <TextField
              label="Yeni Dönem Adı"
              placeholder="2026-2027 2. Dönem"
              value={newTerm.term_name}
              onChange={event => setNewTerm(current => ({ ...current, term_name: event.target.value }))}
            />
            <TextField
              label="Başlama Tarihi"
              type="date"
              value={newTerm.start_date}
              onChange={event => setNewTerm(current => ({ ...current, start_date: event.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Bitiş Tarihi"
              type="date"
              value={newTerm.end_date}
              onChange={event => setNewTerm(current => ({ ...current, end_date: event.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewTermOpen(false)} disabled={saving}>İptal</Button>
          <Button variant="contained" color="warning" onClick={startNewTerm} disabled={saving}>
            Onayla ve Yeni Dönemi Başlat
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={passwordOpen} onClose={() => !saving && setPasswordOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle fontWeight={900}>Şifre Değiştir</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Yeni Şifre" type="password" value={newPassword}
              autoComplete="new-password" onChange={event => setNewPassword(event.target.value)}
              helperText="En az 6 karakter" />
            <TextField label="Yeni Şifre Tekrar" type="password" value={newPasswordAgain}
              autoComplete="new-password" onChange={event => setNewPasswordAgain(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordOpen(false)} disabled={saving}>İptal</Button>
          <Button variant="contained" onClick={changePassword} disabled={saving}>Şifreyi Değiştir</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
