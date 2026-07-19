import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import html2pdf from 'html2pdf.js'
import {
  Alert, Avatar, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, LinearProgress, Paper, Snackbar,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography
} from '@mui/material'
import {
  Add, AutoAwesome, BarChart, CalendarMonth, CheckCircle, Close, Delete, Download,
  Edit, EmojiEvents, Groups, Insights, Monitor, Person, Psychology, Settings,
  TrendingDown, TrendingUp, UploadFile, Visibility, Archive, PictureAsPdf, TableView,
  RestartAlt, PlayCircle, ErrorOutline, Print, Assessment, History, Search, AccessTime, FactCheck, RadioButtonChecked
} from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { readSharedState, writeSharedState } from '../services/sharedState'
import { ONLINE_EXAM_ACCEPT, removeOnlineExamFile, uploadOnlineExamFile, validateOnlineExamFile } from '../services/onlineExamFiles'

const safeText = value => value == null ? '' : String(value)
const asNumber = value => {
  if (value === '' || value == null) return null
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}
const formatNumber = value => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return number.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const average = values => {
  const valid = values.map(Number).filter(Number.isFinite)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}
const numericFields = [
  'turkish_correct','turkish_net','history_correct','history_net','religion_correct','religion_net',
  'english_correct','english_net','math_correct','math_net','science_correct','science_net',
  'total_correct','total_net','score','rank'
]
const lessonDefs = [
  { key:'turkish', name:'Türkçe', count:20 }, { key:'history', name:'İnkılap', count:10 },
  { key:'religion', name:'Din Kültürü', count:10 }, { key:'english', name:'İngilizce', count:10 },
  { key:'math', name:'Matematik', count:20 }, { key:'science', name:'Fen', count:20 }
]
const initialOnlineExams = []

const escapeHtml = value => safeText(value)
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')
const fileSafe = value => safeText(value).replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ _-]/gi,'_').trim() || 'rapor'
const onlineValue = (participant, lessonKey, kind) => {
  const candidates = [
    participant?.[`${lessonKey}_${kind}`], participant?.[`${lessonKey}${kind[0].toUpperCase()}${kind.slice(1)}`],
    participant?.results?.[lessonKey]?.[kind], participant?.lessonResults?.[lessonKey]?.[kind]
  ]
  return candidates.find(value => value !== undefined && value !== null && value !== '')
}

const calculateLgsOnlineScore = participant => {
  const net = key => Number(onlineValue(participant, key, 'net')) || 0
  return 177.1 + (net('turkish') * 4.52) + (net('history') * 1.95) +
    (net('religion') * 2) + (net('english') * 1.7) +
    (net('math') * 4.6) + (net('science') * 4.2)
}
const onlineTotalNet = participant => lessonDefs.reduce((sum, lesson) => sum + (Number(onlineValue(participant, lesson.key, 'net')) || 0), 0)
const countAnsweredQuestions = participant => {
  const answers = participant?.answers || {}
  return Object.values(answers).reduce((total, value) => {
    if (value && typeof value === 'object') return total + Object.values(value).filter(Boolean).length
    return total + (value ? 1 : 0)
  }, 0)
}
const liveStatusKey = participant => {
  const status = safeText(participant?.status).toLocaleLowerCase('tr-TR')
  if (participant?.finishedAt || status.includes('bitir') || status.includes('tamam')) return 'finished'
  if (participant?.startedAt || status.includes('sınavda') || status.includes('başla')) return 'active'
  return 'waiting'
}
const timeOnly = value => {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })
  return safeText(value).slice(0,5)
}
const elapsedText = (startedAt, finishedAt, now=Date.now()) => {
  if (!startedAt) return '-'
  const start = new Date(startedAt).getTime()
  if (!Number.isFinite(start)) return '-'
  const end = finishedAt ? new Date(finishedAt).getTime() : now
  const seconds = Math.max(0, Math.floor((end-start)/1000))
  const hours = Math.floor(seconds/3600)
  const minutes = Math.floor((seconds%3600)/60)
  const secs = seconds%60
  return hours ? `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}` : `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
}
const runPdfDownload = async (html, filename, orientation='landscape') => {
  // Rapor, html2canvas tarafından gerçekten çizilebilmesi için görünür koordinatlarda
  // oluşturulur. Kullanıcının ekranını kapatmaması için raporun üstüne bir yükleniyor
  // katmanı yerleştirilir. Negatif z-index / display:none / visibility:hidden kullanmak
  // bazı Chrome sürümlerinde tamamen beyaz PDF üretiyordu.
  const overlay=document.createElement('div')
  Object.assign(overlay.style, {
    position:'fixed', inset:'0', zIndex:'2147483647', background:'rgba(245,248,247,.98)',
    display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Arial, sans-serif',
    fontSize:'18px', fontWeight:'700', color:'#145b35'
  })
  overlay.textContent='PDF hazırlanıyor...'

  const host=document.createElement('div')
  const width=orientation==='landscape' ? 1120 : 790
  Object.assign(host.style, {
    position:'fixed', left:'0', top:'0', width:`${width}px`, minHeight:'1px',
    background:'#ffffff', zIndex:'2147483646', pointerEvents:'none', overflow:'visible',
    opacity:'1', visibility:'visible', display:'block'
  })
  host.innerHTML=html
  document.body.appendChild(host)
  document.body.appendChild(overlay)

  try {
    if (document.fonts?.ready) await document.fonts.ready
    await new Promise(resolve=>setTimeout(resolve,250))
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))

    const pages=host.querySelectorAll('.report-page')
    if (!pages.length || host.scrollHeight < 50 || host.scrollWidth < 50) {
      throw new Error('PDF rapor içeriği oluşturulamadı.')
    }

    const options={
      margin:0,
      filename,
      image:{ type:'jpeg', quality:.98 },
      html2canvas:{
        scale:2,
        useCORS:true,
        allowTaint:false,
        backgroundColor:'#ffffff',
        letterRendering:true,
        logging:false,
        scrollX:0,
        scrollY:0,
        windowWidth:width,
        windowHeight:Math.max(host.scrollHeight,790),
        width,
        height:host.scrollHeight,
        onclone:(clonedDocument)=>{
          const clonedHost=clonedDocument.body.lastElementChild?.previousElementSibling || clonedDocument.body.firstElementChild
          if (clonedHost) {
            clonedHost.style.position='static'
            clonedHost.style.left='0'
            clonedHost.style.top='0'
            clonedHost.style.zIndex='auto'
            clonedHost.style.opacity='1'
            clonedHost.style.visibility='visible'
          }
        }
      },
      jsPDF:{ unit:'mm', format:'a4', orientation, compress:true },
      pagebreak:{ mode:['css','legacy'], before:'.pdf-page-break', avoid:['tr','.keep-together'] }
    }

    await html2pdf().set(options).from(host).save()
  } catch (pdfError) {
    console.error('PDF oluşturma hatası:', pdfError)
    throw pdfError
  } finally {
    overlay.remove()
    host.remove()
  }
}
const pdfStyles = `
<style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,'Segoe UI',sans-serif;color:#171b22;background:white}.report-page{width:1120px;min-height:790px;padding:27px 28px 24px;background:#fff;page-break-after:always;overflow:hidden}.report-page:last-child{page-break-after:auto}.report-head{display:grid;grid-template-columns:1.1fr 2fr 1.15fr;align-items:start;border-bottom:3px solid #145b35;padding-bottom:10px;margin-bottom:10px}.brand-lock{display:flex;gap:10px;align-items:center}.brand-mark{width:46px;height:46px;border:3px solid #145b35;border-radius:50%;display:grid;place-items:center;color:#145b35;font-weight:900;font-size:12px;line-height:1;text-align:center}.brand-name{font-size:24px;font-weight:900;color:#145b35;letter-spacing:.3px}.brand-sub{font-size:16px;font-weight:800;margin-top:4px}.report-center{text-align:center;padding-top:5px}.report-center h1{font-size:21px;margin:0;color:#151515}.report-center b{font-size:13px}.report-meta{text-align:right;font-size:12px;line-height:1.7}.report-meta b{display:inline-block;min-width:95px}.participation{font-size:12px;font-weight:800;margin:6px 0 8px}.result-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}.result-table th,.result-table td{border:1px solid #cfd8dc;padding:5px 3px;text-align:center;height:29px}.result-table thead th{background:#145b35;color:white;font-weight:900}.result-table thead .sub th{font-size:8px}.result-table tbody tr:nth-child(even){background:#eefaf3}.result-table .name{text-align:left;padding-left:8px}.result-table .total-d{background:#d7fbe2;font-weight:800}.result-table .total-n{background:#dcecff;font-weight:800}.result-table .score{background:#fff0b8;font-weight:800}.result-table .rank{background:#edf0f6;font-weight:800}.result-table .avg-row td{background:#bdf3cd!important;font-weight:900;border-top:2px solid #145b35}.arrow-up{color:#168447;font-weight:900}.arrow-down{color:#d02727;font-weight:900}.analysis-layout{display:grid;grid-template-columns:2fr 1.08fr;gap:10px}.lesson-analysis{background:#f3f6fc;border:1px solid #d8dee9;border-radius:9px;padding:7px;margin-bottom:8px}.lesson-analysis h3{text-align:center;font-size:13px;margin:0 0 6px}.question-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:4px}.qbox{height:31px;border-radius:5px;display:flex;flex-direction:column;justify-content:center;align-items:center;font-size:9px;font-weight:900}.q-high{background:#9ceb2f}.q-mid{background:#ffc329}.q-low{background:#ff963d}.q-zero{background:#f0f2f5;color:#7d8790}.side-card{border:1px solid #d7dde5;border-radius:9px;padding:9px;margin-bottom:9px}.side-card h2{font-size:15px;margin:0 0 8px}.progress-row{display:grid;grid-template-columns:85px 1fr 42px;gap:7px;align-items:center;font-size:11px;margin:6px 0}.progress-track{height:13px;border-radius:9px;background:#e6e8eb;overflow:hidden}.progress-fill{height:100%;background:#9ee833}.progress-fill.warn{background:#ffc51d}.rank-list{display:grid;grid-template-columns:1fr 1fr;gap:4px 15px;font-size:10px}.rank-list div{display:flex;justify-content:space-between;border-bottom:1px dotted #ccd;padding:3px 0}.movement-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.movement-box{border:1px solid #d8dde3;border-radius:10px;overflow:hidden}.movement-title{font-size:20px;color:white;text-align:center;padding:10px;font-weight:900}.movement-box.up .movement-title{background:#168842}.movement-box.down .movement-title{background:#c72027}.movement-table{width:100%;border-collapse:collapse;font-size:13px}.movement-table th,.movement-table td{border:1px solid #d3d9df;padding:8px}.movement-table th{background:#e0e7ef}.movement-box.up td:last-child{color:#168842;font-weight:900}.movement-box.down td:last-child{color:#c72027;font-weight:900}.note{text-align:center;color:#66717c;font-size:11px;margin-top:14px}.student-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:10px 0}.summary-card{border:1px solid #dce3e7;border-radius:8px;padding:8px;background:#f7fbf9;font-size:11px}.summary-card b{display:block;font-size:17px;color:#145b35;margin-top:3px}.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.chart-card{border:1px solid #dbe1e5;border-radius:10px;padding:12px}.chart-card h2{font-size:15px;margin:0 0 5px}.bar-line{display:grid;grid-template-columns:85px 1fr 45px;gap:7px;align-items:center;margin:8px 0;font-size:11px}.bar-bg{height:19px;background:#edf1f2;border-radius:8px;overflow:hidden}.bar-fg{height:100%;background:#50b883}.plan-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.plan-day{border:1px solid #dce3e7;border-radius:8px;padding:7px;break-inside:avoid}.plan-day h3{font-size:12px;margin:0 0 5px;color:#145b35}.plan-day ul{padding-left:17px;margin:0;font-size:9px;line-height:1.45}.ai-box{border:1px solid #cad8d0;background:#f2faf5;border-radius:10px;padding:12px;margin-top:12px;font-size:11px;line-height:1.6}.small-muted{font-size:10px;color:#68727a}.pdf-page-break{page-break-before:always}
</style>`

export default function LgsPage() {
  const [exams, setExams] = useState([])
  const [allResults, setAllResults] = useState([])
  const [lgsStudents, setLgsStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [onlineOpen, setOnlineOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [classReportOpen, setClassReportOpen] = useState(false)
  const [examName, setExamName] = useState('')
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0,10))
  const [rows, setRows] = useState([])
  const [fileExamName, setFileExamName] = useState('')
  const [validationErrors, setValidationErrors] = useState([])
  const [showOnlyInvalidRows, setShowOnlyInvalidRows] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailExam, setDetailExam] = useState(null)
  const [detailRows, setDetailRows] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [studentOpen, setStudentOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentNumberSearch, setStudentNumberSearch] = useState('')
  const [studentSearchError, setStudentSearchError] = useState('')
  const [lgsDate, setLgsDate] = useState(localStorage.getItem('lgsDate') || '2027-06-06')
  const [onlineForm, setOnlineForm] = useState({ name:'', date:'', start:'', end:'', attachment:null })
  const [onlineFile, setOnlineFile] = useState(null)
  const [onlineUploading, setOnlineUploading] = useState(false)
  const [answerKey, setAnswerKey] = useState({})
  const [bookletMap, setBookletMap] = useState({})
  const [onlineValidationErrors, setOnlineValidationErrors] = useState([])
  const [editingOnlineId, setEditingOnlineId] = useState(null)
  const [answerDetail, setAnswerDetail] = useState(null)
  const [liveOpen, setLiveOpen] = useState(false)
  const [liveExam, setLiveExam] = useState(null)
  const [liveTick, setLiveTick] = useState(Date.now())
  const [onlineExams, setOnlineExams] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lgsOnlineExams')) || initialOnlineExams }
    catch { return initialOnlineExams }
  })
  const [onlineCloudReady, setOnlineCloudReady] = useState(false)
  const [targets, setTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lgsTargets')) || {} } catch { return {} }
  })
  const [studyPlans, setStudyPlans] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lgsStudyPlans')) || {} } catch { return {} }
  })
  const [studyPlanDates, setStudyPlanDates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lgsStudyPlanDates')) || {} } catch { return {} }
  })
  const [targetHistory, setTargetHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lgsTargetHistory')) || {} } catch { return {} }
  })

  useEffect(() => { loadDashboard() }, [])
  useEffect(() => {
    if (!onlineCloudReady) return undefined
    const timer = window.setTimeout(async () => {
      try {
        await writeSharedState('lgs-online-exams-v1', onlineExams)
        localStorage.setItem('lgsOnlineExams', JSON.stringify(onlineExams))
        window.dispatchEvent(new Event('taskin-lgs-online-updated'))
      } catch (saveError) {
        console.error('LGS online denemeleri buluta kaydedilemedi:', saveError)
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [onlineExams, onlineCloudReady])
  useEffect(() => {
    if (!onlineCloudReady) return undefined
    const refresh = async () => {
      try {
        const state = await readSharedState('lgs-online-exams-v1', onlineExams)
        if (Array.isArray(state.payload)) setOnlineExams(state.payload)
      } catch {}
    }
    const timer = window.setInterval(refresh, 10000)
    return () => window.clearInterval(timer)
  }, [onlineCloudReady])
  useEffect(() => {
    if (!liveOpen) return undefined
    const timer = window.setInterval(() => setLiveTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [liveOpen])
  useEffect(() => {
    if (liveExam) setLiveExam(onlineExams.find(exam => exam.id === liveExam.id) || liveExam)
  }, [onlineExams])

  async function loadDashboard() {
    setLoading(true)
    setError('')
    try {
      const globalSettings = await readSharedState('lgs-global-settings-v1', { lgsDate: '2027-06-06' })
      const localOnline = (() => { try { return JSON.parse(localStorage.getItem('lgsOnlineExams')) || initialOnlineExams } catch { return initialOnlineExams } })()
      const onlineState = await readSharedState('lgs-online-exams-v1', localOnline)
      if (onlineState.updatedAt) {
        const cloudOnline = Array.isArray(onlineState.payload) ? onlineState.payload : []
        setOnlineExams(cloudOnline)
        try { localStorage.setItem('lgsOnlineExams', JSON.stringify(cloudOnline)) } catch {}
      } else {
        setOnlineExams(localOnline)
        await writeSharedState('lgs-online-exams-v1', localOnline)
      }
      setOnlineCloudReady(true)
      if (globalSettings?.payload?.lgsDate) {
        setLgsDate(globalSettings.payload.lgsDate)
        try { localStorage.setItem('lgsDate', globalSettings.payload.lgsDate) } catch {}
      }

      const { data: examData, error: examError } = await supabase
        .from('lgs_exams')
        .select('id,name,exam_date,created_at,lgs_results(count)')
        .order('exam_date', { ascending:false })
        .order('created_at', { ascending:false })
      if (examError) throw examError
      const examList = examData ?? []
      setExams(examList)

      let lgsClass = null
      const exact = await supabase.from('classes').select('id,name').eq('is_lgs', true).maybeSingle()
      if (!exact.error && exact.data) lgsClass = exact.data
      if (!lgsClass) {
        const fallback = await supabase.from('classes').select('id,name').ilike('name', '%LGS%').limit(1).maybeSingle()
        if (!fallback.error) lgsClass = fallback.data
      }

      if (lgsClass?.id) {
        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('id,student_number,first_name,last_name,class_id,is_active')
          .eq('class_id', lgsClass.id)
          .eq('is_active', true)
          .order('student_number')
        if (studentError) throw studentError
        const loadedStudents = studentData ?? []
        setLgsStudents(loadedStudents)

        // Sınıftan kalıcı olarak silinen öğrencilerin eski yerel online sonuçlarını da temizle.
        const activeStudentIds = new Set(loadedStudents.map(student => String(student.id)))
        setOnlineExams(current => {
          const cleaned = current.map(exam => ({
            ...exam,
            participants: Array.isArray(exam?.participants)
              ? exam.participants.filter(row => activeStudentIds.has(String(row?.studentId ?? row?.student_id ?? '')))
              : []
          }))
          try { localStorage.setItem('lgsOnlineExams', JSON.stringify(cleaned)) } catch {}
          return cleaned
        })

        const { data: portalData } = await supabase
          .from('lgs_student_portal_settings')
          .select('student_id,target_score,target_history,study_plan,study_plan_generated_at')
          .in('student_id', loadedStudents.map(student => student.id))
        if (portalData?.length) {
          const dbTargets = Object.fromEntries(portalData.map(row => [row.student_id, row.target_score ?? '']))
          const dbHistory = Object.fromEntries(portalData.map(row => [row.student_id, row.target_history || []]))
          const dbPlans = Object.fromEntries(portalData.map(row => [row.student_id, row.study_plan || []]))
          const dbDates = Object.fromEntries(portalData.map(row => [row.student_id, row.study_plan_generated_at || null]))
          setTargets(current => ({ ...current, ...dbTargets }))
          setTargetHistory(current => ({ ...current, ...dbHistory }))
          setStudyPlans(current => ({ ...current, ...dbPlans }))
          setStudyPlanDates(current => ({ ...current, ...dbDates }))
        }
      } else {
        setLgsStudents([])
      }

      const { data: resultData, error: resultError } = await supabase
        .from('lgs_results')
        .select('id,exam_id,student_id,student_number,student_name,class_text,turkish_correct,turkish_net,history_correct,history_net,religion_correct,religion_net,english_correct,english_net,math_correct,math_net,science_correct,science_net,total_correct,total_net,score,rank')
      if (resultError) throw resultError
      setAllResults(resultData ?? [])
    } catch (err) {
      setError(err?.message || 'LGS verileri yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }

  async function invokeAccount(body) {
    const { data, error } = await supabase.functions.invoke('student-account', { body })
    if (error) throw new Error(error.message)
    if (!data?.ok) throw new Error(data?.error || 'İşlem başarısız.')
    return data
  }

  function openCreate() {
    setExamName('')
    setExamDate(new Date().toISOString().slice(0,10))
    setRows([])
    setFileExamName('')
    setValidationErrors([])
    setShowOnlyInvalidRows(false)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setCreateOpen(true)
  }

  async function readExcel(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setRows([]); setValidationErrors([]); setFileExamName(file.name); setError('')
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type:'array', cellDates:false })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json(firstSheet, { header:1, defval:'', raw:true })
      if (grid.length < 4) throw new Error('Excel şablonunda sonuç satırı bulunamadı.')
      const embeddedName = safeText(grid[0]?.[0]).trim()
      if (!examName && embeddedName && embeddedName.toLocaleUpperCase('tr-TR') !== 'DENEME ADI') setExamName(embeddedName)
      const parsed = []; const errors = []; const seenNumbers = new Map()
      grid.slice(3).forEach((source,index) => {
        const excelRow = index + 4
        if (source.every(cell => safeText(cell).trim() === '')) return
        const studentNumber = asNumber(source[0])
        const item = {
          excel_row:excelRow, student_number:studentNumber, student_name:safeText(source[1]).trim(), class_text:safeText(source[2]).trim(),
          turkish_correct:asNumber(source[3]), turkish_net:asNumber(source[4]), history_correct:asNumber(source[5]), history_net:asNumber(source[6]),
          religion_correct:asNumber(source[7]), religion_net:asNumber(source[8]), english_correct:asNumber(source[9]), english_net:asNumber(source[10]),
          math_correct:asNumber(source[11]), math_net:asNumber(source[12]), science_correct:asNumber(source[13]), science_net:asNumber(source[14]),
          total_correct:asNumber(source[15]), total_net:asNumber(source[16]), score:asNumber(source[17]), rank:asNumber(source[18]), errors:[], field_errors:{}
        }
        const addRowError=(field,message)=>{
          item.errors.push(message)
          item.field_errors[field]=[...(item.field_errors[field]||[]),message]
        }
        if (!Number.isInteger(studentNumber) || studentNumber <= 0) addRowError('student_number','Öğrenci numarası geçersiz')
        if (!item.student_name) addRowError('student_name','Ad soyad boş')
        if (studentNumber != null && seenNumbers.has(studentNumber)) addRowError('student_number',`Numara tekrar ediyor (satır ${seenNumbers.get(studentNumber)})`)
        else if (studentNumber != null) seenNumbers.set(studentNumber, excelRow)
        const studentMatch = Number.isInteger(studentNumber) ? lgsStudents.find(student=>Number(student.student_number)===Number(studentNumber)) : null
        if (Number.isInteger(studentNumber) && !studentMatch) addRowError('student_number',`LGS Grubu içinde ${studentNumber} numaralı öğrenci bulunamadı`)
        if (studentMatch && item.student_name) {
          const normalizeName=value=>safeText(value).toLocaleUpperCase('tr-TR').replace(/\s+/g,' ').trim()
          const registeredName=normalizeName(`${studentMatch.first_name||''} ${studentMatch.last_name||''}`)
          if (registeredName && normalizeName(item.student_name)!==registeredName) addRowError('student_name',`Ad soyad eşleşmiyor; kayıtlı öğrenci: ${studentMatch.first_name||''} ${studentMatch.last_name||''}`.trim())
        }
        const numericLabels={
          turkish_correct:'Türkçe doğru',turkish_net:'Türkçe net',history_correct:'İnkılap doğru',history_net:'İnkılap net',
          religion_correct:'Din doğru',religion_net:'Din net',english_correct:'İngilizce doğru',english_net:'İngilizce net',
          math_correct:'Matematik doğru',math_net:'Matematik net',science_correct:'Fen doğru',science_net:'Fen net',
          total_correct:'Toplam doğru',total_net:'Toplam net',score:'Puan',rank:'Sıra'
        }
        numericFields.forEach(field => { if (item[field] == null) addRowError(field,`${numericLabels[field]||field} boş veya geçersiz`) })
        parsed.push(item)
        if (item.errors.length) errors.push({ excel_row:excelRow, errors:item.errors })
      })
      if (!parsed.length) throw new Error('Excel dosyasında dolu öğrenci satırı bulunamadı.')
      setRows(parsed); setValidationErrors(errors)
    } catch (err) { setError(err?.message || 'Excel dosyası okunamadı.') }
  }

  async function saveExam() {
    if (!examName.trim()) return setError('Deneme adı zorunlu.')
    if (!examDate) return setError('Deneme tarihi zorunlu.')
    if (!rows.length || validationErrors.length) return
    setSaving(true); setProgress(25); setError('')
    try {
      const result = await invokeAccount({ action:'create_lgs_exam', exam:{ name:examName.trim(), exam_date:examDate, results:rows.map(({ errors,...row }) => row) } })
      setProgress(100); setMessage(`${result.success_count} LGS sonucu kaydedildi.`); setCreateOpen(false); await loadDashboard()
    } catch (err) { setError(err?.message || 'LGS denemesi kaydedilemedi.') }
    finally { setSaving(false) }
  }

  async function openDetails(exam) {
    setDetailExam(exam); setDetailRows([]); setDetailOpen(true); setDetailLoading(true)
    const rows = allResults.filter(row => row.exam_id === exam.id).sort((a,b) => Number(a.rank)-Number(b.rank))
    setDetailRows(rows)
    setDetailLoading(false)
  }

  async function deleteExam(exam) {
    if (!window.confirm(`"${exam.name}" denemesi ve tüm sonuçları silinsin mi?`)) return
    try { await invokeAccount({ action:'delete_lgs_exam', exam_id:exam.id }); setMessage('LGS denemesi silindi.'); await loadDashboard() }
    catch (err) { setError(err?.message || 'Deneme silinemedi.') }
  }

  function getOnlineStatus(exam) {
    const now = new Date()
    const start = new Date(`${exam.date}T${exam.start || '00:00'}:00`)
    const end = new Date(`${exam.date}T${exam.end || '23:59'}:00`)
    if (now < start) return { label:'Planlandı', color:'info' }
    if (now > end) return { label:'Bitti', color:'error' }
    return { label:'Aktif', color:'success' }
  }

  function openOnlineCreate() {
    setOnlineForm({ name:'', date:new Date().toISOString().slice(0,10), start:'10:00', end:'12:35', attachment:null }); setOnlineFile(null)
    setAnswerKey({}); setBookletMap({}); setOnlineValidationErrors([]); setEditingOnlineId(null); setOnlineOpen(true)
  }

  function editOnlineExam(exam) {
    setOnlineForm({ name:exam.name, date:exam.date, start:exam.start, end:exam.end, attachment:exam.attachment||null }); setOnlineFile(null)
    setAnswerKey(exam.answerKey || {}); setBookletMap(exam.bookletMap || {})
    setOnlineValidationErrors([]); setEditingOnlineId(exam.id); setOnlineOpen(true)
  }

  function validateOnlineExam() {
    const errors = []
    if (!onlineForm.name.trim()) errors.push({ key:'name', message:'Deneme adı boş bırakılamaz.' })
    if (!onlineForm.date) errors.push({ key:'date', message:'Deneme tarihi seçilmelidir.' })
    if (!onlineForm.start) errors.push({ key:'start', message:'Giriş saati seçilmelidir.' })
    if (!onlineForm.end) errors.push({ key:'end', message:'Bitiş saati seçilmelidir.' })
    for (const lesson of lessonDefs) {
      const used = new Map()
      for (let question=1; question<=lesson.count; question++) {
        const key = `${lesson.key}-${question}`
        if (!answerKey[key]) errors.push({ key:`answer-${key}`, message:`${lesson.name} cevap anahtarında ${question}. soru boş.` })
        const value = Number(bookletMap[key])
        if (!Number.isInteger(value) || value < 1 || value > lesson.count) {
          errors.push({ key:`map-${key}`, message:`${lesson.name}: A ${question}. soru için geçerli bir B soru numarası girilmelidir.` })
        } else if (used.has(value)) {
          errors.push({ key:`map-${key}`, message:`${lesson.name}: B ${value}. soru iki kez kullanılmış (A ${used.get(value)} ve A ${question}).` })
        } else used.set(value, question)
      }
    }
    return errors
  }

  function focusOnlineError(key) {
    document.querySelector(`[data-field="${key}"]`)?.scrollIntoView({ behavior:'smooth', block:'center' })
    setTimeout(()=>document.querySelector(`[data-field="${key}"] input, [data-field="${key}"] button`)?.focus(), 300)
  }

  async function saveOnlineExam() {
    const errors = validateOnlineExam()
    setOnlineValidationErrors(errors)
    if (errors.length) { setError(`Online deneme kaydedilemedi: ${errors.length} alan düzeltilmelidir.`); focusOnlineError(errors[0].key); return }
    const fileError = validateOnlineExamFile(onlineFile)
    if (fileError) return setError(fileError)
    setOnlineUploading(true)
    try {
      const old = onlineExams.find(item => item.id === editingOnlineId)
      const examId = editingOnlineId || Date.now()
      let attachment = onlineForm.attachment || old?.attachment || null
      if (onlineFile) {
        const previous = attachment
        attachment = await uploadOnlineExamFile(onlineFile, 'lgs', examId)
        if (previous?.path) await removeOnlineExamFile(previous).catch(()=>{})
      }
      const item = { id:examId, ...onlineForm, attachment, answerKey, bookletMap, participants:old?.participants || [] }
      const next = editingOnlineId ? onlineExams.map(x=>x.id===editingOnlineId?item:x) : [item, ...onlineExams]
      setOnlineExams(next); localStorage.setItem('lgsOnlineExams', JSON.stringify(next)); window.dispatchEvent(new Event('taskin-lgs-online-updated'))
      setMessage(editingOnlineId ? 'Online deneme güncellendi.' : 'Online deneme kaydedildi.'); setOnlineOpen(false); setOnlineFile(null)
    } catch (err) { setError(`Deneme dosyası yüklenemedi: ${err?.message || err}`) }
    finally { setOnlineUploading(false) }
  }

  function openLiveTracking(exam) {
    const completed = (exam.participants || []).map(participant => {
      const state = liveStatusKey(participant)
      if (state !== 'finished') return participant
      const score = Number(participant.score)
      return {
        ...participant,
        totalNet: Number.isFinite(Number(participant.totalNet)) ? Number(participant.totalNet) : onlineTotalNet(participant),
        score: Number.isFinite(score) ? score : calculateLgsOnlineScore(participant)
      }
    })
    const ranked = completed.map(participant => {
      if (liveStatusKey(participant) !== 'finished') return participant
      const scores = completed.filter(item => liveStatusKey(item)==='finished').map(item => Number(item.score)).filter(Number.isFinite).sort((a,b)=>b-a)
      return { ...participant, rank: scores.indexOf(Number(participant.score)) + 1 }
    })
    const normalized = { ...exam, participants: ranked }
    if (JSON.stringify(normalized.participants) !== JSON.stringify(exam.participants || [])) {
      const next = onlineExams.map(item => item.id === exam.id ? normalized : item)
      setOnlineExams(next); localStorage.setItem('lgsOnlineExams', JSON.stringify(next)); window.dispatchEvent(new Event('taskin-lgs-online-updated'))
    }
    setLiveExam(normalized); setLiveOpen(true)
  }

  function resetStudentExam(examId, studentId) {
    const next = onlineExams.map(exam => exam.id !== examId ? exam : ({ ...exam, participants:(exam.participants || []).map(p => p.studentId !== studentId ? p : ({ ...p, status:'Tekrar girebilir', score:null, rank:null, totalCorrect:null, totalNet:null, answers:{}, startedAt:null, finishedAt:null, results:{}, lessonResults:{} })) }))
    setOnlineExams(next); localStorage.setItem('lgsOnlineExams', JSON.stringify(next)); window.dispatchEvent(new Event('taskin-lgs-online-updated')); setLiveExam(next.find(x=>x.id===examId)); setMessage('Öğrencinin sınavı iptal edildi ve tekrar giriş hakkı açıldı.')
  }

  function downloadOnlineExcel(exam) {
    const rows = (exam.participants || []).map((p,i)=>({ Sıra:i+1, Numara:p.studentNumber||'', 'Ad Soyad':p.name||'', Durum:p.status||'Girmedi', 'Toplam Net':p.totalNet??'', Puan:p.score??'', 'Giriş Saati':p.startedAt||'', 'Bitiş Saati':p.finishedAt||'' }))
    const ws = XLSX.utils.json_to_sheet(rows.length?rows:[{ Bilgi:'Bu denemeye henüz öğrenci katılmadı.' }])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Online Deneme'); XLSX.writeFile(wb,`${exam.name.replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ ]/gi,'_')}.xlsx`)
  }

  async function downloadOnlinePdf(exam) {
    const participants=[...(exam.participants||[])].filter(p=>liveStatusKey(p)==='finished').map(p=>({...p,totalNet:Number.isFinite(Number(p.totalNet))?Number(p.totalNet):onlineTotalNet(p),score:Number.isFinite(Number(p.score))?Number(p.score):calculateLgsOnlineScore(p)})).sort((a,b)=>Number(b.score||0)-Number(a.score||0)||Number(a.studentNumber||0)-Number(b.studentNumber||0)).map((p,index)=>({...p,rank:index+1}))
    const pageSize=18
    const chunks=participants.length ? Array.from({length:Math.ceil(participants.length/pageSize)},(_,i)=>participants.slice(i*pageSize,(i+1)*pageSize)) : [[]]
    const dateText=exam.date?new Date(`${exam.date}T00:00:00`).toLocaleDateString('tr-TR'):'-'
    const reportDate=new Date().toLocaleDateString('tr-TR')
    const header=(subtitle)=>`<div class="report-head"><div class="brand-lock"><img class="brand-pdf-logo" src="/taskin-takip-sistemi-logo.png" alt="Taşkın Takip Sistemi"><div><div class="brand-name">TAŞKIN</div><div class="brand-sub">TAKİP SİSTEMİ • ${subtitle}</div></div></div><div class="report-center"><h1>${escapeHtml(exam.name)}</h1><b>LGS Grubu</b></div><div class="report-meta"><div><b>Deneme:</b> ${escapeHtml(exam.name)}</div><div><b>Deneme Tarihi:</b> ${dateText}</div><div><b>Rapor Tarihi:</b> ${reportDate}</div></div></div>`
    const resultPages=chunks.map((chunk,pageIndex)=>{
      const rows=chunk.map((p,i)=>{
        const cells=lessonDefs.map(lesson=>`<td>${formatNumber(onlineValue(p,lesson.key,'correct'))}</td><td>${formatNumber(onlineValue(p,lesson.key,'net'))}</td>`).join('')
        return `<tr><td>${pageIndex*pageSize+i+1}</td><td>${escapeHtml(p.studentNumber||'-')}</td><td class="name">${escapeHtml(p.name||'-')}</td>${cells}<td class="total-d">${formatNumber(p.totalCorrect??p.total_correct)}</td><td class="total-n">${formatNumber(p.totalNet??p.total_net)}</td><td class="score">${formatNumber(p.score)}</td><td class="rank">${p.rank??'-'}</td></tr>`
      }).join('') || `<tr><td colspan="18">Bu denemeye henüz öğrenci katılmadı.</td></tr>`
      const avg=(field)=>average(chunk.map(p=>field(p)))
      const avgCells=lessonDefs.map(lesson=>`<td>${formatNumber(avg(p=>onlineValue(p,lesson.key,'correct')))}</td><td>${formatNumber(avg(p=>onlineValue(p,lesson.key,'net')))}</td>`).join('')
      return `<section class="report-page">${header(`Sınıf Sonuçları (${pageIndex+1}/${chunks.length})`)}<div class="participation">Katılım: ${participants.length}/${lgsStudents.length || participants.length}</div><table class="result-table"><thead><tr><th rowspan="2" style="width:30px">#</th><th rowspan="2" style="width:45px">NO</th><th rowspan="2" style="width:145px">ADI SOYADI</th>${lessonDefs.map(l=>`<th colspan="2">${escapeHtml(l.name.toUpperCase())}</th>`).join('')}<th rowspan="2">TOP. D</th><th rowspan="2">TOP. NET</th><th rowspan="2">PUAN</th><th rowspan="2">SIRA</th></tr><tr class="sub">${lessonDefs.map(()=>'<th>D</th><th>NET</th>').join('')}</tr></thead><tbody>${rows}<tr class="avg-row"><td colspan="3">SINIF ORTALAMALARI</td>${avgCells}<td>${formatNumber(avg(p=>p.totalCorrect??p.total_correct))}</td><td>${formatNumber(avg(p=>p.totalNet??p.total_net))}</td><td>${formatNumber(avg(p=>p.score))}</td><td>-</td></tr></tbody></table></section>`
    }).join('')

    const questionStats=[]
    lessonDefs.forEach(lesson=>{
      for(let q=1;q<=lesson.count;q++){
        const key=`${lesson.key}-${q}`
        let answered=0,correct=0
        participants.forEach(p=>{
          const group=String(p.bookletGroup||'A').toUpperCase()
          const bQuestion=Number(exam.bookletMap?.[key])
          const participantQuestion=group==='B' && Number.isFinite(bQuestion) ? bQuestion : q
          const participantKey=`${lesson.key}-${participantQuestion}`
          const answer=p.answers?.[participantKey] ?? p.answers?.[lesson.key]?.[participantQuestion] ?? p.answers?.[lesson.key]?.[String(participantQuestion)]
          if(answer){ answered++; if(answer===exam.answerKey?.[key]) correct++ }
        })
        questionStats.push({ lesson, question:q, pct:answered?Math.round(correct/answered*100):0 })
      }
    })
    const questionSections=lessonDefs.map(lesson=>{
      const list=questionStats.filter(x=>x.lesson.key===lesson.key)
      const avg=average(list.map(x=>x.pct))||0
      return `<div class="lesson-analysis"><h3>${escapeHtml(lesson.name)} (Ort. %${Math.round(avg)})</h3><div class="question-grid">${list.map(x=>`<div class="qbox ${x.pct>=67?'q-high':x.pct>=34?'q-mid':x.pct>0?'q-low':'q-zero'}"><span>${x.question}</span><span>%${x.pct}</span></div>`).join('')}</div></div>`
    }).join('')
    const courseBars=lessonDefs.map(lesson=>{
      const pct=Math.round(average(questionStats.filter(x=>x.lesson.key===lesson.key).map(x=>x.pct))||0)
      return `<div class="progress-row"><b>${escapeHtml(lesson.name)}</b><div class="progress-track"><div class="progress-fill ${pct<50?'warn':''}" style="width:${pct}%"></div></div><b>%${pct}</b></div>`
    }).join('')
    const sortedQuestions=[...questionStats].sort((a,b)=>a.pct-b.pct)
    const hardest=sortedQuestions.slice(0,10)
    const easiest=[...sortedQuestions].sort((a,b)=>b.pct-a.pct).slice(0,10)
    const analysisPage=`<section class="report-page">${header('Soru Analizi')}<div class="analysis-layout"><div>${questionSections}</div><div><div class="side-card"><h2>Ders Başarı Ortalamaları</h2>${courseBars}</div><div class="side-card"><h2>En Zor 10 Soru</h2><div class="rank-list">${hardest.map((x,i)=>`<div><span>${i+1}. ${escapeHtml(x.lesson.name)} ${x.question}</span><b>%${x.pct}</b></div>`).join('')}</div></div><div class="side-card"><h2>En Kolay 10 Soru</h2><div class="rank-list">${easiest.map((x,i)=>`<div><span>${i+1}. ${escapeHtml(x.lesson.name)} ${x.question}</span><b>%${x.pct}</b></div>`).join('')}</div></div></div></div></section>`

    const movement=participants.map(p=>{
      const history=(resultsByStudent.get(p.studentId)||[]).filter(r=>String(r.exam_id)!==`online-${exam.id}`)
      const previous=history.at(-1)
      return { name:p.name||'-', delta:previous?Number(p.score)-Number(previous.score):NaN }
    }).filter(x=>Number.isFinite(x.delta)&&x.delta!==0)
    const up=[...movement].filter(x=>x.delta>0).sort((a,b)=>b.delta-a.delta).slice(0,5)
    const down=[...movement].filter(x=>x.delta<0).sort((a,b)=>a.delta-b.delta).slice(0,5)
    const movementRows=(items)=>items.length?items.map((x,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(x.name)}</td><td>${x.delta>0?'+':''}${formatNumber(x.delta)} ${x.delta>0?'▲':'▼'}</td></tr>`).join(''):'<tr><td colspan="3">Karşılaştırma için önceki sonuç bulunamadı.</td></tr>'
    const movementPage=`<section class="report-page">${header('Bir Önceki Katıldığı Denemeye Göre Gelişim')}<div class="movement-grid"><div class="movement-box up"><div class="movement-title">▲ En Çok Yükselen 5 Öğrenci</div><table class="movement-table"><tr><th>SIRA</th><th>ÖĞRENCİ ADI</th><th>PUAN FARKI</th></tr>${movementRows(up)}</table></div><div class="movement-box down"><div class="movement-title">▼ En Çok Düşen 5 Öğrenci</div><table class="movement-table"><tr><th>SIRA</th><th>ÖĞRENCİ ADI</th><th>PUAN FARKI</th></tr>${movementRows(down)}</table></div></div><div class="note">Karşılaştırma, öğrencinin katıldığı son normal veya online LGS denemesine göre yapılır.</div></section>`
    await runPdfDownload(`${pdfStyles}${resultPages}${analysisPage}${movementPage}`,`${fileSafe(exam.name)}_online_sonuclari.pdf`,'landscape')
    setMessage('Online deneme PDF dosyası indirildi.')
  }

  function deleteOnlineExam(exam) {
    if (!window.confirm(`"${exam.name}" online denemesi silinsin mi?`)) return
    const next = onlineExams.filter(item => item.id !== exam.id)
    setOnlineExams(next); localStorage.setItem('lgsOnlineExams', JSON.stringify(next)); window.dispatchEvent(new Event('taskin-lgs-online-updated'))
  }

  const examById = useMemo(() => new Map(exams.map(exam => [exam.id, exam])), [exams])
  const combinedTimeline = useMemo(() => {
    const normal = exams.map(exam => ({ id:exam.id, name:exam.name, date:exam.exam_date, kind:'normal', rows:allResults.filter(row=>row.exam_id===exam.id) }))
    const online = onlineExams.map(exam => ({ id:`online-${exam.id}`, name:exam.name, date:exam.date, exam_date:exam.date, kind:'online', rows:(exam.participants||[]).filter(p=>liveStatusKey(p)==='finished').map((p,index)=>({
      exam_id:`online-${exam.id}`, student_id:p.studentId, student_number:p.studentNumber, student_name:p.name,
      turkish_correct:Number(onlineValue(p,'turkish','correct'))||0, turkish_net:Number(onlineValue(p,'turkish','net'))||0,
      history_correct:Number(onlineValue(p,'history','correct'))||0, history_net:Number(onlineValue(p,'history','net'))||0,
      religion_correct:Number(onlineValue(p,'religion','correct'))||0, religion_net:Number(onlineValue(p,'religion','net'))||0,
      english_correct:Number(onlineValue(p,'english','correct'))||0, english_net:Number(onlineValue(p,'english','net'))||0,
      math_correct:Number(onlineValue(p,'math','correct'))||0, math_net:Number(onlineValue(p,'math','net'))||0,
      science_correct:Number(onlineValue(p,'science','correct'))||0, science_net:Number(onlineValue(p,'science','net'))||0,
      total_correct:Number.isFinite(Number(p.totalCorrect))?Number(p.totalCorrect):lessonDefs.reduce((sum,lesson)=>sum+(Number(onlineValue(p,lesson.key,'correct'))||0),0),
      total_net:Number.isFinite(Number(p.totalNet))?Number(p.totalNet):onlineTotalNet(p),
      score:Number.isFinite(Number(p.score))?Number(p.score):calculateLgsOnlineScore(p), rank:Number(p.rank)||index+1, online:true
    })) })).filter(item=>item.rows.length)
    return [...normal,...online].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')))
  }, [exams, allResults, onlineExams])
  const sortedExamsAsc = useMemo(() => combinedTimeline.map(item => ({ id:item.id, name:item.name, exam_date:item.date, kind:item.kind })), [combinedTimeline])
  const resultsByStudent = useMemo(() => {
    const map = new Map()
    combinedTimeline.forEach(exam => exam.rows.forEach(row => {
      if (!map.has(row.student_id)) map.set(row.student_id, [])
      map.get(row.student_id).push({ ...row, _examName:exam.name, _examDate:exam.date, _kind:exam.kind })
    }))
    map.forEach(items => items.sort((a,b)=>String(a._examDate||'').localeCompare(String(b._examDate||''))))
    return map
  }, [combinedTimeline])

  const studentSummaries = useMemo(() => lgsStudents.map(student => {
    const results = resultsByStudent.get(student.id) || []
    const last = results.at(-1)
    const plan = studyPlans[student.id] || []
    const tasks = plan.flatMap(day => day.items || [])
    const completed = tasks.filter(item => item.done).length
    const history = targetHistory[student.id] || []
    const currentTarget=Number(targets[student.id] || 0) || null
    const effectiveHistory=history.map((item,index)=>index===history.length-1&&Number(item.target)===currentTarget ? {...item,passed:results.filter(r=>Number(r.score)>=currentTarget).length} : item)
    return {
      ...student,
      results,
      lastScore:last?.score ?? null,
      averageScore:average(results.map(item => item.score)),
      examCount:results.length,
      target:currentTarget,
      progress:tasks.length ? Math.round(completed / tasks.length * 100) : 0,
      targetPassCount:effectiveHistory.reduce((sum,item)=>sum+Number(item.passed||0),0),
      targetHistory:effectiveHistory
    }
  }), [lgsStudents, resultsByStudent, studyPlans, targets, targetHistory])

  const lastExam = exams[0]
  const lastExamRows = useMemo(() => lastExam ? allResults.filter(row => row.exam_id === lastExam.id) : [], [allResults, lastExam])
  const lastAverage = average(lastExamRows.map(row => row.score))
  const studentCount = lgsStudents.length
  const readyCount = useMemo(() => rows.filter(row => row.errors.length === 0).length, [rows])
  const visibleImportRows = useMemo(() => showOnlyInvalidRows ? rows.filter(row => row.errors.length > 0) : rows, [rows, showOnlyInvalidRows])
  const countdown = Math.max(0, Math.ceil((new Date(`${lgsDate}T00:00:00`) - new Date()) / 86400000))

  const examTrend = useMemo(() => combinedTimeline.slice(-7).map(exam => ({
    label: exam.name,
    short: exam.name.length > 12 ? `${exam.name.slice(0,11)}…` : exam.name,
    value: average(exam.rows.map(row => row.score))
  })).filter(item => item.value != null), [combinedTimeline])

  const lessonAverages = useMemo(() => lessonDefs.map(lesson => ({
    name:lesson.name,
    value:average(lastExamRows.map(row => row[`${lesson.key}_net`])) || 0,
    max:lesson.count
  })), [lastExamRows])

  const movement = useMemo(() => studentSummaries.map(student => {
    const lastTwo = student.results.slice(-2)
    if (lastTwo.length < 2) return null
    return {
      name:`${student.first_name} ${student.last_name}`,
      delta:Number(lastTwo[1].score)-Number(lastTwo[0].score),
      netDelta:Number(lastTwo[1].total_net)-Number(lastTwo[0].total_net)
    }
  }).filter(Boolean), [studentSummaries])
  const rising = [...movement].filter(item => item.delta > 0).sort((a,b) => b.delta-a.delta).slice(0,5)
  const falling = [...movement].filter(item => item.delta < 0).sort((a,b) => a.delta-b.delta).slice(0,5)

  async function saveSettings() {
    const nextHistory={...targetHistory}
    lgsStudents.forEach(student=>{
      const previous=Number((targetHistory[student.id]||[]).at(-1)?.target || 0)
      const current=Number(targets[student.id]||0)
      if(current>0 && current!==previous){
        const passed=(resultsByStudent.get(student.id)||[]).filter(r=>Number(r.score)>=current).length
        nextHistory[student.id]=[...(nextHistory[student.id]||[]),{ target:current, passed, changedAt:new Date().toISOString() }]
      }
    })
    setTargetHistory(nextHistory); localStorage.setItem('lgsTargetHistory',JSON.stringify(nextHistory))
    localStorage.setItem('lgsDate', lgsDate); localStorage.setItem('lgsTargets', JSON.stringify(targets))
    try {
      await writeSharedState('lgs-global-settings-v1', { lgsDate })
    } catch (cloudError) {
      return setError(`LGS tarihi buluta kaydedilemedi: ${cloudError?.message || cloudError}`)
    }
    const portalRows = lgsStudents.map(student => ({
      student_id: student.id,
      target_score: Number(targets[student.id] || 0) || null,
      target_history: nextHistory[student.id] || [],
      study_plan: studyPlans[student.id] || [],
      study_plan_generated_at: studyPlanDates[student.id] || null,
      updated_at: new Date().toISOString()
    }))
    const { error: portalError } = await supabase.from('lgs_student_portal_settings').upsert(portalRows,{onConflict:'student_id'})
    if (portalError) return setError(`LGS öğrenci ayarları kaydedilemedi: ${portalError.message}`)
    setSettingsOpen(false); setMessage('LGS ayarları, hedef puanlar ve hedef geçmişi kaydedildi.')
  }

  function openStudent(student) {
    setSelectedStudent(student)
    setStudentOpen(true)
  }

  function buildStudyPlan(student) {
    const results = student.results || []
    const weakness = lessonDefs.map(lesson => {
      const avg = average(results.slice(-3).map(row => row[`${lesson.key}_net`])) ?? 0
      return { ...lesson, avg, ratio:avg / lesson.count }
    }).sort((a,b)=>a.ratio-b.ratio)
    const priority = { math:1.5, turkish:1.35, science:1.35, history:.72, religion:.62, english:.72 }
    const stamp = Date.now()
    return Array.from({ length:14 }, (_, index) => {
      const dayItems=[]
      let remaining=80
      const selected=[...weakness]
        .sort((a,b)=>(a.ratio/(priority[a.key]||1))-(b.ratio/(priority[b.key]||1)))
        .slice(0,index%3===0?4:3)
      selected.forEach((lesson,li)=>{
        if(remaining<=0)return
        const base = ['math','turkish','science'].includes(lesson.key) ? (li===0?30:25) : 15
        const questions=Math.min(remaining,base)
        remaining-=questions
        const task = lesson.key==='turkish'
          ? `${questions} soru çöz; bunun en az 15'i paragraf olsun.`
          : `${questions} soru çöz ve yanlışlarını kısa notlarla kontrol et.`
        dayItems.push({ id:`${student.id}-${stamp}-${index}-${lesson.key}`, lesson:lesson.name, task, questions, minutes:questions>=25?40:25, done:false })
      })
      if(index%4===3) dayItems.push({ id:`${student.id}-${stamp}-${index}-review`, lesson:'Genel Tekrar', task:'Son denemedeki yanlışları 20 dakika gözden geçir.', questions:0, minutes:20, done:false })
      return { day:index+1, items:dayItems }
    })
  }

  function generateStudyPlan(student, notify=true) {
    const plan = buildStudyPlan(student)
    const now = new Date().toISOString()
    const next={...studyPlans,[student.id]:plan}
    const nextDates={...studyPlanDates,[student.id]:now}
    setStudyPlans(next)
    setStudyPlanDates(nextDates)
    localStorage.setItem('lgsStudyPlans',JSON.stringify(next))
    localStorage.setItem('lgsStudyPlanDates',JSON.stringify(nextDates))
    supabase.from('lgs_student_portal_settings').upsert({
      student_id: student.id,
      target_score: Number(targets[student.id] || 0) || null,
      target_history: targetHistory[student.id] || [],
      study_plan: plan,
      study_plan_generated_at: now,
      updated_at: now
    },{onConflict:'student_id'}).then(({error})=>{ if(error) setError(error.message) })
    if (notify) setMessage('14 günlük çalışma programı otomatik olarak hazırlandı.')
  }

  useEffect(() => {
    if (loading || !lgsStudents.length) return
    const fourteenDays = 14 * 24 * 60 * 60 * 1000
    const now = Date.now()
    let changed = false
    const nextPlans = { ...studyPlans }
    const nextDates = { ...studyPlanDates }
    lgsStudents.forEach(student => {
      const results = resultsByStudent.get(student.id) || []
      const existing = nextPlans[student.id] || []
      const generatedAt = nextDates[student.id] ? new Date(nextDates[student.id]).getTime() : 0
      if (!existing.length || !generatedAt || now - generatedAt >= fourteenDays) {
        nextPlans[student.id] = buildStudyPlan({ ...student, results })
        nextDates[student.id] = new Date().toISOString()
        changed = true
      }
    })
    if (changed) {
      setStudyPlans(nextPlans)
      setStudyPlanDates(nextDates)
      localStorage.setItem('lgsStudyPlans',JSON.stringify(nextPlans))
      localStorage.setItem('lgsStudyPlanDates',JSON.stringify(nextDates))
      const rowsToPersist = lgsStudents.map(student => ({
        student_id: student.id,
        target_score: Number(targets[student.id] || 0) || null,
        target_history: targetHistory[student.id] || [],
        study_plan: nextPlans[student.id] || [],
        study_plan_generated_at: nextDates[student.id] || null,
        updated_at: new Date().toISOString()
      }))
      supabase.from('lgs_student_portal_settings').upsert(rowsToPersist,{onConflict:'student_id'}).then(({error})=>{
        if(error)setError(`Çalışma programları kaydedilemedi: ${error.message}`)
      })
    }
  }, [loading, lgsStudents, resultsByStudent])

  function togglePlanItem(studentId, itemId) {
    const nextPlan=(studyPlans[studentId]||[]).map(day=>({ ...day, items:(day.items||[]).map(item=>item.id===itemId?{...item,done:!item.done}:item) }))
    const next={...studyPlans,[studentId]:nextPlan}; setStudyPlans(next); localStorage.setItem('lgsStudyPlans',JSON.stringify(next))
    supabase.from('lgs_student_portal_settings').upsert({
      student_id: studentId,
      target_score: Number(targets[studentId] || 0) || null,
      target_history: targetHistory[studentId] || [],
      study_plan: nextPlan,
      study_plan_generated_at: studyPlanDates[studentId] || new Date().toISOString(),
      updated_at: new Date().toISOString()
    },{onConflict:'student_id'}).then(({error})=>{ if(error) setError(error.message) })
  }

  async function printStudentReport(student, detailed=true) {
    const reportDate=new Date().toLocaleDateString('tr-TR')
    const fullName=`${student.first_name} ${student.last_name}`.trim()
    const header=(subtitle)=>`<div class="report-head"><div class="brand-lock"><img class="brand-pdf-logo" src="/taskin-takip-sistemi-logo.png" alt="Taşkın Takip Sistemi"><div><div class="brand-name">TAŞKIN</div><div class="brand-sub">TAKİP SİSTEMİ • ${subtitle}</div></div></div><div class="report-center"><h1>${escapeHtml(fullName)}</h1><b>LGS Grubu</b></div><div class="report-meta"><div><b>Öğrenci No:</b> ${escapeHtml(student.student_number||'-')}</div><div><b>Grup:</b> LGS Grubu</div><div><b>Rapor Tarihi:</b> ${reportDate}</div></div></div>`
    const resultRows=student.results||[]
    const pageSize=13
    const chunks=resultRows.length?Array.from({length:Math.ceil(resultRows.length/pageSize)},(_,i)=>resultRows.slice(i*pageSize,(i+1)*pageSize)):[[]]
    const fields=['turkish_correct','turkish_net','history_correct','history_net','religion_correct','religion_net','english_correct','english_net','math_correct','math_net','science_correct','science_net','total_correct','total_net','score']
    const avg=Object.fromEntries(fields.map(field=>[field,average(resultRows.map(r=>r[field]))]))
    const tablePages=chunks.map((chunk,pageIndex)=>{
      const rows=chunk.map((r,i)=>{
        const exam=examById.get(r.exam_id)
        return `<tr><td>${pageIndex*pageSize+i+1}</td><td class="name">${escapeHtml(exam?.name||'-')}</td><td>${exam?.exam_date?new Date(`${exam.exam_date}T00:00:00`).toLocaleDateString('tr-TR'):'-'}</td><td>${formatNumber(r.turkish_correct)}</td><td>${formatNumber(r.turkish_net)}</td><td>${formatNumber(r.history_correct)}</td><td>${formatNumber(r.history_net)}</td><td>${formatNumber(r.religion_correct)}</td><td>${formatNumber(r.religion_net)}</td><td>${formatNumber(r.english_correct)}</td><td>${formatNumber(r.english_net)}</td><td>${formatNumber(r.math_correct)}</td><td>${formatNumber(r.math_net)}</td><td>${formatNumber(r.science_correct)}</td><td>${formatNumber(r.science_net)}</td><td class="total-d">${formatNumber(r.total_correct)}</td><td class="total-n">${formatNumber(r.total_net)}</td><td class="score">${formatNumber(r.score)}</td><td class="rank">${r.rank??'-'}</td></tr>`
      }).join('') || `<tr><td colspan="19">Henüz deneme sonucu bulunmuyor.</td></tr>`
      const avgRow=pageIndex===chunks.length-1?`<tr class="avg-row"><td colspan="3">ÖĞRENCİ ORTALAMALARI</td><td>${formatNumber(avg.turkish_correct)}</td><td>${formatNumber(avg.turkish_net)}</td><td>${formatNumber(avg.history_correct)}</td><td>${formatNumber(avg.history_net)}</td><td>${formatNumber(avg.religion_correct)}</td><td>${formatNumber(avg.religion_net)}</td><td>${formatNumber(avg.english_correct)}</td><td>${formatNumber(avg.english_net)}</td><td>${formatNumber(avg.math_correct)}</td><td>${formatNumber(avg.math_net)}</td><td>${formatNumber(avg.science_correct)}</td><td>${formatNumber(avg.science_net)}</td><td>${formatNumber(avg.total_correct)}</td><td>${formatNumber(avg.total_net)}</td><td>${formatNumber(avg.score)}</td><td>-</td></tr>`:''
      return `<section class="report-page">${header(`Öğrenci Deneme Sonuçları (${pageIndex+1}/${chunks.length})`)}${pageIndex===0?`<div class="student-summary"><div class="summary-card">Son Puan<b>${formatNumber(student.lastScore)}</b></div><div class="summary-card">Ortalama Puan<b>${formatNumber(student.averageScore)}</b></div><div class="summary-card">Hedef Puan<b>${formatNumber(student.target)}</b></div><div class="summary-card">Katıldığı Deneme<b>${student.examCount}</b></div><div class="summary-card">Hedefi Geçme<b>${student.targetPassCount} kez</b></div></div>`:''}<table class="result-table"><thead><tr><th rowspan="2" style="width:26px">#</th><th rowspan="2" style="width:145px">DENEME</th><th rowspan="2" style="width:65px">TARİH</th>${lessonDefs.map(l=>`<th colspan="2">${escapeHtml(l.name.toUpperCase())}</th>`).join('')}<th rowspan="2">TOP. D</th><th rowspan="2">TOP. NET</th><th rowspan="2">PUAN</th><th rowspan="2">SIRA</th></tr><tr class="sub">${lessonDefs.map(()=>'<th>D</th><th>NET</th>').join('')}</tr></thead><tbody>${rows}${avgRow}</tbody></table></section>`
    }).join('')

    const recent=resultRows.slice(-7)
    const scoreValues=recent.map(r=>Number(r.score)).filter(Number.isFinite)
    const lineSvg=scoreValues.length?(()=>{const min=Math.min(...scoreValues)-10,max=Math.max(...scoreValues)+10,range=Math.max(1,max-min);const pts=scoreValues.map((v,i)=>`${40+i*(440/Math.max(1,scoreValues.length-1))},${185-(v-min)/range*135}`).join(' ');return `<svg viewBox="0 0 520 220" style="width:100%;height:230px"><line x1="35" y1="185" x2="490" y2="185" stroke="#bfc8c3"/><polyline points="${pts}" fill="none" stroke="#145b35" stroke-width="4"/>${scoreValues.map((v,i)=>{const x=40+i*(440/Math.max(1,scoreValues.length-1)),y=185-(v-min)/range*135;return `<circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="#145b35" stroke-width="3"/><text x="${x}" y="${Math.max(15,y-9)}" text-anchor="middle" font-size="10">${Math.round(v)}</text><text x="${x}" y="205" text-anchor="middle" font-size="9">D${i+1}</text>`}).join('')}</svg>`})():'<div class="small-muted">Grafik için yeterli sonuç yok.</div>'
    const last=resultRows.at(-1)
    const bars=lessonDefs.map(l=>({name:l.name,value:Number(last?.[`${l.key}_net`]||0),max:l.count})).map(x=>`<div class="bar-line"><b>${escapeHtml(x.name)}</b><div class="bar-bg"><div class="bar-fg" style="width:${Math.max(0,Math.min(100,x.value/x.max*100))}%"></div></div><b>${formatNumber(x.value)}</b></div>`).join('')
    const recent3=resultRows.slice(-3)
    const lessonRanking=lessonDefs.map(l=>({name:l.name,ratio:(average(recent3.map(r=>r[`${l.key}_net`]))||0)/l.count})).sort((a,b)=>b.ratio-a.ratio)
    const firstScore=Number(recent3[0]?.score||0),lastScore=Number(recent3.at(-1)?.score||0),delta=lastScore-firstScore
    const targetGap=student.target?Number(student.target)-lastScore:null
    const analysis=`${recent3.length<2?'İlk performans verisi oluştu.':delta>5?`Son denemelerde ${formatNumber(delta)} puanlık yükseliş var.`:delta<-5?`Son denemelerde ${formatNumber(Math.abs(delta))} puanlık düşüş var.`:'Son denemelerde puan dengeli seyrediyor.'} En güçlü ders ${lessonRanking[0]?.name||'-'}, öncelikli geliştirme alanı ${lessonRanking.at(-1)?.name||'-'}. ${targetGap==null?'Hedef puan tanımlanmamış.':targetGap<=0?'Mevcut hedef puan geçildi.':`Hedefe ${formatNumber(targetGap)} puan kaldı.`}`
    const chartPage=detailed?`<section class="report-page">${header('Öğrenci Gelişim Grafikleri')}<div class="chart-grid"><div class="chart-card"><h2>Son 7 Deneme Puan Grafiği</h2>${lineSvg}</div><div class="chart-card"><h2>Son Deneme Ders Netleri</h2>${bars}</div></div><div class="ai-box"><b>Performans Analizi</b><br>${escapeHtml(analysis)}</div><div class="side-card" style="margin-top:12px"><h2>Hedef Geçmişi</h2>${(student.targetHistory||[]).length?(student.targetHistory||[]).map(h=>`<div class="progress-row"><b>${formatNumber(h.target)} puan</b><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,Number(h.passed||0)*15)}%"></div></div><b>${h.passed||0} kez</b></div>`).join(''):'<div class="small-muted">Hedef geçmişi bulunmuyor.</div>'}</div></section>`:''
    const plan=studyPlans[student.id]||[]
    const tasks=plan.flatMap(day=>day.items||[]),done=tasks.filter(t=>t.done).length,pct=tasks.length?Math.round(done/tasks.length*100):0
    const planPage=detailed?`<section class="report-page">${header('14 Günlük Çalışma Programı')}<div class="student-summary"><div class="summary-card">Tamamlanan Görev<b>${done}/${tasks.length}</b></div><div class="summary-card">İlerleme<b>%${pct}</b></div><div class="summary-card">Günlük Soru Üst Sınırı<b>80</b></div><div class="summary-card">Ağırlıklı Dersler<b>Mat-Türkçe-Fen</b></div><div class="summary-card">Yenilenme<b>14 günde</b></div></div><div class="plan-grid">${plan.map(day=>`<div class="plan-day"><h3>${day.day}. Gün - ${(day.items||[]).reduce((sum,x)=>sum+Number(x.questions||0),0)} soru</h3><ul>${(day.items||[]).map(item=>`<li>${item.done?'✓':'○'} <b>${escapeHtml(item.lesson)}</b>: ${escapeHtml(item.task)}</li>`).join('')}</ul></div>`).join('')}</div></section>`:''
    await runPdfDownload(`${pdfStyles}${tablePages}${chartPage}${planPage}`,`${fileSafe(fullName)}_LGS_ogrenci_raporu.pdf`,'landscape')
    setMessage('Öğrenci PDF raporu indirildi.')
  }

  function findStudentByNumber() {
    const query = String(studentNumberSearch || '').trim()
    if (!query) {
      setStudentSearchError('Öğrenci numarasını yazın.')
      return
    }
    const student = studentSummaries.find(item => String(item.student_number).trim() === query)
    if (!student) {
      setStudentSearchError(`${query} numaralı öğrenci aktif LGS grubunda bulunamadı.`)
      return
    }
    setStudentSearchError('')
    openStudent(student)
  }

  const classReportRows = useMemo(() => studentSummaries.map(student => {
    const resultRows=student.results||[]
    const row={
      student_number:student.student_number,
      student_name:`${student.first_name} ${student.last_name}`.trim(),
      exam_count:resultRows.length
    }
    lessonDefs.forEach(lesson=>{
      row[`${lesson.key}_correct`]=average(resultRows.map(result=>result[`${lesson.key}_correct`]))
      row[`${lesson.key}_net`]=average(resultRows.map(result=>result[`${lesson.key}_net`]))
    })
    row.total_net=average(resultRows.map(result=>result.total_net))
    row.score=average(resultRows.map(result=>result.score))
    return row
  }).sort((a,b)=>(Number(b.score)||-1)-(Number(a.score)||-1)), [studentSummaries])

  function downloadClassReportExcel() {
    const rows=classReportRows.map((row,index)=>({
      'Sıra':index+1,'No':row.student_number,'Adı Soyadı':row.student_name,'Katıldığı Deneme':row.exam_count,
      'Türkçe Doğru Ort.':row.turkish_correct,'Türkçe Net Ort.':row.turkish_net,
      'İnkılap Doğru Ort.':row.history_correct,'İnkılap Net Ort.':row.history_net,
      'Din Doğru Ort.':row.religion_correct,'Din Net Ort.':row.religion_net,
      'İngilizce Doğru Ort.':row.english_correct,'İngilizce Net Ort.':row.english_net,
      'Matematik Doğru Ort.':row.math_correct,'Matematik Net Ort.':row.math_net,
      'Fen Doğru Ort.':row.science_correct,'Fen Net Ort.':row.science_net,
      'Toplam Net Ort.':row.total_net,'Toplam Puan Ort.':row.score
    }))
    const sheet=XLSX.utils.json_to_sheet(rows); const book=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,sheet,'LGS Sınıf Raporu')
    XLSX.writeFile(book,'LGS_Sinif_Genel_Basari_Raporu.xlsx'); setMessage('Sınıf raporu Excel olarak indirildi.')
  }

  async function downloadClassReportPdf() {
    const headers=lessonDefs.map(lesson=>`<th colspan="2">${lesson.name}</th>`).join('')
    const sub=lessonDefs.map(()=>'<th>Doğru Ort.</th><th>Net Ort.</th>').join('')
    const rows=classReportRows.map((row,index)=>`<tr><td>${index+1}</td><td>${escapeHtml(row.student_number)}</td><td class="name">${escapeHtml(row.student_name)}</td><td>${row.exam_count}</td>${lessonDefs.map(lesson=>`<td>${formatNumber(row[`${lesson.key}_correct`])}</td><td>${formatNumber(row[`${lesson.key}_net`])}</td>`).join('')}<td class="total-n">${formatNumber(row.total_net)}</td><td class="score">${formatNumber(row.score)}</td></tr>`).join('')
    const avgRow=`<tr class="avg-row"><td colspan="4">SINIF ORTALAMASI</td>${lessonDefs.map(lesson=>`<td>${formatNumber(average(classReportRows.map(row=>row[`${lesson.key}_correct`])) )}</td><td>${formatNumber(average(classReportRows.map(row=>row[`${lesson.key}_net`])) )}</td>`).join('')}<td>${formatNumber(average(classReportRows.map(row=>row.total_net)))}</td><td>${formatNumber(average(classReportRows.map(row=>row.score)))}</td></tr>`
    const html=`${pdfStyles}<section class="report-page"><div class="report-head"><div class="brand-lock"><div class="brand-mark">TA</div><div><div class="brand-name">Taşkın Akademi</div><div class="brand-sub">LGS Sınıf Genel Başarı Raporu</div></div></div><div class="report-center"><h1>Ders Bazlı Öğrenci Ortalamaları</h1><b>${new Date().toLocaleDateString('tr-TR')}</b></div><div class="report-meta"><b>Öğrenci:</b> ${classReportRows.length}<br><b>Sıralama:</b> Puan ortalaması</div></div><table class="result-table"><thead><tr><th rowspan="2">Sıra</th><th rowspan="2">No</th><th rowspan="2">Adı Soyadı</th><th rowspan="2">Deneme</th>${headers}<th rowspan="2">Toplam Net Ort.</th><th rowspan="2">Puan Ort.</th></tr><tr class="sub">${sub}</tr></thead><tbody>${rows}${avgRow}</tbody></table></section>`
    await runPdfDownload(html,'LGS_Sinif_Genel_Basari_Raporu.pdf','landscape'); setMessage('Sınıf raporu PDF olarak indirildi.')
  }

  const selectedSummary = selectedStudent ? studentSummaries.find(item => item.id === selectedStudent.id) || selectedStudent : null
  const selectedPlan = selectedSummary ? studyPlans[selectedSummary.id] || [] : []
  const selectedTasks = selectedPlan.flatMap(day=>day.items || [])

  return <Box className="lgs-dashboard-page">
    <Box className="lgs-dashboard-head">
      <Box><Typography variant="h4" fontWeight={950}>LGS Grubu</Typography><Typography color="text.secondary">Deneme, analiz ve öğrenci takibi tek ekranda</Typography></Box>
      <Stack direction="row" spacing={1} className="lgs-top-actions"><Button size="small" color="success" variant="contained" startIcon={<Add />} onClick={openCreate}>Deneme Oluştur</Button><Button size="small" color="success" variant="contained" startIcon={<Monitor />} onClick={openOnlineCreate}>Online Deneme Oluştur</Button><Button size="small" color="success" variant="contained" startIcon={<Assessment />} onClick={()=>setClassReportOpen(true)}>Sınıf Raporu</Button><Button size="small" variant="contained" startIcon={<Settings />} onClick={()=>setSettingsOpen(true)}>Ayarlar</Button></Stack>
    </Box>

    {error && <Alert severity="error" onClose={()=>setError('')} sx={{ mb:2 }}>{error}</Alert>}

    <Box className="glass lgs-countdown-hero">
      <Box className="countdown-icon"><CalendarMonth/></Box>
      <Box><Typography variant="overline" fontWeight={900}>LGS'YE KALAN SÜRE</Typography><Typography variant="h4" fontWeight={950}>{countdown} gün</Typography><Typography color="text.secondary">Sınav tarihi: {new Date(`${lgsDate}T00:00:00`).toLocaleDateString('tr-TR')}</Typography></Box>
      <Button variant="outlined" startIcon={<Settings/>} onClick={()=>setSettingsOpen(true)}>Tarihi Düzenle</Button>
    </Box>

    <Box className="two-dashboard-cards" sx={{ mt:2 }}>
      <Box className="glass metric-card"><BarChart /><Box><Typography color="text.secondary">Son Deneme Ortalama Puanı</Typography><strong>{lastAverage == null ? '-' : formatNumber(lastAverage)}</strong><small>{lastExam?.name || 'Henüz deneme yok'}</small></Box></Box>
      <Box className="glass metric-card"><Groups /><Box><Typography color="text.secondary">Gruptaki Öğrenci Sayısı</Typography><strong>{studentCount}</strong><small>Yalnızca sizin eklediğiniz aktif LGS öğrencileri</small></Box></Box>
    </Box>

    <Typography variant="h5" fontWeight={950} sx={{ mt:3, mb:1 }}>Denemeler</Typography>
    <Box className="lgs-exam-columns">
      <Box className="glass lgs-list-panel"><Typography variant="h6" fontWeight={900}>Normal Denemeler</Typography>{loading ? <CircularProgress size={26}/> : exams.length ? exams.map(exam => <Box className="lgs-list-row" key={exam.id}><Box><b>{exam.name}</b><small>{new Date(`${exam.exam_date}T00:00:00`).toLocaleDateString('tr-TR')} • {exam.lgs_results?.[0]?.count ?? 0} öğrenci</small></Box><Chip size="small" color="success" label="Sonuç yüklendi"/><IconButton onClick={()=>openDetails(exam)}><Visibility/></IconButton><IconButton><Edit/></IconButton><IconButton color="error" onClick={()=>deleteExam(exam)}><Delete/></IconButton></Box>) : <Typography color="text.secondary">Henüz deneme bulunmuyor.</Typography>}</Box>
      <Box className="glass lgs-list-panel"><Typography variant="h6" fontWeight={900}>Aktif / Planlanan Online Denemeler</Typography>{onlineExams.filter(exam=>getOnlineStatus(exam).label!=='Bitti').length ? onlineExams.filter(exam=>getOnlineStatus(exam).label!=='Bitti').map(exam => { const status=getOnlineStatus(exam); return <Box className="lgs-list-row" key={exam.id}><Box><b>{exam.name}</b><small>{new Date(`${exam.date}T00:00:00`).toLocaleDateString('tr-TR')} • {exam.start}–{exam.end}</small></Box><Chip size="small" color={status.color} label={status.label}/><IconButton title="Canlı takip" onClick={()=>openLiveTracking(exam)}><Visibility/></IconButton><IconButton title="Düzenle" onClick={()=>editOnlineExam(exam)}><Edit/></IconButton><IconButton title="PDF" onClick={()=>downloadOnlinePdf(exam)}><PictureAsPdf/></IconButton><IconButton title="Excel" onClick={()=>downloadOnlineExcel(exam)}><TableView/></IconButton><IconButton color="error" title="Sil" onClick={()=>deleteOnlineExam(exam)}><Delete/></IconButton></Box> }) : <Typography color="text.secondary">Aktif veya planlanan online deneme bulunmuyor.</Typography>}</Box>
    </Box>

    <Box className="glass lgs-archive-panel" sx={{ mt:2 }}>
      <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" alignItems={{xs:'flex-start',md:'center'}} spacing={1}><Box><Stack direction="row" spacing={1} alignItems="center"><Archive color="primary"/><Typography variant="h6" fontWeight={950}>Online Deneme Arşivi</Typography></Stack><Typography color="text.secondary">Biten tüm online denemeleri görüntüleyin, PDF veya Excel olarak indirin.</Typography></Box><Chip label={`${onlineExams.filter(exam=>getOnlineStatus(exam).label==='Bitti').length} biten deneme`} /></Stack>
      <Box className="lgs-archive-grid">{onlineExams.filter(exam=>getOnlineStatus(exam).label==='Bitti').map(exam=><Box className="lgs-archive-item" key={exam.id}><div><b>{exam.name}</b><small>{new Date(`${exam.date}T00:00:00`).toLocaleDateString('tr-TR')} • {(exam.participants||[]).length} öğrenci</small></div><Stack direction="row"><IconButton title="Sonuçları / canlı durumu aç" onClick={()=>openLiveTracking(exam)}><Assessment/></IconButton><IconButton title="Düzenle" onClick={()=>editOnlineExam(exam)}><Edit/></IconButton><IconButton title="PDF indir" onClick={()=>downloadOnlinePdf(exam)}><PictureAsPdf/></IconButton><IconButton title="Excel indir" onClick={()=>downloadOnlineExcel(exam)}><TableView/></IconButton></Stack></Box>)}{!onlineExams.some(exam=>getOnlineStatus(exam).label==='Bitti')&&<Typography color="text.secondary">Henüz arşivlenecek bitmiş online deneme yok.</Typography>}</Box>
    </Box>

    <Box className="dashboard-chart-grid" sx={{ mt:2 }}><TrendChart data={examTrend}/><LessonBars data={lessonAverages} examName={lastExam?.name}/></Box>
    <Box className="dashboard-chart-grid" sx={{ mt:2 }}>
      <MovementCard title="En Fazla Yükselen 5 Öğrenci" icon={<TrendingUp/>} positive items={rising}/>
      <MovementCard title="En Fazla Düşen 5 Öğrenci" icon={<TrendingDown/>} items={falling}/>
    </Box>

    <Box className="section-heading lgs-student-section-head" sx={{ mt:3 }}>
      <Box><Typography variant="h5" fontWeight={950}>Öğrenci Kartları</Typography><Typography color="text.secondary">Öğrenci numarasını yazarak doğrudan kişisel takip sayfasını açabilirsiniz.</Typography></Box>
      <Box className="lgs-student-search">
        <TextField
          size="small"
          label="Öğrenci numarası"
          value={studentNumberSearch}
          onChange={event=>{ setStudentNumberSearch(event.target.value.replace(/[^0-9]/g,'')); setStudentSearchError('') }}
          onKeyDown={event=>{ if(event.key==='Enter') findStudentByNumber() }}
          inputProps={{ inputMode:'numeric' }}
          error={Boolean(studentSearchError)}
          helperText={studentSearchError || ' '}
        />
        <Button variant="contained" startIcon={<Search/>} onClick={findStudentByNumber}>Bul</Button>
        <Chip icon={<Groups/>} label={`${studentSummaries.length} öğrenci`} color="primary" variant="outlined"/>
      </Box>
    </Box>
    {loading ? <Box className="loader compact"><CircularProgress/></Box> : studentSummaries.length ? (
      <Box className="lgs-student-card-grid">
        {studentSummaries.map(student => <button className="glass lgs-student-card" key={student.id} onClick={()=>openStudent(student)}>
          <Avatar className="lgs-student-avatar"><Person/></Avatar>
          <div className="lgs-student-title"><strong>{student.first_name} {student.last_name}</strong><small>No: {student.student_number}</small></div>
          <div className="lgs-student-metrics">
            <span><small>Katıldığı</small><b>{student.examCount} deneme</b></span>
            <span><small>Son puan</small><b>{formatNumber(student.lastScore)}</b></span>
            <span><small>Ortalama</small><b>{formatNumber(student.averageScore)}</b></span>
            <span><small>Hedef</small><b>{student.target ? formatNumber(student.target) : '-'}</b></span>
            <span><small>Hedefi geçti</small><b>{student.targetPassCount} kez</b></span>
          </div>
          <div className="lgs-progress-line"><span>14 günlük program</span><b>%{student.progress}</b></div>
          <LinearProgress variant="determinate" value={student.progress}/>
        </button>)}
      </Box>
    ) : <Box className="glass empty"><Groups fontSize="large"/><Typography fontWeight={900}>LGS Grubu öğrencisi bulunamadı</Typography><Typography color="text.secondary">Öğrenciler ekranından LGS Grubu sınıfına öğrenci eklediğinizde kartlar burada görünür.</Typography></Box>}

    <Dialog open={createOpen} onClose={()=>!saving&&setCreateOpen(false)} fullWidth maxWidth="lg" fullScreen={window.innerWidth<700}>
      <DialogTitle fontWeight={900}>Yeni LGS Denemesi<IconButton onClick={()=>setCreateOpen(false)} sx={{ position:'absolute', right:8, top:8 }}><Close/></IconButton></DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ mt:1 }}><Box className="two"><TextField label="Deneme Adı" value={examName} onChange={e=>setExamName(e.target.value)} required/><TextField label="Deneme Tarihi" type="date" value={examDate} onChange={e=>setExamDate(e.target.value)} InputLabelProps={{ shrink:true }} required/></Box><Alert severity="info">Önce denemeyi oluşturup ardından sonuç Excel dosyasını yükleyebilirsiniz.</Alert><input ref={fileInputRef} hidden type="file" accept=".xlsx,.xls" onChange={readExcel}/><Button variant="outlined" size="large" startIcon={<UploadFile/>} onClick={()=>fileInputRef.current?.click()}>LGS Excel Dosyasını Seç</Button>{fileExamName&&<Typography variant="body2">Seçilen dosya: {fileExamName}</Typography>}{rows.length>0&&<><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Chip color="primary" label={`${rows.length} sonuç`}/><Chip color="success" label={`${readyCount} hazır`}/><Chip clickable onClick={()=>setShowOnlyInvalidRows(value=>!value)} color={validationErrors.length?'error':'success'} variant={showOnlyInvalidRows?'filled':'outlined'} label={`${validationErrors.length} hatalı${showOnlyInvalidRows?' • yalnız hatalar':''}`}/></Stack>{validationErrors.length>0&&<Alert severity="error" sx={{mt:1}}><b>Hatalı kayıtlar kırmızı çerçeveyle işaretlendi.</b> Kırmızı “Hatalı” rozetine basarak yalnızca sorunlu satırları görebilirsiniz.</Alert>}{saving&&<LinearProgress variant="determinate" value={progress}/>}<TableContainer component={Paper} variant="outlined" sx={{ maxHeight:430, mt:1 }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell>Excel Satırı</TableCell><TableCell>No</TableCell><TableCell>Ad Soyad</TableCell><TableCell>Toplam Net</TableCell><TableCell>Puan</TableCell><TableCell>Sıra</TableCell><TableCell sx={{minWidth:300}}>Hata Detayı</TableCell></TableRow></TableHead><TableBody>{visibleImportRows.map(r=>{const invalid=r.errors.length>0;const cellSx=field=>r.field_errors?.[field]?.length?{backgroundColor:'#fff1f2',boxShadow:'inset 0 0 0 2px #dc2626',fontWeight:800,color:'#991b1b'}:{};return <TableRow key={r.excel_row} sx={invalid?{'& td':{borderTop:'2px solid #dc2626',borderBottom:'2px solid #dc2626'},'& td:first-of-type':{borderLeft:'2px solid #dc2626'},'& td:last-of-type':{borderRight:'2px solid #dc2626'},backgroundColor:'#fff7f7'}:{}}><TableCell>{r.excel_row}</TableCell><TableCell sx={cellSx('student_number')}>{r.student_number??'-'}</TableCell><TableCell sx={cellSx('student_name')}>{r.student_name||'-'}</TableCell><TableCell sx={cellSx('total_net')}>{formatNumber(r.total_net)}</TableCell><TableCell sx={cellSx('score')}>{formatNumber(r.score)}</TableCell><TableCell sx={cellSx('rank')}>{r.rank??'-'}</TableCell><TableCell>{invalid?<Stack spacing={0.5}>{r.errors.map((message,index)=><Typography key={index} variant="body2" color="error.main" fontWeight={800}>• {message}</Typography>)}</Stack>:<Chip size="small" color="success" label="Hazır"/>}</TableCell></TableRow>})}</TableBody></Table></TableContainer></>}</Stack></DialogContent>
      <DialogActions><Button onClick={()=>setCreateOpen(false)}>İptal</Button><Button variant="contained" onClick={saveExam} disabled={saving||!rows.length||validationErrors.length>0}>{saving?'Kaydediliyor…':'Kaydet'}</Button></DialogActions>
    </Dialog>

    <Dialog open={onlineOpen} onClose={()=>setOnlineOpen(false)} fullWidth maxWidth="xl" fullScreen={window.innerWidth<700}>
      <DialogTitle fontWeight={900}>{editingOnlineId?'Online Denemeyi Düzenle':'Online Deneme Oluştur'}<IconButton onClick={()=>setOnlineOpen(false)} sx={{ position:'absolute', right:8, top:8 }}><Close/></IconButton></DialogTitle>
      <DialogContent>
        {onlineValidationErrors.length>0&&<Alert severity="error" icon={<ErrorOutline/>} sx={{my:1}}><b>Deneme kaydedilemedi. Aşağıdaki alanları düzeltin:</b><ul className="online-error-list">{onlineValidationErrors.slice(0,20).map((err,i)=><li key={`${err.key}-${i}`}><button onClick={()=>focusOnlineError(err.key)}>{err.message}</button></li>)}</ul>{onlineValidationErrors.length>20&&<small>+ {onlineValidationErrors.length-20} hata daha</small>}</Alert>}
        <Box className="two" sx={{ mt:1 }}><TextField data-field="name" error={onlineValidationErrors.some(e=>e.key==='name')} label="Deneme adı" value={onlineForm.name} onChange={e=>setOnlineForm({...onlineForm,name:e.target.value})}/><TextField data-field="date" error={onlineValidationErrors.some(e=>e.key==='date')} type="date" label="Tarih" InputLabelProps={{ shrink:true }} value={onlineForm.date} onChange={e=>setOnlineForm({...onlineForm,date:e.target.value})}/><TextField data-field="start" error={onlineValidationErrors.some(e=>e.key==='start')} type="time" label="Giriş saati" InputLabelProps={{ shrink:true }} value={onlineForm.start} onChange={e=>setOnlineForm({...onlineForm,start:e.target.value})}/><TextField data-field="end" error={onlineValidationErrors.some(e=>e.key==='end')} type="time" label="Bitiş saati" InputLabelProps={{ shrink:true }} value={onlineForm.end} onChange={e=>setOnlineForm({...onlineForm,end:e.target.value})}/></Box>
        <Paper variant="outlined" sx={{p:2,my:2,borderRadius:3}}><Stack spacing={1}><Typography fontWeight={900}>Deneme Dosyası (isteğe bağlı)</Typography><Typography variant="body2" color="text.secondary">PDF, JPG, PNG veya WEBP • En fazla 20 MB. Öğrenci yalnızca sınav süresi içinde erişebilir.</Typography><Button component="label" variant="outlined" startIcon={<UploadFile/>} disabled={onlineUploading}>{onlineFile?onlineFile.name:onlineForm.attachment?.name||'Dosya Seç'}<input hidden type="file" accept={ONLINE_EXAM_ACCEPT} onChange={e=>setOnlineFile(e.target.files?.[0]||null)}/></Button>{onlineForm.attachment&&!onlineFile&&<Button color="error" size="small" onClick={()=>setOnlineForm({...onlineForm,attachment:null})}>Yüklü Dosyayı Kaldır</Button>}</Stack></Paper><Alert severity="info" sx={{ my:2 }}>A kitapçığı cevabını seçin. B sırası alanlarında Enter'a bastığınızda bir sonraki kutuya geçilir. Aynı B soru numarası iki kez kullanılamaz.</Alert>
        <Box className="online-answer-sections">{lessonDefs.map(lesson => {const half=Math.ceil(lesson.count/2);const columns=[Array.from({length:half},(_,i)=>i+1),Array.from({length:lesson.count-half},(_,i)=>i+half+1)];return <Box className="online-answer-lesson" key={lesson.key}><Stack direction="row" justifyContent="space-between"><Typography variant="h6" fontWeight={900}>{lesson.name}</Typography><Chip size="small" label={`${Array.from({length:lesson.count},(_,i)=>answerKey[`${lesson.key}-${i+1}`]&&bookletMap[`${lesson.key}-${i+1}`]).filter(Boolean).length}/${lesson.count} tamamlandı`}/></Stack><Box className="online-answer-columns">{columns.map((questions,ci)=><Box className="online-answer-column" key={ci}>{questions.map(question => { const key=`${lesson.key}-${question}`;const hasError=onlineValidationErrors.some(e=>e.key===`answer-${key}`||e.key===`map-${key}`);return <Box data-field={`map-${key}`} className={`online-answer-row ${hasError?'field-error':''}`} key={key}><b>{question}</b>{['A','B','C','D'].map(option => <Button data-field={`answer-${key}`} key={option} size="small" variant={answerKey[key]===option?'contained':'outlined'} onClick={()=>setAnswerKey({...answerKey,[key]:option})}>{option}</Button>)}<TextField id={`map-${key}`} size="small" type="number" label="B sırası" value={bookletMap[key]||''} onChange={e=>setBookletMap({...bookletMap,[key]:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const q=question<lesson.count?question+1:null;if(q)document.getElementById(`map-${lesson.key}-${q}`)?.focus();else document.getElementById('save-online-exam')?.focus()}}} inputProps={{ min:1,max:lesson.count }}/></Box> })}</Box>)}</Box></Box>})}</Box>
      </DialogContent>
      <DialogActions><Button onClick={()=>setOnlineOpen(false)}>İptal</Button><Button id="save-online-exam" variant="contained" onClick={saveOnlineExam} disabled={onlineUploading}>{editingOnlineId?'Değişiklikleri Kaydet':'Cevap Anahtarıyla Kaydet'}</Button></DialogActions>
    </Dialog>

    <Dialog open={liveOpen} onClose={()=>setLiveOpen(false)} fullWidth maxWidth="xl" PaperProps={{ className:'lgs-live-dialog' }}>
      <DialogTitle className="lgs-live-title">
        <Box><Typography variant="h5" fontWeight={950}>Canlı Takip – LGS Grubu</Typography><Typography variant="body2">{liveExam?.name}</Typography></Box>
        <IconButton onClick={()=>setLiveOpen(false)} className="lgs-live-close"><Close/></IconButton>
      </DialogTitle>
      <DialogContent className="lgs-live-content">
        <Box className="lgs-live-list">
          {lgsStudents.map((student,index)=>{
            const participant=(liveExam?.participants||[]).find(item=>String(item.studentId)===String(student.id) || String(item.studentNumber)===String(student.student_number))
            const row=participant || { studentId:student.id, studentNumber:student.student_number, name:`${student.first_name} ${student.last_name}`, status:'Henüz başlamadı' }
            const state=liveStatusKey(row)
            const answered=countAnsweredQuestions(row)
            const totalQuestions=90
            const score=state==='finished' ? (Number.isFinite(Number(row.score)) ? Number(row.score) : calculateLgsOnlineScore(row)) : null
            const canReset=state!=='waiting' || safeText(row.status).toLocaleLowerCase('tr-TR').includes('tekrar')
            return <Box className={`lgs-live-row ${state}`} key={student.id}>
              <Box className="lgs-live-number">{index+1}</Box>
              <Box className="lgs-live-student">
                <Typography fontWeight={950}>{student.first_name} {student.last_name}</Typography>
                <Typography className="lgs-live-state"><i/>{state==='waiting'?'Henüz başlamadı / tekrar çözebilir':state==='active'?'Deneme başladı':'Denemeyi tamamladı'}</Typography>
              </Box>
              {state==='active' && <>
                <Box className="lgs-live-metric"><AccessTime/><span>Başlangıç<b>{timeOnly(row.startedAt)}</b></span></Box>
                <Box className="lgs-live-metric"><FactCheck/><span>Çözülen<b>{answered} / {totalQuestions} <em>(%{Math.round(answered/totalQuestions*100)})</em></b></span></Box>
                <Box className="lgs-live-metric"><AccessTime/><span>Süre<b>{elapsedText(row.startedAt,row.finishedAt,liveTick)}</b></span></Box>
              </>}
              {state==='finished' && <>
                <Box className="lgs-live-metric"><CheckCircle/><span>Bitiş<b>{timeOnly(row.finishedAt)}</b></span></Box>
                <Box className="lgs-live-metric"><FactCheck/><span>Toplam Net<b>{formatNumber(row.totalNet ?? onlineTotalNet(row))}</b></span></Box>
                <Box className="lgs-live-metric score"><Assessment/><span>Puan<b>{formatNumber(score)}</b></span></Box>
              </>}
              {state==='waiting' && <Box className="lgs-live-waiting-space"/>}
              <Box className="lgs-live-row-actions">
                {state==='finished'&&<Button className="lgs-live-answer" variant="outlined" startIcon={<Visibility/>} onClick={()=>setAnswerDetail({participant:row,exam:liveExam})}>Cevapları Gör</Button>}
                <Button className="lgs-live-reset" variant="outlined" disabled={!canReset} startIcon={<RestartAlt/>} onClick={()=>window.confirm(`${student.first_name} ${student.last_name} öğrencisinin sınavı iptal edilip yeniden giriş hakkı açılsın mı?`)&&resetStudentExam(liveExam.id,student.id)}>Tekrar Çözdür</Button>
              </Box>
            </Box>
          })}
        </Box>
      </DialogContent>
      <DialogActions className="lgs-live-actions"><Typography>Öğrenciler denemeyi bitirdiğinde sonuçlar otomatik olarak sisteme aktarılır.</Typography><Button variant="outlined" onClick={()=>setLiveOpen(false)}>Kapat</Button></DialogActions>
    </Dialog>


    <Dialog open={!!answerDetail} onClose={()=>setAnswerDetail(null)} fullWidth maxWidth="lg">
      <DialogTitle fontWeight={900}>{answerDetail?.participant?.name||'Öğrenci'} – İşaretlenen Cevaplar<IconButton onClick={()=>setAnswerDetail(null)} sx={{position:'absolute',right:8,top:8}}><Close/></IconButton></DialogTitle>
      <DialogContent dividers><Stack direction="row" spacing={1} sx={{mb:2}}><Chip color="primary" label={`${answerDetail?.participant?.bookletGroup||'A'} Grubu`}/><Chip label={`Toplam Net: ${formatNumber(answerDetail?.participant?.totalNet??onlineTotalNet(answerDetail?.participant||{}))}`}/></Stack><Box className="lgs-answer-review">{lessonDefs.map(lesson=><Box key={lesson.key} className="answer-review-lesson"><Typography variant="h6" fontWeight={950}>{lesson.name}</Typography><Box className="answer-review-grid">{Array.from({length:lesson.count},(_,i)=>i+1).map(q=>{const key=`${lesson.key}-${q}`;const group=(answerDetail?.participant?.bookletGroup||'A').toUpperCase();const bQuestion=Number(answerDetail?.exam?.bookletMap?.[key]);const participantQuestion=group==='B'&&Number.isFinite(bQuestion)?bQuestion:q;const participantKey=`${lesson.key}-${participantQuestion}`;const selected=answerDetail?.participant?.answers?.[participantKey];const correct=answerDetail?.exam?.answerKey?.[key];const state=!selected?'blank':selected===correct?'correct':'wrong';return <Paper elevation={0} className={`answer-review-item ${state}`} key={key}><b>{q}</b>{group==='B'&&<span>B kitapçığı: {participantQuestion}. soru</span>}<span>Doğru: {correct||'-'}</span><span>Öğrenci: {selected||'Boş'}</span><Chip size="small" color={state==='correct'?'success':state==='wrong'?'error':'default'} label={state==='correct'?'Doğru':state==='wrong'?'Yanlış':'Boş'}/></Paper>})}</Box></Box>)}</Box></DialogContent>
      <DialogActions><Button onClick={()=>setAnswerDetail(null)}>Kapat</Button></DialogActions>
    </Dialog>
    <Dialog open={classReportOpen} onClose={()=>setClassReportOpen(false)} fullWidth maxWidth="xl" fullScreen={window.innerWidth<800}>
      <DialogTitle fontWeight={900}>LGS Sınıf Genel Başarı Raporu<IconButton onClick={()=>setClassReportOpen(false)} sx={{position:'absolute',right:8,top:8}}><Close/></IconButton></DialogTitle>
      <DialogContent><Stack direction="row" spacing={1} justifyContent="flex-end" sx={{mb:1}}><Button variant="outlined" startIcon={<PictureAsPdf/>} onClick={downloadClassReportPdf}>PDF İndir</Button><Button variant="outlined" startIcon={<TableView/>} onClick={downloadClassReportExcel}>Excel İndir</Button></Stack>
      <TableContainer component={Paper} variant="outlined" sx={{maxHeight:'68vh'}}><Table stickyHeader size="small"><TableHead><TableRow><TableCell rowSpan={2}>Sıra</TableCell><TableCell rowSpan={2}>No</TableCell><TableCell rowSpan={2}>Adı Soyadı</TableCell><TableCell rowSpan={2}>Deneme</TableCell>{lessonDefs.map(lesson=><TableCell key={lesson.key} align="center" colSpan={2}>{lesson.name}</TableCell>)}<TableCell rowSpan={2}>Toplam Net Ort.</TableCell><TableCell rowSpan={2}>Puan Ort.</TableCell></TableRow><TableRow>{lessonDefs.map(lesson=><Box component="span" sx={{display:'contents'}} key={lesson.key}><TableCell align="center">Doğru Ort.</TableCell><TableCell align="center">Net Ort.</TableCell></Box>)}</TableRow></TableHead><TableBody>{classReportRows.map((row,index)=><TableRow key={`${row.student_number}-${index}`}><TableCell>{index+1}</TableCell><TableCell>{row.student_number}</TableCell><TableCell sx={{fontWeight:800,minWidth:170}}>{row.student_name}</TableCell><TableCell>{row.exam_count}</TableCell>{lessonDefs.map(lesson=><Box component="span" sx={{display:'contents'}} key={lesson.key}><TableCell align="center">{formatNumber(row[`${lesson.key}_correct`])}</TableCell><TableCell align="center">{formatNumber(row[`${lesson.key}_net`])}</TableCell></Box>)}<TableCell align="center"><b>{formatNumber(row.total_net)}</b></TableCell><TableCell align="center"><b>{formatNumber(row.score)}</b></TableCell></TableRow>)}</TableBody></Table></TableContainer></DialogContent>
    </Dialog>

    <Dialog open={settingsOpen} onClose={()=>setSettingsOpen(false)} fullWidth maxWidth="md">
      <DialogTitle fontWeight={900}>LGS Grubu Ayarları</DialogTitle>
      <DialogContent>
        <TextField sx={{ mt:1, mb:2 }} fullWidth label="LGS tarihi" type="date" value={lgsDate} onChange={e=>setLgsDate(e.target.value)} InputLabelProps={{ shrink:true }}/>
        <Typography variant="h6" fontWeight={900} sx={{ mb:1 }}>Öğrenci hedef puanları</Typography>
        <Box className="lgs-target-list">{lgsStudents.map(student => <TextField key={student.id} label={`${student.first_name} ${student.last_name} • No ${student.student_number}`} type="number" value={targets[student.id] || ''} onChange={e=>setTargets({...targets,[student.id]:e.target.value})} inputProps={{ min:0,max:500 }}/>)}</Box>
      </DialogContent>
      <DialogActions><Button onClick={()=>setSettingsOpen(false)}>İptal</Button><Button variant="contained" onClick={saveSettings}>Kaydet</Button></DialogActions>
    </Dialog>

    <Dialog open={detailOpen} onClose={()=>setDetailOpen(false)} fullWidth maxWidth="xl" fullScreen={window.innerWidth<700}>
      <DialogTitle fontWeight={900}>{detailExam?.name||'LGS Deneme Sonuçları'}<IconButton onClick={()=>setDetailOpen(false)} sx={{ position:'absolute', right:8, top:8 }}><Close/></IconButton></DialogTitle>
      <DialogContent>{detailLoading?<Box className="loader compact"><CircularProgress/></Box>:<TableContainer component={Paper} variant="outlined" sx={{ mt:1,maxHeight:'70vh' }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell>Sıra</TableCell><TableCell>No</TableCell><TableCell>Öğrenci</TableCell><TableCell>Türkçe</TableCell><TableCell>İnkılap</TableCell><TableCell>Din</TableCell><TableCell>İngilizce</TableCell><TableCell>Matematik</TableCell><TableCell>Fen</TableCell><TableCell>Toplam Net</TableCell><TableCell>Puan</TableCell></TableRow></TableHead><TableBody>{detailRows.map(r=><TableRow key={r.id}><TableCell>{r.rank}</TableCell><TableCell>{r.student_number}</TableCell><TableCell>{r.student_name}</TableCell><TableCell>{formatNumber(r.turkish_net)}</TableCell><TableCell>{formatNumber(r.history_net)}</TableCell><TableCell>{formatNumber(r.religion_net)}</TableCell><TableCell>{formatNumber(r.english_net)}</TableCell><TableCell>{formatNumber(r.math_net)}</TableCell><TableCell>{formatNumber(r.science_net)}</TableCell><TableCell>{formatNumber(r.total_net)}</TableCell><TableCell>{formatNumber(r.score)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}</DialogContent>
    </Dialog>

    <Dialog open={studentOpen} onClose={()=>setStudentOpen(false)} fullWidth maxWidth="xl" fullScreen={window.innerWidth<700}>
      <DialogTitle fontWeight={900}>{selectedSummary ? `${selectedSummary.first_name} ${selectedSummary.last_name}` : 'Öğrenci Detayı'}<IconButton onClick={()=>setStudentOpen(false)} sx={{ position:'absolute', right:8, top:8 }}><Close/></IconButton></DialogTitle>
      <DialogContent>
        {selectedSummary && <Stack spacing={2}>
          <Box className="lgs-student-detail-head glass">
            <Avatar className="lgs-student-avatar"><Person/></Avatar>
            <Box><Typography variant="h6" fontWeight={950}>{selectedSummary.first_name} {selectedSummary.last_name}</Typography><Typography color="text.secondary">No: {selectedSummary.student_number} • {selectedSummary.examCount} deneme</Typography></Box>
            <Stack direction={{xs:'column',sm:'row'}} spacing={1}><Chip color="primary" label={`Hedef: ${selectedSummary.target ? formatNumber(selectedSummary.target) : '-'}`}/><Chip icon={<History/>} label={`Toplam ${selectedSummary.targetPassCount} kez hedef geçti`}/><Button variant="outlined" startIcon={<PictureAsPdf/>} onClick={()=>printStudentReport(selectedSummary,true)}>Öğrenci Durum PDF</Button><Button variant="outlined" startIcon={<Print/>} onClick={()=>printStudentReport(selectedSummary,false)}>Kısa PDF</Button></Stack>
          </Box>

          <Typography variant="h6" fontWeight={950}>Bütün Deneme Sonuçları</Typography>
          <StudentResultsTable student={selectedSummary} exams={sortedExamsAsc} resultMap={new Map(selectedSummary.results.map(row => [row.exam_id,row]))}/>

          <Box className="dashboard-chart-grid">
            <StudentScoreChart student={selectedSummary} examById={examById}/>
            <StudentLessonBars student={selectedSummary}/>
          </Box>

          <StudentAiAnalysis student={selectedSummary}/>

          <Box className="glass lgs-study-section">
            <Box className="section-heading">
              <Box><Stack direction="row" spacing={1} alignItems="center"><Psychology color="primary"/><Typography variant="h6" fontWeight={950}>Yapay Zekâ Destekli 14 Günlük Program</Typography></Stack><Typography color="text.secondary">Program otomatik hazırlanır ve 14 günde bir yenilenir. Günlük toplam soru sayısı 80'i geçmez.</Typography></Box>
              <Chip color="success" icon={<AutoAwesome/>} label="Otomatik program" />
            </Box>
            {selectedPlan.length ? <>
              <Box className="lgs-plan-progress"><span>İlerleme • {selectedTasks.filter(item=>item.done).length}/{selectedTasks.length} görev</span><b>%{selectedTasks.length?Math.round(selectedTasks.filter(item=>item.done).length/selectedTasks.length*100):0}</b></Box>
              <LinearProgress variant="determinate" value={selectedTasks.length?Math.round(selectedTasks.filter(item=>item.done).length/selectedTasks.length*100):0} sx={{ height:10,borderRadius:8,mb:2 }}/>
              <Box className="lgs-plan-days">{selectedPlan.map(day => <Box className="lgs-plan-day" key={day.day}><Typography fontWeight={950}>{day.day}. Gün <small>• Toplam {(day.items||[]).reduce((sum,x)=>sum+x.questions,0)} soru</small></Typography>{(day.items||[]).map(item=><label className={`lgs-plan-item ${item.done?'done':''}`} key={item.id}><Checkbox checked={item.done} onChange={()=>togglePlanItem(selectedSummary.id,item.id)}/><div><b>{item.lesson}</b><span>{item.task}</span><small>{item.questions?`${item.questions} soru • `:''}${item.minutes} dakika</small></div>{item.done&&<CheckCircle color="success"/>}</label>)}</Box>)}</Box>
            </> : <Box className="empty-chart"><AutoAwesome/><Typography fontWeight={900}>Çalışma programı hazırlanıyor</Typography><Typography color="text.secondary">Öğrenci verileri yüklendiğinde 14 günlük plan otomatik oluşturulur.</Typography></Box>}
          </Box>
        </Stack>}
      </DialogContent>
    </Dialog>

    <Snackbar open={Boolean(message)} autoHideDuration={3000} onClose={()=>setMessage('')} message={message}/>
  </Box>
}

function TrendChart({ data }) {
  if (!data.length) return <Box className="glass lgs-chart-card"><Typography variant="h6" fontWeight={900}>Son 7 Deneme</Typography><Box className="empty-chart"><Insights/><Typography color="text.secondary">Grafik için deneme sonucu bekleniyor.</Typography></Box></Box>
  const values = data.map(item => item.value)
  const min = Math.min(...values) - 10
  const max = Math.max(...values) + 10
  const range = Math.max(1,max-min)
  const points = data.map((item,i)=>`${35+i*(410/Math.max(1,data.length-1))},${178-(item.value-min)/range*135}`).join(' ')
  return <Box className="glass lgs-chart-card"><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h6" fontWeight={900}>Son 7 Deneme</Typography><Typography color="text.secondary" variant="body2">Sınıf ortalama puanı</Typography></Box><Insights/></Stack><svg viewBox="0 0 480 210" className="lgs-line-chart"><line x1="30" y1="180" x2="450" y2="180"/><polyline points={points} fill="none"/><g>{data.map((item,i)=>{const x=35+i*(410/Math.max(1,data.length-1));const y=178-(item.value-min)/range*135;return <g key={item.label}><circle cx={x} cy={y} r="5"/><text x={x} y={Math.max(16,y-10)} textAnchor="middle">{Math.round(item.value)}</text><text x={x} y="202" textAnchor="middle">D{i+1}</text></g>})}</g></svg></Box>
}
function LessonBars({ data, examName }) { return <Box className="glass lgs-chart-card"><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h6" fontWeight={900}>Son Deneme Ders Ortalamaları</Typography><Typography color="text.secondary" variant="body2">{examName || 'Ders bazında ortalama net'}</Typography></Box><BarChart/></Stack><Box className="lgs-bars">{data.map(item=><Box className="lgs-bar-row" key={item.name}><span>{item.name}</span><i><b style={{ width:`${Math.max(0,Math.min(100,item.value/item.max*100))}%` }}></b><em>{item.value.toFixed(1)}</em></i></Box>)}</Box></Box> }
function MovementCard({ title, icon, items, positive=false }) { return <Box className={`glass movement-card ${positive?'positive':'negative'}`}><Typography variant="h6" fontWeight={900}>{icon}{title}</Typography><Box className="movement-list">{items.length ? items.map((x,i)=><div key={x.name}><span>{i+1}</span><b>{x.name}</b><em>{x.delta>0?'+':''}{x.delta.toFixed(1)}</em></div>) : <Typography color="text.secondary" sx={{ py:2 }}>Karşılaştırma için en az iki deneme sonucu gerekir.</Typography>}</Box></Box> }

function StudentAiAnalysis({ student }) {
  const recent=student.results.slice(-3)
  if(!recent.length)return <Box className="glass lgs-ai-analysis"><Stack direction="row" spacing={1}><Psychology color="primary"/><Typography variant="h6" fontWeight={950}>Yapay Zekâ Performans Analizi</Typography></Stack><Typography color="text.secondary" sx={{mt:1}}>Analiz için en az bir deneme sonucu gerekir.</Typography></Box>
  const lessons=lessonDefs.map(l=>({name:l.name,key:l.key,ratio:(average(recent.map(r=>r[`${l.key}_net`]))||0)/l.count})).sort((a,b)=>b.ratio-a.ratio)
  const first=Number(recent[0]?.score||0),last=Number(recent.at(-1)?.score||0),delta=last-first
  const targetGap=student.target?Number(student.target)-last:null
  return <Box className="glass lgs-ai-analysis"><Stack direction="row" spacing={1} alignItems="center"><Psychology color="primary"/><Typography variant="h6" fontWeight={950}>Yapay Zekâ Performans Analizi</Typography></Stack><Box className="lgs-ai-grid"><div><small>Genel eğilim</small><b>{recent.length<2?'İlk veri oluştu':delta>5?`Yükseliş: +${formatNumber(delta)} puan`:delta<-5?`Düşüş: ${formatNumber(delta)} puan`:'Dengeli seyir'}</b></div><div><small>En güçlü ders</small><b>{lessons[0].name}</b></div><div><small>Öncelikli ders</small><b>{lessons.at(-1).name}</b></div><div><small>Hedefe kalan</small><b>{targetGap==null?'-':targetGap<=0?'Hedef geçildi':`${formatNumber(targetGap)} puan`}</b></div></Box><Typography color="text.secondary" sx={{mt:1}}>Program Matematik, Türkçe ve Fen ağırlıklı hazırlanır; günlük toplam soru sayısı 80'i geçmez. İnkılap, Din Kültürü ve İngilizce ihtiyaç oranına göre destekleyici olarak dağıtılır.</Typography></Box>
}

function StudentResultsTable({ student, exams, resultMap }) {
  const fields = ['turkish_correct','turkish_net','history_correct','history_net','religion_correct','religion_net','english_correct','english_net','math_correct','math_net','science_correct','science_net','total_correct','total_net','score','rank']
  const averages = Object.fromEntries(fields.map(field => [field, average(student.results.map(row => row[field]))]))
  return <TableContainer component={Paper} variant="outlined" className="lgs-student-results-table"><Table size="small"><TableHead><TableRow><TableCell rowSpan={2}>Deneme</TableCell><TableCell rowSpan={2}>Tarih</TableCell>{['Türkçe','T.C. İnkılap Tarihi','Din Kültürü','İngilizce','Matematik','Fen Bilimleri'].map(name=><TableCell key={name} align="center" colSpan={2}>{name}</TableCell>)}<TableCell rowSpan={2}>Toplam Doğru</TableCell><TableCell rowSpan={2}>Toplam Net</TableCell><TableCell rowSpan={2}>Puan</TableCell><TableCell rowSpan={2}>Sıralama</TableCell></TableRow><TableRow>{Array.from({length:6},(_,i)=><Box component="span" key={i} sx={{ display:'contents' }}><TableCell align="center">Doğru</TableCell><TableCell align="center">Net</TableCell></Box>)}</TableRow></TableHead><TableBody>{exams.map((exam,index)=>{const row=resultMap.get(exam.id);return <TableRow key={exam.id} className={index%2?'alt-row':''}><TableCell sx={{ minWidth:170,fontWeight:800 }}>{exam.name}</TableCell><TableCell>{new Date(`${exam.exam_date}T00:00:00`).toLocaleDateString('tr-TR')}</TableCell>{fields.map(field=><TableCell key={field} align="center">{row ? (field==='rank' ? row[field] : formatNumber(row[field])) : '-'}</TableCell>)}</TableRow>})}<TableRow className="average-row"><TableCell colSpan={2}><b>ORTALAMA</b></TableCell>{fields.map(field=><TableCell key={field} align="center"><b>{field==='rank' ? '-' : formatNumber(averages[field])}</b></TableCell>)}</TableRow></TableBody></Table></TableContainer>
}

function StudentScoreChart({ student, examById }) {
  const data = student.results.slice(-7)
  if (!data.length) return <Box className="glass lgs-chart-card"><Typography variant="h6" fontWeight={900}>Son 7 Deneme Puan Grafiği</Typography><Box className="empty-chart"><Insights/><Typography color="text.secondary">Henüz sonuç yok.</Typography></Box></Box>
  const values=data.map(row=>Number(row.score));const min=Math.min(...values)-10;const max=Math.max(...values)+10;const range=Math.max(1,max-min)
  const points=data.map((row,i)=>`${35+i*(410/Math.max(1,data.length-1))},${178-(Number(row.score)-min)/range*135}`).join(' ')
  return <Box className="glass lgs-chart-card"><Typography variant="h6" fontWeight={900}>Son 7 Deneme Puan Grafiği</Typography><Typography color="text.secondary" variant="body2">Öğrencinin puan gelişimi</Typography><svg viewBox="0 0 480 210" className="lgs-line-chart"><line x1="30" y1="180" x2="450" y2="180"/><polyline points={points} fill="none"/>{data.map((row,i)=>{const x=35+i*(410/Math.max(1,data.length-1));const y=178-(Number(row.score)-min)/range*135;return <g key={row.id}><circle cx={x} cy={y} r="5"/><text x={x} y={Math.max(16,y-10)} textAnchor="middle">{Math.round(Number(row.score))}</text><text x={x} y="202" textAnchor="middle">{safeText(row._examName||examById.get(row.exam_id)?.name||`D${i+1}`).slice(0,10)}</text><title>{row._examName||examById.get(row.exam_id)?.name}</title></g>})}</svg></Box>
}
function StudentLessonBars({ student }) {
  const last=student.results.at(-1)
  const data=lessonDefs.map(lesson=>({name:lesson.name,value:Number(last?.[`${lesson.key}_net`]||0),max:lesson.count}))
  return <Box className="glass lgs-chart-card"><Typography variant="h6" fontWeight={900}>Son Deneme Netleri</Typography><Typography color="text.secondary" variant="body2">Ders bazında sütun görünümü</Typography><Box className="student-column-chart">{data.map(item=><div key={item.name}><span><i style={{ height:`${Math.max(3,item.value/item.max*150)}px` }}></i><b>{formatNumber(item.value)}</b></span><small>{item.name}</small></div>)}</Box></Box>
}
