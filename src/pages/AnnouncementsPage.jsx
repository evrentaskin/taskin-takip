import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel,
  MenuItem, Paper, Radio, RadioGroup, Select, Snackbar, Stack, Tab, Tabs,
  TextField, Typography
} from '@mui/material'
import {
  Add, Archive, AttachFile, Campaign, CheckCircle, Delete, Download,
  Edit, Groups, Image, InsertDriveFile, Preview, Schedule,
  Visibility, VisibilityOff
} from '@mui/icons-material'
import { supabase } from '../services/supabase'

export const ANNOUNCEMENTS_STORAGE_KEY = 'taskin-akademi-v64-announcements'
const MAX_FILES = 5
const MAX_FILE_BYTES = 2 * 1024 * 1024

export function readAnnouncements() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistAnnouncements(items) {
  localStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent('taskin-announcements-updated'))
}

function localDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

function isExpired(item) {
  if (!item.endDate) return false
  const end = new Date(`${item.endDate}T23:59:59`).getTime()
  return end < Date.now()
}

function todayValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl: reader.result
    })
    reader.onerror = () => reject(new Error(`${file.name} okunamadı.`))
    reader.readAsDataURL(file)
  })
}

function downloadAttachment(file) {
  const anchor = document.createElement('a')
  anchor.href = file.dataUrl
  anchor.download = file.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export default function AnnouncementsPage() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [items, setItems] = useState(readAnnouncements)
  const [loading, setLoading] = useState(true)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [tab, setTab] = useState('active')
  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [processingFiles, setProcessingFiles] = useState(false)

  useEffect(() => { loadActiveClasses() }, [])
  useEffect(() => { if (selectedClass) loadStudents(selectedClass) }, [selectedClass])

  async function loadActiveClasses() {
    setLoading(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) throw new Error('Oturum bulunamadı.')
      const [classResult, activeResult] = await Promise.all([
        supabase.from('classes').select('id,name,sort_order,is_lgs').order('sort_order'),
        supabase.from('teacher_active_classes').select('class_id').eq('teacher_id', authData.user.id)
      ])
      if (classResult.error) throw classResult.error
      if (activeResult.error) throw activeResult.error
      const activeIds = new Set((activeResult.data || []).map(row => row.class_id))
      const next = (classResult.data || []).filter(item =>
        activeIds.has(item.id) && !item.is_lgs && !String(item.name).toLocaleLowerCase('tr-TR').includes('lgs')
      )
      setClasses(next)
      setSelectedClass(current => next.some(item => item.id === current) ? current : (next[0]?.id || ''))
    } catch (err) {
      setError(err?.message || 'Aktif sınıflar yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }

  async function loadStudents(classId) {
    setStudentsLoading(true)
    const { data, error: studentError } = await supabase
      .from('students')
      .select('id,student_number,first_name,last_name,class_id,is_active')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('student_number')
    if (studentError) {
      setError(studentError.message)
      setStudents([])
    } else setStudents(data || [])
    setStudentsLoading(false)
  }

  const classInfo = classes.find(item => item.id === selectedClass)
  const visible = useMemo(() => items
    .filter(item => item.classId === selectedClass)
    .filter(item => tab === 'archive' ? isExpired(item) : !isExpired(item))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [items, selectedClass, tab])

  const stats = useMemo(() => {
    const classItems = items.filter(item => item.classId === selectedClass && !isExpired(item))
    const recipientCount = classItems.reduce((sum, item) => sum + item.recipientIds.length, 0)
    const readCount = classItems.reduce((sum, item) => sum + Object.values(item.readBy || {}).filter(Boolean).length, 0)
    return { active: classItems.length, recipientCount, readCount, unreadCount: Math.max(0, recipientCount - readCount) }
  }, [items, selectedClass])

  function openCreate() {
    setForm(emptyForm())
    setDialog({ type: 'form', id: null })
    setError('')
  }

  function openEdit(item) {
    setForm({
      title: item.title,
      body: item.body,
      audienceType: item.audienceType,
      selectedStudentIds: item.audienceType === 'selected' ? item.recipientIds : [],
      publishDate: item.publishDate,
      endDate: item.endDate || '',
      attachments: item.attachments || []
    })
    setDialog({ type: 'form', id: item.id })
    setError('')
  }

  async function handleFiles(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (form.attachments.length + files.length > MAX_FILES) {
      setError(`En fazla ${MAX_FILES} dosya ekleyebilirsiniz.`)
      return
    }
    const large = files.find(file => file.size > MAX_FILE_BYTES)
    if (large) {
      setError(`${large.name} çok büyük. Her dosya en fazla 2 MB olabilir.`)
      return
    }
    setProcessingFiles(true)
    try {
      const encoded = await Promise.all(files.map(fileToDataUrl))
      setForm(current => ({ ...current, attachments: [...current.attachments, ...encoded] }))
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessingFiles(false)
    }
  }

  function saveAnnouncement() {
    if (!selectedClass) return setError('Önce aktif sınıf seçin.')
    if (!form.title.trim()) return setError('Duyuru başlığı boş bırakılamaz.')
    if (!form.body.trim()) return setError('Duyuru metni boş bırakılamaz.')
    if (!form.publishDate) return setError('Yayın tarihi seçin.')
    if (form.endDate && form.endDate < form.publishDate) return setError('Son gösterim tarihi yayın tarihinden önce olamaz.')

    const recipients = form.audienceType === 'class'
      ? students
      : students.filter(student => form.selectedStudentIds.includes(student.id))
    if (!recipients.length) return setError('Duyurunun gönderileceği en az bir öğrenci seçin.')

    const recipientIds = recipients.map(item => item.id)
    const recipientNames = Object.fromEntries(recipients.map(item => [item.id, `${item.student_number} · ${item.first_name} ${item.last_name}`]))
    const existing = dialog?.id ? items.find(item => item.id === dialog.id) : null
    const announcement = {
      id: existing?.id || globalThis.crypto?.randomUUID?.() || String(Date.now()),
      classId: selectedClass,
      className: classInfo?.name || '',
      title: form.title.trim(),
      body: form.body.trim(),
      audienceType: form.audienceType,
      recipientIds,
      recipientNames,
      publishDate: form.publishDate,
      endDate: form.endDate || '',
      attachments: form.attachments,
      readBy: Object.fromEntries(recipientIds.map(id => [id, Boolean(existing?.readBy?.[id])])),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const next = existing ? items.map(item => item.id === existing.id ? announcement : item) : [announcement, ...items]
    setItems(next)
    persistAnnouncements(next)
    setDialog(null)
    setMessage(existing ? 'Duyuru güncellendi.' : 'Duyuru yayınlandı.')
  }

  function deleteAnnouncement() {
    const next = items.filter(item => item.id !== dialog.item.id)
    setItems(next)
    persistAnnouncements(next)
    setDialog(null)
    setMessage('Duyuru silindi.')
  }

  function toggleStudent(studentId) {
    setForm(current => ({
      ...current,
      selectedStudentIds: current.selectedStudentIds.includes(studentId)
        ? current.selectedStudentIds.filter(id => id !== studentId)
        : [...current.selectedStudentIds, studentId]
    }))
  }

  if (loading) return <Box className="loader compact"><CircularProgress /></Box>

  return (
    <Box className="announcements-page">
      <Box className="page-head announcement-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>Duyurular</Typography>
          <Typography color="text.secondary">Velilere görsel ve dosya ekli duyurular gönderin</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate} disabled={!selectedClass || !students.length}>Duyuru Yap</Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <Paper className="glass announcement-classbar" elevation={0}>
        <FormControl size="small" fullWidth>
          <InputLabel>Aktif sınıf</InputLabel>
          <Select value={selectedClass} label="Aktif sınıf" onChange={event => setSelectedClass(event.target.value)}>
            {classes.map(item => <MenuItem value={item.id} key={item.id}>{item.name}</MenuItem>)}
          </Select>
        </FormControl>
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <Groups color="primary" />
          <Box><Typography fontWeight={900}>{classInfo?.name || 'Sınıf seçilmedi'}</Typography><Typography variant="caption" color="text.secondary">{students.length} aktif öğrenci</Typography></Box>
        </Stack>
      </Paper>

      <Box className="announcement-stats">
        <Paper className="glass announcement-stat primary" elevation={0}><Campaign /><Box><Typography variant="caption">Aktif duyuru</Typography><Typography variant="h5" fontWeight={950}>{stats.active}</Typography></Box></Paper>
        <Paper className="glass announcement-stat success" elevation={0}><Visibility /><Box><Typography variant="caption">Okundu</Typography><Typography variant="h5" fontWeight={950}>{stats.readCount}</Typography></Box></Paper>
        <Paper className="glass announcement-stat warning" elevation={0}><VisibilityOff /><Box><Typography variant="caption">Okunmadı</Typography><Typography variant="h5" fontWeight={950}>{stats.unreadCount}</Typography></Box></Paper>
      </Box>

      <Paper className="glass announcement-tabs" elevation={0}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab value="active" label="Aktif Duyurular" icon={<Campaign />} iconPosition="start" />
          <Tab value="archive" label="Duyuru Arşivi" icon={<Archive />} iconPosition="start" />
        </Tabs>
      </Paper>

      {studentsLoading ? <Box className="loader compact"><CircularProgress /></Box> : visible.length ? (
        <Box className="announcement-list">
          {visible.map(item => {
            const readCount = Object.values(item.readBy || {}).filter(Boolean).length
            const unreadStudents = item.recipientIds.filter(id => !item.readBy?.[id])
            return <Paper className="glass announcement-row" elevation={0} key={item.id}>
              <Avatar className="announcement-icon"><Campaign /></Avatar>
              <Box className="announcement-main">
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h6" fontWeight={950}>{item.title}</Typography>
                  {isExpired(item) ? <Chip size="small" label="Arşivlendi" /> : <Chip size="small" color="success" label="Yayında" />}
                  <Chip size="small" variant="outlined" label={item.audienceType === 'class' ? 'Sınıfın tamamı' : `${item.recipientIds.length} seçili öğrenci`} />
                </Stack>
                <Typography className="announcement-body">{item.body}</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" icon={<Schedule />} label={`${localDate(item.publishDate)}${item.endDate ? ` – ${localDate(item.endDate)}` : ''}`} />
                  <Chip size="small" icon={<Visibility />} label={`${readCount} okudu`} color="success" variant="outlined" />
                  <Chip size="small" icon={<VisibilityOff />} label={`${unreadStudents.length} okumadı`} color="warning" variant="outlined" onClick={() => setDialog({ type: 'unread', item })} />
                  {!!item.attachments?.length && <Chip size="small" icon={<AttachFile />} label={`${item.attachments.length} ek`} />}
                </Stack>
              </Box>
              <Box className="announcement-actions">
                <Button size="small" startIcon={<Preview />} onClick={() => setDialog({ type: 'preview', item })}>Önizle</Button>
                {!isExpired(item) && <Button size="small" startIcon={<Edit />} onClick={() => openEdit(item)}>Düzenle</Button>}
                <Button size="small" color="error" startIcon={<Delete />} onClick={() => setDialog({ type: 'delete', item })}>Sil</Button>
              </Box>
            </Paper>
          })}
        </Box>
      ) : <Paper className="glass announcement-empty" elevation={0}><Campaign /><Typography fontWeight={900}>{tab === 'archive' ? 'Arşivlenmiş duyuru yok.' : 'Bu sınıfa ait aktif duyuru yok.'}</Typography></Paper>}

      <Dialog open={dialog?.type === 'form'} onClose={() => !processingFiles && setDialog(null)} fullWidth maxWidth="md">
        <DialogTitle>{dialog?.id ? 'Duyuruyu Düzenle' : 'Duyuru Yap'}</DialogTitle>
        <DialogContent className="announcement-form">
          <TextField label="Duyuru başlığı" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} fullWidth />
          <TextField label="Duyuru metni" value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} fullWidth multiline minRows={4} />
          <RadioGroup row value={form.audienceType} onChange={event => setForm({ ...form, audienceType: event.target.value, selectedStudentIds: [] })}>
            <FormControlLabel value="class" control={<Radio />} label="Sınıfın tamamı" />
            <FormControlLabel value="selected" control={<Radio />} label="Seçili öğrenciler" />
          </RadioGroup>
          {form.audienceType === 'selected' && <Box className="announcement-student-picker">
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography fontWeight={900}>Öğrencileri seçin</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => setForm({ ...form, selectedStudentIds: students.map(item => item.id) })}>Tümünü Seç</Button>
                <Button size="small" onClick={() => setForm({ ...form, selectedStudentIds: [] })}>Temizle</Button>
              </Stack>
            </Stack>
            {students.map(student => <button type="button" className={`announcement-student-option ${form.selectedStudentIds.includes(student.id) ? 'selected' : ''}`} onClick={() => toggleStudent(student.id)} key={student.id}>
              <span>{student.student_number}</span><b>{student.first_name} {student.last_name}</b>{form.selectedStudentIds.includes(student.id) && <CheckCircle />}
            </button>)}
          </Box>}
          <Box className="announcement-date-grid">
            <TextField label="Yayın tarihi" type="date" value={form.publishDate} onChange={event => setForm({ ...form, publishDate: event.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField label="Son gösterim tarihi (isteğe bağlı)" type="date" value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })} InputLabelProps={{ shrink: true }} />
          </Box>
          <Box className="announcement-upload-box">
            <Button component="label" variant="outlined" startIcon={<AttachFile />} disabled={processingFiles || form.attachments.length >= MAX_FILES}>
              Görsel veya Dosya Ekle
              <input hidden multiple type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={handleFiles} />
            </Button>
            <Typography variant="caption" color="text.secondary">En fazla 5 dosya, dosya başına 2 MB</Typography>
          </Box>
          {!!form.attachments.length && <Box className="announcement-attachment-list">
            {form.attachments.map(file => <Paper variant="outlined" key={file.id} className="announcement-attachment-item">
              {file.type.startsWith('image/') ? <Image /> : <InsertDriveFile />}
              <Box><Typography fontWeight={850}>{file.name}</Typography><Typography variant="caption">{Math.ceil(file.size / 1024)} KB</Typography></Box>
              <Button color="error" size="small" onClick={() => setForm({ ...form, attachments: form.attachments.filter(item => item.id !== file.id) })}>Kaldır</Button>
            </Paper>)}
          </Box>}
        </DialogContent>
        <DialogActions><Button onClick={() => setDialog(null)}>İptal</Button><Button variant="contained" onClick={saveAnnouncement} disabled={processingFiles}>{dialog?.id ? 'Güncelle' : 'Yayınla'}</Button></DialogActions>
      </Dialog>

      <Dialog open={dialog?.type === 'preview'} onClose={() => setDialog(null)} fullWidth maxWidth="md">
        <DialogTitle>Duyuru Önizleme</DialogTitle>
        <DialogContent>{dialog?.item && <AnnouncementPreview item={dialog.item} />}</DialogContent>
        <DialogActions><Button onClick={() => setDialog(null)}>Kapat</Button></DialogActions>
      </Dialog>

      <Dialog open={dialog?.type === 'unread'} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Henüz Okumayan Veliler</DialogTitle>
        <DialogContent><Stack spacing={1}>{dialog?.item?.recipientIds.filter(id => !dialog.item.readBy?.[id]).map(id => <Paper variant="outlined" sx={{ p: 1.2 }} key={id}><Typography fontWeight={850}>{dialog.item.recipientNames?.[id] || 'Öğrenci'}</Typography></Paper>)}</Stack></DialogContent>
        <DialogActions><Button onClick={() => setDialog(null)}>Kapat</Button></DialogActions>
      </Dialog>

      <Dialog open={dialog?.type === 'delete'} onClose={() => setDialog(null)}>
        <DialogTitle>Duyuru silinsin mi?</DialogTitle>
        <DialogContent><Typography>“{dialog?.item?.title}” kalıcı olarak silinecek.</Typography></DialogContent>
        <DialogActions><Button onClick={() => setDialog(null)}>Vazgeç</Button><Button color="error" variant="contained" onClick={deleteAnnouncement}>Sil</Button></DialogActions>
      </Dialog>

      <Snackbar open={Boolean(message)} autoHideDuration={3000} onClose={() => setMessage('')} message={message} />
    </Box>
  )
}

export function AnnouncementPreview({ item }) {
  return <Box className="announcement-preview">
    <Typography variant="h5" fontWeight={950}>{item.title}</Typography>
    <Typography variant="caption" color="text.secondary">{item.className} · {localDate(item.publishDate)}</Typography>
    <Typography className="announcement-preview-body">{item.body}</Typography>
    {!!item.attachments?.length && <Box className="announcement-preview-files">
      {item.attachments.map(file => file.type.startsWith('image/') ? <Box className="announcement-preview-image" key={file.id}>
        <img src={file.dataUrl} alt={file.name} />
        <Button startIcon={<Download />} onClick={() => downloadAttachment(file)}>Görseli İndir</Button>
      </Box> : <Paper variant="outlined" className="announcement-download-row" key={file.id}>
        <InsertDriveFile /><Box><Typography fontWeight={900}>{file.name}</Typography><Typography variant="caption">{Math.ceil(file.size / 1024)} KB</Typography></Box><Button startIcon={<Download />} onClick={() => downloadAttachment(file)}>İndir</Button>
      </Paper>)}
    </Box>}
  </Box>
}

function emptyForm() {
  return { title: '', body: '', audienceType: 'class', selectedStudentIds: [], publishDate: todayValue(), endDate: '', attachments: [] }
}
