import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, InputLabel,
  Checkbox, ListItemText, MenuItem, Paper, Select, Stack, Typography
} from '@mui/material'
import {
  Assessment, AssignmentTurnedIn, EmojiEvents, FileDownload, Groups,
  Insights, OnlinePrediction, PictureAsPdf, Print, Science, TrendingDown, TrendingUp
} from '@mui/icons-material'
import * as XLSX from 'xlsx'
import html2pdf from 'html2pdf.js'
import { supabase } from '../services/supabase'

const EXAMS_KEY = 'taskin-akademi-v64-exams'
const HOMEWORK_KEY = 'taskin-akademi-v64-homeworks'
const PLUS_KEY = 'taskin-akademi-v64-plus-records'
const safeLoad = key => { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } }
const fmt = n => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateOf = e => e.date || e.startAt || e.createdAt || ''
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) }
const monthEnd = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }
const inRange = (value, start, end) => { if (!value) return false; const d = new Date(value); return d >= start && d <= end }
const menuProps = {
  disablePortal: false,
  disableScrollLock: true,
  anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
  transformOrigin: { vertical: 'top', horizontal: 'left' },
  PaperProps: {
    sx: {
      maxHeight: 360,
      maxWidth: 'calc(100vw - 24px)',
      zIndex: 1600
    }
  }
}

const cards = [
  ['fen', 'Fen Denemeleri', 'Tek ve toplu fen denemesi raporları', Science],
  ['general', 'Genel Denemeler', 'Tek ve toplu genel deneme raporları', Assessment],
  ['online', 'Online Denemeler', 'Soru analizi ve öğrenci karşılaştırması', OnlinePrediction],
  ['monthly', 'Ayın Öğrencisi', 'Canlı aylık puan sıralaması', EmojiEvents],
  ['term', 'Dönemin Öğrencisi', 'Dönem boyunca biriken puanlar', Insights],
  ['homework', 'Ödev Raporu', 'Tüm ödevlerin tek tabloda özeti', AssignmentTurnedIn]
]

export default function ReportsPage() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [section, setSection] = useState('fen')
  const [examId, setExamId] = useState('')
  const [mode, setMode] = useState('single')
  const [sort, setSort] = useState('number')
  const [scope, setScope] = useState('entered')
  const [selectedExamIds, setSelectedExamIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reportRef = useRef(null)
  const exams = useMemo(() => safeLoad(EXAMS_KEY), [section, selectedClass])
  const homeworks = useMemo(() => safeLoad(HOMEWORK_KEY), [section, selectedClass])
  const plusRecords = useMemo(() => safeLoad(PLUS_KEY), [section, selectedClass])

  useEffect(() => { loadClasses() }, [])
  useEffect(() => { if (selectedClass) loadStudents(selectedClass) }, [selectedClass])

  async function loadClasses() {
    setLoading(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) throw new Error('Oturum bulunamadı.')
      const [cr, ar] = await Promise.all([
        supabase.from('classes').select('id,name,sort_order,is_lgs').order('sort_order'),
        supabase.from('teacher_active_classes').select('class_id').eq('teacher_id', user.id)
      ])
      if (cr.error) throw cr.error; if (ar.error) throw ar.error
      const ids = new Set((ar.data || []).map(x => x.class_id))
      const active = (cr.data || []).filter(c => ids.has(c.id) && !c.is_lgs && !String(c.name).toLowerCase().includes('lgs'))
      setClasses(active); setSelectedClass(active[0]?.id || '')
    } catch (e) { setError(e.message || 'Sınıflar yüklenemedi.') } finally { setLoading(false) }
  }

  async function loadStudents(classId) {
    const { data, error } = await supabase.from('students')
      .select('id,student_number,first_name,last_name,class_id,is_active')
      .eq('class_id', classId).eq('is_active', true)
    if (error) setError(error.message)
    setStudents(data || [])
  }

  const classInfo = classes.find(c => c.id === selectedClass)
  const relevantExams = useMemo(() => exams.filter(e => e.classId === selectedClass && (
    section === 'online' ? e.kind === 'online' : e.kind === 'normal' && e.type === section
  )).sort((a,b) => String(dateOf(a)).localeCompare(String(dateOf(b)))), [exams, selectedClass, section])

  useEffect(() => {
    setExamId(relevantExams.at(-1)?.id || '')
    setSelectedExamIds(relevantExams.map(e => e.id))
  }, [section, selectedClass, relevantExams.length])
  const selectedExam = relevantExams.find(e => e.id === examId)

  const baseStudents = useMemo(() => [...students].sort((a,b) => Number(a.student_number) - Number(b.student_number)), [students])
  const normalRows = useMemo(() => {
    if (!selectedExam) return []
    const rows = baseStudents.map(s => {
      const result = selectedExam.results?.[s.id]
      return {
        number: s.student_number, name: `${s.first_name} ${s.last_name}`,
        correct: result ? Number(result.correct || 0) : 0, wrong: result ? Number(result.wrong || 0) : 0,
        net: result ? Number(result.net || 0) : 0, studentId: s.id, entered: Boolean(result)
      }
    }).filter(r => scope === 'all' || r.entered)
    return sort === 'net' ? rows.sort((a,b) => b.net-a.net) : rows
  }, [selectedExam, baseStudents, sort, scope])

  const movers = useMemo(() => {
    if (!selectedExam) return { up: [], down: [] }
    const selectedIndex = relevantExams.findIndex(e => e.id === selectedExam.id)
    const values = baseStudents.map(student => {
      const entered = relevantExams.slice(0, selectedIndex + 1).map(exam => {
        const row = exam.kind === 'online' ? exam.attempts?.[student.id] : exam.results?.[student.id]
        if (!row) return null
        const net = Number(row.net ?? (Number(row.correct || 0) - Number(row.wrong || 0) / 3))
        return Number.isFinite(net) ? { exam, net } : null
      }).filter(Boolean)
      if (entered.length < 2 || entered.at(-1).exam.id !== selectedExam.id) return null
      return { number:student.student_number, name:`${student.first_name} ${student.last_name}`, diff:entered.at(-1).net-entered.at(-2).net }
    }).filter(Boolean)
    return { up:[...values].filter(x=>x.diff>0).sort((a,b)=>b.diff-a.diff).slice(0,5), down:[...values].filter(x=>x.diff<0).sort((a,b)=>a.diff-b.diff).slice(0,5) }
  }, [selectedExam, relevantExams, baseStudents])

  const reportTitle = cards.find(c => c[0] === section)?.[1] || 'Rapor'
  const exportRows = getExportRows()

  function getExportRows() {
    if (section === 'homework') return homeworkRows().map((r, i) => {
      const row = { Sıra: i + 1, 'Öğrenci No': r.number, 'Ad Soyad': r.name }
      r.items.forEach((v,i) => row[classHomeworks()[i]?.title || `Ödev ${i+1}`] = v)
      row['Yaptı'] = r.done; row['Yapmadı'] = r.missing; row['Gelmedi'] = r.absent
      return row
    })
    if (section === 'monthly' || section === 'term') return scoreRows(section).map((r,i)=>({ Sıra:i+1,'Öğrenci No':r.number,'Ad Soyad':r.name,Puan:r.score }))
    if (mode === 'all' && section !== 'online') return collectiveRows().map((r, i) => {
      const row = { Sıra: i + 1, 'Öğrenci No': r.number, 'Ad Soyad': r.name }
      relevantExams.forEach((e,i)=>row[e.name || `Deneme ${i+1}`]=r.nets[i] == null ? 'Girmedi' : r.nets[i])
      row['Toplam Net']=r.total; row['Ortalama Net']=r.avg; return row
    })
    if (section === 'online' && mode === 'all') return onlineCollectiveRows().map((r, i) => {
      const row = { Sıra: i + 1, 'Öğrenci No': r.number, 'Ad Soyad': r.name }
      selectedOnlineExams().forEach((e,i) => row[e.name || `Deneme ${i+1}`] = r.nets[i] == null ? 'Girmedi' : r.nets[i])
      row['Girilen Deneme'] = `${r.enteredCount}/${selectedOnlineExams().length}`
      row['Ortalama Net'] = r.avg
      return row
    })
    if (section === 'online') return onlineRows().map((r,i)=>({Sıra:i+1,'Öğrenci No':r.number,'Ad Soyad':r.name,Doğru:r.correct,Yanlış:r.wrong,Net:r.net,Durum:r.entered?'Girdi':'Girmedi'}))
    return normalRows.map((r,i)=>({Sıra:i+1,'Öğrenci No':r.number,'Ad Soyad':r.name,Doğru:r.correct,Yanlış:r.wrong,Net:r.net}))
  }

  function classHomeworks() { return homeworks.filter(h => h.classId === selectedClass).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))) }
  function homeworkRows() {
    const hs = classHomeworks()
    return baseStudents.map(s => {
      const items = hs.map(h => ({done:'Yaptı',missing:'Yapmadı',absent:'Gelmedi'}[h.statuses?.[s.id]] || '-') )
      return { number:s.student_number,name:`${s.first_name} ${s.last_name}`,items,done:items.filter(x=>x==='Yaptı').length,missing:items.filter(x=>x==='Yapmadı').length,absent:items.filter(x=>x==='Gelmedi').length }
    })
  }
  function collectiveRows() {
    const rows = baseStudents.map(s => {
      const nets = relevantExams.map(e => e.results?.[s.id] ? Number(e.results[s.id].net || 0) : null)
      const entered = nets.filter(v => v != null)
      const total = entered.reduce((a,b)=>a+b,0)
      return {number:s.student_number,name:`${s.first_name} ${s.last_name}`,nets,total,avg:entered.length?total/entered.length:0,enteredCount:entered.length}
    }).filter(r => scope === 'all' || r.enteredCount > 0)
    return sort === 'net' ? rows.sort((a,b)=>b.avg-a.avg) : rows
  }
  function onlineRows() {
    if (!selectedExam) return []
    const rows=baseStudents.map(s=>{
      const attempt=selectedExam.attempts?.[s.id]
      const a=attempt||{}
      return {studentId:s.id,number:s.student_number,name:`${s.first_name} ${s.last_name}`,correct:Number(a.correct||0),wrong:Number(a.wrong||0),net:Number((Number(a.net ?? (Number(a.correct||0)-Number(a.wrong||0)/3))).toFixed(2)),answers:a.answers||a.responses||{},entered:Boolean(attempt)}
    }).filter(r=>scope==='all'||r.entered)
    return sort==='net'?rows.sort((a,b)=>b.net-a.net):rows
  }
  function selectedOnlineExams() { return relevantExams.filter(e => selectedExamIds.includes(e.id)) }
  function onlineCollectiveRows() {
    const chosen = selectedOnlineExams()
    const rows = baseStudents.map(s => {
      const nets = chosen.map(e => {
        const a = e.attempts?.[s.id]
        if (!a) return null
        return Number(Number(a.net ?? (Number(a.correct||0)-Number(a.wrong||0)/3)).toFixed(2))
      })
      const entered = nets.filter(v => v != null)
      const total = entered.reduce((a,b)=>a+b,0)
      return {number:s.student_number,name:`${s.first_name} ${s.last_name}`,nets,enteredCount:entered.length,avg:entered.length?total/entered.length:0}
    }).filter(r => scope === 'all' || r.enteredCount > 0)
    return sort === 'net' ? rows.sort((a,b)=>b.avg-a.avg) : rows
  }
  function scoreRows(kind) {
    const start = kind === 'monthly' ? monthStart() : new Date(localStorage.getItem('taskin-akademi-v64-term-start') || '2000-01-01')
    const end = kind === 'monthly' ? monthEnd() : new Date(localStorage.getItem('taskin-akademi-v64-term-end') || '2999-12-31')
    const hs=homeworks.filter(h=>h.classId===selectedClass && inRange(h.createdAt||h.dueDate,start,end))
    const es=exams.filter(e=>e.classId===selectedClass && inRange(dateOf(e),start,end))
    return baseStudents.map(s=>{
      let score=0
      hs.forEach(h=>{const st=h.statuses?.[s.id]; if(st==='done')score+=10; if(st==='missing')score-=10})
      plusRecords.filter(p=>p.classId===selectedClass&&p.studentId===s.id&&inRange(p.createdAt,start,end)).forEach(p=>score+=10*Number(p.amount||1))
      es.filter(e=>e.kind==='online').forEach(e=>score+=e.attempts?.[s.id]?10:-10)
      es.filter(e=>e.kind==='normal'&&e.type==='fen').forEach(e=>{const net=Number(e.results?.[s.id]?.net||0),target=Number(e.targets?.[s.id]||0); score += net>=target ? 10 : -10; const vals=baseStudents.map(x=>Number(e.results?.[x.id]?.net||0)); const avg=vals.reduce((a,b)=>a+b,0)/Math.max(1,vals.length); if(net>avg)score+=10})
      return {number:s.student_number,name:`${s.first_name} ${s.last_name}`,score}
    }).sort((a,b)=>b.score-a.score)
  }
  function questionAnalysis() {
    if (!selectedExam) return []
    const rows=onlineRows().filter(r=>selectedExam.attempts?.[r.studentId])
    return Array.from({length:20},(_,i)=>{const q=i+1; let correct=0,wrong=0; rows.forEach(r=>{const ans=r.answers?.[q]||r.answers?.[String(q)]; if(ans===selectedExam.answers?.[q])correct++; else wrong++}); const pct=rows.length?Math.round(correct*100/rows.length):0; return {q,correct,wrong,pct} })
  }

  function singleExamStats(rows, questionCount = 20) {
    const enteredRows = rows.filter(r => r.entered)
    const count = enteredRows.length
    const sum = key => enteredRows.reduce((total, row) => total + Number(row[key] || 0), 0)
    const avg = key => count ? sum(key) / count : 0
    const avgCorrect = avg('correct')
    const avgWrong = avg('wrong')
    const avgBlank = count
      ? enteredRows.reduce((total, row) => total + Math.max(0, questionCount - Number(row.correct || 0) - Number(row.wrong || 0)), 0) / count
      : 0
    const avgNet = avg('net')
    const highestNet = count ? Math.max(...enteredRows.map(row => Number(row.net || 0))) : 0
    return { count, avgCorrect, avgWrong, avgBlank, avgNet, highestNet }
  }

  function StatsSummary({ stats, totalStudents = baseStudents.length }) {
    const participation = totalStudents ? Math.round(stats.count * 1000 / totalStudents) / 10 : 0
    return <Box className="report-summary report-stats-summary">
      <Chip icon={<Groups/>} label={`Katılım: ${stats.count}/${totalStudents} (%${participation.toLocaleString('tr-TR')})`}/>
      <Chip label={`Ort. Doğru: ${fmt(stats.avgCorrect)}`}/>
      <Chip label={`Ort. Yanlış: ${fmt(stats.avgWrong)}`}/>
      <Chip label={`Ort. Boş: ${fmt(stats.avgBlank)}`}/>
      <Chip label={`Ort. Net: ${fmt(stats.avgNet)}`}/>
      <Chip label={`En Yüksek Net: ${fmt(stats.highestNet)}`}/>
    </Box>
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Rapor')
    XLSX.writeFile(wb, `${reportTitle}-${classInfo?.name || 'Sinif'}.xlsx`)
  }
  function exportPdf() {
    if (!reportRef.current) return
    const isOnline = section === 'online'
    html2pdf().set({
      margin: isOnline ? 0 : 8,
      filename:`${reportTitle}-${classInfo?.name||'Sinif'}.pdf`,
      image:{type:'jpeg',quality:.98},
      html2canvas:{scale:2, useCORS:true},
      pagebreak:{mode:['css'], avoid:['.report-letterhead','.report-table tr','.question-box','.mini-analysis']},
      jsPDF:{unit:'mm',format:'a4',orientation: exportRows[0] && Object.keys(exportRows[0]).length>7?'landscape':'portrait'}
    }).from(reportRef.current).save()
  }

  if (loading) return <Box className="loader compact"><CircularProgress/></Box>
  return <Box className="reports-page">
    <Box className="page-head"><Box><Typography variant="h4" fontWeight={950}>Raporlar</Typography><Typography color="text.secondary">Analiz, sıralama ve çıktı merkezi</Typography></Box></Box>
    {error && <Alert severity="error" sx={{mb:2}}>{error}</Alert>}
    <Box className="report-card-grid">{cards.map(([id,title,desc,Icon])=><Paper key={id} className={`glass report-menu-card ${section===id?'active':''}`} onClick={()=>{setSection(id);setMode('single')}} elevation={0}><Icon/><Box><Typography fontWeight={950}>{title}</Typography><Typography variant="caption" color="text.secondary">{desc}</Typography></Box></Paper>)}</Box>
    <Paper className="glass report-toolbar" elevation={0}>
      <FormControl size="small"><InputLabel>Aktif sınıf</InputLabel><Select MenuProps={menuProps} value={selectedClass} label="Aktif sınıf" onChange={e=>setSelectedClass(e.target.value)}>{classes.map(c=><MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}</Select></FormControl>
      {['fen','general','online'].includes(section)&&<FormControl size="small"><InputLabel>Rapor tipi</InputLabel><Select MenuProps={menuProps} value={mode} label="Rapor tipi" onChange={e=>setMode(e.target.value)}><MenuItem value="single">Tek Deneme</MenuItem><MenuItem value="all">Toplu Denemeler</MenuItem></Select></FormControl>}
      {['fen','general','online'].includes(section)&&mode==='single'&&<FormControl size="small"><InputLabel htmlFor="report-exam-select">Deneme</InputLabel><Select native inputProps={{id:'report-exam-select'}} value={examId} label="Deneme" onChange={e=>setExamId(e.target.value)}><option aria-label="Deneme seçin" value="" />{relevantExams.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</Select></FormControl>}
      {section==='online'&&mode==='all'&&<FormControl size="small" className="exam-multi-select"><InputLabel>Denemeler</InputLabel><Select multiple MenuProps={menuProps} value={selectedExamIds} label="Denemeler" onChange={e=>setSelectedExamIds(typeof e.target.value==='string'?e.target.value.split(','):e.target.value)} renderValue={ids=>`${ids.length} deneme seçildi`}>{relevantExams.map(e=><MenuItem key={e.id} value={e.id}><Checkbox checked={selectedExamIds.includes(e.id)}/><ListItemText primary={e.name}/></MenuItem>)}</Select></FormControl>}
      {['fen','general','online'].includes(section)&&<FormControl size="small"><InputLabel>Öğrenci kapsamı</InputLabel><Select MenuProps={menuProps} value={scope} label="Öğrenci kapsamı" onChange={e=>setScope(e.target.value)}><MenuItem value="entered">Denemeye girenler</MenuItem><MenuItem value="all">Sınıfın tamamı</MenuItem></Select></FormControl>}
      {!['monthly','term'].includes(section)&&<FormControl size="small"><InputLabel>Sıralama</InputLabel><Select MenuProps={menuProps} value={sort} label="Sıralama" onChange={e=>setSort(e.target.value)}><MenuItem value="number">Öğrenci numarası</MenuItem><MenuItem value="net">Net / başarı</MenuItem></Select></FormControl>}
      <Box sx={{flex:1}}/><Button startIcon={<PictureAsPdf/>} onClick={exportPdf}>PDF</Button><Button startIcon={<FileDownload/>} onClick={exportExcel}>Excel</Button><Button startIcon={<Print/>} onClick={()=>window.print()}>Yazdır</Button>
    </Paper>
    <Box ref={reportRef} className={`print-report ${section==='online'?'online-pdf-report':''}`}>
      {section === 'online' ? renderOnlinePages() : <ReportPage page={1}>{renderContent()}</ReportPage>}
    </Box>
  </Box>


  function ReportHeader() { return <Box className="report-letterhead"><Box className="report-logo report-logo-wide"><img src="/taskin-logo-horizontal.png" alt="TAŞKIN logosu"/></Box><Box><Typography fontWeight={800}>{reportTitle}</Typography></Box><Box className="report-meta"><b>{classInfo?.name}</b><span>{selectedExam?.name || ''}</span><span>{new Date().toLocaleDateString('tr-TR')}</span></Box></Box> }
  function ReportPage({page, children}) { return <Box className="pdf-report-page"><ReportHeader/><Box className="pdf-page-content">{children}</Box><Box className="report-footer">TAŞKIN • Oluşturulma: {new Date().toLocaleString('tr-TR')} • Sayfa {page}</Box></Box> }
  function renderOnlinePages() {
    if (mode === 'all') {
      const rows = onlineCollectiveRows()
      const chosen = selectedOnlineExams()
      const enteredRows = rows.filter(r => r.enteredCount > 0)
      const overallAvg = enteredRows.length ? enteredRows.reduce((sum, r) => sum + r.avg, 0) / enteredRows.length : 0
      return <ReportPage page={1}><Box className="report-summary report-stats-summary"><Chip icon={<Groups/>} label={`${rows.length} öğrenci listelendi`}/><Chip label={`${chosen.length} deneme`}/><Chip label={scope==='all'?'Sınıfın tamamı':'En az bir denemeye girenler'}/><Chip label={`Genel Ort. Net: ${fmt(overallAvg)}`}/></Box><ReportTable headers={['Sıra','No','Öğrenci',...chosen.map(e=>e.name),'Girilen','Ortalama']} rows={rows.map((r,i)=>[i+1,r.number,r.name,...r.nets.map(v=>v==null?'Girmedi':fmt(v)),`${r.enteredCount}/${chosen.length}`,fmt(r.avg)])}/></ReportPage>
    }
    const rows = onlineRows()
    const pageSize = 25
    const rowPages = rows.length
      ? Array.from({ length: Math.ceil(rows.length / pageSize) }, (_, i) => rows.slice(i * pageSize, (i + 1) * pageSize))
      : [[]]
    const qa = questionAnalysis()
    const hard = [...qa].sort((a,b)=>a.pct-b.pct).slice(0,5)
    const easy = [...qa].sort((a,b)=>b.pct-a.pct).slice(0,5)
    const stats = singleExamStats(rows, Number(selectedExam?.questionCount || selectedExam?.question_count || 20))
    const table = (data, pageIndex) => <>
      <ReportTable headers={['Sıra','No','Öğrenci','Doğru','Yanlış','Net']} rows={data.map((r,i)=>[pageIndex * pageSize + i + 1,r.number,r.name,r.correct,r.wrong,fmt(r.net)])}/>
    </>
    const analysisPage = rowPages.length + 1
    return <>
      {rowPages.map((pageRows, i)=><ReportPage key={`students-${i}`} page={i+1}>{table(pageRows, i)}</ReportPage>)}
      <ReportPage page={analysisPage}>
        <Typography variant="h6" fontWeight={950} sx={{mb:1}}>Sınav Özeti</Typography>
        <Box className="pdf-final-stats"><StatsSummary stats={stats}/></Box>
        <Typography variant="h6" fontWeight={950} sx={{mt:1.5,mb:1}}>Soru Analizi</Typography>
        <Box className="question-grid">{qa.map(x=><Box key={x.q} className={`question-box ${x.pct>=80?'good':x.pct>=50?'mid':'bad'}`}><b>{x.q}</b><span>%{x.pct}</span><small>{x.correct}D / {x.wrong}Y</small></Box>)}</Box>
        <Box className="analysis-pair"><MiniList title="En Zor 5 Soru" rows={hard.map(x=>({name:`${x.q}. soru`,diff:`%${x.pct}`}))}/><MiniList title="En Kolay 5 Soru" rows={easy.map(x=>({name:`${x.q}. soru`,diff:`%${x.pct}`}))}/></Box>
        <MoverPanels/>
      </ReportPage>
    </>
  }

  function renderContent() {
    if(section==='homework') return <ReportTable statusColors headers={['Sıra','No','Öğrenci',...classHomeworks().map(h=>h.title),'Yaptı','Yapmadı','Gelmedi']} rows={homeworkRows().map((r,i)=>[i+1,r.number,r.name,...r.items,r.done,r.missing,r.absent])}/>
    if(section==='monthly'||section==='term') { const rows=scoreRows(section); return <><Box className="report-summary"><Chip icon={<EmojiEvents/>} label={`Lider: ${rows[0]?.name||'-'} • ${rows[0]?.score||0} puan`}/><Chip label={`${rows.length} öğrenci`}/></Box><ReportTable headers={['Sıra','No','Öğrenci','Puan']} rows={rows.map((r,i)=>[i+1,r.number,r.name,r.score])}/></> }
    if(mode==='all'&&section!=='online') { const rows=collectiveRows(); const enteredRows=rows.filter(r=>r.enteredCount>0); const overallAvg=enteredRows.length?enteredRows.reduce((sum,r)=>sum+r.avg,0)/enteredRows.length:0; return <><Box className="report-summary report-stats-summary"><Chip icon={<Groups/>} label={`${rows.length} öğrenci listelendi`}/><Chip label={`${relevantExams.length} deneme`}/><Chip label={`Genel Ort. Net: ${fmt(overallAvg)}`}/></Box><ReportTable headers={['Sıra','No','Öğrenci',...relevantExams.map(e=>e.name),'Girilen','Toplam','Ortalama']} rows={rows.map((r,i)=>[i+1,r.number,r.name,...r.nets.map(v=>v==null?'Girmedi':fmt(v)),`${r.enteredCount}/${relevantExams.length}`,fmt(r.total),fmt(r.avg)])}/></> }
    if(section==='online') return null
    const stats=singleExamStats(normalRows, Number(selectedExam?.questionCount || selectedExam?.question_count || 20))
    return <><StatsSummary stats={stats}/><ReportTable headers={['Sıra','No','Öğrenci','Doğru','Yanlış','Net','Hedef Durumu']} rows={normalRows.map((r,i)=>{ const target=Number(selectedExam?.targets?.[r.studentId]); return [i+1,r.number,r.name,r.correct,r.wrong,fmt(r.net),Number.isFinite(target)&&target>0?(r.net>=target?'Hedefi Geçti ✓':'Hedefin Altında ✕'):'Hedef Yok'] })}/><MoverPanels/></>
  }
  function MoverPanels(){return <Box className="analysis-pair"><MiniList title="En Çok Yükselen 5 Öğrenci" icon={<TrendingUp/>} rows={movers.up.map(x=>({name:`${x.number} • ${x.name}`,diff:`+${fmt(x.diff)}`}))}/><MiniList title="En Fazla Düşüş Yaşayan 5 Öğrenci" icon={<TrendingDown/>} rows={movers.down.map(x=>({name:`${x.number} • ${x.name}`,diff:fmt(x.diff)}))}/></Box>}
}

function ReportTable({headers,rows,statusColors=false}) { const statusClass=v=>statusColors&&v==='Yaptı'?'status-done':statusColors&&v==='Yapmadı'?'status-missing':statusColors&&v==='Gelmedi'?'status-absent':''; const cellClass=(value,index)=>[statusClass(value),headers[index]==='Öğrenci'?'student-name-cell':''].filter(Boolean).join(' '); return <Box className="report-table-wrap"><table className="report-table"><thead><tr>{headers.map((h,i)=><th className={h==='Öğrenci'?'student-name-cell':''} key={i}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td className={cellClass(v,j)} key={j}>{v}</td>)}</tr>):<tr><td colSpan={headers.length}>Raporlanacak kayıt bulunamadı.</td></tr>}</tbody></table></Box> }
function MiniList({title,rows,icon}) { return <Paper className="mini-analysis" elevation={0}><Typography fontWeight={950}>{icon} {title}</Typography>{rows.length?rows.map((r,i)=><Box key={i}><span>{r.name}</span><b>{r.diff}</b></Box>):<Typography variant="caption" color="text.secondary">Karşılaştırma için önceki deneme bulunamadı.</Typography>}</Paper> }
