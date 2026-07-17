import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Divider, Stack, Typography } from '@mui/material'
import { ArrowBack, Assignment, AutoStories, Comment, EmojiEvents, PictureAsPdf, Quiz, School, Star } from '@mui/icons-material'
import html2pdf from 'html2pdf.js'
import { supabase } from '../services/supabase'

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback }
}
const fmtDate = value => value ? new Date(value.includes?.('T') ? value : `${value}T12:00:00`).toLocaleDateString('tr-TR') : '—'
const num = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '—'

export default function StudentDetailPage({ studentId, onBack }) {
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reportRef = useRef(null)

  useEffect(() => { loadStudent() }, [studentId])

  async function loadStudent() {
    setLoading(true); setError('')
    const { data, error } = await supabase
      .from('students')
      .select('id,student_number,first_name,last_name,username,class_id,is_active,classes(id,name,is_lgs)')
      .eq('id', studentId)
      .single()
    if (error) setError(error.message)
    else setStudent(data)
    setLoading(false)
  }

  const data = useMemo(() => {
    if (!student) return null
    const homeworks = load('taskin-akademi-v64-homeworks', []).filter(x => x.classId === student.class_id)
    const homeworkRows = homeworks.map(item => ({
      name: item.name || item.title || 'Ödev',
      date: item.dueDate || item.createdAt,
      status: item.statuses?.[student.id] || 'unknown'
    }))
    const exams = load('taskin-akademi-v64-exams', []).filter(x => x.classId === student.class_id)
    const examRows = exams.map(item => {
      const result = item.results?.[student.id] || item.attempts?.[student.id] || null
      return {
        name: item.name || item.title || 'Deneme', kind: item.kind || item.type || 'deneme', date: item.date || item.startAt || item.createdAt,
        correct: result?.correct ?? result?.totalCorrect, wrong: result?.wrong ?? result?.totalWrong,
        net: result?.net ?? result?.totalNet, score: result?.score
      }
    }).filter(x => x.net != null || x.score != null || x.correct != null)
    const plusRows = load('taskin-akademi-v64-plus-records', []).filter(x => x.classId === student.class_id && x.studentId === student.id)
    const gradesStore = load('taskin-akademi-v64-school-exam-grades', {})
    const grades = gradesStore?.[student.class_id]?.[student.id] || {}
    const projects = load('taskin-akademi-v64-projects', []).filter(x => x.classId === student.class_id && x.studentId === student.id)
    const comments = load('taskin-akademi-v64-comments', []).filter(x => x.classId === student.class_id && x.studentId === student.id)
    const done = homeworkRows.filter(x => x.status === 'done').length
    const missing = homeworkRows.filter(x => x.status === 'missing').length
    const absent = homeworkRows.filter(x => x.status === 'absent').length
    return { homeworkRows, examRows, plusRows, grades, projects, comments, done, missing, absent }
  }, [student])

  async function downloadPdf() {
    if (!reportRef.current || !student) return
    const name = `${student.student_number}_${student.first_name}_${student.last_name}_durum_raporu.pdf`.replaceAll(' ', '_')
    await html2pdf().set({
      margin: 8,
      filename: name,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    }).from(reportRef.current).save()
  }

  if (loading) return <Box className="loader"><CircularProgress /></Box>
  if (error || !student) return <Alert severity="error">{error || 'Öğrenci bulunamadı.'}</Alert>

  const fullName = `${student.first_name} ${student.last_name}`
  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
      <Button startIcon={<ArrowBack />} onClick={onBack}>Ana sayfaya dön</Button>
      <Button variant="contained" startIcon={<PictureAsPdf />} onClick={downloadPdf}>Öğrenci Durum PDF</Button>
    </Stack>

    <Box ref={reportRef} className="student-detail-report">
      <Box className="student-detail-header">
        <img src="/taskin-takip-sistemi-logo.png" alt="Taşkın Takip Sistemi" />
        <Box><Typography variant="h4" fontWeight={950}>{fullName}</Typography><Typography color="text.secondary">Öğrenci Durum Raporu</Typography></Box>
        <Box className="student-detail-meta"><b>No: {student.student_number}</b><span>{student.classes?.name || 'Sınıf belirtilmedi'}</span><span>{new Date().toLocaleDateString('tr-TR')}</span></Box>
      </Box>

      <Box className="student-summary-grid">
        <Summary icon={<Assignment />} label="Ödev yaptı" value={data.done} />
        <Summary icon={<Assignment />} label="Ödev yapmadı" value={data.missing} />
        <Summary icon={<School />} label="Gelmedi" value={data.absent} />
        <Summary icon={<Star />} label="Toplam artı" value={data.plusRows.reduce((s, x) => s + Number(x.amount || 1), 0)} />
        <Summary icon={<Quiz />} label="Deneme sonucu" value={data.examRows.length} />
        <Summary icon={<AutoStories />} label="Proje" value={data.projects.length} />
      </Box>

      <ReportSection title="Deneme Sonuçları" icon={<Quiz />}>
        <table><thead><tr><th>Deneme</th><th>Tarih</th><th>Doğru</th><th>Yanlış</th><th>Net</th><th>Puan</th></tr></thead><tbody>
          {data.examRows.length ? data.examRows.map((x, i) => <tr key={i}><td>{x.name}</td><td>{fmtDate(x.date)}</td><td>{num(x.correct)}</td><td>{num(x.wrong)}</td><td>{num(x.net)}</td><td>{num(x.score)}</td></tr>) : <EmptyRow cols={6} />}
        </tbody></table>
      </ReportSection>

      <ReportSection title="Ödev Durumu" icon={<Assignment />}>
        <table><thead><tr><th>Ödev</th><th>Tarih</th><th>Durum</th></tr></thead><tbody>
          {data.homeworkRows.length ? data.homeworkRows.map((x, i) => <tr key={i}><td>{x.name}</td><td>{fmtDate(x.date)}</td><td><Chip size="small" label={x.status === 'done' ? 'Yaptı' : x.status === 'missing' ? 'Yapmadı' : x.status === 'absent' ? 'Gelmedi' : 'Belirtilmedi'} color={x.status === 'done' ? 'success' : x.status === 'missing' ? 'error' : x.status === 'absent' ? 'warning' : 'default'} /></td></tr>) : <EmptyRow cols={3} />}
        </tbody></table>
      </ReportSection>

      <ReportSection title="Sınav Notları" icon={<EmojiEvents />}>
        <Box className="grade-chip-list">{Object.keys(data.grades).length ? Object.entries(data.grades).map(([key, value]) => <Chip key={key} label={`${key}: ${value || '—'}`} />) : <Typography color="text.secondary">Sınav notu bulunmuyor.</Typography>}</Box>
      </ReportSection>

      <ReportSection title="Projeler" icon={<AutoStories />}>
        <table><thead><tr><th>Proje</th><th>Veriliş</th><th>Son tarih</th><th>Not</th></tr></thead><tbody>
          {data.projects.length ? data.projects.map((x, i) => <tr key={i}><td>{x.name || 'Proje'}</td><td>{fmtDate(x.assignedDate)}</td><td>{fmtDate(x.dueDate)}</td><td>{x.grade || '—'}</td></tr>) : <EmptyRow cols={4} />}
        </tbody></table>
      </ReportSection>

      <ReportSection title="Yorumlar" icon={<Comment />}>
        {data.comments.length ? data.comments.map((x, i) => <Box className="student-comment" key={i}><b>{fmtDate(x.date || x.createdAt)}</b><span>{x.text || x.comment || x.content || '—'}</span></Box>) : <Typography color="text.secondary">Yorum bulunmuyor.</Typography>}
      </ReportSection>
    </Box>
  </Stack>
}

function Summary({ icon, label, value }) { return <Box className="student-summary-box"><span>{icon}</span><small>{label}</small><b>{value}</b></Box> }
function ReportSection({ title, icon, children }) { return <Box className="student-report-section"><Stack direction="row" spacing={1} alignItems="center"><span>{icon}</span><Typography variant="h6" fontWeight={900}>{title}</Typography></Stack><Divider sx={{ my: 1.2 }} />{children}</Box> }
function EmptyRow({ cols }) { return <tr><td colSpan={cols} style={{ textAlign: 'center' }}>Kayıt bulunmuyor.</td></tr> }
