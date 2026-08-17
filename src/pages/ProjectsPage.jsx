import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper,
  Select, Snackbar, Stack, TextField, Typography
} from '@mui/material'
import {
  Add, Assignment, CalendarMonth, Delete, Edit, Folder,
  Grade, Groups, Person, Save
} from '@mui/icons-material'
import { supabase } from '../services/supabase'

const STORAGE_KEY = 'taskin-akademi-v64-projects'

function readProjects() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

function normalizeGrade(value) {
  const text = String(value ?? '').trim()
  if (text === '') return ''
  if (!/^\d{1,3}$/.test(text)) return null
  const number = Number(text)
  if (number < 0 || number > 100) return null
  return String(number)
}

const emptyForm = {
  studentId: '',
  name: '',
  description: '',
  assignedDate: today(),
  dueDate: ''
}

export default function ProjectsPage() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [projects, setProjects] = useState(readProjects)
  const [loading, setLoading] = useState(true)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [gradeValue, setGradeValue] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { loadActiveClasses() }, [])
  useEffect(() => { if (selectedClass) loadStudents(selectedClass) }, [selectedClass])

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
    setStudentsLoading(false)
  }

  const selectedClassInfo = classes.find(item => item.id === selectedClass)
  const visibleProjects = useMemo(() => projects
    .filter(item => item.classId === selectedClass)
    .sort((a, b) => String(b.assignedDate).localeCompare(String(a.assignedDate))), [projects, selectedClass])

  const projectStudents = useMemo(() => {
    const ids = new Set(visibleProjects.map(item => item.studentId))
    return students.filter(student => ids.has(student.id)).length
  }, [students, visibleProjects])

  function persist(nextProjects) {
    setProjects(nextProjects)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProjects))
  }

  function openCreate() {
    setForm({ ...emptyForm, assignedDate: today() })
    setDialog({ type: 'form', projectId: null })
    setError('')
  }

  function openEdit(project) {
    setForm({
      studentId: project.studentId,
      name: project.name,
      description: project.description || '',
      assignedDate: project.assignedDate,
      dueDate: project.dueDate
    })
    setDialog({ type: 'form', projectId: project.id })
    setError('')
  }

  function saveProject() {
    if (!selectedClass) return setError('Önce aktif sınıf seçin.')
    if (!form.studentId) return setError('Proje verilecek öğrenciyi seçin.')
    if (!form.name.trim()) return setError('Proje adı zorunludur.')
    if (!form.assignedDate) return setError('Veriliş tarihi zorunludur.')
    if (!form.dueDate) return setError('Teslim tarihi zorunludur.')
    if (form.dueDate < form.assignedDate) return setError('Teslim tarihi veriliş tarihinden önce olamaz.')

    const student = students.find(item => item.id === form.studentId)
    if (!student) return setError('Seçilen öğrenci bulunamadı.')

    let nextProjects
    if (dialog?.projectId) {
      nextProjects = projects.map(item => item.id === dialog.projectId ? {
        ...item,
        studentId: student.id,
        studentNumber: student.student_number,
        studentName: `${student.first_name} ${student.last_name}`,
        name: form.name.trim(),
        description: form.description.trim(),
        assignedDate: form.assignedDate,
        dueDate: form.dueDate,
        updatedAt: new Date().toISOString()
      } : item)
    } else {
      nextProjects = [{
        id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()),
        classId: selectedClass,
        className: selectedClassInfo?.name || '',
        studentId: student.id,
        studentNumber: student.student_number,
        studentName: `${student.first_name} ${student.last_name}`,
        name: form.name.trim(),
        description: form.description.trim(),
        assignedDate: form.assignedDate,
        dueDate: form.dueDate,
        grade: '',
        createdAt: new Date().toISOString()
      }, ...projects]
    }

    persist(nextProjects)
    setDialog(null)
    setMessage(dialog?.projectId ? 'Proje güncellendi.' : 'Proje öğrenciye verildi.')
  }

  function requestDelete(project) {
    setDialog({ type: 'delete', project })
  }

  function deleteProject() {
    persist(projects.filter(item => item.id !== dialog.project.id))
    setDialog(null)
    setMessage('Proje silindi.')
  }

  function openGrade(project) {
    setGradeValue(project.grade ?? '')
    setDialog({ type: 'grade', project })
    setError('')
  }

  function saveGrade() {
    const normalized = normalizeGrade(gradeValue)
    if (normalized === null) return setError('Proje notu 0 ile 100 arasında olmalıdır.')
    persist(projects.map(item => item.id === dialog.project.id ? { ...item, grade: normalized, gradedAt: new Date().toISOString() } : item))
    setDialog(null)
    setMessage(normalized === '' ? 'Proje notu temizlendi.' : 'Proje notu kaydedildi.')
  }

  if (loading) return <Box className="loader compact"><CircularProgress /></Box>

  return (
    <Box className="projects-page">
      <Box className="page-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>Projeler</Typography>
          <Typography color="text.secondary">Aktif sınıflardaki öğrencilere proje verin ve notlarını takip edin</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate} disabled={!selectedClass || !students.length}>
          Proje Ver
        </Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

      <Paper className="glass project-classbar" elevation={0}>
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

      <Box className="project-stats">
        <Paper className="glass project-stat primary" elevation={0}>
          <Assignment />
          <Box><Typography variant="caption">Toplam Proje</Typography><Typography variant="h5" fontWeight={950}>{visibleProjects.length}</Typography></Box>
        </Paper>
        <Paper className="glass project-stat success" elevation={0}>
          <Person />
          <Box><Typography variant="caption">Projesi Olan Öğrenci</Typography><Typography variant="h5" fontWeight={950}>{projectStudents}</Typography></Box>
        </Paper>
        <Paper className="glass project-stat warning" elevation={0}>
          <Grade />
          <Box><Typography variant="caption">Notu Girilen</Typography><Typography variant="h5" fontWeight={950}>{visibleProjects.filter(item => item.grade !== '').length}</Typography></Box>
        </Paper>
      </Box>

      {studentsLoading ? <Box className="loader compact"><CircularProgress /></Box> : visibleProjects.length === 0 ? (
        <Paper className="glass empty" elevation={0}>
          <Folder sx={{ fontSize: 64 }} />
          <Typography variant="h6" fontWeight={900}>Bu sınıfta kayıtlı proje yok</Typography>
          <Typography color="text.secondary">Yeni bir proje vermek için “Proje Ver” butonunu kullanın.</Typography>
        </Paper>
      ) : (
        <Box className="project-list">
          {visibleProjects.map(project => (
            <Paper className="glass project-row" elevation={0} key={project.id}>
              <Box className="project-student-number">{project.studentNumber || '—'}</Box>
              <Box className="project-main-info">
                <Typography fontWeight={950}>{project.studentName}</Typography>
                <Typography fontWeight={850} className="project-name">{project.name}</Typography>
                {project.description && <Typography variant="body2" color="text.secondary">{project.description}</Typography>}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: .8 }}>
                  <Chip size="small" icon={<CalendarMonth />} label={`Veriliş: ${formatDate(project.assignedDate)}`} />
                  <Chip size="small" icon={<CalendarMonth />} label={`Teslim: ${formatDate(project.dueDate)}`} />
                </Stack>
              </Box>
              <Box className="project-grade-box">
                <Typography variant="caption" color="text.secondary">Proje Notu</Typography>
                <Typography variant="h5" fontWeight={950}>{project.grade === '' ? '—' : project.grade}</Typography>
                {project.grade !== '' && <Chip size="small" className={Number(project.grade) >= 50 ? 'project-grade-chip passed' : 'project-grade-chip failed'} label={Number(project.grade) >= 50 ? 'Geçti' : 'Geçemedi'} />}
              </Box>
              <Box className="project-actions">
                <Button size="small" variant="contained" startIcon={<Grade />} onClick={() => openGrade(project)}>Not Ver</Button>
                <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => openEdit(project)}>Düzenle</Button>
                <Button size="small" color="error" variant="outlined" startIcon={<Delete />} onClick={() => requestDelete(project)}>Sil</Button>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Dialog open={dialog?.type === 'form'} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>{dialog?.projectId ? 'Projeyi Düzenle' : 'Proje Ver'}</DialogTitle>
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
            <TextField label="Proje adı" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} autoFocus />
            <TextField label="Açıklama" multiline minRows={3} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth label="Veriliş tarihi" type="date" InputLabelProps={{ shrink: true }} value={form.assignedDate} onChange={event => setForm(current => ({ ...current, assignedDate: event.target.value }))} />
              <TextField fullWidth label="Teslim tarihi" type="date" InputLabelProps={{ shrink: true }} value={form.dueDate} onChange={event => setForm(current => ({ ...current, dueDate: event.target.value }))} />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>İptal</Button>
          <Button variant="contained" startIcon={<Save />} onClick={saveProject}>Kaydet</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog?.type === 'grade'} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Proje Notu Ver</DialogTitle>
        <DialogContent>
          <Typography fontWeight={900} sx={{ mb: 2 }}>{dialog?.project?.studentName}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{dialog?.project?.name}</Typography>
          <TextField
            fullWidth
            autoFocus
            label="Proje notu (0-100)"
            value={gradeValue}
            onChange={event => {
              const value = event.target.value
              if (value === '' || /^\d{0,3}$/.test(value)) setGradeValue(value)
            }}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveGrade() } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>İptal</Button>
          <Button variant="contained" startIcon={<Save />} onClick={saveGrade}>Kaydet</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog?.type === 'delete'} onClose={() => setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>Projeyi Sil</DialogTitle>
        <DialogContent>
          <Typography><strong>{dialog?.project?.studentName}</strong> öğrencisine verilen <strong>{dialog?.project?.name}</strong> projesi silinsin mi?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Vazgeç</Button>
          <Button color="error" variant="contained" startIcon={<Delete />} onClick={deleteProject}>Sil</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(message)} autoHideDuration={2600} onClose={() => setMessage('')} message={message} />
    </Box>
  )
}
