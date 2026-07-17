import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Drawer, IconButton, List,
  ListItemButton, ListItemIcon, ListItemText, Paper, Stack, TextField,
  Toolbar, Typography
} from '@mui/material'
import {
  AddCircle, Announcement, Assignment, AutoAwesome, BarChart, Campaign,
  CheckCircle, Close, Download, EmojiEvents, Event, Home, Logout, Menu, NoteAlt,
  OnlinePrediction, PlayArrow, Psychology, Quiz, Schedule, Settings, Star, TrendingUp
} from '@mui/icons-material'
import html2pdf from 'html2pdf.js'
import { supabase } from '../services/supabase'
import { readSharedState } from '../services/sharedState'
import { ANNOUNCEMENTS_STORAGE_KEY, readAnnouncements } from './AnnouncementsPage'
import LgsStudentHomePage from './LgsStudentHomePage'

const KEYS = {
  homework: 'taskin-akademi-v64-homeworks',
  exams: 'taskin-akademi-v64-exams',
  plus: 'taskin-akademi-v64-plus-records',
  grades: 'taskin-akademi-v64-school-exam-grades',
  comments: 'taskin-akademi-v64-comments'
}
const safeLoad = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback } }
const fmtDate = value => value ? new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)) : '—'
const fmtDateTime = value => value ? new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'
const examDate = exam => exam.date || exam.startAt || exam.createdAt || ''
const examResult = (exam, studentId) => exam.kind === 'online' ? exam.attempts?.[studentId] : exam.results?.[studentId]
const examType = exam => exam.kind === 'online' ? 'Online' : exam.type === 'general' ? 'Genel' : 'Fen'
const monthBounds = () => {
  const now = new Date()
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) }
}
const inRange = (value, start, end) => { const d = new Date(value); return Number.isFinite(d.getTime()) && d >= start && d <= end }
const motivational = [
  'Bugünün emeği, yarının başarısıdır.', 'Küçük adımlar büyük sonuçlar doğurur.',
  'Başarı, vazgeçmeyenlerin yol arkadaşıdır.', 'Her deneme seni hedefe biraz daha yaklaştırır.'
]
const threeWrongNet = (correct, wrong) => Number((Number(correct || 0) - Number(wrong || 0) / 3).toFixed(2))
const remainingText = (endValue, current = new Date()) => {
  const ms = new Date(endValue).getTime() - current.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function StudentHomePage({ session, profile }) {
  const [page, setPage] = useState('Ana Sayfa')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [student, setStudent] = useState(null)
  const [classInfo, setClassInfo] = useState(null)
  const [classStudents, setClassStudents] = useState([])
  const [announcements, setAnnouncements] = useState(readAnnouncements)
  const [now, setNow] = useState(new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlineOpen, setOnlineOpen] = useState(false)
  const [activeOnlineExam, setActiveOnlineExam] = useState(null)
  const [onlineAnswers, setOnlineAnswers] = useState({})
  const [exams, setExams] = useState(() => safeLoad(KEYS.exams))
  const [homeworks, setHomeworks] = useState(() => safeLoad(KEYS.homework))
  const pdfRef = useRef(null)

  const plusRecords = safeLoad(KEYS.plus)
  const grades = safeLoad(KEYS.grades, {})
  const comments = safeLoad(KEYS.comments)

  useEffect(() => {
    const refreshCloudData = async () => {
      try {
        const [examState, homeworkState] = await Promise.all([
          readSharedState('exams-v1', safeLoad(KEYS.exams)),
          readSharedState('homeworks-v1', safeLoad(KEYS.homework))
        ])
        setExams(examState.payload || [])
        setHomeworks(homeworkState.payload || [])
      } catch {
        setExams(safeLoad(KEYS.exams))
        setHomeworks(safeLoad(KEYS.homework))
      }
    }
    const clockTimer = setInterval(() => setNow(new Date()), 1000)
    const dataTimer = setInterval(refreshCloudData, 30000)
    window.addEventListener('storage', refreshCloudData)
    window.addEventListener('focus', refreshCloudData)
    window.addEventListener('taskin-exams-updated', refreshCloudData)
    const visibility = () => { if (!document.hidden) refreshCloudData() }
    document.addEventListener('visibilitychange', visibility)
    refreshCloudData()
    return () => {
      clearInterval(clockTimer)
      clearInterval(dataTimer)
      window.removeEventListener('storage', refreshCloudData)
      window.removeEventListener('focus', refreshCloudData)
      window.removeEventListener('taskin-exams-updated', refreshCloudData)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error: studentError } = await supabase
        .from('students')
        .select('id,student_number,first_name,last_name,class_id,is_active')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()
      if (studentError || !data) {
        setError(studentError?.message || 'Öğrenci kaydı bulunamadı.')
        setLoading(false); return
      }
      setStudent(data)
      const [classResult, studentsResult] = await Promise.all([
        supabase.from('classes').select('id,name,is_lgs').eq('id', data.class_id).maybeSingle(),
        supabase.from('students').select('id,student_number,first_name,last_name,class_id').eq('class_id', data.class_id).eq('is_active', true)
      ])
      setClassInfo(classResult.data || null)
      setClassStudents(studentsResult.data || [data])
      setLoading(false)
    }
    load()
    const refresh = () => setAnnouncements(readAnnouncements())
    window.addEventListener('storage', refresh)
    window.addEventListener('taskin-announcements-updated', refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('taskin-announcements-updated', refresh) }
  }, [session.user.id])

  const studentExams = useMemo(() => student ? exams
    .filter(exam => exam.classId === student.class_id && examResult(exam, student.id))
    .filter(exam => exam.kind !== 'online' || !exam.endAt || now >= new Date(exam.endAt))
    .sort((a, b) => new Date(examDate(b)) - new Date(examDate(a))) : [], [student, exams])
  const studentHomeworks = useMemo(() => student ? homeworks
    .filter(hw => hw.classId === student.class_id && (hw.studentIds || []).includes(student.id))
    .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate)) : [], [student, homeworks])
  const studentPlus = useMemo(() => student ? plusRecords
    .filter(row => row.studentId === student.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : [], [student, plusRecords])
  const studentComments = useMemo(() => student ? comments
    .filter(row => row.studentId === student.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : [], [student, comments])
  const visibleAnnouncements = useMemo(() => student ? announcements
    .filter(item => item.recipientIds?.includes(student.id))
    .filter(item => (!item.publishDate || new Date(item.publishDate) <= now) && (!item.endDate || new Date(`${item.endDate}T23:59:59`) >= now))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : [], [announcements, student, now])

  const upcomingHomework = studentHomeworks
    .filter(hw => new Date(`${hw.dueDate}T23:59:59`) >= now && !hw.statuses?.[student?.id])
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]
  const upcomingOnline = exams
    .filter(exam => {
      if (!student || exam.classId !== student.class_id || exam.kind !== 'online' || exam.isPassive || new Date(exam.endAt) < now) return false
      return true
    })
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))[0]

  const classStudentIds = useMemo(() => collectClassStudentIds(student, homeworks, exams, plusRecords, classStudents), [student, homeworks, exams, plusRecords, classStudents])
  const ranking = useMemo(() => calculateRanking(classStudentIds, student?.class_id, homeworks, exams, plusRecords), [classStudentIds, student, homeworks, exams, plusRecords])
  const ownRankIndex = ranking.findIndex(item => item.id === student?.id)
  const ownRank = ownRankIndex >= 0 ? ownRankIndex + 1 : 0
  const ownPoints = ranking.find(item => item.id === student?.id)?.points || 0
  const scoreLeader = ranking[0]
  const publishedWinner = useMemo(() => getPublishedMonthlyWinner(student?.class_id), [student?.class_id, now.getMonth(), now.getFullYear()])
  const latestExam = studentExams[0]
  const latestNet = Number(examResult(latestExam || {}, student?.id)?.net || 0)

  const menu = [
    ['Ana Sayfa', Home], ['Denemelerim', Quiz], ['Ödevlerim', Assignment],
    ['Artılarım', Star], ['Sınav Notlarım', NoteAlt]
  ]

  function countdown(value) {
    if (!value) return 'Planlanmadı'
    const diff = new Date(value) - now
    if (diff <= 0) return 'Başladı'
    const d = Math.floor(diff / 86400000), h = Math.floor(diff % 86400000 / 3600000), m = Math.floor(diff % 3600000 / 60000), s = Math.floor(diff % 60000 / 1000)
    return `${d ? `${d} gün ` : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function askAi() {
    const done = studentHomeworks.filter(hw => hw.statuses?.[student.id] === 'done').length
    const total = studentHomeworks.length
    const trend = studentExams.slice(0, 3).map(e => Number(examResult(e, student.id)?.net || 0))
    const direction = trend.length >= 2 && trend[0] > trend[trend.length - 1] ? 'yükseliş gösteriyorsun' : 'düzenli tekrar yapman faydalı olacaktır'
    setAiAnswer(`${student.first_name}, son denemelerinde ${direction}. ${total ? `Ödev tamamlama durumun ${done}/${total}.` : 'Henüz ödev verin oluşmadı.'} Bugün 25 dakikalık odaklı bir çalışma yapıp son denemendeki yanlışlarını tekrar etmeni öneriyorum.${aiText ? ` Soruna özel not: “${aiText}” için önce konu özeti, sonra 10 soru çöz.` : ''}`)
  }

  async function changePassword() {
    setPasswordError(''); setPasswordMessage('')
    if (newPassword.length < 6) return setPasswordError('Yeni şifre en az 6 karakter olmalıdır.')
    if (newPassword !== confirmPassword) return setPasswordError('Şifreler birbiriyle eşleşmiyor.')
    setPasswordBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordBusy(false)
    if (updateError) return setPasswordError(updateError.message || 'Şifre değiştirilemedi.')
    setPasswordMessage('Şifren başarıyla değiştirildi.')
    setNewPassword(''); setConfirmPassword('')
  }

  function persistExams(next) {
    setExams(next)
    try {
      localStorage.setItem(KEYS.exams, JSON.stringify(next))
      window.dispatchEvent(new window.Event('taskin-exams-updated'))
      return true
    } catch (storageError) {
      console.error('Online deneme kaydı yerel depolamaya yazılamadı:', storageError)
      return false
    }
  }

  function beginOnlineExam() {
    if (!upcomingOnline || !student) return
    const start = new Date(upcomingOnline.startAt)
    const end = new Date(upcomingOnline.endAt)
    if (now < start) return window.alert('Denemenin başlangıç saati henüz gelmedi.')
    if (now > end) return window.alert('Bu denemenin süresi sona erdi.')
    const existing = upcomingOnline.attempts?.[student.id] || {}
    if (existing.finishedAt || existing.locked) return window.alert('Bu denemeyi kaydettin. Süre bittikten sonra sonucunu Denemelerim ekranında görebilirsin.')
    const attempt = { ...existing, startedAt: existing.startedAt || new Date().toISOString(), finishedAt: null, status: 'Sınavda', answers: existing.answers || {} }
    const next = exams.map(exam => exam.id === upcomingOnline.id ? { ...exam, attempts: { ...(exam.attempts || {}), [student.id]: attempt } } : exam)
    const selectedExam = next.find(exam => exam.id === upcomingOnline.id) || { ...upcomingOnline, attempts: { ...(upcomingOnline.attempts || {}), [student.id]: attempt } }
    // Önce cevap ekranını aç. Depolama hatası ekranın açılmasını engellemesin.
    setActiveOnlineExam(selectedExam)
    setOnlineAnswers(attempt.answers || {})
    setOnlineOpen(true)
    setError('')
    sessionStorage.setItem('taskin-active-online-exam-id', String(selectedExam.id))
    persistExams(next)
  }

  function chooseOnlineAnswer(question, answer) {
    const answers = { ...onlineAnswers, [question]: answer }
    setOnlineAnswers(answers)
    if (!activeOnlineExam || !student) return
    const existing = activeOnlineExam.attempts?.[student.id] || {}
    const attempt = { ...existing, startedAt: existing.startedAt || new Date().toISOString(), finishedAt: null, status: 'Sınavda', answers }
    const updated = { ...activeOnlineExam, attempts: { ...(activeOnlineExam.attempts || {}), [student.id]: attempt } }
    setActiveOnlineExam(updated)
    persistExams(exams.map(exam => exam.id === updated.id ? updated : exam))
  }

  function finishOnlineExam(autoFinish = false) {
    if (!activeOnlineExam || !student) return
    if (!autoFinish && !window.confirm('Cevaplarını kesin olarak kaydetmek istediğine emin misin? Kaydettikten sonra tekrar değiştiremezsin.')) return
    let correct = 0, wrong = 0
    for (let q = 1; q <= 20; q += 1) {
      const selected = onlineAnswers[q]
      if (!selected) continue
      if (selected === activeOnlineExam.answers?.[q]) correct += 1
      else wrong += 1
    }
    const net = threeWrongNet(correct, wrong)
    const existing = activeOnlineExam.attempts?.[student.id] || {}
    const attempt = { ...existing, answers: onlineAnswers, correct, wrong, blank: 20 - correct - wrong, net, status: 'Kaydedildi', locked: true, finishedAt: new Date().toISOString() }
    const updated = { ...activeOnlineExam, attempts: { ...(activeOnlineExam.attempts || {}), [student.id]: attempt } }
    persistExams(exams.map(exam => exam.id === updated.id ? updated : exam))
    setOnlineOpen(false)
    setActiveOnlineExam(null)
    window.alert(autoFinish ? 'Süre doldu. Mevcut cevapların otomatik kaydedildi.' : 'Cevapların kaydedildi. Sonuçların deneme süresi bittikten sonra Denemelerim ekranında görünecek.')
  }

  useEffect(() => {
    if (!onlineOpen || !activeOnlineExam || !student) return
    const end = new Date(activeOnlineExam.endAt)
    const attempt = activeOnlineExam.attempts?.[student.id]
    if (Number.isFinite(end.getTime()) && now >= end && !attempt?.finishedAt) finishOnlineExam(true)
  }, [now, onlineOpen, activeOnlineExam?.id])

  function cancelOnlineExam() {
    setOnlineOpen(false)
    setActiveOnlineExam(null)
    setError('')
  }

  function downloadPdf() {
    if (!pdfRef.current) return
    html2pdf().set({
      margin: 8, filename: `${student.first_name}-${student.last_name}-ogrenci-durum-raporu.pdf`,
      image: { type: 'jpeg', quality: .98 }, html2canvas: { scale: 2, useCORS: true },
      pagebreak: { mode: ['css'], avoid: ['.student-report-card', 'tr'] }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(pdfRef.current).save()
  }

  if (loading) return <Box className="loader"><CircularProgress /></Box>
  if (classInfo?.is_lgs) return <LgsStudentHomePage session={session} student={student} classInfo={classInfo} />
  if (error && !onlineOpen) return <Box sx={{ p: 4 }}><Alert severity="error">{error}</Alert><Button sx={{ mt: 2 }} onClick={() => supabase.auth.signOut()}>Çıkış</Button></Box>

  if (onlineOpen && activeOnlineExam) return <Box className="online-exam-screen">
    <Box className="online-exam-header">
      <Box><Typography variant="h5" fontWeight={950}>{activeOnlineExam.name || 'Online Deneme'}</Typography><Typography variant="body2">Cevapların her işaretlemede otomatik kaydedilir.</Typography></Box>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Chip color="warning" icon={<Schedule/>} label={`Kalan Süre: ${remainingText(activeOnlineExam.endAt, now)}`} /><Chip label={`İşaretlenen: ${Object.keys(onlineAnswers).length} / 20`} /></Stack>
    </Box>
    <Box className="online-exam-body">
      <Box className="student-online-two-columns">
        {[Array.from({length:10},(_,i)=>i+1), Array.from({length:10},(_,i)=>i+11)].map((questions,column)=><Box className="student-online-column" key={column}>{questions.map(question => <Paper className="student-online-question" elevation={0} key={question}><b>{question}</b><Stack direction="row" spacing={.7}>{['A','B','C','D'].map(answer=><Button key={answer} size="small" variant={onlineAnswers[question]===answer?'contained':'outlined'} onClick={()=>chooseOnlineAnswer(question,answer)}>{answer}</Button>)}</Stack></Paper>)}</Box>)}
      </Box>
    </Box>
    <Box className="online-exam-footer"><Typography color="text.secondary">İptal edip çıkarsan cevapların korunur ve süre içinde tekrar devam edebilirsin.</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={1}><Button variant="outlined" startIcon={<Close/>} onClick={cancelOnlineExam}>İptal Et ve Çık</Button><Button variant="contained" color="success" size="large" startIcon={<CheckCircle/>} onClick={()=>finishOnlineExam(false)}>Cevapları Kaydet</Button></Stack></Box>
  </Box>

  return <Box className="student-portal">
    <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: 260 } }}>
      <StudentDrawer />
    </Drawer>
    <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: 260, border: 0 } }}><StudentDrawer /></Drawer>

    <Box className="student-portal-main">
      <Toolbar className="student-topbar">
        <IconButton sx={{ display: { md: 'none' } }} onClick={() => setMobileOpen(true)}><Menu /></IconButton>
        <Box><Typography fontWeight={950}>{fmtDate(now)}</Typography><Typography variant="caption">{now.toLocaleTimeString('tr-TR')}</Typography></Box>
        <Box sx={{ flex: 1 }} />
        <IconButton title="Ayarlar" onClick={() => setSettingsOpen(true)}><Settings /></IconButton>
        <Button color="inherit" startIcon={<Logout />} onClick={() => supabase.auth.signOut()}>Çıkış</Button>
      </Toolbar>

      <Box className="student-portal-content">
        {page === 'Ana Sayfa' && <StudentDashboard />}
        {page === 'Denemelerim' && <StudentExams />}
        {page === 'Ödevlerim' && <StudentHomeworks />}
        {page === 'Artılarım' && <StudentPlus />}
        {page === 'Sınav Notlarım' && <StudentGrades />}
      </Box>
    </Box>


    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Ayarlar</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>Kullanıcı: <b>{profile?.full_name || `${student.first_name} ${student.last_name}`}</b></Typography>
        {passwordError && <Alert severity="error" sx={{ mb: 1.5 }}>{passwordError}</Alert>}
        {passwordMessage && <Alert severity="success" sx={{ mb: 1.5 }}>{passwordMessage}</Alert>}
        <Stack spacing={1.5}>
          <TextField label="Yeni şifre" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
          <TextField label="Yeni şifre tekrar" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" onKeyDown={e => e.key === 'Enter' && changePassword()} />
          <Typography variant="caption" color="text.secondary">Şifre en az 6 karakter olmalıdır.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={() => setSettingsOpen(false)}>Kapat</Button><Button variant="contained" disabled={passwordBusy} onClick={changePassword}>{passwordBusy ? 'Kaydediliyor…' : 'Şifreyi Değiştir'}</Button></DialogActions>
    </Dialog>
  </Box>

  function StudentDrawer() {
    return <Box className="student-drawer">
      <Box className="student-drawer-brand"><img src="/taskin-takip-sistemi-logo.png" alt="Taşkın Takip Sistemi"/><Box><Typography fontWeight={950}>TAŞKIN</Typography><Typography variant="caption">Öğrenci Paneli</Typography></Box></Box>
      <Divider />
      <List>{menu.map(([label, Icon]) => <ListItemButton key={label} selected={page === label} onClick={() => { setPage(label); setMobileOpen(false) }}><ListItemIcon><Icon /></ListItemIcon><ListItemText primary={label}/></ListItemButton>)}</List>
      <Box sx={{ flex: 1 }}/><Button startIcon={<Logout />} onClick={() => supabase.auth.signOut()}>Çıkış Yap</Button>
    </Box>
  }

  function StudentDashboard() {
    return <Stack spacing={2.5}>
      <Paper className="student-welcome" elevation={0}><Box><Typography variant="h3" fontWeight={950}>Hoş geldin, {student.first_name} {student.last_name}</Typography><Typography variant="h6">{classInfo?.name || 'Sınıf'} • No: {student.student_number}</Typography><Typography className="student-motivation">“{motivational[new Date().getDate() % motivational.length]}”</Typography></Box><EmojiEvents className="student-welcome-icon" /></Paper>
      <Box className="student-summary-grid">
        <SummaryCard icon={<Star />} label="Toplam Artım" value={studentPlus.reduce((s, r) => s + Number(r.amount || 1), 0)} tone="gold" />
        <SummaryCard icon={<TrendingUp />} label="Son Deneme Netim" value={latestExam ? `${latestNet.toFixed(2)} net` : '—'} tone="blue" />
        <SummaryCard icon={<EmojiEvents />} label="Ayın Öğrencisi" value={publishedWinner?.name || 'Henüz belirlenmedi'} sub={publishedWinner ? `${publishedWinner.points ?? ''} puan` : 'Öğretmen tarafından yayımlanmadı'} tone="green" />
        <SummaryCard icon={<BarChart />} label="Bu Ayki Puanım" value={`${ownPoints} puan`} sub={scoreLeader && scoreLeader.id !== student.id ? `1. ile fark: ${Math.max(0, scoreLeader.points - ownPoints)} puan • Sıra: ${ownRank || '—'}` : ranking.length ? 'Şu anda 1. sıradasın' : 'Henüz sıralama oluşmadı'} tone="purple" />
      </Box>
      <Box className="student-large-grid">
        <Paper className="student-action-card" elevation={0}><Box className="student-card-title"><Assignment/><Typography variant="h5" fontWeight={950}>Yaklaşan Ödev</Typography></Box>{upcomingHomework ? <><Typography variant="h6" fontWeight={900}>{upcomingHomework.title}</Typography><Typography color="text.secondary">Son tarih: {fmtDate(upcomingHomework.dueDate)}</Typography><Chip sx={{ mt: 2 }} color="warning" label={`${Math.max(0, Math.ceil((new Date(`${upcomingHomework.dueDate}T23:59:59`) - now) / 86400000))} gün kaldı`} /></> : <Typography color="text.secondary">Yaklaşan ödev bulunmuyor.</Typography>}<Button onClick={() => setPage('Ödevlerim')}>Tüm Ödevlerim</Button></Paper>
        <Paper className="student-action-card online" elevation={0}><Box className="student-card-title"><OnlinePrediction/><Typography variant="h5" fontWeight={950}>Online Deneme</Typography></Box>{upcomingOnline ? <><Typography variant="h6" fontWeight={900}>{upcomingOnline.name}</Typography><Typography color="text.secondary">Başlangıç: {fmtDateTime(upcomingOnline.startAt)}</Typography><Typography className="student-countdown">{countdown(upcomingOnline.startAt)}</Typography>{upcomingOnline.attempts?.[student.id]?.finishedAt ? <><Chip color="info" label="Cevapların kaydedildi"/><Typography variant="body2" color="text.secondary">Sonucun süre bittikten sonra Denemelerim ekranında açılacak.</Typography></> : <Button variant="contained" startIcon={<PlayArrow/>} disabled={new Date(upcomingOnline.startAt) > now || new Date(upcomingOnline.endAt) < now} onClick={beginOnlineExam}>{upcomingOnline.attempts?.[student.id]?.startedAt ? 'Devam Et' : 'Denemeye Başla'}</Button>}</> : <Typography color="text.secondary">Planlanmış online deneme bulunmuyor.</Typography>}</Paper>
      </Box>
      <Box className="student-info-grid">
        <Paper className="student-info-card" elevation={0}><Box className="student-card-title"><Campaign/><Typography variant="h5" fontWeight={950}>Duyurular</Typography></Box>{visibleAnnouncements.slice(0, 3).map(a => <Box className="student-mini-row" key={a.id}><Announcement/><Box><Typography fontWeight={900}>{a.title}</Typography><Typography variant="body2" color="text.secondary">{a.body}</Typography></Box></Box>)}{!visibleAnnouncements.length && <Typography color="text.secondary">Yeni duyuru yok.</Typography>}</Paper>
        <Paper className="student-info-card" elevation={0}><Box className="student-card-title"><Psychology/><Typography variant="h5" fontWeight={950}>Öğretmen Yorumu</Typography></Box>{studentComments[0] ? <><Typography className="student-comment">“{studentComments[0].text}”</Typography><Typography variant="caption" color="text.secondary">{fmtDateTime(studentComments[0].createdAt)}</Typography></> : <Typography color="text.secondary">Henüz öğretmen yorumu bulunmuyor.</Typography>}</Paper>
      </Box>
      <Paper className="student-ai-card" elevation={0}><Box className="student-card-title"><AutoAwesome/><Typography variant="h5" fontWeight={950}>Yapay Zekâ Desteği</Typography></Box><Typography color="text.secondary">Çalışma önerisi almak veya sonuçların hakkında soru sormak için yaz.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}><TextField fullWidth placeholder="Örneğin: Fen netimi nasıl artırabilirim?" value={aiText} onChange={e => setAiText(e.target.value)} onKeyDown={e => e.key === 'Enter' && askAi()}/><Button variant="contained" startIcon={<AutoAwesome/>} onClick={askAi}>Öneri Al</Button></Stack>{aiAnswer && <Alert severity="success" sx={{ mt: 2 }}>{aiAnswer}</Alert>}</Paper>
    </Stack>
  }

  function StudentExams() {
    const chronological = [...studentExams].sort((a, b) => new Date(examDate(a)) - new Date(examDate(b)))
    return <Stack spacing={2}><PageTitle icon={<Quiz />} title="Denemelerim" subtitle="Fen, genel ve online deneme sonuçların" action={<Button variant="contained" startIcon={<Download />} onClick={downloadPdf}>Durum PDF</Button>}/><Paper className="student-table-card" elevation={0}><div className="student-table-wrap"><table className="student-data-table"><thead><tr><th>Tarih</th><th>Tür</th><th>Deneme</th><th>Doğru</th><th>Yanlış</th><th>Net</th><th>Sınıf Sırası</th></tr></thead><tbody>{studentExams.map(exam => { const result = examResult(exam, student.id) || {}; const rows = examParticipants(exam).sort((a,b)=>b.net-a.net); const rankIndex = rows.findIndex(r=>r.id===student.id); const rank = rankIndex >= 0 ? rankIndex + 1 : 0; return <tr key={exam.id}><td>{fmtDate(examDate(exam))}</td><td><Chip size="small" label={examType(exam)} /></td><td>{exam.name}</td><td>{result.correct ?? '—'}</td><td>{result.wrong ?? '—'}</td><td><b>{(exam.kind === 'online' ? threeWrongNet(result.correct, result.wrong) : Number(result.net || 0)).toFixed(2)}</b></td><td>{rank || '—'} / {rows.length}</td></tr>})}</tbody></table></div>{!studentExams.length && <Empty text="Henüz deneme sonucun yok."/>}</Paper><Box className="student-chart-grid"><Paper className="student-chart-card" elevation={0}><Typography variant="h6" fontWeight={950}>Net Gelişimim</Typography><LineChart exams={chronological}/></Paper><Paper className="student-chart-card" elevation={0}><Typography variant="h6" fontWeight={950}>Son Deneme Karşılaştırması</Typography><ComparisonChart exam={latestExam}/></Paper></Box><StudentReport /></Stack>
  }

  function StudentHomeworks() {
    return <Stack spacing={2}><PageTitle icon={<Assignment />} title="Ödevlerim" subtitle="Tüm ödevlerin ve durumların"/><Paper className="student-table-card" elevation={0}><div className="student-table-wrap"><table className="student-data-table"><thead><tr><th>Ödev</th><th>Veriliş</th><th>Son Tarih</th><th>Durum</th></tr></thead><tbody>{studentHomeworks.map(hw => { const status = hw.statuses?.[student.id]; return <tr key={hw.id}><td><b>{hw.title}</b><small>{hw.description}</small></td><td>{fmtDate(hw.createdAt)}</td><td>{fmtDate(hw.dueDate)}</td><td><StatusChip status={status}/></td></tr>})}</tbody></table></div>{!studentHomeworks.length && <Empty text="Henüz ödevin yok."/>}</Paper></Stack>
  }

  function StudentPlus() {
    return <Stack spacing={2}><PageTitle icon={<Star />} title="Artılarım" subtitle="Aldığın artılar ve nedenleri"/><Paper className="student-table-card" elevation={0}><div className="student-table-wrap"><table className="student-data-table"><thead><tr><th>Tarih</th><th>Artı</th><th>Neden</th></tr></thead><tbody>{studentPlus.map(row => <tr key={row.id}><td>{fmtDateTime(row.createdAt)}</td><td><Chip icon={<AddCircle />} color="success" label={`+${row.amount || 1}`} /></td><td><b>{row.reason}</b></td></tr>)}</tbody></table></div>{!studentPlus.length && <Empty text="Henüz artı kaydın yok."/>}</Paper></Stack>
  }

  function StudentGrades() {
    const row = grades?.[student.class_id]?.[student.id] || {}
    return <Stack spacing={2}><PageTitle icon={<NoteAlt />} title="Sınav Notlarım" subtitle="Fen yazılı sonuçların"/><Box className="student-summary-grid two"><SummaryCard icon={<NoteAlt/>} label="Fen 1. Yazılı" value={row.exam1 || '—'} tone="blue"/><SummaryCard icon={<NoteAlt/>} label="Fen 2. Yazılı" value={row.exam2 || '—'} tone="green"/></Box><Paper className="student-info-card" elevation={0}><Typography variant="h6" fontWeight={950}>Not Ortalamam</Typography><Typography variant="h2" fontWeight={950}>{gradeAverage(row)}</Typography></Paper></Stack>
  }

  function LineChart({ exams: rows }) {
    if (!rows.length) return <Empty text="Grafik için deneme verisi yok." />
    const nets = rows.map(e => Number(examResult(e, student.id)?.net || 0)); const max = Math.max(20, ...nets); const width=650,height=260,pad=45; const points=nets.map((v,i)=>`${pad+i*((width-pad*2)/Math.max(1,nets.length-1))},${height-pad-(v/max)*(height-pad*2)}`).join(' ')
    return <svg className="student-svg-chart" viewBox={`0 0 ${width} ${height}`}>{[0,.25,.5,.75,1].map(r=><line key={r} x1={pad} y1={pad+r*(height-pad*2)} x2={width-pad} y2={pad+r*(height-pad*2)} />)}<polyline points={points}/>{nets.map((v,i)=>{const x=pad+i*((width-pad*2)/Math.max(1,nets.length-1)),y=height-pad-(v/max)*(height-pad*2);return <g key={i}><circle cx={x} cy={y} r="6"/><text x={x} y={y-12}>{v.toFixed(1)}</text><text className="axis" x={x} y={height-15}>{rows[i].name.slice(0,9)}</text></g>})}</svg>
  }

  function ComparisonChart({ exam }) {
    if (!exam) return <Empty text="Karşılaştırılacak deneme yok." />
    const participants = examParticipants(exam)
    const vals = participants.map(item => item.net).filter(Number.isFinite)
    if (!vals.length) return <Empty text="Sınıf karşılaştırma verisi bulunmuyor." />
    const ownResult = examResult(exam, student.id) || {}; const own = exam.kind === 'online' ? threeWrongNet(ownResult.correct, ownResult.wrong) : Number(ownResult.net || 0)
    const stats=[['En Düşük',Math.min(...vals)],['Sınıf Ort.',vals.reduce((a,b)=>a+b,0)/vals.length],['Benim Netim',own],['En Yüksek',Math.max(...vals)]]
    const max=Math.max(1,...stats.map(x=>x[1])); return <Box className="student-bars">{stats.map(([label,val])=><Box className="student-bar" key={label}><b>{val.toFixed(2)}</b><i style={{height:`${Math.max(8,val/max*160)}px`}}/><small>{label}</small></Box>)}</Box>
  }

  function examParticipants(exam) {
    if (!exam) return []
    const source = exam.kind === 'online' ? (exam.attempts || {}) : (exam.results || {})
    return Object.entries(source).flatMap(([id, result]) => {
      if (!result || typeof result !== 'object') return []
      const net = exam.kind === 'online' ? threeWrongNet(result.correct, result.wrong) : Number(result.net)
      return Number.isFinite(net) ? [{ id, net }] : []
    })
  }

  function StudentReport() {
    return <Box className="student-report-print" ref={pdfRef}><Box className="student-report-letter"><img src="/taskin-takip-sistemi-logo.png"/><Box><h1>ÖĞRENCİ DURUM RAPORU</h1><p>{student.first_name} {student.last_name} • {classInfo?.name} • No: {student.student_number}</p></Box></Box><Box className="student-report-grid"><ReportCard title="Aylık Durum" lines={[`Puan: ${ownPoints}`, `Sıra: ${ownRank || '—'}`, `Birinci ile fark: ${scoreLeader ? Math.max(0, scoreLeader.points-ownPoints) : '—'}`]}/><ReportCard title="Genel Özet" lines={[`Toplam artı: ${studentPlus.length}`, `Son deneme: ${latestExam ? `${latestNet.toFixed(2)} net` : '—'}`, `Ödev sayısı: ${studentHomeworks.length}`]}/></Box><h2>Deneme Sonuçları</h2><table><thead><tr><th>Tarih</th><th>Tür</th><th>Deneme</th><th>Net</th></tr></thead><tbody>{studentExams.map(e=><tr key={e.id}><td>{fmtDate(examDate(e))}</td><td>{examType(e)}</td><td>{e.name}</td><td>{(e.kind === 'online' ? threeWrongNet(examResult(e,student.id)?.correct, examResult(e,student.id)?.wrong) : Number(examResult(e,student.id)?.net||0)).toFixed(2)}</td></tr>)}</tbody></table><h2>Ödev Durumu</h2><table><thead><tr><th>Ödev</th><th>Son Tarih</th><th>Durum</th></tr></thead><tbody>{studentHomeworks.map(h=><tr key={h.id}><td>{h.title}</td><td>{fmtDate(h.dueDate)}</td><td>{statusLabel(h.statuses?.[student.id])}</td></tr>)}</tbody></table></Box>
  }
}

function collectClassStudentIds(student, homeworks, exams, plusRecords, visibleStudents = []) {
  if (!student?.class_id) return []
  const ids = new Set([student.id, ...visibleStudents.map(item => item.id)])
  homeworks.filter(item => item.classId === student.class_id).forEach(item => {
    ;(item.studentIds || []).forEach(id => ids.add(id))
    Object.keys(item.statuses || {}).forEach(id => ids.add(id))
  })
  exams.filter(item => item.classId === student.class_id).forEach(item => {
    Object.keys(item.results || {}).forEach(id => ids.add(id))
    Object.keys(item.attempts || {}).forEach(id => ids.add(id))
    Object.keys(item.targets || {}).forEach(id => ids.add(id))
  })
  plusRecords.filter(item => item.classId === student.class_id).forEach(item => item.studentId && ids.add(item.studentId))
  return [...ids].filter(Boolean)
}
function getPublishedMonthlyWinner(classId) {
  if (!classId) return null
  try {
    const data = JSON.parse(localStorage.getItem('taskin-akademi-v64-published-monthly-winners') || '{}')
    const now = new Date()
    return data[`${classId}:${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`] || null
  } catch { return null }
}
function calculateRanking(studentIds, classId, homeworks, exams, plusRecords) {
  if (!classId) return []
  const { start, end } = monthBounds()
  const hs=homeworks.filter(h=>h.classId===classId&&inRange(h.createdAt||h.dueDate,start,end))
  const es=exams.filter(e=>e.classId===classId&&inRange(examDate(e),start,end))
  const ps=plusRecords.filter(p=>p.classId===classId&&inRange(p.createdAt,start,end))
  return studentIds.map(id=>{let points=0
    hs.forEach(h=>{const st=h.statuses?.[id];if(st==='done')points+=10;if(st==='missing')points-=10})
    ps.filter(p=>p.studentId===id).forEach(p=>points+=10*Number(p.amount||1))
    es.filter(e=>e.kind==='online').forEach(e=>points+=e.attempts?.[id]?10:-10)
    es.filter(e=>e.kind==='normal'&&e.type==='fen').forEach(e=>{
      const result=e.results?.[id]
      if (!result) return
      const net=Number(result.net||0),target=Number(e.targets?.[id]||0)
      points+=net>=target?10:-10
      const vals=Object.values(e.results||{}).map(r=>Number(r?.net)).filter(Number.isFinite)
      const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0
      if(net>avg)points+=10
    })
    return{id,points}
  }).sort((a,b)=>b.points-a.points||String(a.id).localeCompare(String(b.id)))
}
function SummaryCard({ icon, label, value, sub, tone }) { return <Paper className={`student-summary-card ${tone}`} elevation={0}><span>{icon}</span><Box><Typography variant="caption">{label}</Typography><Typography variant="h5" fontWeight={950}>{value}</Typography>{sub&&<Typography variant="caption">{sub}</Typography>}</Box></Paper> }
function PageTitle({ icon, title, subtitle, action }) { return <Box className="student-page-title"><Box className="student-card-title">{icon}<Box><Typography variant="h4" fontWeight={950}>{title}</Typography><Typography color="text.secondary">{subtitle}</Typography></Box></Box>{action}</Box> }
function StatusChip({ status }) { const map={done:['Yaptı','success'],missing:['Yapmadı','error'],absent:['Gelmedi','warning']};const item=map[status]||['Bekliyor','default'];return <Chip label={item[0]} color={item[1]} /> }
function statusLabel(status){return ({done:'Yaptı',missing:'Yapmadı',absent:'Gelmedi'}[status]||'Bekliyor')}
function gradeAverage(row){const vals=[row.exam1,row.exam2].map(Number).filter(Number.isFinite);return vals.length?(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1):'—'}
function Empty({ text }) { return <Box className="student-empty"><Schedule/><Typography>{text}</Typography></Box> }
function ReportCard({title,lines}){return <div className="student-report-card"><h3>{title}</h3>{lines.map(x=><p key={x}>{x}</p>)}</div>}
