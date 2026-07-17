import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, IconButton, InputLabel,
  MenuItem, Paper, Select, Snackbar, Stack, Tab, Tabs, TextField,
  Typography
} from '@mui/material'
import {
  AddCircle, Assessment, CheckCircle, Close, Delete, Edit, Event,
  Groups, MonitorHeart, OnlinePrediction, QueryStats, Refresh,
  Save, Science, TrackChanges
} from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { useSharedCloudState } from '../services/useSharedCloudState'

const STORAGE_KEY = 'taskin-akademi-v64-exams'
const ANSWERS = ['A', 'B', 'C', 'D']
const todayIso = () => new Date().toISOString().slice(0, 10)
const formatDate = value => value ? new Intl.DateTimeFormat('tr-TR').format(new Date(`${value}T00:00:00`)) : '-'
const calcNet = (correct, wrong) => Number((Number(correct || 0) - Number(wrong || 0) / 3).toFixed(2))

function loadStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export default function ExamsPage() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [exams, setExams, examsCloudReady] = useSharedCloudState({
    stateKey: 'exams-v1', localKey: STORAGE_KEY, fallback: loadStored(),
    onError: err => setError(`Denemeler buluta kaydedilemedi: ${err?.message || err}`)
  })
  const [loading, setLoading] = useState(true)
  const [studentLoading, setStudentLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [onlineOpen, setOnlineOpen] = useState(false)
  const [targetOpen, setTargetOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [liveOpen, setLiveOpen] = useState(false)
  const [answerDetail, setAnswerDetail] = useState(null)
  const [editing, setEditing] = useState(null)
  const [activeExam, setActiveExam] = useState(null)
  const [tab, setTab] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', date: todayIso(), type: 'fen' })
  const [onlineForm, setOnlineForm] = useState({ name: '', startAt: '', endAt: '', answers: {} })
  const [targetValues, setTargetValues] = useState({})
  const [resultValues, setResultValues] = useState({})
  const resultRefs = useRef([])

  useEffect(() => { loadClasses() }, [])
  useEffect(() => { if (selectedClass) loadStudents(selectedClass) }, [selectedClass])
  useEffect(() => {
    if (examsCloudReady) window.dispatchEvent(new Event('taskin-exams-updated'))
  }, [exams, examsCloudReady])

  async function loadClasses() {
    setLoading(true)
    setError('')
    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) throw new Error('Oturum bulunamadı.')
      const [classResult, activeResult] = await Promise.all([
        supabase.from('classes').select('id,name,sort_order,is_lgs').order('sort_order'),
        supabase.from('teacher_active_classes').select('class_id').eq('teacher_id', user.id)
      ])
      if (classResult.error) throw classResult.error
      if (activeResult.error) throw activeResult.error
      const ids = new Set((activeResult.data || []).map(x => x.class_id))
      const active = (classResult.data || []).filter(c => ids.has(c.id) && !c.is_lgs && !String(c.name).toLowerCase().includes('lgs'))
      setClasses(active)
      setSelectedClass(current => active.some(c => c.id === current) ? current : (active[0]?.id || ''))
    } catch (err) {
      setError(err?.message || 'Aktif sınıflar yüklenemedi.')
    } finally { setLoading(false) }
  }

  async function loadStudents(classId) {
    setStudentLoading(true)
    const { data, error } = await supabase.from('students')
      .select('id,student_number,first_name,last_name,class_id,is_active')
      .eq('class_id', classId).eq('is_active', true).order('student_number')
    if (error) setError(error.message)
    const loaded = data || []
    setStudents(loaded)

    // Sınıftan silinen öğrencilerin gömülü deneme sonuçlarını/cevaplarını temizle.
    const activeIds = new Set(loaded.map(student => String(student.id)))
    setExams(current => current.map(exam => {
      if (String(exam?.classId || '') !== String(classId)) return exam
      const results = Object.fromEntries(Object.entries(exam?.results || {}).filter(([id]) => activeIds.has(String(id))))
      const attempts = Object.fromEntries(Object.entries(exam?.attempts || {}).filter(([id]) => activeIds.has(String(id))))
      const targets = Object.fromEntries(Object.entries(exam?.targets || {}).filter(([id]) => activeIds.has(String(id))))
      return { ...exam, results, attempts, targets }
    }))
    setStudentLoading(false)
  }

  const classInfo = classes.find(c => c.id === selectedClass)
  const classExams = useMemo(() => exams.filter(e => e.classId === selectedClass)
    .sort((a,b) => String(b.date || b.startAt).localeCompare(String(a.date || a.startAt))), [exams, selectedClass])
  const normalExams = classExams.filter(e => e.kind === 'normal')
  const onlineExams = classExams.filter(e => e.kind === 'online')

  function openNormal(exam = null) {
    setEditing(exam)
    setForm(exam ? { name: exam.name, date: exam.date, type: exam.type } : { name: '', date: todayIso(), type: 'fen' })
    setCreateOpen(true)
  }

  function saveNormal() {
    if (!form.name.trim()) return setError('Deneme adı zorunludur.')
    if (!form.date) return setError('Deneme tarihi seçilmelidir.')
    if (!selectedClass) return setError('Aktif sınıf seçilmelidir.')
    if (editing) {
      setExams(list => list.map(e => e.id === editing.id ? { ...e, ...form, name: form.name.trim() } : e))
      setMessage('Deneme güncellendi.')
    } else {
      setExams(list => [{
        id: crypto.randomUUID(), kind: 'normal', classId: selectedClass,
        className: classInfo?.name || '', name: form.name.trim(), date: form.date,
        type: form.type, targets: {}, results: {}, createdAt: new Date().toISOString()
      }, ...list])
      setMessage('Deneme oluşturuldu.')
    }
    setCreateOpen(false)
  }

  function openOnline(exam = null) {
    setEditing(exam)
    setOnlineForm(exam ? {
      name: exam.name, startAt: exam.startAt, endAt: exam.endAt, answers: exam.answers || {}
    } : { name: '', startAt: '', endAt: '', answers: {} })
    setOnlineOpen(true)
  }

  function saveOnline() {
    if (!onlineForm.name.trim()) return setError('Online deneme adı zorunludur.')
    if (!onlineForm.startAt || !onlineForm.endAt) return setError('Başlangıç ve bitiş tarihi-saatleri zorunludur.')
    if (new Date(onlineForm.endAt) <= new Date(onlineForm.startAt)) return setError('Bitiş zamanı başlangıçtan sonra olmalıdır.')
    const missing = Array.from({ length: 20 }, (_, i) => i + 1).filter(q => !onlineForm.answers[q])
    if (missing.length) return setError(`Cevap anahtarı eksik: ${missing.join(', ')}. sorular`)
    if (editing) {
      setExams(list => list.map(e => e.id === editing.id ? { ...e, ...onlineForm, name: onlineForm.name.trim() } : e))
      setMessage('Online deneme güncellendi.')
    } else {
      setExams(list => [{
        id: crypto.randomUUID(), kind: 'online', classId: selectedClass,
        className: classInfo?.name || '', name: onlineForm.name.trim(),
        startAt: onlineForm.startAt, endAt: onlineForm.endAt,
        answers: onlineForm.answers, attempts: {}, isPassive: false,
        createdAt: new Date().toISOString()
      }, ...list])
      setMessage('Online deneme oluşturuldu.')
    }
    setOnlineOpen(false)
  }

  function deleteExam(exam) {
    if (!window.confirm(`“${exam.name}” denemesi silinsin mi?`)) return
    setExams(list => list.filter(e => e.id !== exam.id))
    setMessage('Deneme silindi.')
  }

  function openTargets(exam) {
    setActiveExam(exam)
    setTargetValues(Object.fromEntries(students.map(s => [s.id, exam.targets?.[s.id] ?? ''])))
    setTargetOpen(true)
  }

  function saveTargets() {
    setExams(list => list.map(e => e.id === activeExam.id ? { ...e, targets: targetValues } : e))
    setTargetOpen(false)
    setMessage('Hedef netler kaydedildi.')
  }

  function openResults(exam) {
    setActiveExam(exam)
    setResultValues(Object.fromEntries(students.map(s => [s.id, {
      correct: exam.results?.[s.id]?.correct ?? '', wrong: exam.results?.[s.id]?.wrong ?? ''
    }])))
    setResultOpen(true)
  }

  function updateResult(studentId, key, value) {
    const num = value === '' ? '' : Math.max(0, Number(value))
    setResultValues(v => ({ ...v, [studentId]: { ...v[studentId], [key]: num } }))
  }

  function saveResults() {
    const max = activeExam.type === 'fen' ? 20 : 80
    const invalid = students.find(s => Number(resultValues[s.id]?.correct || 0) + Number(resultValues[s.id]?.wrong || 0) > max)
    if (invalid) return setError(`${invalid.first_name} ${invalid.last_name}: doğru ve yanlış toplamı ${max}'yi geçemez.`)
    const results = Object.fromEntries(students.map(s => {
      const r = resultValues[s.id] || {}
      return [s.id, { correct: Number(r.correct || 0), wrong: Number(r.wrong || 0), net: calcNet(r.correct, r.wrong) }]
    }))
    setExams(list => list.map(e => e.id === activeExam.id ? { ...e, results } : e))
    setResultOpen(false)
    setMessage('Sonuçlar kaydedildi.')
  }

  function examStatus(exam) {
    if (exam.isPassive) return { label: 'Pasif', color: 'error' }
    const now = new Date()
    if (now < new Date(exam.startAt)) return { label: 'Planlandı', color: 'info' }
    if (now > new Date(exam.endAt)) return { label: 'Süresi Geçti', color: 'error' }
    return { label: 'Aktif', color: 'success' }
  }

  function openLive(exam) { setActiveExam(exam); setLiveOpen(true) }
  function resetAttempt(studentId) {
    setExams(list => list.map(e => e.id === activeExam.id ? { ...e, attempts: { ...(e.attempts || {}), [studentId]: null } } : e))
    setActiveExam(e => ({ ...e, attempts: { ...(e.attempts || {}), [studentId]: null } }))
    setMessage('Öğrencinin sonucu iptal edildi; tekrar çözebilir.')
  }
  function togglePassive(exam) {
    setExams(list => list.map(e => e.id === exam.id ? { ...e, isPassive: !e.isPassive } : e))
  }

  const trendData = useMemo(() => classExams.slice(0, 7).reverse().map(e => {
    const values = e.kind === 'normal'
      ? Object.values(e.results || {}).map(r => Number(r.net || 0))
      : Object.values(e.attempts || {}).filter(Boolean).map(r => calcNet(r.correct, r.wrong))
    return { name: e.name, avg: values.length ? Number((values.reduce((a,b) => a+b, 0) / values.length).toFixed(2)) : 0 }
  }), [classExams])

  const successData = useMemo(() => {
    const exam = classExams.find(e => e.kind === 'normal' && Object.keys(e.results || {}).length)
    if (!exam) return { passed: 0, failed: 0, above: 0, below: 0, title: 'Sonuç girilmiş deneme yok' }
    const rows = students.map(s => ({ net: Number(exam.results?.[s.id]?.net || 0), target: Number(exam.targets?.[s.id] || 0) }))
    const avg = rows.length ? rows.reduce((a,b) => a + b.net, 0) / rows.length : 0
    return {
      passed: rows.filter(r => r.target > 0 && r.net >= r.target).length,
      failed: rows.filter(r => r.target > 0 && r.net < r.target).length,
      above: rows.filter(r => r.net >= avg).length,
      below: rows.filter(r => r.net < avg).length,
      title: exam.name
    }
  }, [classExams, students])

  if (loading || !examsCloudReady) return <Box className="loader compact"><CircularProgress /></Box>

  return <Box className="exams-page">
    <Box className="page-head exams-head">
      <Box><Typography variant="h4" fontWeight={950}>Denemeler</Typography><Typography color="text.secondary">5, 6, 7 ve 8. sınıflar için deneme yönetimi</Typography></Box>
    </Box>

    <Paper className="glass exams-classbar" elevation={0}>
      <FormControl fullWidth size="small"><InputLabel>Aktif sınıf</InputLabel><Select value={selectedClass} label="Aktif sınıf" onChange={e => setSelectedClass(e.target.value)}>
        {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
      </Select></FormControl>
      <Box className="homework-class-summary"><Groups/><Box><Typography fontWeight={900}>{classInfo?.name || 'Sınıf seçilmedi'}</Typography><Typography variant="caption" color="text.secondary">{students.length} aktif öğrenci</Typography></Box></Box>
    </Paper>

    <Stack direction="row" spacing={1.2} justifyContent="flex-end" className="exam-create-buttons">
      <Button size="small" color="success" variant="contained" startIcon={<Science/>} onClick={() => openNormal()} disabled={!selectedClass}>Deneme Oluştur</Button>
      <Button size="small" color="success" variant="contained" startIcon={<OnlinePrediction/>} onClick={() => openOnline()} disabled={!selectedClass}>Online Deneme Oluştur</Button>
    </Stack>

    <Paper className="glass exams-list-panel" elevation={0}>
      <Tabs value={tab} onChange={(_,v) => setTab(v)}><Tab label={`Normal Denemeler (${normalExams.length})`}/><Tab label={`Online Denemeler (${onlineExams.length})`}/></Tabs>
      <Box className="exam-list">
        {(tab === 0 ? normalExams : onlineExams).length === 0 ? <Box className="empty compact"><Assessment sx={{fontSize:52}}/><Typography fontWeight={900}>Bu sınıfta henüz deneme yok.</Typography></Box> :
          (tab === 0 ? normalExams : onlineExams).map(exam => <Paper key={exam.id} className="exam-item" elevation={0}>
            <Box className="exam-item-main"><Box className="exam-type-icon">{exam.kind === 'online' ? <OnlinePrediction/> : <Science/>}</Box><Box><Typography fontWeight={950}>{exam.name}</Typography><Typography variant="caption" color="text.secondary">{exam.kind === 'online' ? `${new Date(exam.startAt).toLocaleString('tr-TR')} – ${new Date(exam.endAt).toLocaleString('tr-TR')}` : `${formatDate(exam.date)} • ${exam.type === 'fen' ? 'Fen Denemesi' : 'Genel Deneme'}`}</Typography></Box></Box>
            {exam.kind === 'online' ? <Chip label={examStatus(exam).label} color={examStatus(exam).color} sx={{fontWeight:900}}/> : <ResultSummary exam={exam} students={students}/>} 
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap className="exam-buttons">
              {exam.kind === 'normal' ? <><Button size="small" startIcon={<TrackChanges/>} onClick={() => openTargets(exam)}>Hedef Gir</Button><Button size="small" startIcon={<Assessment/>} onClick={() => openResults(exam)}>Sonuç Gir</Button></> : <><Button size="small" startIcon={<MonitorHeart/>} onClick={() => openLive(exam)}>Canlı Takip</Button><Button size="small" startIcon={<Refresh/>} onClick={() => togglePassive(exam)}>{exam.isPassive ? 'Aktif Yap' : 'Pasif Yap'}</Button></>}
              <IconButton size="small" onClick={() => exam.kind === 'normal' ? openNormal(exam) : openOnline(exam)}><Edit/></IconButton><IconButton size="small" color="error" onClick={() => deleteExam(exam)}><Delete/></IconButton>
            </Stack>
          </Paper>)}
      </Box>
    </Paper>

    <Box className="exam-charts-grid"><TrendChart data={trendData}/><SuccessChart data={successData}/></Box>

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editing ? 'Denemeyi Düzenle' : 'Deneme Oluştur'}<IconButton className="dialog-close" onClick={() => setCreateOpen(false)}><Close/></IconButton></DialogTitle><DialogContent dividers><Stack spacing={2} sx={{pt:1}}>
      <FormControl fullWidth><InputLabel>Deneme türü</InputLabel><Select value={form.type} label="Deneme türü" onChange={e => setForm({...form,type:e.target.value})}><MenuItem value="fen">Fen Denemesi</MenuItem><MenuItem value="general">Genel Deneme</MenuItem></Select></FormControl>
      <TextField label="Deneme adı" value={form.name} onChange={e => setForm({...form,name:e.target.value})}/><TextField type="date" label="Deneme tarihi" value={form.date} onChange={e => setForm({...form,date:e.target.value})} InputLabelProps={{shrink:true}}/>
      <Alert severity="info">Sınıf: {classInfo?.name}. Sınıf listesinde yalnızca aktif sınıflar bulunur.</Alert>
    </Stack></DialogContent><DialogActions><Button onClick={() => setCreateOpen(false)}>İptal</Button><Button variant="contained" startIcon={<Save/>} onClick={saveNormal}>Kaydet</Button></DialogActions></Dialog>

    <Dialog open={onlineOpen} onClose={() => setOnlineOpen(false)} fullWidth maxWidth="md"><DialogTitle>{editing ? 'Online Denemeyi Düzenle' : 'Online Deneme Oluştur'}<IconButton className="dialog-close" onClick={() => setOnlineOpen(false)}><Close/></IconButton></DialogTitle><DialogContent dividers><Stack spacing={2} sx={{pt:1}}>
      <TextField label="Deneme adı" value={onlineForm.name} onChange={e => setOnlineForm({...onlineForm,name:e.target.value})}/><Box className="online-time-grid"><TextField type="datetime-local" label="Başlangıç" value={onlineForm.startAt} onChange={e => setOnlineForm({...onlineForm,startAt:e.target.value})} InputLabelProps={{shrink:true}}/><TextField type="datetime-local" label="Bitiş" value={onlineForm.endAt} onChange={e => setOnlineForm({...onlineForm,endAt:e.target.value})} InputLabelProps={{shrink:true}}/></Box>
      <Typography variant="h6" fontWeight={950}>20 Soruluk Cevap Anahtarı</Typography><Box className="answer-key-grid">{[1,11].map(start => <Box key={start} className="answer-key-column">{Array.from({length:10},(_,i)=>start+i).map(q => <Box className="answer-key-row" key={q}><b>{q}</b>{ANSWERS.map(a => <Button key={a} size="small" variant={onlineForm.answers[q]===a?'contained':'outlined'} onClick={() => setOnlineForm({...onlineForm,answers:{...onlineForm.answers,[q]:a}})}>{a}</Button>)}</Box>)}</Box>)}</Box>
    </Stack></DialogContent><DialogActions><Button onClick={() => setOnlineOpen(false)}>İptal</Button><Button variant="contained" startIcon={<Save/>} onClick={saveOnline}>Kaydet</Button></DialogActions></Dialog>

    <Dialog open={targetOpen} onClose={() => setTargetOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Hedef Net Gir – {activeExam?.name}<IconButton className="dialog-close" onClick={() => setTargetOpen(false)}><Close/></IconButton></DialogTitle><DialogContent dividers><Stack spacing={1.2}>{students.map(s => <Box className="student-input-row" key={s.id}><Box><Typography fontWeight={850}>{s.student_number} • {s.first_name} {s.last_name}</Typography></Box><TextField size="small" type="number" label="Hedef net" value={targetValues[s.id] ?? ''} onChange={e => setTargetValues({...targetValues,[s.id]:e.target.value})} inputProps={{min:0,max:activeExam?.type==='fen'?20:80,step:.25}}/></Box>)}</Stack></DialogContent><DialogActions><Button onClick={() => setTargetOpen(false)}>İptal</Button><Button variant="contained" onClick={saveTargets}>Kaydet</Button></DialogActions></Dialog>

    <Dialog open={resultOpen} onClose={() => setResultOpen(false)} fullWidth maxWidth="md"><DialogTitle>Sonuç Gir – {activeExam?.name}<IconButton className="dialog-close" onClick={() => setResultOpen(false)}><Close/></IconButton></DialogTitle><DialogContent dividers><Alert severity="info" sx={{mb:2}}>Enter tuşu bir sonraki kutuya geçer. Doğru + yanlış toplamı 20'yi geçemez.</Alert><Stack spacing={1}>{students.map((s,index) => { const r=resultValues[s.id]||{}; const total=Number(r.correct||0)+Number(r.wrong||0); const max=20; return <Box className={`result-entry-row ${total>max?'invalid':''}`} key={s.id}><Typography fontWeight={850}>{s.student_number} • {s.first_name} {s.last_name}</Typography><TextField inputRef={el => resultRefs.current[index*2]=el} size="small" type="number" label="Doğru" value={r.correct??''} onChange={e=>updateResult(s.id,'correct',e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();resultRefs.current[index*2+1]?.focus()}}}/><TextField inputRef={el => resultRefs.current[index*2+1]=el} size="small" type="number" label="Yanlış" value={r.wrong??''} onChange={e=>updateResult(s.id,'wrong',e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();resultRefs.current[index*2+2]?.focus()}}}/><Box className="net-box"><small>Net</small><b>{calcNet(r.correct,r.wrong)}</b></Box></Box>})}</Stack></DialogContent><DialogActions><Button onClick={() => setResultOpen(false)}>İptal</Button><Button variant="contained" onClick={saveResults}>Kaydet</Button></DialogActions></Dialog>

    <Dialog open={liveOpen} onClose={() => setLiveOpen(false)} fullWidth maxWidth="lg"><DialogTitle>Canlı Takip – {activeExam?.name}<IconButton className="dialog-close" onClick={() => setLiveOpen(false)}><Close/></IconButton></DialogTitle><DialogContent dividers><Stack spacing={1}>{students.map(s => { const attempt=activeExam?.attempts?.[s.id]; return <Box className="live-student-row" key={s.id}><Box className="live-student-main"><Typography fontWeight={900}>{s.student_number} • {s.first_name} {s.last_name}</Typography><Typography variant="caption" color="text.secondary">{attempt ? `Tamamladı • ${calcNet(attempt.correct, attempt.wrong)} net` : 'Henüz başlamadı / tekrar çözebilir'}</Typography></Box><Box className="live-student-actions"><Button variant="outlined" disabled={!attempt?.answers} onClick={()=>setAnswerDetail({student:s,attempt,exam:activeExam})}>Cevapları Gör</Button><Button color="error" variant="outlined" disabled={!attempt} onClick={() => resetAttempt(s.id)}>Tekrar Çözdür</Button></Box></Box>})}</Stack></DialogContent><DialogActions><Button onClick={() => setLiveOpen(false)}>Kapat</Button></DialogActions></Dialog>


    <Dialog open={!!answerDetail} onClose={()=>setAnswerDetail(null)} fullWidth maxWidth="md"><DialogTitle>{answerDetail?.student?.first_name} {answerDetail?.student?.last_name} – Cevap Detayı<IconButton className="dialog-close" onClick={()=>setAnswerDetail(null)}><Close/></IconButton></DialogTitle><DialogContent dividers><Box className="answer-review-grid">{Array.from({length:20},(_,i)=>i+1).map(q=>{const selected=answerDetail?.attempt?.answers?.[q];const correct=answerDetail?.exam?.answers?.[q];const state=!selected?'blank':selected===correct?'correct':'wrong';return <Paper elevation={0} className={`answer-review-item ${state}`} key={q}><b>{q}</b><span>Doğru: {correct||'-'}</span><span>Öğrenci: {selected||'Boş'}</span><Chip size="small" color={state==='correct'?'success':state==='wrong'?'error':'default'} label={state==='correct'?'Doğru':state==='wrong'?'Yanlış':'Boş'}/></Paper>})}</Box></DialogContent><DialogActions><Button onClick={()=>setAnswerDetail(null)}>Kapat</Button></DialogActions></Dialog>
    <Snackbar open={!!message} autoHideDuration={2800} onClose={() => setMessage('')} message={message}/>
    <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError('')}><Alert severity="error" onClose={() => setError('')}>{error}</Alert></Snackbar>
  </Box>
}

function ResultSummary({ exam, students }) {
  const rows = students.map(s => ({ net:Number(exam.results?.[s.id]?.net || 0), target:Number(exam.targets?.[s.id] || 0) }))
  const entered = rows.filter(r => r.net !== 0 || r.target !== 0)
  const avg = entered.length ? entered.reduce((a,b)=>a+b.net,0)/entered.length : 0
  const passed = rows.filter(r => r.target > 0 && r.net >= r.target).length
  return <Stack direction="row" spacing={1}><Chip size="small" label={`Ort. ${avg.toFixed(2)} net`} color="primary" variant="outlined"/><Chip size="small" label={`${passed} hedef geçti`} color="success" variant="outlined"/></Stack>
}

function TrendChart({ data }) {
  const max = Math.max(20, ...data.map(d => d.avg))
  const points = data.map((d,i) => `${42 + i*(420/Math.max(1,data.length-1))},${190-(d.avg/max)*145}`).join(' ')
  return <Paper className="glass exam-chart-card" elevation={0}><Box className="chart-card-head"><Box><Typography variant="h6" fontWeight={950}>Son 7 Deneme Performansı</Typography><Typography variant="caption" color="text.secondary">Fen, genel ve online denemelerin sınıf ortalama netleri</Typography></Box><QueryStats/></Box><svg viewBox="0 0 500 235" className="exam-svg"><text x="14" y="120" transform="rotate(-90 14 120)" className="chart-axis-title">Sınıf Ortalama Neti</text>{[45,80,115,150,185].map(y=><line key={y} x1="42" y1={y} x2="470" y2={y} className="chart-gridline"/>)}{data.length>1&&<polyline points={points} fill="none" className="chart-line"/>}{data.map((d,i)=>{const x=42+i*(420/Math.max(1,data.length-1));const y=190-(d.avg/max)*145;return <g key={i}><circle cx={x} cy={y} r="5" className="chart-dot"/><text x={x} y={y-10} textAnchor="middle" className="chart-value">{d.avg}</text><text x={x} y="215" textAnchor="middle" className="chart-label">{d.name.length>9?d.name.slice(0,8)+'…':d.name}</text></g>})}<text x="255" y="232" textAnchor="middle" className="chart-axis-title">Deneme Adı</text></svg></Paper>
}

function SuccessChart({ data }) {
  const rows=[['Hedefini Geçen',data.passed,'success'],['Hedefine Ulaşamayan',data.failed,'danger'],['Ortalama Üzeri',data.above,'primary'],['Ortalama Altı',data.below,'warning']]
  const max=Math.max(1,...rows.map(r=>r[1]))
  return <Paper className="glass exam-chart-card" elevation={0}><Box className="chart-card-head"><Box><Typography variant="h6" fontWeight={950}>Başarı Dağılımı</Typography><Typography variant="caption" color="text.secondary">{data.title}</Typography></Box><Assessment/></Box><Box className="success-chart"><div className="success-y-title">Öğrenci Sayısı</div><Box className="success-bars">{rows.map(([label,val,tone])=><Box className="success-bar-item" key={label}><Box className="success-bar-track"><Box className={`success-bar ${tone}`} sx={{height:`${Math.max(8,(val/max)*155)}px`}}><b>{val}</b></Box></Box><Typography variant="caption" fontWeight={800}>{label}</Typography></Box>)}</Box><Typography className="success-x-title">Başarı Kategorisi</Typography></Box></Paper>
}
