import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper,
  Select, Snackbar, Stack, TextField, Typography
} from '@mui/material'
import {
  AddComment, CalendarMonth, Delete, Edit, Groups, Person,
  Save, Schedule, Visibility
} from '@mui/icons-material'
import { supabase } from '../services/supabase'

const STORAGE_KEY = 'taskin-akademi-v64-comments'
const COMMENT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

function nowIso() {
  return new Date().toISOString()
}

function addSevenDays(value = new Date()) {
  return new Date(value.getTime() + COMMENT_LIFETIME_MS).toISOString()
}

function readComments() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(stored)) return []
    const now = Date.now()
    const active = stored.filter(item => {
      const expiresAt = item.expiresAt || addSevenDays(new Date(item.createdAt || Date.now()))
      return new Date(expiresAt).getTime() > now
    }).map(item => ({
      ...item,
      expiresAt: item.expiresAt || addSevenDays(new Date(item.createdAt || Date.now()))
    }))
    if (active.length !== stored.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(active))
    return active
  } catch {
    return []
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value))
}

function remainingText(expiresAt) {
  const difference = new Date(expiresAt).getTime() - Date.now()
  if (difference <= 0) return 'Süresi doldu'
  const totalHours = Math.ceil(difference / 3600000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) return `${days} gün ${hours ? `${hours} saat` : ''}`.trim()
  return `${Math.max(1, hours)} saat`
}

export default function CommentsPage() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [comments, setComments] = useState(readComments)
  const [loading, setLoading] = useState(true)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState({ studentId: '', text: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [, forceClock] = useState(0)

  useEffect(() => { loadActiveClasses() }, [])
  useEffect(() => { if (selectedClass) loadStudents(selectedClass) }, [selectedClass])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      setComments(current => {
        const active = current.filter(item => new Date(item.expiresAt).getTime() > now)
        if (active.length !== current.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(active))
        return active
      })
      forceClock(value => value + 1)
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  async function loadActiveClasses() {
    setLoading(true)
    setError('')
    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) throw new Error('Oturum bulunamadı.')

      const [classesResult, activeResult] = await Promise.all([
        supabase.from('classes').select('id,name,sort_order,is_lgs').order('sort_order'),
        supabase.from('teacher_active_classes').select('class_id').eq('teacher_id', user.id)
      ])
      if (classesResult.error) throw classesResult.error
      if (activeResult.error) throw activeResult.error

      const activeIds = new Set((activeResult.data || []).map(row => row.class_id))
      const nextClasses = (classesResult.data || []).filter(item =>
        activeIds.has(item.id) &&
        !item.is_lgs &&
        !String(item.name).toLocaleLowerCase('tr-TR').includes('lgs')
      )

      setClasses(nextClasses)
      setSelectedClass(current => nextClasses.some(item => item.id === current) ? current : (nextClasses[0]?.id || ''))
      if (!nextClasses.length) setStudents([])
    } catch (err) {
      setError(err?.message || 'Aktif sınıflar yüklenemedi.')
      setClasses([])
      setSelectedClass('')
    } finally {
      setLoading(false)
    }
  }

  async function loadStudents(classId) {
    setStudentsLoading(true)
    const { data, error: loadError } = await supabase
      .from('students')
      .select('id,student_number,first_name,last_name,class_id,is_active')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('student_number')

    if (loadError) {
      setError(loadError.message)
      setStudents([])
    } else {
      setStudents(data || [])
    }
    setStudentsLoading(false)
  }

  const selectedClassInfo = classes.find(item => item.id === selectedClass)
  const visibleComments = useMemo(() => comments
    .filter(item => item.classId === selectedClass)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [comments, selectedClass])

  const studentsWithComments = useMemo(() => new Set(visibleComments.map(item => item.studentId)).size, [visibleComments])

  function persist(nextComments) {
    setComments(nextComments)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextComments))
  }

  function openCreate() {
    setForm({ studentId: '', text: '' })
    setDialog({ type: 'form', commentId: null })
    setError('')
  }

  function openEdit(comment) {
    setForm({ studentId: comment.studentId, text: comment.text })
    setDialog({ type: 'form', commentId: comment.id })
    setError('')
  }

  function saveComment() {
    if (!selectedClass) return setError('Önce aktif sınıf seçin.')
    if (!form.studentId) return setError('Yorum yazılacak öğrenciyi seçin.')
    if (!form.text.trim()) return setError('Yorum metni boş bırakılamaz.')
    if (form.text.trim().length > 1000) return setError('Yorum en fazla 1000 karakter olabilir.')

    const student = students.find(item => item.id === form.studentId)
    if (!student) return setError('Seçilen öğrenci bulunamadı.')

    let nextComments
    if (dialog?.commentId) {
      nextComments = comments.map(item => item.id === dialog.commentId ? {
        ...item,
        studentId: student.id,
        studentNumber: student.student_number,
        studentName: `${student.first_name} ${student.last_name}`,
        text: form.text.trim(),
        updatedAt: nowIso()
      } : item)
    } else {
      const createdAt = nowIso()
      nextComments = [{
        id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()),
        classId: selectedClass,
        className: selectedClassInfo?.name || '',
        studentId: student.id,
        studentNumber: student.student_number,
        studentName: `${student.first_name} ${student.last_name}`,
        text: form.text.trim(),
        createdAt,
        expiresAt: addSevenDays(new Date(createdAt))
      }, ...comments]
    }

    persist(nextComments)
    setDialog(null)
    setMessage(dialog?.commentId ? 'Yorum güncellendi.' : 'Yorum kaydedildi. Veli 7 gün boyunca görebilir.')
  }

  function requestDelete(comment) {
    setDialog({ type: 'delete', comment })
  }

  function deleteComment() {
    persist(comments.filter(item => item.id !== dialog.comment.id))
    setDialog(null)
    setMessage('Yorum silindi.')
  }

  if (loading) return <Box className="loader compact"><CircularProgress /></Box>

  return (
    <Box className="comments-page">
      <Box className="page-head comments-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>Yorumlar</Typography>
          <Typography color="text.secondary">Öğrenciyle ilgili kısa notları veliyle 7 gün süreyle paylaşın</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddComment />} onClick={openCreate} disabled={!selectedClass || !students.length}>
          Yorum Ekle
        </Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

      <Paper className="glass comment-classbar" elevation={0}>
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

      <Box className="comment-stats">
        <Paper className="glass comment-stat primary" elevation={0}>
          <AddComment />
          <Box><Typography variant="caption">Aktif Yorum</Typography><Typography variant="h5" fontWeight={950}>{visibleComments.length}</Typography></Box>
        </Paper>
        <Paper className="glass comment-stat success" elevation={0}>
          <Person />
          <Box><Typography variant="caption">Yorum Yazılan Öğrenci</Typography><Typography variant="h5" fontWeight={950}>{studentsWithComments}</Typography></Box>
        </Paper>
        <Paper className="glass comment-stat warning" elevation={0}>
          <Visibility />
          <Box><Typography variant="caption">Veli Görünürlüğü</Typography><Typography variant="h6" fontWeight={950}>7 gün</Typography></Box>
        </Paper>
      </Box>

      {studentsLoading ? <Box className="loader compact"><CircularProgress /></Box> : visibleComments.length === 0 ? (
        <Paper className="glass empty" elevation={0}>
          <AddComment sx={{ fontSize: 64 }} />
          <Typography variant="h6" fontWeight={900}>Bu sınıfta aktif yorum yok</Typography>
          <Typography color="text.secondary">Yeni bir yorum eklemek için “Yorum Ekle” butonunu kullanın.</Typography>
        </Paper>
      ) : (
        <Box className="comment-list">
          {visibleComments.map(comment => (
            <Paper className="glass comment-row" elevation={0} key={comment.id}>
              <Box className="comment-student-number">{comment.studentNumber || '—'}</Box>
              <Box className="comment-main-info">
                <Typography fontWeight={950}>{comment.studentName}</Typography>
                <Typography className="comment-text">{comment.text}</Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                  <Chip size="small" icon={<CalendarMonth />} label={`Yazıldı: ${formatDateTime(comment.createdAt)}`} />
                  <Chip size="small" icon={<Schedule />} className="comment-expiry-chip" label={`Kalan: ${remainingText(comment.expiresAt)}`} />
                  <Chip size="small" icon={<Visibility />} label="Veli görebilir" />
                </Stack>
              </Box>
              <Box className="comment-actions">
                <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => openEdit(comment)}>Düzenle</Button>
                <Button size="small" color="error" variant="outlined" startIcon={<Delete />} onClick={() => requestDelete(comment)}>Sil</Button>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Dialog open={dialog?.type === 'form'} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>{dialog?.commentId ? 'Yorumu Düzenle' : 'Yorum Ekle'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Öğrenci</InputLabel>
              <Select value={form.studentId} label="Öğrenci" onChange={event => setForm(current => ({ ...current, studentId: event.target.value }))}>
                {students.map(student => (
                  <MenuItem key={student.id} value={student.id}>
                    {student.student_number} · {student.first_name} {student.last_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Veliye gösterilecek yorum"
              value={form.text}
              onChange={event => setForm(current => ({ ...current, text: event.target.value }))}
              multiline
              minRows={5}
              inputProps={{ maxLength: 1000 }}
              helperText={`${form.text.length}/1000 · Yorum 7 gün sonra otomatik silinir.`}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>İptal</Button>
          <Button variant="contained" startIcon={<Save />} onClick={saveComment}>Kaydet</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog?.type === 'delete'} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Yorumu Sil</DialogTitle>
        <DialogContent>
          <Typography><strong>{dialog?.comment?.studentName}</strong> öğrencisine yazılan yorum silinsin mi? Veli artık bu yorumu göremez.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Vazgeç</Button>
          <Button color="error" variant="contained" startIcon={<Delete />} onClick={deleteComment}>Sil</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(message)} autoHideDuration={3000} onClose={() => setMessage('')} message={message} />
    </Box>
  )
}
