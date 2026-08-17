import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, InputLabel,
  MenuItem, Paper, Select, Snackbar, Stack, TextField, Typography
} from '@mui/material'
import {
  CheckCircle, Groups, Save, School, TrendingDown, TrendingUp
} from '@mui/icons-material'
import { supabase } from '../services/supabase'

const STORAGE_KEY = 'taskin-akademi-v64-school-exam-grades'

function loadGradeStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function normalizeGrade(value) {
  const text = String(value ?? '').trim().toUpperCase()
  if (text === '') return ''
  if (text === 'G') return 'G'
  if (!/^\d{1,3}$/.test(text)) return null
  const number = Number(text)
  if (number < 0 || number > 100) return null
  return String(number)
}

function numericGrade(value) {
  return value === 'G' || value === '' || value == null ? null : Number(value)
}

export default function ExamGradesPage() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [grades, setGrades] = useState(loadGradeStore)
  const [loading, setLoading] = useState(true)
  const [studentLoading, setStudentLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const inputRefs = useRef({})

  useEffect(() => { loadClasses() }, [])
  useEffect(() => { if (selectedClass) loadStudents(selectedClass) }, [selectedClass])

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

      const activeIds = new Set((activeResult.data || []).map(row => row.class_id))
      const activeClasses = (classResult.data || []).filter(item =>
        activeIds.has(item.id) &&
        !item.is_lgs &&
        !String(item.name).toLocaleLowerCase('tr-TR').includes('lgs')
      )

      setClasses(activeClasses)
      setSelectedClass(current => activeClasses.some(c => c.id === current) ? current : (activeClasses[0]?.id || ''))
      if (!activeClasses.length) setStudents([])
    } catch (err) {
      setError(err?.message || 'Aktif sınıflar yüklenemedi.')
      setClasses([])
      setStudents([])
      setSelectedClass('')
    } finally {
      setLoading(false)
    }
  }

  async function loadStudents(classId) {
    setStudentLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('students')
      .select('id,student_number,first_name,last_name,class_id,is_active')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('student_number')

    if (error) {
      setError(error.message)
      setStudents([])
    } else {
      setStudents(data || [])
    }
    setStudentLoading(false)
  }

  const selectedClassInfo = classes.find(item => item.id === selectedClass)
  const classGrades = grades[selectedClass] || {}

  function updateGrade(studentId, examKey, rawValue) {
    const upper = String(rawValue).toUpperCase()
    if (upper !== '' && upper !== 'G' && !/^\d{0,3}$/.test(upper)) return
    if (/^\d{3}$/.test(upper) && Number(upper) > 100) {
      setError('Not 100’den büyük olamaz.')
      return
    }

    setGrades(current => ({
      ...current,
      [selectedClass]: {
        ...(current[selectedClass] || {}),
        [studentId]: {
          ...(current[selectedClass]?.[studentId] || {}),
          [examKey]: upper
        }
      }
    }))
  }

  function handleBlur(studentId, examKey) {
    const currentValue = grades[selectedClass]?.[studentId]?.[examKey] ?? ''
    const normalized = normalizeGrade(currentValue)
    if (normalized === null) {
      setGrades(current => ({
        ...current,
        [selectedClass]: {
          ...(current[selectedClass] || {}),
          [studentId]: {
            ...(current[selectedClass]?.[studentId] || {}),
            [examKey]: ''
          }
        }
      }))
      setError('Sadece 0–100 arası not veya sınava girmeyen öğrenci için G girilebilir.')
      return
    }
    if (normalized !== currentValue) updateGrade(studentId, examKey, normalized)
  }

  function moveDown(event, rowIndex, examKey) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const nextStudent = students[rowIndex + 1]
    if (nextStudent) inputRefs.current[`${nextStudent.id}-${examKey}`]?.focus()
  }

  function getStudentAverage(studentId) {
    const row = classGrades[studentId] || {}
    const values = [numericGrade(row.exam1), numericGrade(row.exam2)].filter(value => value !== null)
    if (!values.length) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  const stats = useMemo(() => {
    const averages = students.map(student => getStudentAverage(student.id)).filter(value => value !== null)
    const classAverage = averages.length ? averages.reduce((sum, value) => sum + value, 0) / averages.length : null
    const passed = averages.filter(value => value >= 50).length
    const failed = averages.filter(value => value < 50).length
    const absent = students.filter(student => {
      const row = classGrades[student.id] || {}
      return row.exam1 === 'G' && row.exam2 === 'G'
    }).length
    return { classAverage, passed, failed, absent }
  }, [students, classGrades])

  function saveGrades() {
    for (const student of students) {
      for (const examKey of ['exam1', 'exam2']) {
        const value = grades[selectedClass]?.[student.id]?.[examKey] ?? ''
        if (normalizeGrade(value) === null) {
          setError(`${student.first_name} ${student.last_name} için geçersiz not var.`)
          inputRefs.current[`${student.id}-${examKey}`]?.focus()
          return
        }
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grades))
    setMessage(`${selectedClassInfo?.name || 'Sınıf'} sınav notları kaydedildi.`)
  }

  if (loading) return <Box className="loader compact"><CircularProgress /></Box>

  return (
    <Box className="school-exams-page">
      <Box className="page-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>Sınav Notları</Typography>
          <Typography color="text.secondary">Fen 1. Yazılı ve Fen 2. Yazılı notlarını hızlıca girin</Typography>
        </Box>
        <Button variant="contained" startIcon={<Save />} onClick={saveGrades} disabled={!selectedClass || !students.length}>
          Kaydet
        </Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

      <Paper className="glass school-exam-classbar" elevation={0}>
        <FormControl fullWidth size="small">
          <InputLabel>Aktif sınıf</InputLabel>
          <Select value={selectedClass} label="Aktif sınıf" onChange={event => setSelectedClass(event.target.value)}>
            {classes.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={1.2} alignItems="center">
          <Groups color="primary" />
          <Box>
            <Typography fontWeight={900}>{selectedClassInfo?.name || 'Sınıf seçilmedi'}</Typography>
            <Typography variant="caption" color="text.secondary">{students.length} aktif öğrenci</Typography>
          </Box>
        </Stack>
      </Paper>

      <Box className="school-exam-stats">
        <Paper className="glass school-exam-stat primary" elevation={0}>
          <School />
          <Box><Typography variant="caption">Sınıf Ortalaması</Typography><Typography variant="h5" fontWeight={950}>{stats.classAverage == null ? '—' : stats.classAverage.toFixed(1)}</Typography></Box>
        </Paper>
        <Paper className="glass school-exam-stat success" elevation={0}>
          <TrendingUp />
          <Box><Typography variant="caption">Geçen Öğrenci</Typography><Typography variant="h5" fontWeight={950}>{stats.passed}</Typography></Box>
        </Paper>
        <Paper className="glass school-exam-stat danger" elevation={0}>
          <TrendingDown />
          <Box><Typography variant="caption">Geçemeyen Öğrenci</Typography><Typography variant="h5" fontWeight={950}>{stats.failed}</Typography></Box>
        </Paper>
        <Paper className="glass school-exam-stat warning" elevation={0}>
          <CheckCircle />
          <Box><Typography variant="caption">İki Sınava da Girmedi</Typography><Typography variant="h5" fontWeight={950}>{stats.absent}</Typography></Box>
        </Paper>
      </Box>

      {studentLoading ? <Box className="loader compact"><CircularProgress /></Box> : students.length === 0 ? (
        <Paper className="glass empty" elevation={0}>
          <School sx={{ fontSize: 64 }} />
          <Typography variant="h6" fontWeight={900}>Aktif öğrenci bulunmuyor</Typography>
          <Typography color="text.secondary">Seçili sınıfta aktif öğrenci bulunamadı.</Typography>
        </Paper>
      ) : (
        <Paper className="glass school-exam-table-wrap" elevation={0}>
          <Box className="school-exam-table-head">
            <strong>No</strong><strong>Öğrenci</strong><strong>Fen 1. Yazılı</strong><strong>Fen 2. Yazılı</strong><strong>Ortalama Not</strong><strong>Durum</strong>
          </Box>
          <Box className="school-exam-rows">
            {students.map((student, rowIndex) => {
              const row = classGrades[student.id] || {}
              const average = getStudentAverage(student.id)
              const status = average == null ? 'Not yok' : average >= 50 ? 'Geçti' : 'Geçemedi'
              return (
                <Box className="school-exam-row" key={student.id}>
                  <Box className="school-exam-number">{student.student_number || '—'}</Box>
                  <Box className="school-exam-name"><b>{student.first_name} {student.last_name}</b><small>{selectedClassInfo?.name}</small></Box>
                  <TextField
                    inputRef={node => { inputRefs.current[`${student.id}-exam1`] = node }}
                    value={row.exam1 ?? ''}
                    onChange={event => updateGrade(student.id, 'exam1', event.target.value)}
                    onBlur={() => handleBlur(student.id, 'exam1')}
                    onKeyDown={event => moveDown(event, rowIndex, 'exam1')}
                    size="small"
                    inputProps={{ inputMode: 'text', maxLength: 3, 'aria-label': `${student.first_name} Fen 1. Yazılı` }}
                  />
                  <TextField
                    inputRef={node => { inputRefs.current[`${student.id}-exam2`] = node }}
                    value={row.exam2 ?? ''}
                    onChange={event => updateGrade(student.id, 'exam2', event.target.value)}
                    onBlur={() => handleBlur(student.id, 'exam2')}
                    onKeyDown={event => moveDown(event, rowIndex, 'exam2')}
                    size="small"
                    inputProps={{ inputMode: 'text', maxLength: 3, 'aria-label': `${student.first_name} Fen 2. Yazılı` }}
                  />
                  <Box className="school-exam-average">{average == null ? '—' : average.toFixed(1)}</Box>
                  <Chip
                    label={status}
                    className={`school-exam-status ${average == null ? 'empty' : average >= 50 ? 'passed' : 'failed'}`}
                  />
                </Box>
              )
            })}
          </Box>
          <Box className="school-exam-savebar">
            <Typography variant="caption" color="text.secondary">Enter tuşu aynı sütunda bir alttaki öğrencinin kutusuna geçer. Sınava girmeyen öğrenci için G yazabilirsiniz.</Typography>
            <Button variant="contained" startIcon={<Save />} onClick={saveGrades}>Notları Kaydet</Button>
          </Box>
        </Paper>
      )}

      <Snackbar open={Boolean(message)} autoHideDuration={2600} onClose={() => setMessage('')} message={message} />
    </Box>
  )
}
