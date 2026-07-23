import { useMemo, useState } from 'react'
import {
  Alert, AppBar, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, Paper, Stack, Tab, Tabs, TextField,
  Toolbar, Tooltip, Typography
} from '@mui/material'
import {
  Assignment, BarChart, CalendarMonth, LockReset, Logout, PictureAsPdf, Quiz,
  School, Settings
} from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { useSharedCloudState } from '../services/useSharedCloudState'

const STATE_KEY = 'private-lessons-v1'
const LOCAL_KEY = 'taskin-private-lessons-v1'
const POOL_STATE_KEY = 'private-science-exam-pool-v1'
const POOL_LOCAL_KEY = 'taskin-private-science-exam-pool-v1'
const ANSWERS = ['A', 'B', 'C', 'D']
const fmt = v => v ? new Date(v).toLocaleString('tr-TR') : '—'
const netOf = (d, y) => Number(d || 0) - Number(y || 0) / 3
const homeworkStatuses = {
  pending: { label: 'Kontrol Edilmedi', color: 'default', bg: '#f1f5f9' },
  done: { label: 'Yaptı', color: 'success', bg: '#dcfce7' },
  partial: { label: 'Kısmen Yaptı', color: 'warning', bg: '#fef3c7' },
  not_done: { label: 'Yapmadı', color: 'error', bg: '#fee2e2' }
}

function Chart({ items }) {
  if (!items.length) return <Alert severity="info">Grafik için henüz sonuç yok.</Alert>
  const w = 760, h = 240, p = 42
  const vals = items.map(x => Number(x.net || 0))
  const min = Math.min(0, ...vals), max = Math.max(1, ...vals), range = Math.max(1, max - min)
  const pts = items.map((x, i) => ({
    x: items.length === 1 ? w / 2 : p + i * (w - p * 2) / (items.length - 1),
    y: h - p - (Number(x.net || 0) - min) * (h - p * 2) / range
  }))
  return <Box sx={{ overflowX: 'auto' }}>
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', minWidth: 560, display: 'block' }}>
      <polyline points={pts.map(x => `${x.x},${x.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="4" />
      {pts.map((x, i) => <g key={i}>
        <circle cx={x.x} cy={x.y} r="6" fill="currentColor" />
        <text x={x.x} y={x.y - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{Number(items[i].net).toFixed(2)}</text>
        <text x={x.x} y={h - 8} textAnchor="middle" fontSize="11" fill="currentColor">{i + 1}</text>
      </g>)}
    </svg>
  </Box>
}

function SummaryCard({ icon, label, value, tone }) {
  return <Paper className={`private-student-stat ${tone}`} elevation={0}>
    <Box className="private-student-stat-icon">{icon}</Box>
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography variant="h5" fontWeight={950}>{value}</Typography>
    </Box>
  </Paper>
}

export default function PrivateStudentHomePage({ session, profile }) {
  const [data, , ready, setCloudData] = useSharedCloudState({ stateKey: STATE_KEY, localKey: LOCAL_KEY, fallback: { students: [] }, readOnly: true })
  const [pool, , poolReady] = useSharedCloudState({ stateKey: POOL_STATE_KEY, localKey: POOL_LOCAL_KEY, fallback: { exams: [] }, readOnly: true })
  const [tab, setTab] = useState(0)
  const [solve, setSolve] = useState(null)
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [passwords, setPasswords] = useState({ next: '', again: '' })
  const [message, setMessage] = useState('')

  const username = (session?.user?.email || '').split('@')[0]
  const students = Array.isArray(data?.students) ? data.students : []
  const student = students.find(s => String(s.authUserId || s.auth_user_id || '') === session.user.id)
    || students.find(s => String(s.username || '').toLowerCase() === username.toLowerCase())
  const exams = Array.isArray(pool?.exams) ? pool.exams : []
  const assignments = student?.examAssignments || []
  const homeworks = student?.homeworks || []

  const results = useMemo(() => {
    if (!student) return []
    const online = assignments.filter(a => a.result).map(a => {
      const e = exams.find(x => x.id === a.examId)
      return { id: a.id, type: 'Online', name: e?.name || 'Deneme', date: a.finishedAt || a.endAt || a.createdAt, ...a.result, answers: a.answers, answerKey: e?.answers }
    })
    const school = (student.schoolExams || []).map(x => ({ ...x, type: 'Okul', net: Number(x.net ?? netOf(x.correct, x.wrong)) }))
    return [...online, ...school].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
  }, [student, assignments, exams])

  if (!ready || !poolReady) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
  if (!student) return <Box sx={{ p: 3 }}><Alert severity="error">Bu hesaba bağlı özel ders öğrencisi bulunamadı. Öğretmen panelinden öğrenciyi düzenleyip tekrar kaydedin.</Alert><Button sx={{ mt: 2 }} onClick={() => supabase.auth.signOut()}>Çıkış Yap</Button></Box>

  const now = Date.now()
  const active = assignments.filter(a => !a.archived && !a.result && new Date(a.startAt).getTime() <= now && new Date(a.endAt).getTime() >= now)
  const avg = results.length ? results.reduce((t, x) => t + Number(x.net || 0), 0) / results.length : 0
  const pendingHomework = homeworks.filter(h => (h.status || 'pending') === 'pending').length
  const initials = (student.fullName || profile?.full_name || username || 'Ö').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()

  async function submit() {
    const exam = exams.find(x => x.id === solve.examId)
    let correct = 0, wrong = 0, blank = 0
    for (let q = 1; q <= 20; q++) {
      const a = answers[q] || '', k = exam?.answers?.[q] || exam?.answers?.[String(q)] || ''
      if (!a) blank++
      else if (a === k) correct++
      else wrong++
    }
    const result = { correct, wrong, blank, net: netOf(correct, wrong) }
    setSaving(true)
    const { data: rpc, error } = await supabase.rpc('submit_private_exam_attempt', { p_assignment_id: solve.id, p_answers: answers, p_result: result })
    setSaving(false)
    if (error) return alert(error.message)
    if (rpc?.payload) setCloudData(rpc.payload)
    setSolve(null); setAnswers({}); setTab(3)
  }

  async function changePassword() {
    setMessage('')
    if (passwords.next.length < 6) return setMessage('Şifre en az 6 karakter olmalıdır.')
    if (passwords.next !== passwords.again) return setMessage('Yeni şifreler aynı değil.')
    const { error } = await supabase.auth.updateUser({ password: passwords.next })
    if (error) return setMessage(error.message)
    setPasswords({ next: '', again: '' })
    setMessage('Şifreniz değiştirildi.')
  }

  return <Box className="private-student-page">
    <AppBar position="sticky" elevation={0} className="private-student-appbar">
      <Toolbar className="private-student-toolbar">
        <Box className="private-student-brand">
          <img className="private-student-brand-wide" src="/taskin-logo-horizontal.png" alt="TAŞKIN logosu" />
          <Typography variant="caption">Özel Ders Öğrenci Paneli</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box className="private-student-user">
          <Avatar>{initials}</Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2" fontWeight={900} lineHeight={1.15}>{student.fullName || profile?.full_name}</Typography>
            <Typography variant="caption">Öğrenci</Typography>
          </Box>
          <Tooltip title="Ayarlar"><IconButton color="inherit" onClick={() => setSettingsOpen(true)}><Settings /></IconButton></Tooltip>
          <Tooltip title="Çıkış yap"><IconButton color="inherit" onClick={() => supabase.auth.signOut()}><Logout /></IconButton></Tooltip>
        </Box>
      </Toolbar>
    </AppBar>

    <Box className="private-student-container">
      <Paper className="private-student-hero" elevation={0}>
        <Box className="private-student-hero-copy">
          <Chip label="ÖZEL DERS PANELİ" size="small" className="private-student-hero-chip" />
          <Typography variant="h3" fontWeight={950}>Hoş geldin, {student.fullName?.split(' ')[0]} 👋</Typography>
          <Typography>Ödevlerini tamamla, online denemelerine katıl ve gelişimini tek ekrandan takip et.</Typography>
        </Box>
        <Box className="private-student-hero-logo"><img src="/taskin-logo-symbol.png" alt="TAŞKIN" /></Box>
      </Paper>

      <Box className="private-student-stats">
        <SummaryCard icon={<Assignment />} label="Toplam Ödev" value={homeworks.length} tone="green" />
        <SummaryCard icon={<CalendarMonth />} label="Bekleyen Ödev" value={pendingHomework} tone="orange" />
        <SummaryCard icon={<Quiz />} label="Aktif Deneme" value={active.length} tone="blue" />
        <SummaryCard icon={<BarChart />} label="Ortalama Net" value={avg.toFixed(2)} tone="purple" />
      </Box>

      <Box className="private-student-section-cards">
        <button type="button" className={`private-student-section-card ${tab === 0 ? 'active' : ''}`} onClick={() => setTab(0)}>
          <span className="private-student-section-icon homework"><Assignment /></span>
          <span><b>Ödevler</b><small>Verilen ödevleri görüntüle</small></span>
        </button>
        <button type="button" className={`private-student-section-card ${tab === 1 ? 'active' : ''}`} onClick={() => setTab(1)}>
          <span className="private-student-section-icon exam"><Quiz /></span>
          <span><b>Online Denemeler</b><small>Aktif denemelere katıl</small></span>
        </button>
        <button type="button" className={`private-student-section-card school ${tab === 2 ? 'active' : ''}`} onClick={() => setTab(2)}>
          <span className="private-student-section-icon school"><School /></span>
          <span><b>Okul Denemeleri</b><small>Okul sonuçlarını görüntüle</small></span>
        </button>
        <button type="button" className={`private-student-section-card analysis ${tab === 3 ? 'active' : ''}`} onClick={() => setTab(3)}>
          <span className="private-student-section-icon analysis"><BarChart /></span>
          <span><b>Deneme Analizi</b><small>Sonuçlarını ve gelişimini gör</small></span>
        </button>
      </Box>

      <Paper className="private-student-main-card" elevation={0}>
        <Box sx={{ p: { xs: 1.5, md: 3 } }}>
          {tab === 0 && (homeworks.length ? <Stack spacing={1.5}>{[...homeworks].sort((a,b)=>new Date(b.assignedDate||b.createdAt||0)-new Date(a.assignedDate||a.createdAt||0)).map(h => { const state = homeworkStatuses[h.status || 'pending'] || homeworkStatuses.pending; return <Paper key={h.id} variant="outlined" className="private-student-list-card" sx={{ bgcolor: state.bg }}><Box className="private-student-list-icon"><Assignment /></Box><Box sx={{ flex: 1 }}><Typography fontWeight={950}>{h.title || h.name}</Typography><Typography color="text.secondary" sx={{ my: .5 }}>{h.description || 'Açıklama yok.'}</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Chip size="small" label={h.assignedDate ? `Veriliş: ${new Date(`${h.assignedDate}T12:00:00`).toLocaleDateString('tr-TR')}` : 'Veriliş tarihi yok'} /><Chip size="small" label={h.dueDate ? `Son tarih: ${new Date(`${h.dueDate}T12:00:00`).toLocaleDateString('tr-TR')}` : 'Son tarih yok'} /><Chip size="small" color={state.color} label={state.label} /></Stack></Box></Paper> })}</Stack> : <Alert severity="info">Henüz verilmiş ödev bulunmuyor.</Alert>)}

          {tab === 1 && <Stack spacing={1.5}>{assignments.filter(a => !a.archived).length === 0 ? <Alert severity="info">Atanmış online deneme bulunmuyor.</Alert> : assignments.filter(a => !a.archived).map(a => {
            const e = exams.find(x => x.id === a.examId), isActive = active.some(x => x.id === a.id), before = Date.now() < new Date(a.startAt).getTime()
            return <Paper key={a.id} variant="outlined" className="private-student-list-card"><Box className="private-student-list-icon blue"><Quiz /></Box><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ flex: 1 }}><Box sx={{ flex: 1 }}><Typography fontWeight={950}>{e?.name || 'Deneme'}</Typography><Typography variant="body2" color="text.secondary">{fmt(a.startAt)} – {fmt(a.endAt)}</Typography></Box>{e?.attachment?.url && <Button startIcon={<PictureAsPdf />} href={e.attachment.url} target="_blank">Dosyayı Aç</Button>}{a.result ? <Chip color="success" label={`${Number(a.result.net).toFixed(2)} net`} /> : <Button variant="contained" disabled={!isActive} onClick={() => { setSolve(a); setAnswers(a.answers || {}) }}>{before ? 'Henüz Başlamadı' : isActive ? 'Denemeye Başla' : 'Süresi Bitti'}</Button>}</Stack></Paper>
          })}</Stack>}

          {tab === 2 && <Stack spacing={1.5}>{(student.schoolExams || []).length === 0 ? <Alert severity="info">Henüz okul denemesi sonucu bulunmuyor.</Alert> : [...(student.schoolExams || [])].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).map((x, i) => <Paper key={x.id || i} variant="outlined" className="private-student-list-card"><Box className="private-student-list-icon school"><School /></Box><Box sx={{ flex: 1 }}><Typography fontWeight={950}>{x.name || `Okul Denemesi ${i+1}`}</Typography><Typography variant="body2" color="text.secondary">{x.date ? new Date(`${x.date}T12:00:00`).toLocaleDateString('tr-TR') : 'Tarih yok'}</Typography></Box><Chip label={`${x.correct || 0} Doğru`} sx={{ bgcolor: '#dcfce7' }} /><Chip label={`${x.wrong || 0} Yanlış`} sx={{ bgcolor: '#fee2e2' }} /><Chip color="secondary" label={`${Number(x.net ?? netOf(x.correct,x.wrong)).toFixed(2)} Net`} /></Paper>)}</Stack>}

          {tab === 3 && <Stack spacing={2}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Chip label={`Toplam deneme: ${results.length}`} /><Chip color="primary" label={`Ortalama net: ${avg.toFixed(2)}`} /></Stack>{results.length === 0 ? <Alert severity="info">Henüz deneme sonucu bulunmuyor.</Alert> : results.map((x, i) => <Paper key={`${x.type}-${x.id}`} variant="outlined" className="private-student-result-card"><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Box sx={{ flex: 1 }}><Typography fontWeight={950}>{i + 1}. {x.name}</Typography><Typography variant="caption">{x.type}</Typography></Box><Chip label={`${x.correct || 0} Doğru`} sx={{ bgcolor: '#dcfce7' }} /><Chip label={`${x.wrong || 0} Yanlış`} sx={{ bgcolor: '#fee2e2' }} /><Chip label={`${x.blank || 0} Boş`} sx={{ bgcolor: '#fef3c7' }} /><Chip color="primary" label={`${Number(x.net || 0).toFixed(2)} Net`} /></Stack>{x.type === 'Online' && <Box className="private-student-question-strip">{Array.from({ length: 20 }, (_, i) => i + 1).map(q => { const a = x.answers?.[q] || '', k = x.answerKey?.[q] || '', bg = !a ? '#f59e0b' : a === k ? '#16a34a' : '#dc2626'; return <Box key={q} sx={{ bgcolor: bg }}>{q}</Box> })}</Box>}</Paper>)}<Paper variant="outlined" className="private-student-chart-card"><Typography variant="h6" fontWeight={950}>Son 10 Denemenin Net Grafiği</Typography><Chart items={results.slice(-10)} /></Paper></Stack>}
        </Box>
      </Paper>
    </Box>

    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}><LockReset /> Hesap Ayarları</DialogTitle>
      <DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#f1f5f9', borderRadius: 3 }}><Avatar>{initials}</Avatar><Box><Typography fontWeight={900}>{student.fullName}</Typography><Typography variant="caption" color="text.secondary">@{username}</Typography></Box></Box>{message && <Alert severity={message.includes('değiştirildi') ? 'success' : 'error'}>{message}</Alert>}<TextField type="password" label="Yeni şifre" value={passwords.next} onChange={e => setPasswords({ ...passwords, next: e.target.value })} /><TextField type="password" label="Yeni şifre tekrar" value={passwords.again} onChange={e => setPasswords({ ...passwords, again: e.target.value })} /><Button variant="contained" onClick={changePassword}>Şifreyi Değiştir</Button></Stack></DialogContent>
      <DialogActions><Button onClick={() => setSettingsOpen(false)}>Kapat</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(solve)} onClose={() => !saving && setSolve(null)} fullWidth maxWidth="md">
      <DialogTitle fontWeight={950}>{exams.find(x => x.id === solve?.examId)?.name || 'Online Deneme'}</DialogTitle>
      <DialogContent dividers><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>{Array.from({ length: 20 }, (_, i) => i + 1).map(q => <Paper key={q} variant="outlined" sx={{ p: 1, display: 'grid', gridTemplateColumns: '36px repeat(4,1fr)', gap: .5, alignItems: 'center' }}><b>{q}</b>{ANSWERS.map(a => <Button key={a} size="small" variant={answers[q] === a ? 'contained' : 'outlined'} onClick={() => setAnswers(current => {
          const next = { ...current }
          if (next[q] === a) delete next[q]
          else next[q] = a
          return next
        })}>{a}</Button>)}</Paper>)}</Box></DialogContent>
      <DialogActions><Button onClick={() => setSolve(null)} disabled={saving}>Vazgeç</Button><Button variant="contained" onClick={submit} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Denemeyi Bitir'}</Button></DialogActions>
    </Dialog>
  </Box>
}
