import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper,
  Select, Snackbar, Stack, TextField, Typography
} from '@mui/material'
import {
  AddCircle, CheckCircle, Groups, History, RemoveCircle, School,
  Star, StarBorder
} from '@mui/icons-material'
import { supabase } from '../services/supabase'

const STORAGE_KEY = 'taskin-akademi-v64-plus-records'
const REASONS = [
  'Derse katıldı',
  'Soru çözdü',
  'İyi bir davranış gösterdi',
  'Ödevini yaptı',
  'Arkadaşına yardımcı oldu',
  'Derse hazırlıklı geldi',
  'Diğer'
]

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const formatDateTime = value => value
  ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : ''

export default function PlusPage() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [records, setRecords] = useState(loadRecords)
  const [loading, setLoading] = useState(true)
  const [studentLoading, setStudentLoading] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [reason, setReason] = useState(REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { loadClasses() }, [])
  useEffect(() => { if (selectedClass) loadStudents(selectedClass) }, [selectedClass])
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)) }, [records])

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

  const selectedClassInfo = classes.find(c => c.id === selectedClass)
  const studentStats = useMemo(() => Object.fromEntries(students.map(student => {
    const studentRecords = records
      .filter(row => row.studentId === student.id && row.classId === selectedClass)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return [student.id, {
      count: studentRecords.reduce((sum, item) => sum + item.amount, 0),
      last: studentRecords[0] || null
    }]
  })), [students, records, selectedClass])

  function openGive(student) {
    setDialog({ type: 'give', student })
    setReason(REASONS[0])
    setCustomReason('')
  }

  function openRemove(student) {
    const stat = studentStats[student.id]
    if (!stat?.count) {
      setMessage('Bu öğrencinin silinebilecek artısı bulunmuyor.')
      return
    }
    setDialog({ type: 'remove', student })
  }

  function givePlus() {
    if (!dialog?.student) return
    const finalReason = reason === 'Diğer' ? customReason.trim() : reason
    if (!finalReason) return setError('Artı verme sebebini yazmalısınız.')

    setRecords(current => [{
      id: crypto.randomUUID(),
      classId: selectedClass,
      className: selectedClassInfo?.name || '',
      studentId: dialog.student.id,
      studentName: `${dialog.student.first_name} ${dialog.student.last_name}`,
      studentNumber: dialog.student.student_number,
      amount: 1,
      reason: finalReason,
      createdAt: new Date().toISOString()
    }, ...current])
    setDialog(null)
    setMessage(`${dialog.student.first_name} ${dialog.student.last_name} için artı verildi.`)
  }

  function removePlus() {
    if (!dialog?.student) return
    const candidates = records
      .filter(row => row.studentId === dialog.student.id && row.classId === selectedClass && row.amount > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const lastRecord = candidates[0]
    if (!lastRecord) {
      setDialog(null)
      setMessage('Silinecek artı bulunamadı.')
      return
    }
    setRecords(current => current.filter(row => row.id !== lastRecord.id))
    setDialog(null)
    setMessage(`${dialog.student.first_name} ${dialog.student.last_name} için son artı silindi.`)
  }

  if (loading) return <Box className="loader compact"><CircularProgress /></Box>

  return (
    <Box className="plus-page">
      <Box className="page-head plus-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>Artı</Typography>
          <Typography color="text.secondary">Aktif sınıflardaki öğrencilere hızlıca artı verin veya geri alın</Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

      <Paper className="glass plus-classbar" elevation={0}>
        <FormControl fullWidth size="small">
          <InputLabel>Aktif sınıf</InputLabel>
          <Select value={selectedClass} label="Aktif sınıf" onChange={event => setSelectedClass(event.target.value)}>
            {classes.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          </Select>
        </FormControl>
        <Box className="plus-class-summary">
          <Groups />
          <Box>
            <Typography fontWeight={900}>{selectedClassInfo?.name || 'Sınıf seçilmedi'}</Typography>
            <Typography variant="caption" color="text.secondary">{students.length} aktif öğrenci</Typography>
          </Box>
        </Box>
      </Paper>

      {studentLoading ? <Box className="loader compact"><CircularProgress /></Box> : students.length === 0 ? (
        <Paper className="glass empty" elevation={0}>
          <School sx={{ fontSize: 64 }} />
          <Typography variant="h6" fontWeight={900}>Aktif öğrenci bulunmuyor</Typography>
          <Typography color="text.secondary">Seçili sınıfta aktif öğrenci bulunamadı.</Typography>
        </Paper>
      ) : (
        <Box className="plus-student-list">
          {students.map(student => {
            const stat = studentStats[student.id] || { count: 0, last: null }
            return (
              <Paper className="glass plus-student-card" elevation={0} key={student.id}>
                <Box className="plus-number">{student.student_number || '-'}</Box>
                <Box className="plus-student-info">
                  <Typography fontWeight={950}>{student.first_name} {student.last_name}</Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                    <Chip
                      icon={stat.count > 0 ? <Star /> : <StarBorder />}
                      label={`${stat.count} artı`}
                      className={stat.count > 0 ? 'plus-count-chip active' : 'plus-count-chip'}
                    />
                    {stat.last && (
                      <Typography variant="caption" color="text.secondary" className="plus-last-note">
                        Son: {stat.last.reason} · {formatDateTime(stat.last.createdAt)}
                      </Typography>
                    )}
                  </Stack>
                </Box>
                <Box className="plus-card-actions">
                  <Button className="plus-give-btn" variant="contained" startIcon={<AddCircle />} onClick={() => openGive(student)}>
                    Artı Ver
                  </Button>
                  <Button className="plus-remove-btn" variant="contained" startIcon={<RemoveCircle />} onClick={() => openRemove(student)} disabled={stat.count <= 0}>
                    Artı Sil
                  </Button>
                </Box>
              </Paper>
            )
          })}
        </Box>
      )}

      <Dialog open={dialog?.type === 'give'} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center"><AddCircle color="success" /><span>Artı Ver</span></Stack>
        </DialogTitle>
        <DialogContent>
          <Typography fontWeight={900} sx={{ mb: 2 }}>
            {dialog?.student?.student_number} · {dialog?.student?.first_name} {dialog?.student?.last_name}
          </Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Artı verme sebebi</InputLabel>
            <Select value={reason} label="Artı verme sebebi" onChange={event => setReason(event.target.value)}>
              {REASONS.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </Select>
          </FormControl>
          {reason === 'Diğer' && (
            <TextField
              autoFocus
              fullWidth
              label="Sebep açıklaması"
              value={customReason}
              onChange={event => setCustomReason(event.target.value)}
              inputProps={{ maxLength: 120 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>İptal</Button>
          <Button variant="contained" color="success" startIcon={<CheckCircle />} onClick={givePlus}>Artıyı Kaydet</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog?.type === 'remove'} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center"><RemoveCircle color="error" /><span>Artı Sil</span></Stack>
        </DialogTitle>
        <DialogContent>
          <Typography>
            <b>{dialog?.student?.first_name} {dialog?.student?.last_name}</b> öğrencisinin son verilen artısı silinecek.
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>Bu işlem öğrencinin artı sayısını 1 azaltır.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Vazgeç</Button>
          <Button variant="contained" color="error" startIcon={<RemoveCircle />} onClick={removePlus}>Artıyı Sil</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(message)} autoHideDuration={2600} onClose={() => setMessage('')} message={message} />
    </Box>
  )
}
