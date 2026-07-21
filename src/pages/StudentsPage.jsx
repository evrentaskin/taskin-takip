import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Alert, Avatar, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper,
  Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography
} from '@mui/material'
import {
  Add, Close, Computer, ContentCopy, Delete, Download, Edit, Groups, Key, Person, PhoneAndroid, PictureAsPdf, Refresh, Save, TableView, Today, UploadFile, Visibility, VisibilityOff, WarningAmber
} from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { readSharedState } from '../services/sharedState'
import { DEFAULT_STUDENT_PROFILE_FIELDS, STUDENT_PROFILE_SCHEMA_STATE_KEY, mergeProfileFields } from '../utils/studentProfileSchema'
import { isValidUsername, toAuthSafeUsername, USERNAME_HELP } from '../utils/username'
import StudentProfileDialog from '../components/StudentProfileDialog'
import { AVATARS, avatarSrc } from '../utils/avatars'

const emptyStudent = {
  id: null,
  auth_user_id: null,
  class_id: '',
  student_number: '',
  first_name: '',
  last_name: '',
  username: '',
  password: '',
  avatar_id: 1
}

const CREDENTIALS_KEY = 'taskin-takip-student-credentials-v1'
const loadCredentials = () => { try { return JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || '{}') } catch { return {} } }
const saveCredential = (username, password) => {
  if (!username || !password) return
  const credentials = loadCredentials()
  credentials[String(username).toLowerCase()] = String(password)
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
}

const safeText = (v) => v == null ? '' : String(v)
const normalizeHeader = (v) => safeText(v)
  .replace(/^\uFEFF/, '')
  .trim()
  .toLocaleLowerCase('tr-TR')
  .replaceAll('ı', 'i')
  .replaceAll('ş', 's')
  .replaceAll('ğ', 'g')
  .replaceAll('ü', 'u')
  .replaceAll('ö', 'o')
  .replaceAll('ç', 'c')
  .replace(/[^a-z0-9]/g, '')

const headerMap = {
  sinif: 'class_name',
  sınıf: 'class_name',
  numara: 'student_number',
  no: 'student_number',
  okulnumarasi: 'student_number',
  ogrencino: 'student_number',
  ogrencinumarasi: 'student_number',
  ogrencinumara: 'student_number',
  ad: 'first_name',
  isim: 'first_name',
  soyad: 'last_name',
  soyisim: 'last_name',
  kullaniciadi: 'username',
  kullanici: 'username',
  kullaniciismi: 'username',
  username: 'username',
  sifre: 'password',
  parola: 'password',
  password: 'password'
}

const REPORT_FIELDS = [
  ['number','Numara'],['mother','Anne adı'],['father','Baba adı'],['motherPhone','Anne telefonu'],['fatherPhone','Baba telefonu'],
  ['motherAlive','Anne sağ'],['fatherAlive','Baba sağ'],['motherWorks','Anne çalışıyor'],['fatherWorks','Baba çalışıyor'],['livesWith','Kiminle yaşıyor'],
  ['siblings','Kardeş sayısı'],['studyRoom','Çalışma odası var'],['internet','İnternet var'],['computer','Bilgisayar var'],['tablet','Tablet var'],
  ['financial','Maddi durum'],['resourceSupport','Kaynak desteği gerekiyor'],['service','Servis kullanıyor'],['scholarship','Burslu'],
  ['chronic','Kronik hastalık'],['allergy','Alerji'],['eye','Göz problemi'],['hearing','İşitme problemi'],['privateLesson','Özel ders'],
  ['study','Etüt'],['ram','RAM'],['guidance','Rehberlik'],['teacherNotes','Öğretmen notları']
]
const REPORT_PROFILE_KEYS = {
  mother:'default-0', father:'default-1', motherPhone:'default-2', fatherPhone:'default-3', motherAlive:'default-4', fatherAlive:'default-5',
  motherWorks:'default-6', fatherWorks:'default-7', livesWith:'default-8', siblings:'default-9', studyRoom:'default-10', internet:'default-11',
  computer:'default-12', tablet:'default-13', financial:'default-14', resourceSupport:'default-15', service:'default-16', scholarship:'default-17',
  chronic:'default-18', allergy:'default-19', eye:'default-20', hearing:'default-21', privateLesson:'default-22', study:'default-23', ram:'default-24',
  guidance:'default-25', teacherNotes:'default-26'
}

export default function StudentsPage() {
  const [classes, setClasses] = useState([])
  const [activeClasses, setActiveClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyStudent)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileStudent, setProfileStudent] = useState(null)
  const [studentProfile, setStudentProfile] = useState({ gender:'', wears_glasses:false, height_group:'normal', talkative:false, hardworking:false, needs_support:false, front_row:false, notes:'', tags:[] })
  const [tagInput, setTagInput] = useState('')
  const [profileTags, setProfileTags] = useState([])
  const [tagSaving, setTagSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [credentialsOpen, setCredentialsOpen] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)
  const [credentialsVersion, setCredentialsVersion] = useState(0)
  const [classDeleteOpen, setClassDeleteOpen] = useState(false)
  const [classDeleteText, setClassDeleteText] = useState('')
  const [classDeleting, setClassDeleting] = useState(false)
  const [todayLogins, setTodayLogins] = useState([])
  const [todayLoginsLoading, setTodayLoginsLoading] = useState(false)
  const [todayLoginsOpen, setTodayLoginsOpen] = useState(false)
  const [inactiveStudents, setInactiveStudents] = useState([])
  const [inactiveStudentsLoading, setInactiveStudentsLoading] = useState(false)
  const [inactiveStudentsOpen, setInactiveStudentsOpen] = useState(false)
  const [inactiveStudentsSort, setInactiveStudentsSort] = useState('least-logins')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState('pdf')
  const [reportFields, setReportFields] = useState(REPORT_FIELDS.map(x => x[0]))
  const [customReportFields, setCustomReportFields] = useState([])

  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => { loadClasses(); loadTodayLogins(); loadProfileTags() }, [])
  useEffect(() => {
    const refresh = () => loadTodayLogins()
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => { if (selectedClass) loadStudents(selectedClass) }, [selectedClass])
  useEffect(() => { if (activeClasses.length) loadInactiveStudents(activeClasses.map(item => item.id)) }, [activeClasses])

  async function loadTodayLogins() {
    setTodayLoginsLoading(true)
    try {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)

      const { data: events, error: eventsError } = await supabase
        .from('student_login_events')
        .select('user_id,logged_in_at,device_type')
        .gte('logged_in_at', start.toISOString())
        .lt('logged_in_at', end.toISOString())
        .order('logged_in_at', { ascending: false })

      if (eventsError) {
        if (!String(eventsError.message || '').toLowerCase().includes('does not exist')) console.warn(eventsError)
        setTodayLogins([])
        return
      }

      const userIds = [...new Set((events || []).map(item => item.user_id).filter(Boolean))]
      if (!userIds.length) { setTodayLogins([]); return }

      const [{ data: studentRows, error: studentError }, { data: classRows }] = await Promise.all([
        supabase.from('students').select('id,auth_user_id,student_number,first_name,last_name,class_id,is_active').in('auth_user_id', userIds).eq('is_active', true),
        supabase.from('classes').select('id,name')
      ])
      if (studentError) throw studentError

      const studentByUser = new Map((studentRows || []).map(item => [item.auth_user_id, item]))
      const classById = new Map((classRows || []).map(item => [item.id, item.name]))
      const grouped = new Map()
      for (const event of events || []) {
        const student = studentByUser.get(event.user_id)
        if (!student) continue
        const current = grouped.get(event.user_id)
        if (!current) {
          grouped.set(event.user_id, {
            ...student,
            class_name: classById.get(student.class_id) || '-',
            last_login_at: event.logged_in_at,
            device_type: event.device_type || 'bilgisayar',
            login_count: 1
          })
        } else {
          current.login_count += 1
        }
      }
      setTodayLogins([...grouped.values()].sort((a, b) => new Date(b.last_login_at) - new Date(a.last_login_at)))
    } catch (err) {
      console.warn('Bugünkü girişler alınamadı', err)
      setTodayLogins([])
    } finally {
      setTodayLoginsLoading(false)
    }
  }

  function loginTime(value) {
    if (!value) return '-'
    return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
  }

  async function loadClasses() {
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

      const allClasses = classesResult.data ?? []
      const activeIds = new Set((activeResult.data ?? []).map(item => item.class_id))
      const teacherClasses = activeIds.size ? allClasses.filter(item => activeIds.has(item.id)) : allClasses

      setClasses(allClasses)
      setActiveClasses(teacherClasses)
      setSelectedClass(current => teacherClasses.some(item => item.id === current) ? current : (teacherClasses[0]?.id || ''))
    } catch (err) {
      setError(err?.message || 'Sınıflar yüklenemedi.')
      setClasses([])
      setActiveClasses([])
      setSelectedClass('')
    } finally {
      setLoading(false)
    }
  }

  async function loadInactiveStudents(classIds) {
    setInactiveStudentsLoading(true)
    try {
      if (!classIds?.length) { setInactiveStudents([]); return }
      const { data: studentRows, error: studentError } = await supabase
        .from('students')
        .select('id,auth_user_id,student_number,first_name,last_name,class_id,is_active')
        .in('class_id', classIds)
        .eq('is_active', true)
      if (studentError) throw studentError

      const userIds = [...new Set((studentRows || []).map(item => item.auth_user_id).filter(Boolean))]
      let events = []
      if (userIds.length) {
        const { data, error } = await supabase
          .from('student_login_events')
          .select('user_id,logged_in_at')
          .in('user_id', userIds)
          .order('logged_in_at', { ascending: false })
        if (error && !String(error.message || '').toLowerCase().includes('does not exist')) throw error
        events = data || []
      }

      const latestByUser = new Map()
      const loginCountByUser = new Map()
      for (const event of events) {
        if (!latestByUser.has(event.user_id)) latestByUser.set(event.user_id, event.logged_in_at)
        loginCountByUser.set(event.user_id, (loginCountByUser.get(event.user_id) || 0) + 1)
      }
      const classById = new Map(activeClasses.map(item => [item.id, item.name]))
      const now = Date.now()
      const threshold = 5 * 24 * 60 * 60 * 1000
      const rows = (studentRows || []).map(student => {
        const last = latestByUser.get(student.auth_user_id) || null
        const elapsed = last ? now - new Date(last).getTime() : Number.POSITIVE_INFINITY
        return {
          ...student,
          class_name: classById.get(student.class_id) || '-',
          last_login_at: last,
          days_inactive: last ? Math.floor(elapsed / (24 * 60 * 60 * 1000)) : null,
          login_count: loginCountByUser.get(student.auth_user_id) || 0,
          elapsed
        }
      }).filter(item => item.elapsed >= threshold)
        .sort((a, b) => b.elapsed - a.elapsed || String(a.class_name).localeCompare(String(b.class_name), 'tr'))
      setInactiveStudents(rows)
    } catch (err) {
      console.warn('Giriş yapmayan öğrenciler alınamadı', err)
      setInactiveStudents([])
    } finally {
      setInactiveStudentsLoading(false)
    }
  }

  const sortedInactiveStudents = useMemo(() => {
    const rows = [...inactiveStudents]
    const nameOf = item => `${safeText(item.first_name)} ${safeText(item.last_name)}`.trim()
    const numberOf = item => {
      const value = Number(item.student_number)
      return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
    }

    if (inactiveStudentsSort === 'name') {
      return rows.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'tr-TR', { sensitivity: 'base' }) || numberOf(a) - numberOf(b))
    }
    if (inactiveStudentsSort === 'number') {
      return rows.sort((a, b) => numberOf(a) - numberOf(b) || nameOf(a).localeCompare(nameOf(b), 'tr-TR', { sensitivity: 'base' }))
    }
    if (inactiveStudentsSort === 'never-first') {
      return rows.sort((a, b) => {
        const aNever = a.last_login_at ? 1 : 0
        const bNever = b.last_login_at ? 1 : 0
        return aNever - bNever || b.elapsed - a.elapsed || nameOf(a).localeCompare(nameOf(b), 'tr-TR', { sensitivity: 'base' })
      })
    }
    return rows.sort((a, b) =>
      Number(a.login_count || 0) - Number(b.login_count || 0) ||
      b.elapsed - a.elapsed ||
      nameOf(a).localeCompare(nameOf(b), 'tr-TR', { sensitivity: 'base' })
    )
  }, [inactiveStudents, inactiveStudentsSort])

  async function loadStudents(classId) {
    setLoading(true)
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('student_number')
    if (error) setError(error.message)
    else setStudents(data ?? [])
    setLoading(false)
  }

  function openAdd() {
    setForm({ ...emptyStudent, class_id: selectedClass || classes[0]?.id || '' })
    setDialogOpen(true)
  }

  function openEdit(s) {
    setForm({
      id: s.id,
      auth_user_id: s.auth_user_id,
      class_id: safeText(s.class_id),
      student_number: safeText(s.student_number),
      first_name: safeText(s.first_name),
      last_name: safeText(s.last_name),
      username: safeText(s.username),
      password: '',
      avatar_id: Number(s.avatar_id || 1)
    })
    setDialogOpen(true)
  }

  async function loadProfileTags() {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) return

    // İlk kullanımda önerilen etiketleri bir kez oluşturur. Kullanıcı daha sonra
    // bunları silebilir; silinen etiketler yeniden eklenmez.
    const initResult = await supabase.rpc('initialize_student_profile_tags')
    if (initResult.error && !String(initResult.error.message || '').includes('initialize_student_profile_tags')) {
      console.warn('Etiket başlangıcı yapılamadı', initResult.error)
    }

    const { data, error } = await supabase
      .from('student_profile_tags')
      .select('id,label')
      .eq('teacher_id', authData.user.id)
      .order('label')
    if (error) {
      // Migration henüz çalıştırılmadıysa öğrenciler ekranının geri kalanı çalışmaya devam etsin.
      if (!String(error.message || '').includes('student_profile_tags')) setError(error.message)
      return
    }
    setProfileTags(data || [])
  }

  function openProfile(student) {
    setProfileStudent(student)
    setProfileOpen(true)
  }

  async function saveProfile() {
    if (!profileStudent) return
    setSaving(true)
    const normalizedTags = (studentProfile.tags || []).map(x => String(x).toLocaleLowerCase('tr-TR'))
    const hasTag = (...labels) => labels.some(label => normalizedTags.includes(label.toLocaleLowerCase('tr-TR')))
    const payload = {
      ...studentProfile,
      // Eski sütunları etiketlerle eş zamanlı tutuyoruz. Böylece akıllı dağıtım
      // hem yeni etiket sistemini hem de önceki kayıtları kullanabilir.
      wears_glasses: hasTag('Gözlüklü'),
      height_group: hasTag('Kısa boylu') ? 'short' : (hasTag('Uzun boylu') ? 'tall' : 'normal'),
      talkative: hasTag('Çok konuşuyor'),
      hardworking: hasTag('Çalışkan'),
      needs_support: hasTag('Ders desteğine ihtiyacı var', 'Ders çalışmıyor'),
      front_row: hasTag('Ön sırada oturmalı'),
      gender: studentProfile.gender || null,
      student_id: profileStudent.id,
      updated_at: new Date().toISOString()
    }
    delete payload.created_at
    const { error } = await supabase.from('student_profiles').upsert(payload, { onConflict: 'student_id' })
    setSaving(false)
    if (error) setError(error.message)
    else { setProfileOpen(false); setMessage('Öğrenci profili kaydedildi.') }
  }

  function toggleProfileTag(label) {
    setStudentProfile(p => {
      const tags = p.tags || []
      return { ...p, tags: tags.includes(label) ? tags.filter(x => x !== label) : [...tags, label] }
    })
  }

  async function addTag() {
    const label = tagInput.trim().replace(/\s+/g, ' ')
    if (!label) return
    const existing = profileTags.find(t => t.label.toLocaleLowerCase('tr-TR') === label.toLocaleLowerCase('tr-TR'))
    if (existing) {
      if (!(studentProfile.tags || []).includes(existing.label)) toggleProfileTag(existing.label)
      setTagInput('')
      return
    }
    setTagSaving(true)
    const { data: authData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('student_profile_tags')
      .insert({ teacher_id: authData.user.id, label })
      .select('id,label')
      .single()
    setTagSaving(false)
    if (error) { setError(error.message); return }
    setProfileTags(tags => [...tags, data].sort((a,b) => a.label.localeCompare(b.label, 'tr')))
    setStudentProfile(p => ({ ...p, tags: [...new Set([...(p.tags || []), data.label])] }))
    setTagInput('')
  }

  async function deleteProfileTag(tag) {
    if (!window.confirm(`“${tag.label}” etiketi tüm öğrencilerden silinsin mi?`)) return
    setTagSaving(true)
    const { error } = await supabase.rpc('delete_student_profile_tag', { p_tag_id: tag.id })
    setTagSaving(false)
    if (error) { setError(error.message); return }
    setProfileTags(tags => tags.filter(x => x.id !== tag.id))
    setStudentProfile(p => ({ ...p, tags: (p.tags || []).filter(x => x !== tag.label) }))
    setMessage(`“${tag.label}” etiketi silindi.`)
  }

  async function invokeAccount(body) {
    const { data, error } = await supabase.functions.invoke('student-account', { body })
    if (error) {
      let detail = error.message
      try {
        const context = error.context
        if (context && typeof context.json === 'function') {
          const responseBody = await context.json()
          detail = responseBody?.error || detail
        }
      } catch {
        // Supabase bazen response body vermeyebilir.
      }
      throw new Error(detail)
    }
    if (!data?.ok) throw new Error(data?.error || 'İşlem başarısız.')
    return data
  }

  async function saveStudent() {
    if (saving) return
    setSaving(true)
    setError('')

    try {
      const base = {
        class_id: form.class_id,
        student_number: Number(form.student_number),
        first_name: safeText(form.first_name).trim(),
        last_name: safeText(form.last_name).trim(),
        username: toAuthSafeUsername(form.username),
        avatar_id: Number(form.avatar_id || 1)
      }

      if (!form.id) {
        await invokeAccount({
          action: 'create',
          student: { ...base, password: form.password }
        })
        saveCredential(base.username, form.password)
        setCredentialsVersion(value => value + 1)
      } else {
        const original = students.find(item => item.id === form.id)
        if (original && String(original.username || '').toLowerCase() !== base.username) {
          await invokeAccount({
            action: 'change_student_username',
            student_id: form.id,
            auth_user_id: form.auth_user_id,
            username: base.username
          })
          const savedPassword = credentialMap[String(original.username || '').toLowerCase()]
          if (savedPassword) {
            saveCredential(base.username, savedPassword)
            try {
              const map = JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || '{}')
              delete map[String(original.username || '').toLowerCase()]
              localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(map))
            } catch {}
          }
        }
        const { error } = await supabase.from('students').update({
          class_id: base.class_id,
          student_number: base.student_number,
          first_name: base.first_name,
          last_name: base.last_name
        }).eq('id', form.id)
        if (error) throw error
      }

      setDialogOpen(false)
      setMessage(form.id ? 'Öğrenci ve giriş kullanıcı adı güncellendi.' : 'Öğrenci hesabı oluşturuldu.')
      setSelectedClass(base.class_id)
      await loadStudents(base.class_id)
    } catch (err) {
      setError(err?.message || 'İşlem sırasında hata oluştu.')
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    if (newPassword.length < 6) {
      setError('Şifre en az 6 karakter olmalı.')
      return
    }
    setSaving(true)
    try {
      await invokeAccount({
        action: 'change_password',
        auth_user_id: form.auth_user_id,
        password: newPassword
      })
      setPasswordDialog(false)
      setNewPassword('')
      saveCredential(form.username, newPassword)
      setCredentialsVersion(value => value + 1)
      setMessage('Öğrenci şifresi değiştirildi ve bu cihazdaki giriş listesine kaydedildi.')
    } catch (err) {
      setError(err?.message || 'Şifre değiştirilemedi.')
    } finally {
      setSaving(false)
    }
  }

  function purgeStudentLocalData(student) {
    const studentId = String(student?.id || '')
    if (!studentId) return

    const updateArrayStore = (key, transform) => {
      try {
        const current = JSON.parse(localStorage.getItem(key) || '[]')
        if (Array.isArray(current)) localStorage.setItem(key, JSON.stringify(transform(current)))
      } catch (err) {
        console.warn(`${key} temizlenemedi`, err)
      }
    }

    // Normal/online denemelerde öğrencinin sonuç ve cevap girişlerini kaldır.
    updateArrayStore('taskin-akademi-v64-exams', exams => exams.map(exam => {
      const results = { ...(exam?.results || {}) }
      const attempts = { ...(exam?.attempts || {}) }
      const targets = { ...(exam?.targets || {}) }
      delete results[studentId]
      delete attempts[studentId]
      delete targets[studentId]
      return { ...exam, results, attempts, targets }
    }))

    // LGS online denemelerinde gömülü katılımcı/sonuç kayıtlarını kaldır.
    updateArrayStore('lgsOnlineExams', exams => exams.map(exam => ({
      ...exam,
      participants: Array.isArray(exam?.participants)
        ? exam.participants.filter(row => String(row?.studentId ?? row?.student_id ?? '') !== studentId)
        : [],
      results: exam?.results && typeof exam.results === 'object'
        ? Object.fromEntries(Object.entries(exam.results).filter(([id]) => String(id) !== studentId))
        : exam?.results
    })))

    // Öğrenciye bağlı yerel kayıtları tamamen kaldır.
    const rowStores = [
      'taskin-akademi-v64-plus-records',
      'taskin-akademi-v64-projects',
      'taskin-akademi-v64-comments'
    ]
    rowStores.forEach(key => updateArrayStore(key, rows => rows.filter(row =>
      String(row?.studentId ?? row?.student_id ?? '') !== studentId
    )))

    // Ödevin kendisi kalır, silinen öğrencinin durum bilgisi kaldırılır.
    updateArrayStore('taskin-akademi-v64-homeworks', rows => rows.map(row => {
      const statuses = { ...(row?.statuses || {}) }
      delete statuses[studentId]
      return {
        ...row,
        statuses,
        studentIds: Array.isArray(row?.studentIds)
          ? row.studentIds.filter(id => String(id) !== studentId)
          : row?.studentIds
      }
    }))

    try {
      const gradesKey = 'taskin-akademi-v64-school-exam-grades'
      const grades = JSON.parse(localStorage.getItem(gradesKey) || '{}')
      if (grades && typeof grades === 'object') {
        const next = { ...grades }
        delete next[studentId]
        Object.keys(next).forEach(key => {
          if (next[key] && typeof next[key] === 'object' && !Array.isArray(next[key])) {
            const nested = { ...next[key] }
            delete nested[studentId]
            next[key] = nested
          }
        })
        localStorage.setItem(gradesKey, JSON.stringify(next))
      }
    } catch (err) {
      console.warn('Sınav notları temizlenemedi', err)
    }

    ;['lgsTargets', 'lgsStudyPlans', 'lgsStudyPlanDates', 'lgsTargetHistory'].forEach(key => {
      try {
        const value = JSON.parse(localStorage.getItem(key) || '{}')
        if (value && typeof value === 'object') {
          delete value[studentId]
          localStorage.setItem(key, JSON.stringify(value))
        }
      } catch (err) {
        console.warn(`${key} temizlenemedi`, err)
      }
    })

    try {
      const credentials = loadCredentials()
      delete credentials[String(student?.username || '').toLowerCase()]
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
    } catch (err) {
      console.warn('Giriş bilgisi temizlenemedi', err)
    }
  }

  async function deleteStudent(s) {
    const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim()
    const confirmed = window.confirm(
      `${fullName} kalıcı olarak silinsin mi?\n\n` +
      'Öğrencinin giriş hesabı, tüm deneme sonuçları, online cevapları, PDF/rapor verileri, ' +
      'hedefleri, çalışma programı, ödev durumları, artıları, projeleri, sınav notları ve yorumları silinecektir.\n\n' +
      'Bu işlem geri alınamaz.'
    )
    if (!confirmed) return
    setSaving(true)
    setError('')
    try {
      await invokeAccount({
        action: 'delete',
        student_id: s.id,
        auth_user_id: s.auth_user_id
      })
      purgeStudentLocalData(s)
      window.dispatchEvent(new Event('taskin-exams-updated'))
      window.dispatchEvent(new Event('taskin-lgs-online-updated'))
      window.dispatchEvent(new Event('taskin-homeworks-updated'))
      window.dispatchEvent(new Event('taskin-students-updated'))
      setCredentialsVersion(value => value + 1)
      setMessage(`${fullName} ve öğrenciye ait bütün kayıtlar kalıcı olarak silindi.`)
      await loadStudents(selectedClass)
    } catch (err) {
      setError(err?.message || 'Öğrenci ve bağlı kayıtlar silinemedi.')
    } finally {
      setSaving(false)
    }
  }

  function resetImport() {
    setImportRows([])
    setImportErrors([])
    setImportResult(null)
    setImportProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function openImportDialog() {
    resetImport()
    setImportOpen(true)
  }

  async function readExcelFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    resetImport()
    setError('')

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })

      if (rows.length < 2) throw new Error('Excel dosyasında öğrenci satırı bulunamadı.')

      const required = ['class_name', 'student_number', 'first_name', 'last_name', 'username', 'password']
      const requiredLabels = {
        class_name: 'Sınıf',
        student_number: 'Numara',
        first_name: 'Ad',
        last_name: 'Soyad',
        username: 'Kullanıcı Adı',
        password: 'Şifre'
      }

      // Bazı kullanıcılar şablonun üstüne başlık/açıklama satırı ekleyebiliyor.
      // İlk 20 satır içinde gerçek sütun başlıklarını otomatik bul.
      let headerRowIndex = -1
      let keys = []
      let bestMatchCount = -1
      const scanLimit = Math.min(rows.length, 20)
      for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
        const candidateKeys = rows[rowIndex].map(value => headerMap[normalizeHeader(value)] || null)
        const matchCount = required.filter(key => candidateKeys.includes(key)).length
        if (matchCount > bestMatchCount) {
          bestMatchCount = matchCount
          headerRowIndex = rowIndex
          keys = candidateKeys
        }
        if (matchCount === required.length) break
      }

      const missing = required.filter(key => !keys.includes(key))
      if (missing.length) {
        const missingText = missing.map(key => requiredLabels[key]).join(', ')
        throw new Error(`Excel başlıkları bulunamadı. Eksik başlıklar: ${missingText}. Beklenen başlıklar: Sınıf, Numara, Ad, Soyad, Kullanıcı Adı, Şifre.`)
      }

      const classByName = new Map(classes.map(c => [c.name.toLocaleUpperCase('tr-TR'), c]))
      const parsed = []
      const validationErrors = []
      const usernameSeen = new Map()
      const classNoSeen = new Map()

      rows.slice(headerRowIndex + 1).forEach((row, index) => {
        const excelRow = headerRowIndex + index + 2
        if (row.every(cell => safeText(cell).trim() === '')) return

        const item = {}
        keys.forEach((key, col) => {
          if (key) item[key] = row[col]
        })

        const className = safeText(item.class_name).trim().toLocaleUpperCase('tr-TR')
        const foundClass = classByName.get(className)
        const studentNumber = Number(item.student_number)
        const firstName = safeText(item.first_name).trim()
        const lastName = safeText(item.last_name).trim()
        const username = toAuthSafeUsername(item.username)
        const password = safeText(item.password)

        const rowErrors = []
        if (!foundClass) rowErrors.push(`Sınıf bulunamadı: ${className || 'boş'}`)
        if (!Number.isInteger(studentNumber) || studentNumber <= 0) rowErrors.push('Numara geçersiz')
        if (!firstName) rowErrors.push('Ad boş')
        if (!lastName) rowErrors.push('Soyad boş')
        if (!isValidUsername(username)) rowErrors.push(`Kullanıcı adı geçersiz — ${USERNAME_HELP}`)
        if (password.length < 6) rowErrors.push('Şifre en az 6 karakter olmalı')

        const usernameKey = username
        if (usernameSeen.has(usernameKey)) {
          rowErrors.push(`Kullanıcı adı dosyada tekrar ediyor (satır ${usernameSeen.get(usernameKey)})`)
        } else if (usernameKey) {
          usernameSeen.set(usernameKey, excelRow)
        }

        const classNoKey = `${className}-${studentNumber}`
        if (classNoSeen.has(classNoKey)) {
          rowErrors.push(`Sınıf-numara dosyada tekrar ediyor (satır ${classNoSeen.get(classNoKey)})`)
        } else if (foundClass && studentNumber > 0) {
          classNoSeen.set(classNoKey, excelRow)
        }

        const parsedRow = {
          excel_row: excelRow,
          class_id: foundClass?.id || '',
          class_name: className,
          student_number: studentNumber,
          first_name: firstName,
          last_name: lastName,
          username,
          password,
          errors: rowErrors
        }

        parsed.push(parsedRow)
        if (rowErrors.length) {
          validationErrors.push({ excel_row: excelRow, errors: rowErrors })
        }
      })

      if (!parsed.length) throw new Error('Dolu öğrenci satırı bulunamadı.')

      setImportRows(parsed)
      setImportErrors(validationErrors)
    } catch (err) {
      setError(err?.message || 'Excel dosyası okunamadı.')
    }
  }

  async function importStudents() {
    if (!importRows.length || importErrors.length || importing) return

    setImporting(true)
    setImportProgress(10)
    setImportResult(null)
    setError('')

    try {
      // Edge Function tek çağrıda öğrencileri sırayla oluşturur.
      setImportProgress(35)
      const data = await invokeAccount({
        action: 'bulk_create',
        students: importRows.map(({ errors, excel_row, class_name, ...student }) => ({
          ...student,
          excel_row,
          class_name
        }))
      })
      setImportProgress(100)
      setImportResult(data)
      const successfulUsernames = new Set((data.results || []).filter(item => item.ok).map(item => String(item.username).toLowerCase()))
      importRows.forEach(row => {
        if (successfulUsernames.has(String(row.username).toLowerCase())) saveCredential(row.username, row.password)
      })
      setCredentialsVersion(value => value + 1)
      if (data.success_count > 0) {
        setMessage(`${data.success_count} öğrenci başarıyla eklendi.`)
        await loadStudents(selectedClass)
      }
    } catch (err) {
      setError(err?.message || 'Toplu aktarım başarısız.')
    } finally {
      setImporting(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    if (!q) return students
    return students.filter(s =>
      `${s.student_number} ${s.first_name} ${s.last_name} ${s.username || ''}`
        .toLocaleLowerCase('tr-TR')
        .includes(q)
    )
  }, [students, search])

  const credentialMap = useMemo(() => loadCredentials(), [credentialsVersion, credentialsOpen])
  const selectedClassName = classes.find(item => item.id === selectedClass)?.name || ''


  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback }
  }

  function purgeClassLocalData(classId, studentIds) {
    const studentSet = new Set(studentIds.map(String))
    const arrayStores = [
      'taskin-akademi-v64-homeworks',
      'taskin-akademi-v64-exams',
      'taskin-akademi-v64-plus-records',
      'taskin-akademi-v64-projects',
      'taskin-akademi-v64-comments'
    ]
    arrayStores.forEach(key => {
      const rows = readJson(key, [])
      if (!Array.isArray(rows)) return
      const next = rows.filter(row => {
        const rowClass = String(row?.classId ?? row?.class_id ?? '')
        const rowStudent = String(row?.studentId ?? row?.student_id ?? '')
        if (rowClass && rowClass === String(classId)) return false
        if (rowStudent && studentSet.has(rowStudent)) return false
        if (Array.isArray(row?.studentIds) && row.studentIds.some(id => studentSet.has(String(id)))) return false
        return true
      })
      localStorage.setItem(key, JSON.stringify(next))
    })

    const gradeKey = 'taskin-akademi-v64-school-exam-grades'
    const grades = readJson(gradeKey, {})
    if (grades && typeof grades === 'object') {
      const next = { ...grades }
      delete next[classId]
      studentIds.forEach(id => delete next[id])
      Object.keys(next).forEach(key => {
        if (studentSet.has(String(key))) delete next[key]
      })
      localStorage.setItem(gradeKey, JSON.stringify(next))
    }

    const credentials = loadCredentials()
    students.forEach(student => delete credentials[String(student.username || '').toLowerCase()])
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
  }

  async function deleteWholeClass() {
    if (!selectedClass || classDeleteText.trim().toLocaleUpperCase('tr-TR') !== selectedClassName.trim().toLocaleUpperCase('tr-TR')) {
      setError(`Silme işlemi için sınıf adını tam olarak yazın: ${selectedClassName}`)
      return
    }
    setClassDeleting(true)
    setError('')
    try {
      const studentIds = students.map(student => student.id)

      if (studentIds.length) {
        const { error: lgsResultError } = await supabase.from('lgs_results').delete().in('student_id', studentIds)
        if (lgsResultError && !String(lgsResultError.message || '').toLowerCase().includes('does not exist')) throw lgsResultError
      }
      const { error: lgsExamError } = await supabase.from('lgs_exams').delete().eq('class_id', selectedClass)
      if (lgsExamError && !String(lgsExamError.message || '').toLowerCase().includes('does not exist')) throw lgsExamError

      for (const student of students) {
        await invokeAccount({ action: 'delete', student_id: student.id, auth_user_id: student.auth_user_id })
      }

      purgeClassLocalData(selectedClass, studentIds)
      window.dispatchEvent(new Event('taskin-exams-updated'))
      window.dispatchEvent(new Event('taskin-lgs-online-updated'))
      setStudents([])
      setCredentialsVersion(value => value + 1)
      setClassDeleteOpen(false)
      setClassDeleteText('')
      setMessage(`${selectedClassName} sınıfındaki öğrenciler ve sınıfa bağlı tüm kayıtlar silindi.`)
    } catch (err) {
      setError(err?.message || 'Sınıf verileri silinemedi.')
    } finally {
      setClassDeleting(false)
    }
  }

  function studentListRows() {
    return [...students]
      .sort((a, b) => Number(a.student_number || 0) - Number(b.student_number || 0))
      .map(student => ({
        Numara: Number(student.student_number || 0),
        Ad: safeText(student.first_name),
        Soyad: safeText(student.last_name),
        Sınıf: selectedClassName
      }))
  }

  function downloadStudentListExcel() {
    if (!students.length) return setError('İndirilecek öğrenci bulunamadı.')
    const rows = studentListRows()
    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [{ wch: 11 }, { wch: 20 }, { wch: 22 }, { wch: 12 }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, selectedClassName.slice(0, 31) || 'Öğrenciler')
    XLSX.writeFile(workbook, `${selectedClassName}_Ogrenci_Listesi.xlsx`)
  }

  async function downloadStudentListPdf() {
    if (!students.length) return setError('İndirilecek öğrenci bulunamadı.')
    const html2pdf = (await import('html2pdf.js')).default
    const rows = studentListRows()
    const fontSize = rows.length > 42 ? 7 : rows.length > 32 ? 8 : rows.length > 24 ? 9 : 10
    const padding = rows.length > 42 ? 2 : rows.length > 32 ? 3 : 4
    const container = document.createElement('div')
    container.style.cssText = 'width:277mm;padding:8mm 10mm;background:#fff;color:#111;font-family:Arial,sans-serif;box-sizing:border-box;'
    container.innerHTML = `
      <div style="text-align:center;margin-bottom:8px">
        <div style="font-size:18px;font-weight:800">${selectedClassName} Öğrenci Listesi</div>
        <div style="font-size:10px;color:#555">Toplam ${rows.length} öğrenci</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:${fontSize}px;line-height:1.05">
        <thead><tr style="background:#eef2f7">
          <th style="border:1px solid #777;padding:${padding}px;width:12%">Numara</th>
          <th style="border:1px solid #777;padding:${padding}px;width:30%">Ad</th>
          <th style="border:1px solid #777;padding:${padding}px;width:38%">Soyad</th>
          <th style="border:1px solid #777;padding:${padding}px;width:20%">Sınıf</th>
        </tr></thead>
        <tbody>${rows.map(row => `<tr>
          <td style="border:1px solid #aaa;padding:${padding}px;text-align:center">${row.Numara}</td>
          <td style="border:1px solid #aaa;padding:${padding}px">${row.Ad}</td>
          <td style="border:1px solid #aaa;padding:${padding}px">${row.Soyad}</td>
          <td style="border:1px solid #aaa;padding:${padding}px;text-align:center">${row.Sınıf}</td>
        </tr>`).join('')}</tbody>
      </table>`
    document.body.appendChild(container)
    try {
      await html2pdf().set({
        margin: 0,
        filename: `${selectedClassName}_Ogrenci_Listesi.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 1.8, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all'] }
      }).from(container).save()
    } finally {
      container.remove()
    }
  }

  async function openReport(type) {
    setReportType(type)
    const [{ data }, schemaResult] = await Promise.all([
      supabase.from('student_information_cards').select('id,label,field_type,options').order('sort_order'),
      readSharedState(STUDENT_PROFILE_SCHEMA_STATE_KEY, DEFAULT_STUDENT_PROFILE_FIELDS).catch(()=>({payload:DEFAULT_STUDENT_PROFILE_FIELDS}))
    ])
    const legacy = (data || []).map(field => ({ ...field, id:String(field.id), legacy_card_id:field.id }))
    const fields = mergeProfileFields(schemaResult?.payload || DEFAULT_STUDENT_PROFILE_FIELDS, legacy)
    setCustomReportFields(fields)
    setReportFields(['number', ...fields.map(x => `custom:${x.id}`)])
    setReportOpen(true)
  }

  async function buildRecognitionRows() {
    const ids = students.map(x => x.id)
    const [{ data: profiles, error: profileError }, { data: legacyCards }, schemaResult] = await Promise.all([
      supabase.from('student_profiles').select('student_id,recognition_data,notes,tags').in('student_id', ids),
      supabase.from('student_information_cards').select('id,label,field_type,options').order('sort_order'),
      readSharedState(STUDENT_PROFILE_SCHEMA_STATE_KEY, DEFAULT_STUDENT_PROFILE_FIELDS).catch(()=>({payload:DEFAULT_STUDENT_PROFILE_FIELDS}))
    ])
    if (profileError) throw profileError
    const customCards = mergeProfileFields(
      schemaResult?.payload || DEFAULT_STUDENT_PROFILE_FIELDS,
      (legacyCards || []).map(field => ({ ...field, id:String(field.id), legacy_card_id:field.id }))
    )
    const byStudent = new Map((profiles || []).map(x => [x.student_id, x]))
    const selected = new Set(reportFields)
    const rows = [...students].sort((a,b)=>Number(a.student_number)-Number(b.student_number)).map(student => {
      const profile = byStudent.get(student.id) || { recognition_data:{} }
      const values = profile.recognition_data || {}
      const row = { 'Ad Soyad': `${student.first_name} ${student.last_name}` }
      if (selected.has('number')) row.Numara = student.student_number
      for (const card of customCards || []) {
        if (!selected.has(`custom:${card.id}`)) continue
        let raw = values[card.id]
        if (raw === undefined && card.legacy_card_id) raw = values[card.legacy_card_id]
        if (raw === undefined && card.field_type === 'checkbox') raw = (profile.tags || []).includes(card.label)
        row[card.label] = typeof raw === 'boolean' ? (raw ? 'Evet' : 'Hayır') : (raw ?? '')
      }
      return row
    })
    return rows
  }

  async function createRecognitionReport() {
    if (!reportFields.length) return setError('En az bir bilgi alanı seçmelisiniz.')
    try {
      const rows = await buildRecognitionRows()
      if (reportType === 'excel') {
        const worksheet = XLSX.utils.json_to_sheet(rows)
        worksheet['!cols'] = Object.keys(rows[0] || {}).map(key => ({ wch: Math.max(14, Math.min(32, key.length + 5)) }))
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğrenci Tanıma')
        XLSX.writeFile(workbook, `${selectedClassName}_Ogrenci_Tanima.xlsx`)
      } else {
        const html2pdf = (await import('html2pdf.js')).default
        const keys = Object.keys(rows[0] || {})
        const rowCount = Math.max(1, rows.length)
        const columnCount = Math.max(1, keys.length)
        const density = Math.max(rowCount / 28, columnCount / 18)
        const fontSize = Math.max(4.2, Math.min(7.5, 7.5 / Math.max(1, density)))
        const cellPadding = density > 1.55 ? 1 : density > 1.15 ? 1.5 : 2
        const logoSize = rowCount > 34 ? 34 : 42
        const container = document.createElement('div')
        container.style.cssText = 'width:287mm;max-height:200mm;padding:4mm;background:#fff;color:#111;font-family:Arial,sans-serif;box-sizing:border-box;overflow:hidden;'
        const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]))
        container.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;border-bottom:2px solid #178b58;padding-bottom:4px;margin-bottom:5px">
            <img src="/taskin-takip-sistemi-logo.png" style="width:${logoSize}px;height:${logoSize}px;object-fit:contain">
            <div style="flex:1"><div style="font-size:14px;font-weight:900">${escapeHtml(selectedClassName)} Öğrenci Tanıma Raporu</div><div style="font-size:7px;color:#555">Taşkın Takip • ${new Date().toLocaleDateString('tr-TR')} • ${rowCount} öğrenci</div></div>
          </div>
          <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:${fontSize}px;line-height:1.02">
            <thead><tr>${keys.map(k=>`<th style="border:1px solid #777;padding:${cellPadding}px;background:#eaf4ef;overflow-wrap:anywhere">${escapeHtml(k)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td style="border:1px solid #aaa;padding:${cellPadding}px;overflow-wrap:anywhere;text-align:${typeof r[k]==='number'?'center':'left'}">${escapeHtml(r[k])}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>`
        document.body.appendChild(container)
        try {
          await html2pdf().set({
            margin:0,
            filename:`${selectedClassName}_Ogrenci_Tanima.pdf`,
            image:{type:'jpeg',quality:.98},
            html2canvas:{scale:2,useCORS:true,scrollX:0,scrollY:0},
            jsPDF:{unit:'mm',format:'a4',orientation:'landscape'},
            pagebreak:{mode:['avoid-all','css','legacy']}
          }).from(container).save()
        } finally {
          container.remove()
        }
      }
      setReportOpen(false)
    } catch (err) { setError(err?.message || 'Rapor oluşturulamadı.') }
  }

  async function copyClassCredentials() {
    const text = students.map(student => {
      const password = credentialMap[String(student.username || '').toLowerCase()] || 'Şifre kayıtlı değil — yenileyin'
      return `${student.student_number} - ${student.first_name} ${student.last_name} | Kullanıcı adı: ${student.username || '-'} | Şifre: ${password}`
    }).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setMessage('Sınıfın giriş bilgileri panoya kopyalandı.')
    } catch {
      setError('Giriş bilgileri panoya kopyalanamadı.')
    }
  }

  const valid = form.class_id &&
    Number(form.student_number) > 0 &&
    safeText(form.first_name).trim() &&
    safeText(form.last_name).trim() &&
    safeText(form.username).trim() &&
    (form.id || safeText(form.password).length >= 6)

  return (
    <Box>
      <Box className="page-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>Öğrenciler</Typography>
          <Typography color="text.secondary">
            Elle veya Excel'den öğrenci hesabı oluştur
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} width={{ xs: '100%', sm: 'auto' }}>
          <Button variant="outlined" startIcon={<Key />} onClick={() => setCredentialsOpen(true)}>
            Sınıf Giriş Bilgileri
          </Button>
          <Button
            variant="outlined"
            startIcon={<Download />}
            component="a"
            href="/Taskin_Akademi_Toplu_Ogrenci_Sablonu.xlsx"
            download
          >
            Excel Şablonu
          </Button>
          <Button variant="outlined" startIcon={<UploadFile />} onClick={openImportDialog}>
            Excel'den Ekle
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={openAdd}>
            Elle Ekle
          </Button>
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, borderColor: '#c9d8e8', background: '#fff' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Avatar sx={{ bgcolor: '#e9f8ef', color: '#078547', width: 54, height: 54 }}><Today /></Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={950}>Bugün Giriş Yapan Öğrenciler</Typography>
              <Typography variant="h4" fontWeight={950}>{todayLoginsLoading ? '…' : todayLogins.length}</Typography>
              <Typography variant="body2" color="text.secondary">
                {todayLogins.length
                  ? `Son giriş: ${todayLogins[0].first_name} ${todayLogins[0].last_name} • ${loginTime(todayLogins[0].last_login_at)}`
                  : 'Bugün henüz öğrenci girişi yok.'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <IconButton aria-label="Girişleri yenile" onClick={() => { loadTodayLogins(); loadInactiveStudents(activeClasses.map(item => item.id)) }} disabled={todayLoginsLoading}><Refresh /></IconButton>
              <Button variant="contained" onClick={() => setTodayLoginsOpen(true)} disabled={!todayLogins.length}>Tümünü Gör</Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, borderColor: '#fecaca', background: '#fffafb' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Avatar sx={{ bgcolor: '#fee2e2', color: '#c62828', width: 54, height: 54 }}><WarningAmber /></Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={950}>5 Gündür Giriş Yapmayanlar</Typography>
              <Typography variant="h4" fontWeight={950} color="error.main">{inactiveStudentsLoading ? '…' : inactiveStudents.length}</Typography>
              <Typography variant="body2" color="text.secondary">
                {inactiveStudents.length ? 'Aktif sınıflardaki öğrenciler kontrol edildi.' : 'Takip gerektiren öğrenci bulunmuyor.'}
              </Typography>
            </Box>
            <Button color="error" variant="contained" onClick={() => setInactiveStudentsOpen(true)} disabled={!inactiveStudents.length}>Tümünü Gör</Button>
          </Stack>
        </Paper>
      </Box>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

      <Box className="glass filter">
        <TextField select label={`Aktif Sınıf (${activeClasses.length})`} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
          {activeClasses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <TextField label="Öğrenci ara" value={search} onChange={e => setSearch(e.target.value)} />
        <Button variant="outlined" startIcon={<PictureAsPdf />} onClick={() => openReport('pdf')} disabled={!students.length}>
          Tanıma Raporu
        </Button>
        <Button variant="outlined" startIcon={<TableView />} onClick={() => openReport('excel')} disabled={!students.length}>
          Excel İndir
        </Button>
        <Button color="error" variant="outlined" startIcon={<Delete />} onClick={() => { setClassDeleteText(''); setClassDeleteOpen(true) }} disabled={!selectedClass || !students.length}>
          Sınıfı Tamamen Sil
        </Button>
      </Box>

      {loading ? <Box className="loader compact"><CircularProgress /></Box> : filtered.length === 0 ? (
        <Box className="glass empty">
          <Groups sx={{ fontSize: 60 }} />
          <Typography variant="h6" fontWeight={900}>Henüz öğrenci yok</Typography>
        </Box>
      ) : (
        <Box className="students-single-list">
          {filtered.map(s => (
            <Box className="glass student" key={s.id}>
              <Avatar src={avatarSrc(s)} alt={`${s.first_name} ${s.last_name}`} sx={{ width: 62, height: 62 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap fontWeight={950} sx={{ fontSize: '1.08rem' }}>
                  {s.first_name} {s.last_name}
                </Typography>
                <Typography noWrap variant="body2">No: {s.student_number}</Typography>
                <Typography noWrap variant="body2" color="text.secondary">{s.username || 'Kullanıcı adı yok'}</Typography>
              </Box>
              <Button size="small" variant="outlined" startIcon={<Person />} onClick={() => openProfile(s)}>Profili Aç</Button>
              <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => openEdit(s)}>Düzenle</Button>
              <Button size="small" color="error" variant="outlined" startIcon={<Delete />} onClick={() => deleteStudent(s)}>Sil</Button>
            </Box>
          ))}
        </Box>
      )}

      <Dialog open={todayLoginsOpen} onClose={() => setTodayLoginsOpen(false)} fullWidth maxWidth="md">
        <DialogTitle fontWeight={950}>Bugün Giriş Yapan Öğrenciler ({todayLogins.length})
          <IconButton onClick={() => setTodayLoginsOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '62vh' }}>
            <Table stickyHeader size="small">
              <TableHead><TableRow><TableCell>Saat</TableCell><TableCell>Öğrenci</TableCell><TableCell>Sınıf</TableCell><TableCell>Cihaz</TableCell><TableCell align="center">Giriş Sayısı</TableCell></TableRow></TableHead>
              <TableBody>
                {todayLogins.map(item => <TableRow key={item.auth_user_id}>
                  <TableCell><b>{loginTime(item.last_login_at)}</b></TableCell>
                  <TableCell>{item.student_number} — {item.first_name} {item.last_name}</TableCell>
                  <TableCell>{item.class_name}</TableCell>
                  <TableCell><Stack direction="row" spacing={.75} alignItems="center">{item.device_type === 'telefon' ? <PhoneAndroid fontSize="small" /> : <Computer fontSize="small" />}<span>{item.device_type}</span></Stack></TableCell>
                  <TableCell align="center">{item.login_count}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions><Button onClick={() => setTodayLoginsOpen(false)}>Kapat</Button></DialogActions>
      </Dialog>

      <Dialog
        open={inactiveStudentsOpen}
        onClose={() => setInactiveStudentsOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { height: 'min(92vh, 860px)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
      >
        <DialogTitle fontWeight={950} sx={{ flex: '0 0 auto', pr: 7 }}>5 Gündür Giriş Yapmayan Öğrenciler ({inactiveStudents.length})
          <IconButton onClick={() => setInactiveStudentsOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}><Close /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', pt: 1 }}>
          <Alert severity="warning" sx={{ mb: 1.5, flex: '0 0 auto' }}>Hiç giriş yapmamış öğrenciler de bu listede gösterilir.</Alert>
          <TextField
            select
            size="small"
            label="Sırala"
            value={inactiveStudentsSort}
            onChange={event => setInactiveStudentsSort(event.target.value)}
            sx={{ width: { xs: '100%', sm: 320 }, mb: 1.5, flex: '0 0 auto' }}
          >
            <MenuItem value="least-logins">En az giriş yapanlar</MenuItem>
            <MenuItem value="never-first">Hiç giriş yapmayanlar önce</MenuItem>
            <MenuItem value="name">Ada göre A–Z</MenuItem>
            <MenuItem value="number">Numaraya göre küçükten büyüğe</MenuItem>
          </TextField>
          <TableContainer component={Paper} variant="outlined" sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Table stickyHeader size="small">
              <TableHead><TableRow><TableCell>Öğrenci</TableCell><TableCell>Sınıf</TableCell><TableCell align="center">Giriş Sayısı</TableCell><TableCell>Son Giriş</TableCell><TableCell align="center">Durum</TableCell></TableRow></TableHead>
              <TableBody>
                {sortedInactiveStudents.map(item => <TableRow key={item.id}>
                  <TableCell>{item.student_number} — {item.first_name} {item.last_name}</TableCell>
                  <TableCell>{item.class_name}</TableCell>
                  <TableCell align="center"><b>{item.login_count || 0}</b></TableCell>
                  <TableCell>{item.last_login_at ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.last_login_at)) : 'Hiç giriş yapmadı'}</TableCell>
                  <TableCell align="center"><Chip color="error" size="small" label={item.days_inactive == null ? 'Hiç giriş yapmadı' : `${item.days_inactive} gündür`} /></TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ flex: '0 0 auto', borderTop: '1px solid', borderColor: 'divider', px: 2, py: 1.25 }}>
          <Button onClick={() => setInactiveStudentsOpen(false)}>Kapat</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={classDeleteOpen} onClose={() => !classDeleting && setClassDeleteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={950} color="error">{selectedClassName} Sınıfını Tamamen Sil</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            Bu işlem geri alınamaz. Bu sınıftaki tüm öğrenciler, giriş hesapları, ödevler, denemeler, online denemeler, sonuçlar, artılar, projeler, sınav notları ve yorumlar silinecektir.
          </Alert>
          <Typography sx={{ mb: 1 }}>Onaylamak için <b>{selectedClassName}</b> yazın:</Typography>
          <TextField fullWidth autoFocus value={classDeleteText} onChange={e => setClassDeleteText(e.target.value)} label="Sınıf adı" />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setClassDeleteOpen(false)} disabled={classDeleting}>Vazgeç</Button>
          <Button color="error" variant="contained" startIcon={<Delete />} onClick={deleteWholeClass}
            disabled={classDeleting || classDeleteText.trim().toLocaleUpperCase('tr-TR') !== selectedClassName.trim().toLocaleUpperCase('tr-TR')}>
            {classDeleting ? 'Tüm veriler siliniyor…' : 'Kalıcı Olarak Sil'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={credentialsOpen} onClose={() => setCredentialsOpen(false)} fullWidth maxWidth="md">
        <DialogTitle fontWeight={900}>
          {selectedClassName} — Öğrenci Giriş Bilgileri
          <IconButton onClick={() => setCredentialsOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Supabase mevcut şifreleri güvenlik nedeniyle geri göstermez. Bu listede yalnızca bu cihazda oluşturulan veya sonradan yenilenen şifreler görünür. Kayıtlı olmayan bir şifreyi öğrencinin ana listesindeki anahtar düğmesiyle yenileyebilirsiniz.
          </Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <Button variant="outlined" startIcon={showPasswords ? <VisibilityOff /> : <Visibility />} onClick={() => setShowPasswords(value => !value)}>
              {showPasswords ? 'Şifreleri Gizle' : 'Şifreleri Göster'}
            </Button>
            <Button variant="contained" startIcon={<ContentCopy />} onClick={copyClassCredentials}>
              Tümünü Kopyala
            </Button>
          </Stack>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
            <Table stickyHeader size="small">
              <TableHead><TableRow><TableCell>No</TableCell><TableCell>Öğrenci</TableCell><TableCell>Kullanıcı Adı</TableCell><TableCell>Şifre</TableCell><TableCell align="right">İşlem</TableCell></TableRow></TableHead>
              <TableBody>
                {students.map(student => {
                  const password = credentialMap[String(student.username || '').toLowerCase()]
                  return <TableRow key={student.id}>
                    <TableCell>{student.student_number}</TableCell>
                    <TableCell>{student.first_name} {student.last_name}</TableCell>
                    <TableCell><b>{student.username || '-'}</b></TableCell>
                    <TableCell>{password ? (showPasswords ? password : '••••••••') : <Chip size="small" color="warning" label="Kayıtlı değil" />}</TableCell>
                    <TableCell align="right"><Button size="small" startIcon={<Key />} onClick={() => { setCredentialsOpen(false); openEdit(student) }}>Şifre Yenile</Button></TableCell>
                  </TableRow>
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions><Button onClick={() => setCredentialsOpen(false)}>Kapat</Button></DialogActions>
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={900}>
          {form.id ? 'Öğrenciyi Düzenle' : 'Yeni Öğrenci ve Giriş Hesabı'}
          <IconButton onClick={() => setDialogOpen(false)} disabled={saving}
            sx={{ position: 'absolute', right: 8, top: 8 }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Sınıf" value={form.class_id}
              onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}>
              {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField label="Öğrenci Numarası" type="number" value={form.student_number}
              onChange={e => setForm(f => ({ ...f, student_number: e.target.value }))}
              inputProps={{ autoComplete: 'off' }}
            />
            <Box className="two">
              <TextField label="Ad" value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                inputProps={{ autoComplete: 'off' }}
              />
              <TextField label="Soyad" value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                inputProps={{ autoComplete: 'off' }}
              />
            </Box>
            <TextField label="Kullanıcı Adı" value={form.username}
              autoComplete="off"
              inputProps={{ autoComplete: 'new-username' }}
              onChange={e => setForm(f => ({ ...f, username: e.target.value.replace(/\s/g, '') }))} />
            <Box>
              <Typography fontWeight={900} sx={{ mb: 1 }}>Avatar</Typography>
              <Box sx={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:1 }}>
                {AVATARS.map(item => <IconButton key={item.id} onClick={() => setForm(f => ({...f, avatar_id:item.id}))} sx={{ border: form.avatar_id===item.id ? '3px solid #178b58' : '1px solid #d5dfdb', p:.35 }}>
                  <Avatar src={item.src} sx={{width:48,height:48}} />
                </IconButton>)}
              </Box>
            </Box>
            {!form.id && (
              <TextField label="İlk Şifre" type="password" value={form.password}
                autoComplete="new-password"
                inputProps={{ autoComplete: 'new-password' }}
                helperText="En az 6 karakter"
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            )}
            {form.id && <Paper variant="outlined" sx={{p:2,borderRadius:3}}>
              <Typography fontWeight={950} sx={{mb:1}}>Şifre İşlemleri</Typography>
              <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
                <TextField fullWidth label="Yeni Şifre" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} helperText="En az 6 karakter" />
                <Button variant="outlined" startIcon={<Key/>} onClick={changePassword} disabled={saving || newPassword.length<6}>Şifreyi Güncelle</Button>
              </Stack>
            </Paper>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>İptal</Button>
          <Button variant="contained" startIcon={<Save />} onClick={saveStudent} disabled={!valid || saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={importOpen}
        onClose={() => !importing && setImportOpen(false)}
        fullWidth
        maxWidth="lg"
        fullScreen={window.innerWidth < 700}
      >
        <DialogTitle fontWeight={900}>
          Excel'den Toplu Öğrenci Ekle
          <IconButton
            onClick={() => setImportOpen(false)}
            disabled={importing}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              Sütunlar: Sınıf, Numara, Ad, Soyad, Kullanıcı Adı, Şifre. Önce dosya kontrol edilir; hata varsa kayıt başlamaz.
            </Alert>

            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept=".xlsx,.xls"
              onChange={readExcelFile}
            />
            <Button
              variant="outlined"
              size="large"
              startIcon={<UploadFile />}
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              Excel Dosyasını Seç
            </Button>

            {importRows.length > 0 && (
              <>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip label={`${importRows.length} satır okundu`} color="primary" />
                  <Chip
                    label={`${importErrors.length} hatalı satır`}
                    color={importErrors.length ? 'error' : 'success'}
                  />
                </Stack>

                {importing && (
                  <Box>
                    <LinearProgress variant="determinate" value={importProgress} />
                    <Typography variant="caption">{importProgress}%</Typography>
                  </Box>
                )}

                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '58vh', minHeight: 220, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Satır</TableCell>
                        <TableCell>Sınıf</TableCell>
                        <TableCell>No</TableCell>
                        <TableCell>Ad Soyad</TableCell>
                        <TableCell>Kullanıcı Adı</TableCell>
                        <TableCell>Durum</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {importRows.map(row => {
                        const resultRow = importResult?.results?.find(r => r.excel_row === row.excel_row)
                        return (
                          <TableRow key={row.excel_row}>
                            <TableCell>{row.excel_row}</TableCell>
                            <TableCell>{row.class_name}</TableCell>
                            <TableCell>{row.student_number}</TableCell>
                            <TableCell>{row.first_name} {row.last_name}</TableCell>
                            <TableCell>{row.username}</TableCell>
                            <TableCell>
                              {row.errors.length ? (
                                <Chip size="small" color="error" label={row.errors.join(' • ')} />
                              ) : resultRow ? (
                                <Chip
                                  size="small"
                                  color={resultRow.ok ? 'success' : 'error'}
                                  label={resultRow.ok ? 'Eklendi' : resultRow.error}
                                />
                              ) : (
                                <Chip size="small" color="success" variant="outlined" label="Hazır" />
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                {importResult && (
                  <Alert severity={importResult.failure_count ? 'warning' : 'success'}>
                    {importResult.success_count} öğrenci eklendi, {importResult.failure_count} öğrenci eklenemedi.
                  </Alert>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setImportOpen(false)} disabled={importing}>Kapat</Button>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={importStudents}
            disabled={!importRows.length || importErrors.length > 0 || importing || Boolean(importResult)}
          >
            {importing ? 'Öğrenciler Ekleniyor…' : `${importRows.length || 0} Öğrenciyi Ekle`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={950}>{reportType === 'pdf' ? 'Tanıma Raporu' : 'Excel İndir'}</DialogTitle>
        <DialogContent>
          <Typography fontWeight={900} sx={{mb:1}}>Raporda bulunacak bilgiler</Typography>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:.5}}>
            <FormControlLabel control={<Checkbox checked={reportFields.includes('number')} onChange={() => setReportFields(x => x.includes('number') ? x.filter(y=>y!=='number') : [...x,'number'])}/>} label="Numara" />
            {customReportFields.map(field => { const key=`custom:${field.id}`; return <FormControlLabel key={key} control={<Checkbox checked={reportFields.includes(key)} onChange={() => setReportFields(x => x.includes(key) ? x.filter(y=>y!==key) : [...x,key])}/>} label={`${field.label} • ${field.field_type==='number'?'Sayı':field.field_type==='date'?'Tarih':field.field_type==='phone'?'Telefon':field.field_type==='checkbox'?'Evet/Hayır':field.field_type==='select'?'Seçim':'Yazı'}`}/> })}
          </Box>
          {reportType === 'pdf' && <Alert severity="info" sx={{mt:2}}>PDF yatay A4 olarak hazırlanır ve sınıfın tamamı tek sayfaya sığdırılır.</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={()=>setReportOpen(false)}>Vazgeç</Button><Button variant="contained" onClick={createRecognitionReport}>{reportType === 'pdf' ? 'PDF Oluştur' : 'Excel Oluştur'}</Button></DialogActions>
      </Dialog>

      <StudentProfileDialog
        open={profileOpen}
        student={profileStudent}
        seatingCards={profileTags.map(tag => ({...tag, group_name:'seating'}))}
        onClose={() => setProfileOpen(false)}
        onSaved={() => setMessage('Öğrenci profili kaydedildi.')}
      />

      <Snackbar open={Boolean(message)} autoHideDuration={3000} onClose={() => setMessage('')} message={message} />
    </Box>
  )
}
