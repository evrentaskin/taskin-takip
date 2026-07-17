import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Stack,
  TextField, Typography
} from '@mui/material'
import {
  AutoAwesome, EmojiEvents, Menu, PlayArrow, Search,
  TrendingDown, TrendingUp
} from '@mui/icons-material'
import { supabase } from '../services/supabase'

const EXAMS_KEY = 'taskin-akademi-v64-exams'
const HOMEWORK_KEY = 'taskin-akademi-v64-homeworks'
const PLUS_KEY = 'taskin-akademi-v64-plus-records'
const safeLoad = key => { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } }
const dateOf = e => e.date || e.startAt || e.createdAt || ''
const monthBounds = () => {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  }
}
const inRange = (value, start, end) => {
  if (!value) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date >= start && date <= end
}

function calculateMonthlyRanking(students, classId) {
  const { start, end } = monthBounds()
  const homeworks = safeLoad(HOMEWORK_KEY).filter(h => h.classId === classId && inRange(h.createdAt || h.dueDate, start, end))
  const exams = safeLoad(EXAMS_KEY).filter(e => e.classId === classId && inRange(dateOf(e), start, end))
  const plusRecords = safeLoad(PLUS_KEY).filter(p => p.classId === classId && inRange(p.createdAt, start, end))

  return students.map(student => {
    let score = 0
    homeworks.forEach(homework => {
      const status = homework.statuses?.[student.id]
      if (status === 'done') score += 10
      if (status === 'missing') score -= 10
    })
    plusRecords.filter(record => record.studentId === student.id)
      .forEach(record => { score += 10 * Number(record.amount || 1) })
    exams.filter(exam => exam.kind === 'online').forEach(exam => {
      score += exam.attempts?.[student.id] ? 10 : -10
    })
    exams.filter(exam => exam.kind === 'normal' && exam.type === 'fen').forEach(exam => {
      const net = Number(exam.results?.[student.id]?.net || 0)
      const target = Number(exam.targets?.[student.id] || 0)
      score += net >= target ? 10 : -10
      const classNets = students.map(item => Number(exam.results?.[item.id]?.net || 0))
      const average = classNets.reduce((sum, value) => sum + value, 0) / Math.max(1, classNets.length)
      if (net > average) score += 10
    })
    return {
      id: student.id,
      name: `${student.first_name} ${student.last_name}`,
      points: score,
      number: Number(student.student_number)
    }
  }).sort((a, b) => b.points - a.points || a.number - b.number).slice(0, 5)
}

const fmt = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const onlineTotalNetForDashboard = participant => ['turkish','history','religion','english','math','science'].reduce((sum,key)=>sum+Number(participant?.lessonResults?.[key]?.net ?? participant?.[`${key}_net`] ?? 0),0)

function LineChart({ values = [] }) {
  const width = 640
  const height = 250
  const pad = { left: 54, right: 20, top: 24, bottom: 76 }
  const usableW = width - pad.left - pad.right
  const usableH = height - pad.top - pad.bottom

  if (!values.length) return <EmptyChart text="Henüz deneme verisi yok" />

  const nums = values.map(item => Number(item.value)).filter(Number.isFinite)
  const min = Math.min(...nums, 0)
  const max = Math.max(...nums, 1)
  const span = Math.max(1, max - min)
  const x = (index) => values.length === 1 ? pad.left + 34 : pad.left + 24 + (index / Math.max(1, values.length - 1)) * (usableW - 48)
  const y = (value) => pad.top + usableH - ((value - min) / span) * usableH
  const points = values.map((item, index) => `${x(index)},${y(Number(item.value))}`).join(' ')

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Son 5 deneme sınıf ortalaması çizgi grafiği">
        {[0, .25, .5, .75, 1].map((ratio) => {
          const yy = pad.top + usableH * ratio
          const label = max - span * ratio
          return (
            <g key={ratio}>
              <line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="chart-grid" />
              <text x={pad.left - 10} y={yy + 4} textAnchor="end" className="chart-axis-text">{fmt(label)}</text>
            </g>
          )
        })}
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={height - pad.bottom} className="chart-axis" />
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} className="chart-axis" />
        <polyline points={points} fill="none" className="chart-line" />
        {values.map((item, index) => (
          <g key={`${item.label}-${index}`}>
            <circle cx={x(index)} cy={y(Number(item.value))} r="6" className="chart-dot" />
            <text x={x(index)} y={y(Number(item.value)) - 13} textAnchor="middle" className="chart-value">
              {fmt(item.value)}
            </text>
            <text x={x(index)} y={height - pad.bottom + 22} textAnchor="middle" className="chart-label">
              {(item.label || item.shortLabel || '').length > 15 ? `${(item.label || item.shortLabel).slice(0, 14)}…` : (item.label || item.shortLabel)}
            </text>
          </g>
        ))}
        <text x="16" y={height / 2} transform={`rotate(-90 16 ${height / 2})`} textAnchor="middle" className="chart-title">
          Sınıf Ortalama Neti
        </text>
        <text x={width / 2} y={height - 10} textAnchor="middle" className="chart-title">
          Denemeler
        </text>
      </svg>
    </div>
  )
}

function BarChart({ stats }) {
  const values = [
    { label: 'En Düşük', value: stats?.min, className: 'bar-low' },
    { label: 'Ortalama', value: stats?.avg, className: 'bar-avg' },
    { label: 'En Yüksek', value: stats?.max, className: 'bar-high' }
  ].filter(item => Number.isFinite(Number(item.value)))

  if (!values.length) return <EmptyChart text="Son deneme verisi yok" />

  const max = Math.max(...values.map(item => Number(item.value)), 1)

  return (
    <div className="bar-chart" role="img" aria-label="Son deneme en düşük, ortalama ve en yüksek net sütun grafiği">
      <div className="bar-y-title">Net</div>
      <div className="bar-plot">
        {[1, .75, .5, .25, 0].map(ratio => (
          <div className="bar-grid-row" key={ratio}>
            <span>{fmt(max * ratio)}</span>
            <i />
          </div>
        ))}
        <div className="bars">
          {values.map(item => (
            <div className="bar-item" key={item.label}>
              <strong>{fmt(item.value)}</strong>
              <div className={`bar-column ${item.className}`} style={{ height: `${clamp(Number(item.value) / max * 100, 5, 100)}%` }} />
              <small>{item.label}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyChart({ text }) {
  return (
    <div className="empty-chart">
      <Typography fontWeight={900}>{text}</Typography>
      <Typography variant="body2" color="text.secondary">İlgili modüle veri girildiğinde grafik otomatik oluşacak.</Typography>
    </div>
  )
}

export default function DashboardPage({ onNavigate, onOpenStudent, onOpenMenu, onLogout }) {
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [students, setStudents] = useState([])
  const [allStudents, setAllStudents] = useState([])
  const [search, setSearch] = useState('')
  const [searchError, setSearchError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [examTrend, setExamTrend] = useState([])
  const [latestStats, setLatestStats] = useState(null)
  const [topStudents, setTopStudents] = useState([])
  const [latestExamName, setLatestExamName] = useState('Henüz deneme yok')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTitle, setAiTitle] = useState('')
  const [aiText, setAiText] = useState('')
  const [movement, setMovement] = useState([])

  useEffect(() => { loadClasses() }, [])
  useEffect(() => {
    if (selectedClass) loadClassDashboard(selectedClass)
  }, [selectedClass])

  useEffect(() => {
    if (!selectedClass || !students.length) return
    const refresh = () => setTopStudents(calculateMonthlyRanking(students, selectedClass))
    refresh()
    const timer = window.setInterval(refresh, 10000)
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [selectedClass, students])

  async function loadClasses() {
    setLoading(true)
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    const [{ data, error }, { data: activeData, error: activeError }] = await Promise.all([
      supabase.from('classes').select('id,name,sort_order,is_lgs').order('sort_order'),
      user
        ? supabase.from('teacher_active_classes').select('class_id').eq('teacher_id', user.id)
        : Promise.resolve({ data: [], error: null })
    ])

    if (error || activeError) {
      setError(error?.message || activeError?.message)
      setLoading(false)
      return
    }

    const activeIds = new Set((activeData ?? []).map(item => item.class_id))
    const visible = activeIds.size
      ? (data ?? []).filter(item => activeIds.has(item.id))
      : (data ?? []).filter(item => !item.is_lgs).slice(0, 4)

    setClasses(visible)
    if (visible.length) {
      setSelectedClass(visible[0].id)
      const visibleIds = visible.map(item => item.id)
      const { data: allStudentData, error: allStudentError } = await supabase
        .from('students')
        .select('id,student_number,first_name,last_name,username,class_id,classes(id,name,is_lgs)')
        .in('class_id', visibleIds)
        .eq('is_active', true)
        .order('student_number')
      if (allStudentError) setError(allStudentError.message)
      else setAllStudents(allStudentData || [])
    } else setLoading(false)
  }

  async function loadClassDashboard(classId) {
    setLoading(true)
    setError('')
    setExamTrend([])
    setLatestStats(null)
    setTopStudents([])
    setLatestExamName('Henüz deneme yok')
    setMovement([])

    try {
      const selected = classes.find(item => item.id === classId)
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id,student_number,first_name,last_name,username')
        .eq('class_id', classId)
        .eq('is_active', true)
        .order('student_number')

      if (studentError) throw studentError
      setStudents(studentData ?? [])
      setTopStudents(calculateMonthlyRanking(studentData ?? [], classId))

      // 5–8. sınıflarda normal ve online denemeleri tek zaman çizelgesinde birleştir.
      // Türüne bakmadan tarih olarak en son eklenen/yapılan deneme ana sayfaya yansır.
      if (!selected?.is_lgs) {
        const allExams = safeLoad(EXAMS_KEY)
          .filter(exam => exam.classId === classId)
          .map(exam => {
            const source = exam.kind === 'online' ? (exam.attempts || {}) : (exam.results || {})
            const nets = Object.values(source).map(row => {
              if (Number.isFinite(Number(row?.net))) return Number(row.net)
              return Number(row?.correct || 0) - Number(row?.wrong || 0) / 3
            }).filter(Number.isFinite)
            return { ...exam, dashboardDate: dateOf(exam), nets }
          })
          .filter(exam => exam.dashboardDate && exam.nets.length)
          .sort((a, b) => new Date(a.dashboardDate) - new Date(b.dashboardDate))

        const recent = allExams.slice(-5)
        setExamTrend(recent.map((exam) => ({
          label: exam.name,
          shortLabel: exam.name,
          value: exam.nets.reduce((sum, value) => sum + value, 0) / exam.nets.length
        })))
        const changes = (studentData ?? []).map(student => {
          const entered = allExams.filter(exam => {
            const row = exam.kind === 'online' ? exam.attempts?.[student.id] : exam.results?.[student.id]
            return row && Number.isFinite(Number(row.net ?? (Number(row.correct || 0) - Number(row.wrong || 0) / 3)))
          })
          if (entered.length < 2) return null
          const previous = entered.at(-2), latest = entered.at(-1)
          const valueOf = exam => { const row = exam.kind === 'online' ? exam.attempts?.[student.id] : exam.results?.[student.id]; return Number(row.net ?? (Number(row.correct || 0) - Number(row.wrong || 0) / 3)) }
          return { id: student.id, name: `${student.first_name} ${student.last_name}`, netDelta: valueOf(latest) - valueOf(previous), scoreDelta: null }
        }).filter(Boolean)
        setMovement(changes)
        const latest = allExams.at(-1)
        if (latest) {
          setLatestExamName(latest.name)
          setLatestStats({
            min: Math.min(...latest.nets),
            max: Math.max(...latest.nets),
            avg: latest.nets.reduce((sum, value) => sum + value, 0) / latest.nets.length
          })
        }
      }

      // LGS sınıfı seçilmişse son 5 denemeyi gerçek veritabanı sonuçlarından üretir.
      // LGS sınıfı seçilmişse son 5 denemeyi ve puan sıralamasını gerçek veriden üretir.
      if (selected?.is_lgs && studentData?.length) {
        const ids = studentData.map(item => item.id)
        const { data: resultData, error: resultError } = await supabase
          .from('lgs_results')
          .select('exam_id,student_id,total_net,score,rank,student_name,lgs_exams(id,name,exam_date)')
          .in('student_id', ids)

        if (resultError) throw resultError

        const grouped = new Map()
        for (const row of resultData ?? []) {
          const exam = row.lgs_exams
          if (!exam) continue
          if (!grouped.has(exam.id)) grouped.set(exam.id, { exam, rows: [] })
          grouped.get(exam.id).rows.push(row)
        }

        const exams = [...grouped.values()]
          .sort((a, b) => `${a.exam.exam_date}`.localeCompare(`${b.exam.exam_date}`))
          .slice(-5)

        const localOnline = (() => { try { return JSON.parse(localStorage.getItem('lgsOnlineExams') || '[]') } catch { return [] } })()
        const onlineTimeline = localOnline.map(exam => ({
          exam:{ id:`online-${exam.id}`, name:exam.name, exam_date:exam.date, isOnline:true },
          rows:(exam.participants || []).filter(p => p.finishedAt || String(p.status || '').includes('Kaydedildi')).map(p => ({ student_id:p.studentId, total_net:Number(p.totalNet ?? onlineTotalNetForDashboard(p)), score:Number(p.score || 0) }))
        })).filter(item => item.rows.length)
        const fullTimeline = [...grouped.values(), ...onlineTimeline].sort((a,b)=>String(a.exam.exam_date||'').localeCompare(String(b.exam.exam_date||'')))
        const recentAll = fullTimeline.slice(-5)
        setExamTrend(recentAll.map((item) => ({
          label: item.exam.name,
          shortLabel: item.exam.name,
          value: item.rows.reduce((sum, row) => sum + Number(row.total_net || 0), 0) / Math.max(1, item.rows.length)
        })))
        const changes = (studentData ?? []).map(student => {
          const entries = fullTimeline.map(item => {
            const row = item.rows.find(r => String(r.student_id) === String(student.id))
            return row ? { date:item.exam.exam_date, net:Number(row.total_net || 0), score:Number(row.score || 0) } : null
          }).filter(Boolean)
          if (entries.length < 2) return null
          return { id:student.id, name:`${student.first_name} ${student.last_name}`, netDelta:entries.at(-1).net-entries.at(-2).net, scoreDelta:entries.at(-1).score-entries.at(-2).score }
        }).filter(Boolean)
        setMovement(changes)

        const latest = fullTimeline.at(-1)
        if (latest) {
          const nets = latest.rows.map(row => Number(row.total_net)).filter(Number.isFinite)
          setLatestExamName(latest.exam.name)
          setLatestStats({
            min: Math.min(...nets),
            max: Math.max(...nets),
            avg: nets.reduce((sum, value) => sum + value, 0) / Math.max(1, nets.length)
          })
        }
      }
    } catch (err) {
      setError(err?.message || 'Ana sayfa verileri yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }

  const selectedClassName = classes.find(item => item.id === selectedClass)?.name || ''
  const selectedIsLgs = classes.find(item => item.id === selectedClass)?.is_lgs

  const nowText = new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(new Date())

  const searchMatch = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    if (!q) return null
    const exactNumber = allStudents.find(student => String(student.student_number).trim() === search.trim())
    if (exactNumber) return exactNumber
    return allStudents.find(student =>
      `${student.student_number} ${student.first_name} ${student.last_name} ${student.username || ''} ${student.classes?.name || ''}`
        .toLocaleLowerCase('tr-TR').includes(q)
    )
  }, [allStudents, search])

  function openSearchedStudent() {
    setSearchError('')
    if (!search.trim()) { setSearchError('Öğrenci numarasını yazın.'); return }
    if (!searchMatch) { setSearchError('Aktif 5, 6, 7 ve 8. sınıflarda bu numarayla öğrenci bulunamadı.'); return }
    onOpenStudent?.(searchMatch.id)
  }


  const rising = [...movement].filter(item => item.netDelta > 0).sort((a,b) => b.netDelta-a.netDelta).slice(0,5)
  const falling = [...movement].filter(item => item.netDelta < 0).sort((a,b) => a.netDelta-b.netDelta).slice(0,5)

  function openAi(kind) {
    const className = selectedClassName || 'Sınıf'
    const avg = latestStats?.avg
    const up = rising[0]
    const down = falling[0]
    const texts = {
      student: `${className} için son deneme ortalaması ${fmt(avg)} net. ${up ? `En belirgin yükseliş ${up.name}: +${fmt(up.netDelta)} net.` : 'Yükseliş karşılaştırması için yeterli veri yok.'} ${down ? `Öncelikli izlenecek öğrenci ${down.name}: ${fmt(down.netDelta)} net değişim.` : ''}`,
      homework: `${className} sınıfında ödev kayıtları ve son deneme sonuçları birlikte değerlendirilmelidir. Son ortalama ${fmt(avg)} net. Eksik ödevi bulunan öğrencilerle düşüş yaşayan öğrenciler önceliklendirilsin.`,
      weekly: `${className} için haftalık öneri: Pazartesi konu tekrarı, Salı 20 soruluk uygulama, Çarşamba yanlış analizi, Perşembe kısa deneme, Cuma eksik kazanım çalışması. ${down ? `${down.name} için ayrıca bireysel 20 dakikalık tekrar planı oluşturulsun.` : ''}`
    }
    setAiTitle(kind === 'student' ? 'Sınıf Analizi' : kind === 'homework' ? 'Ders ve Ödev Analizi' : 'Haftalık Çalışma Programı')
    setAiText(texts[kind])
    setAiOpen(true)
  }

  return (
    <Box className="home-shell">
      <Box className="home-topbar glass">
        <Stack direction="row" spacing={1.5} alignItems="center">
          <IconButton onClick={onOpenMenu} className="home-menu-button"><Menu /></IconButton>
          <img className="home-brand-logo" src="/taskin-takip-sistemi-logo.png" alt="Taşkın Takip Sistemi logosu" />
          <Box>
            <Typography fontWeight={950}>TAŞKIN • Takip Sistemi</Typography>
            <Typography variant="caption" color="text.secondary">{nowText}</Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" className="home-search-area">
          <TextField size="small" placeholder="5, 6, 7 veya 8. sınıftan öğrenci no" value={search}
            onChange={(event) => { setSearch(event.target.value); setSearchError('') }} onKeyDown={(event) => { if (event.key === 'Enter') openSearchedStudent() }} className="home-search" />
          <Button variant="contained" className="home-find-button" startIcon={<Search />}
            onClick={openSearchedStudent}>
            {searchMatch ? `${searchMatch.first_name}` : 'Bul'}
          </Button>
          <Button variant="contained" color="error" className="home-exit-button" onClick={onLogout}>
            Çıkış
          </Button>
        </Stack>
      </Box>
      {searchError && <Alert severity="warning" onClose={() => setSearchError('')} sx={{ mt: 1 }}>{searchError}</Alert>}

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mt: 1 }}>{error}</Alert>}

      <Stack direction="row" spacing={1} className="home-class-tabs">
        {classes.map(item => (
          <button key={item.id}
            className={`home-class-chip ${selectedClass === item.id ? 'active' : ''}`}
            onClick={() => setSelectedClass(item.id)}>
            {item.name}
          </button>
        ))}
      </Stack>

      {loading ? (
        <Box className="glass home-loading"><CircularProgress /><Typography>Yükleniyor...</Typography></Box>
      ) : (
        <Stack spacing={2}>
          <Box className="glass month-students-card">
            <div className="section-heading">
              <div>
                <Typography variant="h6" fontWeight={950}>Ayın Öğrencileri — {selectedClassName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Ödev, artı, online katılımı ve fen hedeflerine göre canlı aylık ilk 5
                </Typography>
              </div>
              <EmojiEvents className="section-cup" />
            </div>
            <div className="ranking-list">
              {(topStudents.length ? topStudents : Array.from({ length: 5 }, (_, index) => ({
                id: `empty-${index}`, name: `${index + 1}. öğrenci henüz belirlenmedi`, points: null
              }))).map((student, index) => (
                <div className={`ranking-row rank-${index + 1}`} key={student.id}>
                  <span className="rank-number">{index === 0 ? <EmojiEvents /> : index + 1}</span>
                  <strong>{student.name}</strong>
                  <span>{student.points == null ? '—' : `${fmt(student.points)} puan`}</span>
                </div>
              ))}
            </div>
          </Box>

          <Box className="two-dashboard-cards">
            <Box className="glass action-card">
              <Typography variant="h6" fontWeight={950}>Yaklaşan Ödev</Typography>
              <Typography color="text.secondary">
                Yaklaşan ve tarihi geçmemiş ödevler burada gösterilecek.
              </Typography>
              <Button variant="outlined" onClick={() => onNavigate('Ödevler')}>Ödevlere Git</Button>
            </Box>
            <Box className="glass action-card online-card">
              <Typography variant="h6" fontWeight={950}>Online Deneme</Typography>
              <Typography color="text.secondary">
                Aktif online deneme başladığında tarih, saat ve geri sayım burada görünecek.
              </Typography>
              <Button variant="contained" startIcon={<PlayArrow />} onClick={() => onNavigate('Denemeler')}>
                Online Denemelere Git
              </Button>
            </Box>
          </Box>

          <Box className="dashboard-chart-grid">
            <Box className="glass chart-card">
              <Typography variant="h6" fontWeight={950}>Son 5 Deneme — Sınıf Ortalaması</Typography>
              <Typography variant="body2" color="text.secondary">Fen, genel veya online denemelerin ortalama net gelişimi</Typography>
              <LineChart values={examTrend} />
            </Box>
            <Box className="glass chart-card">
              <Typography variant="h6" fontWeight={950}>Son Deneme Dağılımı</Typography>
              <Typography variant="body2" color="text.secondary">{latestExamName}</Typography>
              <BarChart stats={latestStats} />
            </Box>
          </Box>

          <Box className="glass ai-support-section">
            <div className="section-heading">
              <div>
                <Typography variant="h6" fontWeight={950}>Yapay Zekâ Destek Merkezi</Typography>
                <Typography variant="body2" color="text.secondary">{selectedClassName} sınıfına özel öneriler</Typography>
              </div>
              <AutoAwesome className="ai-heading-icon" />
            </div>
            <div className="ai-card-grid">
              <button className="ai-support-card" onClick={() => openAi('student')}>
                <strong>Sınıf Analizi</strong>
                <span>Riskli ve yükselişteki öğrencileri incele</span>
              </button>
              <button className="ai-support-card" onClick={() => openAi('homework')}>
                <strong>Ders ve Ödev Analizi</strong>
                <span>Eksik konulara göre ödev önerisi üret</span>
              </button>
              <button className="ai-support-card" onClick={() => openAi('weekly')}>
                <strong>Haftalık Çalışma Programı</strong>
                <span>Sınıfın netlerine göre haftalık plan hazırla</span>
              </button>
            </div>
          </Box>

          <Box className="dashboard-chart-grid">
            <Box className="glass movement-card">
              <Typography variant="h6" fontWeight={950}><TrendingUp /> En Fazla Yükselen 5 Öğrenci</Typography>
              <div className="movement-list">
                {(rising.length ? rising : Array.from({ length: 5 }, (_, i) => ({ id: i, name: 'Veri bekleniyor', points: null })))
                  .map((item, index) => (
                    <div key={item.id}><span>{index + 1}</span><strong>{item.name}</strong><em>{item.netDelta == null ? '—' : `${item.netDelta > 0 ? '+' : ''}${fmt(item.netDelta)} net${item.scoreDelta != null ? ` • ${item.scoreDelta > 0 ? '+' : ''}${fmt(item.scoreDelta)} puan` : ''}`}</em></div>
                  ))}
              </div>
            </Box>
            <Box className="glass movement-card">
              <Typography variant="h6" fontWeight={950}><TrendingDown /> En Fazla Düşüş Yaşayan 5 Öğrenci</Typography>
              <div className="movement-list">
                {(falling.length ? falling : Array.from({ length: 5 }, (_, i) => ({ id: i, name: 'Veri bekleniyor', points: null })))
                  .map((item, index) => (
                    <div key={item.id}><span>{index + 1}</span><strong>{item.name}</strong><em>{item.netDelta == null ? '—' : `${item.netDelta > 0 ? '+' : ''}${fmt(item.netDelta)} net${item.scoreDelta != null ? ` • ${item.scoreDelta > 0 ? '+' : ''}${fmt(item.scoreDelta)} puan` : ''}`}</em></div>
                  ))}
              </div>
            </Box>
          </Box>
        </Stack>
      )}
      <Dialog open={aiOpen} onClose={() => setAiOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={950}>{aiTitle}</DialogTitle>
        <DialogContent dividers><Typography sx={{ whiteSpace:'pre-line', lineHeight:1.8 }}>{aiText}</Typography></DialogContent>
      </Dialog>
    </Box>
  )
}
