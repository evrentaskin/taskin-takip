import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, FormControlLabel,
  IconButton, InputLabel, MenuItem, Paper, Radio, RadioGroup, Select,
  Snackbar, Stack, TextField, Typography
} from '@mui/material'
import {
  AddTask, Archive, Assignment, CheckCircle, Close, Delete, Edit,
  Event, Groups, History, HowToReg,
  Save, Search, TaskAlt
} from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { useSharedCloudState } from '../services/useSharedCloudState'

const STORAGE_KEY = 'taskin-akademi-v64-homeworks'
const STATUS = {
  done: { label: 'Yaptı', color: '#07883f', bg: '#e4f7ec' },
  missing: { label: 'Yapmadı', color: '#d51f26', bg: '#ffe8e9' },
  absent: { label: 'Gelmedi', color: '#ef6c00', bg: '#fff0df' }
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d
}
const isArchived = (hw) => new Date() > addDays(hw.dueDate, 10)
const formatDate = (value) => value ? new Intl.DateTimeFormat('tr-TR').format(new Date(`${value}T00:00:00`)) : '-'

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function HomeworkPage() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [homeworks, setHomeworks, homeworksCloudReady] = useSharedCloudState({
    stateKey: 'homeworks-v1', localKey: STORAGE_KEY, fallback: loadStored(),
    onError: err => setError(`Ödevler buluta kaydedilemedi: ${err?.message || err}`)
  })
  const [loading, setLoading] = useState(true)
  const [studentLoading, setStudentLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [controlOpen, setControlOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [controlling, setControlling] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', dueDate: '', audience: 'class', studentIds: []
  })

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

      const activeClassIds = new Set((activeResult.data || []).map(item => item.class_id).filter(Boolean))
      const activeClasses = (classResult.data || []).filter(c =>
        activeClassIds.has(c.id) &&
        !c.is_lgs &&
        !String(c.name).toLocaleLowerCase('tr-TR').includes('lgs')
      )

      setClasses(activeClasses)
      setSelectedClass(current =>
        activeClasses.some(c => c.id === current)
          ? current
          : (activeClasses[0]?.id || '')
      )

      if (!activeClasses.length) {
        setStudents([])
      }
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
    const { data, error } = await supabase
      .from('students')
      .select('id,student_number,first_name,last_name,class_id,is_active')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('student_number')
    if (error) setError(error.message)
    else setStudents(data || [])
    setStudentLoading(false)
  }

  const selectedClassInfo = classes.find(c => c.id === selectedClass)
  const classHomeworks = useMemo(() => homeworks.filter(h => h.classId === selectedClass), [homeworks, selectedClass])
  const activeHomeworks = classHomeworks.filter(h => !isArchived(h)).sort((a,b) => b.createdAt.localeCompare(a.createdAt))
  const archivedHomeworks = classHomeworks.filter(isArchived).sort((a,b) => b.dueDate.localeCompare(a.dueDate))

  function openCreate() {
    setEditing(null)
    setForm({ title: '', description: '', dueDate: '', audience: 'class', studentIds: [] })
    setCreateOpen(true)
  }

  function openEdit(hw) {
    setEditing(hw)
    setForm({
      title: hw.title,
      description: hw.description || '',
      dueDate: hw.dueDate,
      audience: hw.audience,
      studentIds: hw.studentIds || []
    })
    setCreateOpen(true)
  }

  function saveHomework() {
    if (!form.title.trim()) return setError('Ödev adı zorunludur.')
    if (!form.dueDate) return setError('Teslim tarihi seçilmelidir.')
    if (form.audience === 'selected' && form.studentIds.length === 0) return setError('En az bir öğrenci seçmelisiniz.')

    const targetStudents = form.audience === 'class' ? students.map(s => s.id) : form.studentIds
    const studentSnapshot = students
      .filter(s => targetStudents.includes(s.id))
      .map(s => ({ id: s.id, number: s.student_number, name: `${s.first_name} ${s.last_name}` }))

    if (editing) {
      setHomeworks(list => list.map(h => h.id === editing.id ? {
        ...h,
        title: form.title.trim(), description: form.description.trim(), dueDate: form.dueDate,
        audience: form.audience, studentIds: targetStudents, studentSnapshot,
        statuses: Object.fromEntries(targetStudents.map(id => [id, h.statuses?.[id] || '']))
      } : h))
      setMessage('Ödev güncellendi.')
    } else {
      const hw = {
        id: crypto.randomUUID(),
        classId: selectedClass,
        className: selectedClassInfo?.name || '',
        title: form.title.trim(),
        description: form.description.trim(),
        dueDate: form.dueDate,
        createdAt: todayIso(),
        audience: form.audience,
        studentIds: targetStudents,
        studentSnapshot,
        statuses: Object.fromEntries(targetStudents.map(id => [id, '']))
      }
      setHomeworks(list => [hw, ...list])
      setMessage('Ödev verildi.')
    }
    setCreateOpen(false)
  }

  function deleteHomework(hw) {
    if (!window.confirm(`“${hw.title}” ödevi ve kontrol kayıtları silinsin mi?`)) return
    setHomeworks(list => list.filter(h => h.id !== hw.id))
    setMessage('Ödev silindi.')
  }

  function openControl(hw) {
    setControlling(structuredClone(hw))
    setSearch('')
    setControlOpen(true)
  }

  function setStudentStatus(studentId, status) {
    setControlling(hw => ({ ...hw, statuses: { ...hw.statuses, [studentId]: status } }))
  }

  function saveControl() {
    setHomeworks(list => list.map(h => h.id === controlling.id ? controlling : h))
    setControlOpen(false)
    setMessage('Ödev kontrolü kaydedildi.')
  }

  function summary(hw) {
    const values = Object.values(hw.statuses || {})
    return {
      done: values.filter(x => x === 'done').length,
      missing: values.filter(x => x === 'missing').length,
      absent: values.filter(x => x === 'absent').length,
      pending: values.filter(x => !x).length
    }
  }

  if (loading || !homeworksCloudReady) return <Box className="loader compact"><CircularProgress /></Box>

  return (
    <Box className="homework-page">
      <Box className="page-head homework-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>Ödevler</Typography>
          <Typography color="text.secondary">Seçili sınıf için ödev verme ve kontrol merkezi</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button startIcon={<Archive />} variant="outlined" onClick={() => setArchiveOpen(true)}>
            Ödev Arşivi ({archivedHomeworks.length})
          </Button>
          <Button startIcon={<AddTask />} variant="contained" onClick={openCreate} disabled={!selectedClass}>
            Ödev Ver
          </Button>
        </Stack>
      </Box>

      <Paper className="glass homework-classbar" elevation={0}>
        <FormControl fullWidth size="small">
          <InputLabel>Aktif sınıf</InputLabel>
          <Select value={selectedClass} label="Aktif sınıf" onChange={e => setSelectedClass(e.target.value)}>
            {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
        <Box className="homework-class-summary">
          <Groups />
          <Box>
            <Typography fontWeight={900}>{selectedClassInfo?.name || 'Sınıf seçilmedi'}</Typography>
            <Typography variant="caption" color="text.secondary">{students.length} aktif öğrenci</Typography>
          </Box>
        </Box>
      </Paper>

      {studentLoading ? <Box className="loader compact"><CircularProgress /></Box> : activeHomeworks.length === 0 ? (
        <Paper className="glass empty" elevation={0}>
          <Assignment sx={{ fontSize: 64 }} />
          <Typography variant="h6" fontWeight={900}>Aktif ödev bulunmuyor</Typography>
          <Typography color="text.secondary">Bu sınıfa ilk ödevi vermek için “Ödev Ver” butonunu kullanın.</Typography>
        </Paper>
      ) : (
        <Box className="homework-grid">
          {activeHomeworks.map(hw => <HomeworkCard key={hw.id} hw={hw} stats={summary(hw)} onControl={openControl} onEdit={openEdit} onDelete={deleteHomework} />)}
        </Box>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span>{editing ? 'Ödevi Düzenle' : 'Ödev Ver'}</span>
          <IconButton onClick={() => setCreateOpen(false)}><Close /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.2} sx={{ pt:1 }}>
            <Alert severity="info">Ödev yalnızca <strong>{selectedClassInfo?.name}</strong> sınıfına verilecektir.</Alert>
            <Box>
              <Typography fontWeight={900} sx={{ mb:.5 }}>Ödev kime verilecek?</Typography>
              <RadioGroup row value={form.audience} onChange={e => setForm(f => ({ ...f, audience:e.target.value, studentIds:[] }))}>
                <FormControlLabel value="class" control={<Radio />} label="Sınıfın tamamı" />
                <FormControlLabel value="selected" control={<Radio />} label="Seçili öğrenciler" />
              </RadioGroup>
            </Box>

            {form.audience === 'selected' && (
              <Paper variant="outlined" className="homework-student-picker">
                <Box className="homework-picker-head">
                  <Typography fontWeight={900}>Öğrenciler</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => setForm(f => ({ ...f, studentIds: students.map(s => s.id) }))}>Tümünü seç</Button>
                    <Button size="small" color="inherit" onClick={() => setForm(f => ({ ...f, studentIds: [] }))}>Temizle</Button>
                  </Stack>
                </Box>
                <Box className="homework-picker-grid">
                  {students.map(s => {
                    const checked = form.studentIds.includes(s.id)
                    return <button key={s.id} type="button" className={`homework-student-choice ${checked ? 'selected' : ''}`} onClick={() => setForm(f => ({ ...f, studentIds: checked ? f.studentIds.filter(id => id !== s.id) : [...f.studentIds, s.id] }))}>
                      <span>{s.student_number}</span><b>{s.first_name} {s.last_name}</b>{checked && <CheckCircle fontSize="small" />}
                    </button>
                  })}
                </Box>
              </Paper>
            )}

            <TextField label="Ödev adı" required value={form.title} onChange={e => setForm(f => ({ ...f, title:e.target.value }))} />
            <TextField label="Açıklama (isteğe bağlı)" multiline minRows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description:e.target.value }))} />
            <TextField label="Teslim tarihi" type="date" required value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate:e.target.value }))} InputLabelProps={{ shrink:true }} inputProps={{ min:todayIso() }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p:2 }}>
          <Button onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button startIcon={<Save />} variant="contained" onClick={saveHomework}>{editing ? 'Güncelle' : 'Ödevi Ver'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={controlOpen} onClose={() => setControlOpen(false)} fullWidth maxWidth="md" className="homework-control-dialog" PaperProps={{ sx:{ height:'min(86vh, 820px)', maxHeight:'86vh', overflow:'hidden' } }}>
        {controlling && <>
          <DialogTitle sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <Box><Typography variant="h6" fontWeight={950}>{controlling.title}</Typography><Typography variant="caption" color="text.secondary">Ödev kontrol paneli</Typography></Box>
            <IconButton onClick={() => setControlOpen(false)}><Close /></IconButton>
          </DialogTitle>
          <DialogContent dividers className="homework-control-content">
            <Stack spacing={2} className="homework-control-layout">
              <Box className="homework-control-summary">
                {Object.entries(STATUS).map(([key, cfg]) => <Chip
                  key={key}
                  label={`${cfg.label}: ${Object.values(controlling.statuses || {}).filter(x => x === key).length}`}
                  sx={{ color:'#fff', bgcolor:cfg.color, fontWeight:950, '& .MuiChip-label':{ px:2 } }}
                />)}
              </Box>
              <TextField size="small" placeholder="Öğrenci ara..." value={search} onChange={e => setSearch(e.target.value)} InputProps={{ startAdornment:<Search sx={{ mr:1, color:'text.secondary' }} /> }} />
              <Box className="homework-control-list">
                {controlling.studentSnapshot.filter(s => `${s.number} ${s.name}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))).map(s => (
                  <Box className="homework-control-row" key={s.id}>
                    <Box className="homework-control-student"><strong>{s.number}</strong><span>{s.name}</span></Box>
                    <Box className="homework-status-buttons">
                      {Object.entries(STATUS).map(([key,cfg]) => {
                        const active = controlling.statuses?.[s.id] === key
                        return <Button
                          key={key}
                          startIcon={active ? <CheckCircle /> : undefined}
                          aria-pressed={active}
                          onClick={() => setStudentStatus(s.id, key)}
                          variant={active ? 'contained' : 'outlined'}
                          sx={{
                            color: active ? '#fff' : cfg.color,
                            bgcolor: active ? cfg.color : cfg.bg,
                            borderColor: active ? cfg.color : `${cfg.color}55`,
                            fontWeight:950,
                            boxShadow: active ? `0 6px 16px ${cfg.color}45` : 'none',
                            '&:hover': {
                              bgcolor: active ? cfg.color : `${cfg.color}20`,
                              borderColor: cfg.color,
                              boxShadow: active ? `0 7px 18px ${cfg.color}55` : 'none'
                            }
                          }}
                        >{cfg.label}</Button>
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p:2 }}>
            <Button onClick={() => setControlOpen(false)}>İptal</Button>
            <Button startIcon={<Save />} variant="contained" onClick={saveControl}>Kontrolü Kaydet</Button>
          </DialogActions>
        </>}
      </Dialog>

      <Dialog open={archiveOpen} onClose={() => setArchiveOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}><span>{selectedClassInfo?.name} Ödev Arşivi</span><IconButton onClick={() => setArchiveOpen(false)}><Close /></IconButton></DialogTitle>
        <DialogContent dividers>
          {archivedHomeworks.length === 0 ? <Box className="empty"><History sx={{ fontSize:56 }} /><Typography fontWeight={900}>Arşivlenmiş ödev yok</Typography></Box> : <Stack spacing={1.5}>
            {archivedHomeworks.map(hw => <HomeworkCard key={hw.id} hw={hw} stats={summary(hw)} onControl={openControl} onEdit={openEdit} onDelete={deleteHomework} archived />)}
          </Stack>}
        </DialogContent>
      </Dialog>

      <Snackbar open={!!message} autoHideDuration={2500} onClose={() => setMessage('')} message={message} />
      <Snackbar open={!!error} autoHideDuration={4500} onClose={() => setError('')}><Alert severity="error" onClose={() => setError('')}>{error}</Alert></Snackbar>
    </Box>
  )
}

function HomeworkCard({ hw, stats, onControl, onEdit, onDelete, archived=false }) {
  const total = hw.studentSnapshot?.length || 0
  return <Paper className="glass homework-card" elevation={0}>
    <Box className="homework-card-icon"><Assignment /></Box>
    <Box className="homework-card-body">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Box><Typography variant="h6" fontWeight={950}>{hw.title}</Typography><Typography variant="caption" color="text.secondary">{hw.audience === 'class' ? 'Sınıfın tamamı' : `${total} seçili öğrenci`}</Typography></Box>
        {archived && <Chip icon={<Archive />} label="Arşiv" size="small" />}
      </Stack>
      {hw.description && <Typography className="homework-description">{hw.description}</Typography>}
      <Box className="homework-dates"><span><Event fontSize="small" /> Veriliş: {formatDate(hw.createdAt)}</span><span><TaskAlt fontSize="small" /> Teslim: {formatDate(hw.dueDate)}</span></Box>
      <Box className="homework-stats">
        <span className="done">Yaptı <b>{stats.done}</b></span>
        <span className="missing">Yapmadı <b>{stats.missing}</b></span>
        <span className="absent">Gelmedi <b>{stats.absent}</b></span>
      </Box>
      <Divider />
      <Box className="homework-card-actions">
        <Button startIcon={<HowToReg />} variant="contained" onClick={() => onControl(hw)}>Kontrol Et</Button>
        <IconButton title="Düzenle" onClick={() => onEdit(hw)}><Edit /></IconButton>
        <IconButton title="Sil" color="error" onClick={() => onDelete(hw)}><Delete /></IconButton>
      </Box>
    </Box>
  </Paper>
}
