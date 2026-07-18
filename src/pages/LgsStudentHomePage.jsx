import { useEffect, useMemo, useState } from 'react'
import html2pdf from 'html2pdf.js'
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Paper, Stack, TextField, Typography
} from '@mui/material'
import {
  Assessment, AutoAwesome, CalendarMonth, CheckCircle, Close, Dashboard, Download, EmojiEvents,
  Logout, Settings, TrendingDown, TrendingUp, OnlinePrediction, PlayArrow, Save
} from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { readSharedState } from '../services/sharedState'
import { saveMyLgsOnlineAttempt } from '../services/studentOnlineExam'

const lessons = [
  { key:'turkish', name:'Türkçe', count:20 }, { key:'history', name:'İnkılap', count:10 },
  { key:'religion', name:'Din', count:10 }, { key:'english', name:'İngilizce', count:10 },
  { key:'math', name:'Matematik', count:20 }, { key:'science', name:'Fen', count:20 }
]
const ONLINE_STORAGE_KEY = 'lgsOnlineExams'
const loadOnlineExams = () => { try { return JSON.parse(localStorage.getItem(ONLINE_STORAGE_KEY) || '[]') } catch { return [] } }
const onlineWindow = exam => ({ start:new Date(`${exam.date}T${exam.start || '00:00'}:00`), end:new Date(`${exam.date}T${exam.end || '23:59'}:00`) })
const participantFor = (exam, student) => (exam?.participants || []).find(p => String(p.studentId) === String(student.id) || String(p.studentNumber) === String(student.student_number))
const calculateOnlineScore = lessonResults => 177.1 + Number(lessonResults.turkish?.net||0)*4.52 + Number(lessonResults.history?.net||0)*1.95 + Number(lessonResults.religion?.net||0)*2 + Number(lessonResults.english?.net||0)*1.7 + Number(lessonResults.math?.net||0)*4.6 + Number(lessonResults.science?.net||0)*4.2
const fmt = value => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtDate = value => value ? new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(`${value}T00:00:00`)) : '—'
const avg = values => { const valid=values.map(Number).filter(Number.isFinite); return valid.length?valid.reduce((s,v)=>s+v,0)/valid.length:null }
const esc = value => String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const remainingText = (endValue, current = new Date()) => {
  const ms = new Date(endValue).getTime() - current.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function LgsStudentHomePage({ session, student, classInfo }) {
  const [page,setPage]=useState('Ana Sayfa')
  const [exams,setExams]=useState([])
  const [results,setResults]=useState([])
  const [classResults,setClassResults]=useState([])
  const [portal,setPortal]=useState({target_score:null,target_history:[],study_plan:[]})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [password,setPassword]=useState('')
  const [passwordAgain,setPasswordAgain]=useState('')
  const [onlineExams,setOnlineExams]=useState(loadOnlineExams)
  const [onlineOpen,setOnlineOpen]=useState(false)
  const [activeOnline,setActiveOnline]=useState(null)
  const [onlineAnswers,setOnlineAnswers]=useState({})
  const [onlineSaving,setOnlineSaving]=useState(false)
  const [onlineNow,setOnlineNow]=useState(new Date())
  const [bookletSelectOpen,setBookletSelectOpen]=useState(false)
  const [selectedBooklet,setSelectedBooklet]=useState('A')

  useEffect(()=>{ load() },[student.id])
  useEffect(()=>{
    const refresh=async()=>{
      try {
        const result=await readSharedState('lgs-online-exams-v1',loadOnlineExams())
        const next=result.payload||[]
        setOnlineExams(next)
        try{localStorage.setItem(ONLINE_STORAGE_KEY,JSON.stringify(next))}catch{}
      } catch {
        setOnlineExams(loadOnlineExams())
      }
    }
    const clockTick=window.setInterval(()=>setOnlineNow(new Date()),1000)
    const dataTick=window.setInterval(refresh,30000)
    window.addEventListener('storage',refresh)
    window.addEventListener('taskin-lgs-online-updated',refresh)
    window.addEventListener('focus',refresh)
    const visibility=()=>{if(!document.hidden)refresh()}
    document.addEventListener('visibilitychange',visibility)
    refresh()
    return()=>{window.clearInterval(clockTick);window.clearInterval(dataTick);window.removeEventListener('storage',refresh);window.removeEventListener('taskin-lgs-online-updated',refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visibility)}
  },[])
  async function load(){
    setLoading(true);setError('')
    const [examRes,resultRes,portalRpcRes,classRes]=await Promise.all([
      supabase.from('lgs_exams').select('id,name,exam_date').order('exam_date',{ascending:true}),
      supabase.from('lgs_results').select('*').eq('student_id',student.id),
      supabase.rpc('get_my_lgs_portal_settings'),
      supabase.rpc('get_my_lgs_exam_stats')
    ])
    const mainError=examRes.error||resultRes.error
    if(mainError)setError(mainError.message)
    setExams(examRes.data||[]);setResults(resultRes.data||[])
    let portalData = Array.isArray(portalRpcRes.data) ? portalRpcRes.data[0] : portalRpcRes.data
    if (portalRpcRes.error) {
      const fallback = await supabase.from('lgs_student_portal_settings').select('*').eq('student_id',student.id).maybeSingle()
      if (!fallback.error) portalData = fallback.data
    }
    if(portalData)setPortal({target_score:portalData.target_score??null,target_history:portalData.target_history||[],study_plan:portalData.study_plan||[],study_plan_generated_at:portalData.study_plan_generated_at||null})
    setClassResults(classRes.data||[])
    setLoading(false)
  }

  const examMap=useMemo(()=>new Map(exams.map(e=>[e.id,e])),[exams])
  const rows=useMemo(()=>{
    const databaseRows=results.map(r=>({...r,exam:examMap.get(r.exam_id)}))
    const completedOnline=onlineExams.flatMap(exam=>{
      const w=onlineWindow(exam)
      if(onlineNow<w.end)return []
      const p=participantFor(exam,student)
      if(!p?.finishedAt)return []
      return [{...p,id:`online-${exam.id}-${student.id}`,exam_id:`online-${exam.id}`,exam:{id:`online-${exam.id}`,name:exam.name||'LGS Online Deneme',exam_date:exam.date},rank:p.rank||null}]
    })
    return [...databaseRows,...completedOnline].sort((a,b)=>String(a.exam?.exam_date||'').localeCompare(String(b.exam?.exam_date||'')))
  },[results,examMap,onlineExams,onlineNow,student])
  const latest=rows.at(-1)
  const scoreAverage=avg(rows.map(r=>r.score))
  const target=Number(portal.target_score||0)||null
  const targetPassCount=useMemo(()=>{
    const history=Array.isArray(portal.target_history)?portal.target_history:[]
    if(history.length)return history.reduce((s,h)=>s+Number(h.passed||0),0)
    return target?rows.filter(r=>Number(r.score)>=target).length:0
  },[portal.target_history,target,rows])
  const latestRank=latest?.rank||null
  const medal=latestRank===1?'🥇 Son denemenin birincisisin':latestRank===2?'🥈 Son denemenin ikincisisin':latestRank===3?'🥉 Son denemenin üçüncüsüsün':''
  const plan=Array.isArray(portal.study_plan)?portal.study_plan:[]

  const statsByExam=useMemo(()=>{
    const map=new Map(exams.map(exam=>{
      const aggregate=classResults.find(r=>String(r.exam_id)===String(exam.id) && (r.average_score!=null || r.max_score!=null || r.min_score!=null))
      if(aggregate)return [exam.id,{average:Number(aggregate.average_score),max:Number(aggregate.max_score),min:Number(aggregate.min_score),count:Number(aggregate.participant_count||0)}]
      const vals=classResults.filter(r=>String(r.exam_id)===String(exam.id)).map(r=>Number(r.score)).filter(Number.isFinite)
      return [exam.id,{average:avg(vals),max:vals.length?Math.max(...vals):null,min:vals.length?Math.min(...vals):null,count:vals.length}]
    }))
    onlineExams.forEach(exam=>{
      if(onlineNow<onlineWindow(exam).end)return
      const vals=(exam.participants||[]).filter(p=>p.finishedAt).map(p=>Number(p.score)).filter(Number.isFinite)
      map.set(`online-${exam.id}`,{average:avg(vals),max:vals.length?Math.max(...vals):null,min:vals.length?Math.min(...vals):null,count:vals.length})
    })
    return map
  },[exams,classResults,onlineExams,onlineNow])

  const analysis=useMemo(()=>buildAnalysis(rows,target),[rows,target])
  const availableOnline=useMemo(()=>onlineExams
    .filter(exam=>{const w=onlineWindow(exam);return onlineNow<=w.end})
    .sort((a,b)=>onlineWindow(a).start-onlineWindow(b).start)[0]||null,[onlineExams,student,onlineNow])
  const availableParticipant=availableOnline?participantFor(availableOnline,student):null
  const onlineCanStart=availableOnline?onlineNow>=onlineWindow(availableOnline).start&&onlineNow<=onlineWindow(availableOnline).end&&!availableParticipant?.finishedAt:false
  const onlineCountdown=availableOnline?formatCountdown(onlineWindow(availableOnline).start-onlineNow):''

  async function togglePlan(itemId){
    const next=plan.map(day=>({...day,items:(day.items||[]).map(item=>item.id===itemId?{...item,done:!item.done}:item)}))
    setPortal(p=>({...p,study_plan:next}))
    const {error:updateError}=await supabase.from('lgs_student_portal_settings').update({study_plan:next,updated_at:new Date().toISOString()}).eq('student_id',student.id)
    if(updateError)setError(updateError.message)
  }

  async function changePassword(){
    setError('');setMessage('')
    if(password.length<6)return setError('Şifre en az 6 karakter olmalıdır.')
    if(password!==passwordAgain)return setError('Şifreler eşleşmiyor.')
    const {error:updateError}=await supabase.auth.updateUser({password})
    if(updateError)return setError(updateError.message)
    setPassword('');setPasswordAgain('');setMessage('Şifren başarıyla değiştirildi.')
  }

  function saveOnlineList(next){
    setOnlineExams(next)
    try{localStorage.setItem(ONLINE_STORAGE_KEY,JSON.stringify(next))}catch{}
    window.dispatchEvent(new Event('taskin-lgs-online-updated'))
  }

  async function persistLgsParticipant(examId, participant){
    const payload=await saveMyLgsOnlineAttempt(examId,participant)
    saveOnlineList(payload)
    return payload
  }

  async function beginOnlineExam(bookletGroup='A'){
    if(!availableOnline)return
    const windowInfo=onlineWindow(availableOnline)
    if(onlineNow<windowInfo.start)return setError('Denemenin başlangıç saati henüz gelmedi.')
    if(onlineNow>windowInfo.end)return setError('Bu denemenin süresi sona erdi.')
    const existing=participantFor(availableOnline,student)
    if(existing?.finishedAt)return setError('Bu denemeyi kaydettin. Sonucun süre bittikten sonra LGS Denemelerim ekranında görünecek.')
    const group=existing?.bookletGroup || bookletGroup
    const participant={...(existing||{}),studentId:student.id,studentNumber:student.student_number,name:`${student.first_name} ${student.last_name}`,bookletGroup:group,status:'Sınavda',startedAt:existing?.startedAt||new Date().toISOString(),finishedAt:null,answers:existing?.answers||{}}
    const participants=[...(availableOnline.participants||[]).filter(p=>String(p.studentId)!==String(student.id)&&String(p.studentNumber)!==String(student.student_number)),participant]
    const next=onlineExams.map(e=>e.id===availableOnline.id?{...e,participants}:e)
    const selectedExam={...availableOnline,participants}
    // Önce cevap ekranını aç. Depolama hatası ekranın açılmasını engellemesin.
    setActiveOnline(selectedExam)
    setOnlineAnswers(participant.answers||{})
    setOnlineOpen(true)
    setBookletSelectOpen(false)
    setSelectedBooklet(group)
    setError('')
    sessionStorage.setItem('taskin-active-lgs-online-exam-id', String(selectedExam.id))
    saveOnlineList(next)
    try{
      const payload=await persistLgsParticipant(selectedExam.id,participant)
      const cloudExam=payload.find(e=>String(e.id)===String(selectedExam.id))
      if(cloudExam)setActiveOnline(cloudExam)
    }catch(saveError){
      setError(`Deneme başlatılamadı: ${saveError.message||'Bulut kaydı başarısız.'}`)
      setOnlineOpen(false);setActiveOnline(null)
    }
  }

  async function chooseOnlineAnswer(key,value){
    const answers={...onlineAnswers,[key]:value}
    setOnlineAnswers(answers)
    if(!activeOnline)return
    const existing=participantFor(activeOnline,student)||{}
    const participant={...existing,studentId:student.id,studentNumber:student.student_number,name:`${student.first_name} ${student.last_name}`,bookletGroup:existing.bookletGroup||selectedBooklet,status:'Sınavda',startedAt:existing.startedAt||new Date().toISOString(),answers}
    const participants=[...(activeOnline.participants||[]).filter(p=>String(p.studentId)!==String(student.id)&&String(p.studentNumber)!==String(student.student_number)),participant]
    const updated={...activeOnline,participants}
    setActiveOnline(updated)
    saveOnlineList(onlineExams.map(e=>e.id===updated.id?updated:e))
    try{
      const payload=await persistLgsParticipant(updated.id,participant)
      const cloudExam=payload.find(e=>String(e.id)===String(updated.id))
      if(cloudExam)setActiveOnline(cloudExam)
      setError('')
    }catch(saveError){setError(`Cevap buluta kaydedilemedi: ${saveError.message||'Bağlantıyı kontrol et.'}`)}
  }

  async function finishOnlineExam(autoFinish=false){
    if(!activeOnline)return
    if(!autoFinish&&!window.confirm('Cevaplarını kesin olarak kaydetmek istediğine emin misin? Kaydettikten sonra tekrar değiştiremezsin.'))return
    const existingParticipant=participantFor(activeOnline,student)||{}
    const selectedGroup=(existingParticipant.bookletGroup||selectedBooklet||'A').toUpperCase()
    const lessonResults={}
    let totalCorrect=0,totalWrong=0,totalBlank=0,totalNet=0
    for(const lesson of lessons){
      let correct=0,wrong=0,blank=0
      for(let q=1;q<=lesson.count;q++){
        const key=`${lesson.key}-${q}`
        const answer=onlineAnswers[key]
        const group=selectedGroup
        let correctAnswer=activeOnline.answerKey?.[key]
        if(group==='B') {
          const aKey=Object.keys(activeOnline.bookletMap||{}).find(mapKey=>mapKey.startsWith(`${lesson.key}-`) && Number(activeOnline.bookletMap?.[mapKey])===q)
          correctAnswer=aKey ? activeOnline.answerKey?.[aKey] : correctAnswer
        }
        if(!answer)blank++
        else if(answer===correctAnswer)correct++
        else wrong++
      }
      const net=correct-wrong/3
      lessonResults[lesson.key]={correct,wrong,blank,net}
      totalCorrect+=correct;totalWrong+=wrong;totalBlank+=blank;totalNet+=net
    }
    const score=calculateOnlineScore(lessonResults)
    const old=existingParticipant
    const participant={...old,studentId:student.id,studentNumber:student.student_number,name:`${student.first_name} ${student.last_name}`,bookletGroup:old.bookletGroup||selectedBooklet||'A',status:'Kaydedildi',locked:true,startedAt:old.startedAt||new Date().toISOString(),finishedAt:new Date().toISOString(),answers:onlineAnswers,lessonResults,totalCorrect,totalWrong,totalBlank,totalNet,score,...Object.fromEntries(lessons.flatMap(l=>[[`${l.key}_correct`,lessonResults[l.key].correct],[`${l.key}_wrong`,lessonResults[l.key].wrong],[`${l.key}_net`,lessonResults[l.key].net]]))}
    const participants=[...(activeOnline.participants||[]).filter(p=>String(p.studentId)!==String(student.id)&&String(p.studentNumber)!==String(student.student_number)),participant]
    const completed=participants.filter(p=>p.finishedAt||String(p.status||'').includes('Tamam')).sort((a,b)=>Number(b.score||0)-Number(a.score||0))
    const ranked=participants.map(p=>{const idx=completed.findIndex(x=>String(x.studentId)===String(p.studentId));return idx>=0?{...p,rank:idx+1}:p})
    const updated={...activeOnline,participants:ranked}
    setOnlineSaving(true);setError('')
    try{
      await persistLgsParticipant(updated.id,participant)
      setOnlineOpen(false);setActiveOnline(null);setOnlineAnswers({});setMessage(autoFinish?'Süre doldu. Mevcut cevapların buluta kaydedildi.':'Cevapların buluta kaydedildi. Sonucun deneme süresi bittikten sonra LGS Denemelerim ekranında görünecek.')
    }catch(saveError){setError(`Cevaplar kaydedilemedi: ${saveError.message||'İnternet bağlantısını kontrol edip tekrar dene.'}`)}
    finally{setOnlineSaving(false)}
  }

  useEffect(()=>{
    if(!onlineOpen||!activeOnline)return
    const p=participantFor(activeOnline,student)
    if(onlineNow>=onlineWindow(activeOnline).end&&!p?.finishedAt)finishOnlineExam(true)
  },[onlineNow,onlineOpen,activeOnline?.id])

  function cancelOnlineExam(){
    setOnlineOpen(false);setActiveOnline(null);setError('')
  }

  async function downloadPdf(){
    const html=buildPdf({student,classInfo,rows,target,targetPassCount,analysis,plan})
    const host=document.createElement('div');host.innerHTML=html;document.body.appendChild(host)
    try{await html2pdf().set({margin:0,filename:`${student.first_name}_${student.last_name}_LGS_raporu.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#fff'},jsPDF:{unit:'mm',format:'a4',orientation:'landscape'},pagebreak:{mode:['css','legacy'],avoid:['tr']}}).from(host).save()}finally{host.remove()}
  }

  if(loading)return <Box className="loader"><CircularProgress/></Box>
  if(onlineOpen && activeOnline)return <Box className="online-exam-screen lgs-online-exam-screen">
    <Box className="online-exam-header">
      <Box><Typography variant="h5" fontWeight={950}>{activeOnline.name || 'LGS Online Deneme'}</Typography><Typography variant="body2">90 soru • Cevapların otomatik kaydedilir.</Typography></Box>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Chip color="warning" label={`Kalan Süre: ${remainingText(onlineWindow(activeOnline).end, onlineNow)}`} /><Chip label={`İşaretlenen: ${Object.keys(onlineAnswers).length} / 90`} /><Chip color="primary" label={`${selectedBooklet} Grubu`} /></Stack>
    </Box>
    <Box className="online-exam-body">
      {lessons.map(lesson=><Box className="lgs-online-lesson-section" key={lesson.key}><Typography variant="h6" fontWeight={950}>{lesson.name}</Typography><Box className="lgs-online-four-row-grid">{Array.from({length:lesson.count},(_,index)=>index+1).map(question=>{const key=`${lesson.key}-${question}`;return <Paper className="student-online-question" elevation={0} key={key}><b>{question}</b><Stack direction="row" spacing={.7}>{['A','B','C','D'].map(answer=><Button key={answer} size="small" variant={onlineAnswers[key]===answer?'contained':'outlined'} disabled={onlineSaving} onClick={()=>chooseOnlineAnswer(key,answer)}>{answer}</Button>)}</Stack></Paper>})}</Box></Box>)}
    </Box>
    <Box className="online-exam-footer"><Typography color="text.secondary">İptal edip çıkarsan cevapların korunur ve süre içinde tekrar devam edebilirsin.</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={1}><Button variant="outlined" startIcon={<Close/>} onClick={cancelOnlineExam}>İptal Et ve Çık</Button><Button variant="contained" color="success" size="large" startIcon={<CheckCircle/>} disabled={onlineSaving} onClick={()=>finishOnlineExam(false)}>Cevapları Kaydet</Button></Stack></Box>
  </Box>
  const menu=[['Ana Sayfa',Dashboard],['LGS Denemelerim',Assessment],['Çalışma Programım',CalendarMonth]]
  return <Box className="lgs-student-shell">
    <Box className="lgs-student-sidebar">
      <Box className="brand"><img className="brand-logo-image" src="/taskin-takip-sistemi-logo.png"/><Box><Typography fontWeight={950}>TAŞKIN</Typography><Typography variant="caption">LGS Öğrenci Paneli</Typography></Box></Box>
      <Divider sx={{my:2,borderColor:'rgba(255,255,255,.2)'}}/>
      <List>{menu.map(([label,Icon])=><ListItemButton key={label} selected={page===label} onClick={()=>setPage(label)}><ListItemIcon><Icon/></ListItemIcon><ListItemText primary={label}/></ListItemButton>)}</List>
      <Box sx={{flex:1}}/><Button startIcon={<Settings/>} onClick={()=>setSettingsOpen(true)}>Ayarlar</Button><Button startIcon={<Logout/>} onClick={()=>supabase.auth.signOut()}>Çıkış</Button>
    </Box>
    <Box className="lgs-student-main">
      {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}{message&&<Alert severity="success" sx={{mb:2}}>{message}</Alert>}
      {page==='Ana Sayfa'&&<>
        <Paper className="lgs-welcome" elevation={0}><Box><Typography variant="overline">{classInfo?.name||'LGS Grubu'}</Typography><Typography variant="h3" fontWeight={950}>Hoş geldin, {student.first_name} {student.last_name}</Typography><Typography color="text.secondary">Her deneme, hedefe giden yolda yeni bir ölçüm noktasıdır.</Typography>{medal&&<Chip className="lgs-medal-chip" label={medal}/>}</Box><EmojiEvents sx={{fontSize:72}}/></Paper>
        <Box className="lgs-summary-grid"><Metric label="Son Puan" value={fmt(latest?.score)}/><Metric label="Son Deneme Sıralaması" value={latestRank||'—'}/><Metric label="Puan Ortalaması" value={fmt(scoreAverage)}/><Metric label="Hedef Puanı" value={fmt(target)}/><Metric label="Hedefi Geçme Sayısı" value={`${targetPassCount} kez`}/></Box>
        <Paper className="lgs-online-student-card" elevation={0}>
          <Box className="lgs-online-student-icon"><OnlinePrediction/></Box>
          <Box className="lgs-online-student-info"><Typography variant="overline">LGS Online Deneme</Typography><Typography variant="h5" fontWeight={950}>{availableOnline?.name||'Planlanmış aktif deneme yok'}</Typography>{availableOnline&&<Typography color="text.secondary">{fmtDate(availableOnline.date)} • {availableOnline.start}–{availableOnline.end}</Typography>}</Box>
          <Box className="lgs-online-student-status">{availableOnline?availableParticipant?.finishedAt?<><Chip color="info" label="Cevapların kaydedildi"/><Typography variant="body2" color="text.secondary">Sonucun süre bittikten sonra LGS Denemelerim ekranında açılacak.</Typography></>:<><Chip color={onlineCanStart?'success':'info'} label={availableParticipant?.startedAt?'Devam ediyor':onlineCanStart?'Başlayabilirsin':`Başlamasına ${onlineCountdown}`}/><Button variant="contained" startIcon={<PlayArrow/>} disabled={!onlineCanStart} onClick={()=>availableParticipant?.startedAt?beginOnlineExam(availableParticipant.bookletGroup||'A'):setBookletSelectOpen(true)}>{availableParticipant?.startedAt?'Devam Et':'Denemeye Başla'}</Button></>:<Typography color="text.secondary">Yeni deneme planlandığında burada görünecek.</Typography>}</Box>
        </Paper>
        <Box className="lgs-dashboard-grid"><Paper className="lgs-panel" elevation={0}><Typography variant="h5" fontWeight={950}>Puan Gelişimim</Typography><ScoreChart rows={rows}/></Paper><Paper className="lgs-panel" elevation={0}><Typography variant="h5" fontWeight={950}>Son Deneme Karşılaştırması</Typography><ComparisonBars latest={latest} stats={latest?statsByExam.get(latest.exam_id):null}/></Paper></Box>
        <Paper className="lgs-ai-panel" elevation={0}><Stack direction="row" spacing={1} alignItems="center"><AutoAwesome color="primary"/><Typography variant="h5" fontWeight={950}>Yapay Zekâ Destekli Deneme Analizi</Typography></Stack><Typography>{analysis}</Typography><Typography variant="caption">Bu analiz her yeni deneme sonucu eklendiğinde otomatik olarak yenilenir.</Typography></Paper>
      </>}
      {page==='LGS Denemelerim'&&<>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={2} sx={{mb:2}}><Stack direction="row" spacing={1} alignItems="center"><Assessment/><Typography variant="h4" fontWeight={950}>LGS Denemelerim</Typography></Stack><Button variant="contained" startIcon={<Download/>} onClick={downloadPdf}>PDF İndir</Button></Stack>
        <LgsResultsTable rows={rows}/>
        <Box className="lgs-dashboard-grid" sx={{mt:2}}><Paper className="lgs-panel" elevation={0}><Typography variant="h5" fontWeight={950}>Net Gelişimim</Typography><NetChart rows={rows}/></Paper><Paper className="lgs-panel" elevation={0}><Typography variant="h5" fontWeight={950}>Son Deneme Puan Karşılaştırması</Typography><ComparisonBars latest={latest} stats={latest?statsByExam.get(latest.exam_id):null}/></Paper></Box>
      </>}
      {page==='Çalışma Programım'&&<>
        <Stack direction="row" spacing={1} alignItems="center" sx={{mb:2}}><CalendarMonth/><Typography variant="h4" fontWeight={950}>14 Günlük Çalışma Programım</Typography></Stack>
        {plan.length?<Box className="lgs-student-plan-grid">{plan.map(day=><Paper className="lgs-student-plan-day" key={day.day} elevation={0}><Typography variant="h6" fontWeight={950}>{day.day}. Gün</Typography>{(day.items||[]).map(item=><label className={`lgs-student-plan-item ${item.done?'done':''}`} key={item.id}><Checkbox checked={Boolean(item.done)} onChange={()=>togglePlan(item.id)}/><Box><b>{item.lesson}</b><span>{item.task}</span><small>{item.questions?`${item.questions} soru • `:''}${item.minutes||0} dakika</small></Box>{item.done&&<CheckCircle color="success"/>}</label>)}</Paper>)}</Box>:<Paper className="lgs-panel" elevation={0}><Typography color="text.secondary">Öğretmenin henüz çalışma programı oluşturmadı.</Typography></Paper>}
      </>}
    </Box>

    <Dialog open={bookletSelectOpen} onClose={()=>setBookletSelectOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle fontWeight={950}>Kitapçık Grubunu Seç</DialogTitle>
      <DialogContent><Alert severity="info" sx={{mt:1}}>Sınav kitapçığındaki grubu seç. Sonuç bu grubun cevap anahtarına göre hesaplanacaktır.</Alert><Stack direction="row" spacing={2} sx={{mt:3}}><Button fullWidth size="large" variant={selectedBooklet==='A'?'contained':'outlined'} onClick={()=>setSelectedBooklet('A')}>A Grubu</Button><Button fullWidth size="large" variant={selectedBooklet==='B'?'contained':'outlined'} onClick={()=>setSelectedBooklet('B')}>B Grubu</Button></Stack></DialogContent>
      <DialogActions><Button onClick={()=>setBookletSelectOpen(false)}>İptal</Button><Button variant="contained" onClick={()=>beginOnlineExam(selectedBooklet)}>Denemeye Başla</Button></DialogActions>
    </Dialog>
    <Dialog open={settingsOpen} onClose={()=>setSettingsOpen(false)} fullWidth maxWidth="xs"><DialogTitle fontWeight={950}>Hesap Ayarları</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField label="Kullanıcı Adı" value={session.user.email?.split('@')[0]||''} disabled helperText="Kullanıcı adını yalnızca öğretmenin değiştirebilir."/><TextField label="Yeni Şifre" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><TextField label="Yeni Şifre Tekrar" type="password" value={passwordAgain} onChange={e=>setPasswordAgain(e.target.value)}/></Stack></DialogContent><DialogActions><Button onClick={()=>setSettingsOpen(false)}>Kapat</Button><Button variant="contained" onClick={changePassword}>Şifreyi Değiştir</Button></DialogActions></Dialog>
  </Box>
}

function formatCountdown(diff){if(diff<=0)return '00:00:00';const total=Math.floor(diff/1000);const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),sec=total%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`}
function Metric({label,value}){return <Paper className="lgs-metric" elevation={0}><Typography color="text.secondary">{label}</Typography><Typography variant="h4" fontWeight={950}>{value}</Typography></Paper>}
function Arrow({value,previous}){if(value==null||previous==null)return <span className="lgs-arrow neutral">—</span>;const d=Number(value)-Number(previous);return d>0?<span className="lgs-arrow up">▲ {fmt(d)}</span>:d<0?<span className="lgs-arrow down">▼ {fmt(Math.abs(d))}</span>:<span className="lgs-arrow neutral">• 0,00</span>}
function LgsResultsTable({rows}){
  const fields=lessons.flatMap(l=>[`${l.key}_correct`,`${l.key}_net`]).concat(['total_correct','total_net','score'])
  const averages=Object.fromEntries(fields.map(f=>[f,avg(rows.map(r=>r[f]))]))
  return <Paper className="student-table-card" elevation={0}><div className="student-table-wrap"><table className="lgs-detailed-table"><thead><tr><th rowSpan="2">Tarih</th><th rowSpan="2">Deneme Adı</th>{lessons.map(l=><th key={l.key} colSpan="2">{l.name}</th>)}<th rowSpan="2">Top. D</th><th rowSpan="2">Top. Net</th><th rowSpan="2">Puan</th><th rowSpan="2">Sıra</th></tr><tr>{lessons.map(l=><><th key={`${l.key}d`}>D</th><th key={`${l.key}n`}>Net</th></>)}</tr></thead><tbody>{rows.map((r,i)=>{const prev=rows[i-1];return <tr key={r.id}><td>{fmtDate(r.exam?.exam_date)}</td><td><b>{r.exam?.name||'LGS Denemesi'}</b></td>{lessons.map(l=><><td key={`${r.id}-${l.key}-d`}>{fmt(r[`${l.key}_correct`])}<Arrow value={r[`${l.key}_correct`]} previous={prev?.[`${l.key}_correct`]}/></td><td key={`${r.id}-${l.key}-n`}>{fmt(r[`${l.key}_net`])}<Arrow value={r[`${l.key}_net`]} previous={prev?.[`${l.key}_net`]}/></td></>)}<td>{fmt(r.total_correct)}</td><td>{fmt(r.total_net)}<Arrow value={r.total_net} previous={prev?.total_net}/></td><td><b>{fmt(r.score)}</b><Arrow value={r.score} previous={prev?.score}/></td><td>{r.rank||'—'}</td></tr>})}{rows.length>0&&<tr className="lgs-average-row"><td colSpan="2">DENEME ORTALAMALARI</td>{lessons.map(l=><><td key={`${l.key}-ad`}>{fmt(averages[`${l.key}_correct`])}</td><td key={`${l.key}-an`}>{fmt(averages[`${l.key}_net`])}</td></>)}<td>{fmt(averages.total_correct)}</td><td>{fmt(averages.total_net)}</td><td>{fmt(averages.score)}</td><td>—</td></tr>}</tbody></table></div>{!rows.length&&<Typography sx={{p:3}} color="text.secondary">Henüz LGS deneme sonucun bulunmuyor.</Typography>}</Paper>
}
function ScoreChart({rows}){return <AxisLineChart rows={rows} field="score" max={500} colors={['#2563eb','#7c3aed','#e11d48','#0f9f78']}/>}
function NetChart({rows}){return <AxisLineChart rows={rows} field="total_net" max={90} colors={['#0f9f78','#2563eb','#f59e0b','#db2777']}/>}
function AxisLineChart({rows,field,max,colors}){if(!rows.length)return <Typography color="text.secondary" sx={{mt:3}}>Grafik için veri yok.</Typography>;const w=700,h=300,l=62,r=22,t=28,b=58,sideGap=42;const vals=rows.map(x=>Number(x[field])).filter(Number.isFinite);const upper=Math.max(max||0,...vals);const y=v=>h-b-(Number(v)/Math.max(1,upper))*(h-t-b);const usable=w-l-r-sideGap*2;const x=i=>rows.length===1?l+sideGap+usable/2:l+sideGap+i*usable/Math.max(1,rows.length-1);const pts=rows.map((row,i)=>`${x(i)},${y(row[field])}`).join(' ');const ticks=5;return <svg className="lgs-axis-chart" viewBox={`0 0 ${w} ${h}`}><line x1={l} y1={t} x2={l} y2={h-b}/><line x1={l} y1={h-b} x2={w-r} y2={h-b}/>{Array.from({length:ticks+1},(_,i)=>{const val=upper/ticks*i;const yy=y(val);return <g key={i}><line className="grid" x1={l} y1={yy} x2={w-r} y2={yy}/><text x={l-10} y={yy+4} textAnchor="end">{val.toFixed(0)}</text></g>})}{rows.length>1&&<polyline className="main-line" points={pts}/>} {rows.map((row,i)=><g key={row.id}><circle cx={x(i)} cy={y(row[field])} r="6" fill={colors[i%colors.length]}/><text className="value" x={x(i)} y={y(row[field])-12}>{fmt(row[field])}</text><text className="xlabel" x={x(i)} y={h-28} transform={`rotate(-25 ${x(i)} ${h-28})`}>{(row.exam?.name||'Deneme').slice(0,13)}</text></g>)}</svg>}
function ComparisonBars({latest,stats}){if(!latest)return <Typography color="text.secondary" sx={{mt:3}}>Henüz sonuç yok.</Typography>;const vals=[['Öğrenci',Number(latest.score), '#2563eb'],['Sınıf Ort.',Number(stats?.average), '#0f9f78'],['En Yüksek',Number(stats?.max), '#f59e0b'],['En Düşük',Number(stats?.min), '#e11d48']];return <div className="lgs-comparison-chart">{vals.map(([label,value,color])=><div className="lgs-comparison-item" key={label}><b>{fmt(value)}</b><div className="bar"><i style={{height:`${Math.max(3,Number(value||0)/500*100)}%`,background:color}}/></div><span>{label}</span></div>)}</div>}
function buildAnalysis(rows,target){if(!rows.length)return 'Henüz deneme sonucu olmadığı için kişisel analiz oluşturulamadı.';const last=rows.at(-1),prev=rows.at(-2);const lessonChanges=lessons.map(l=>({name:l.name,now:Number(last[`${l.key}_net`]),delta:prev?Number(last[`${l.key}_net`])-Number(prev[`${l.key}_net`]):0}));const rising=[...lessonChanges].sort((a,b)=>b.delta-a.delta)[0];const falling=[...lessonChanges].sort((a,b)=>a.delta-b.delta)[0];const weakest=[...lessonChanges].sort((a,b)=>a.now-b.now)[0];const scoreDelta=prev?Number(last.score)-Number(prev.score):null;let text=prev?`Son denemede puanın ${scoreDelta>0?`${fmt(scoreDelta)} puan arttı`:scoreDelta<0?`${fmt(Math.abs(scoreDelta))} puan azaldı`:'değişmedi'}. `:'İlk deneme verin oluştu. ';if(prev)text+=`${rising.name} dersinde en güçlü yükseliş görülürken ${falling.delta<0?`${falling.name} dersinde düşüş var. `:''}`;text+=`Öncelikli çalışma alanın ${weakest.name}; yanlış analizi ve düzenli soru tekrarı önerilir. `;if(target)text+=Number(last.score)>=target?`Son puanın ${fmt(target)} hedefini geçti.`:`Hedef puana ${fmt(target-Number(last.score))} puan kaldı.`;return text}
function buildPdf({student,classInfo,rows,target,targetPassCount,analysis,plan}){const averages=Object.fromEntries(lessons.flatMap(l=>[[`${l.key}_correct`,avg(rows.map(r=>r[`${l.key}_correct`]))],[`${l.key}_net`,avg(rows.map(r=>r[`${l.key}_net`]))]]));const resultRows=rows.map(r=>`<tr><td>${fmtDate(r.exam?.exam_date)}</td><td>${esc(r.exam?.name)}</td>${lessons.map(l=>`<td class="score-value">${fmt(r[`${l.key}_correct`])}</td><td class="score-value net-value">${fmt(r[`${l.key}_net`])}</td>`).join('')}<td class="score-value">${fmt(r.total_correct)}</td><td class="score-value net-value">${fmt(r.total_net)}</td><td class="score-value score-point">${fmt(r.score)}</td><td>${r.rank||'-'}</td></tr>`).join('')||'<tr><td colspan="18">Sonuç bulunamadı.</td></tr>';const avgRow=rows.length?`<tr class="avg"><td colspan="2">ORTALAMALAR</td>${lessons.map(l=>`<td>${fmt(averages[`${l.key}_correct`])}</td><td>${fmt(averages[`${l.key}_net`])}</td>`).join('')}<td>${fmt(avg(rows.map(r=>r.total_correct)))}</td><td>${fmt(avg(rows.map(r=>r.total_net)))}</td><td>${fmt(avg(rows.map(r=>r.score)))}</td><td>-</td></tr>`:'';const planHtml=plan.map(day=>`<div class="day"><b>${day.day}. Gün</b>${(day.items||[]).map(i=>`<p>${i.done?'✓':'□'} ${esc(i.lesson)} — ${esc(i.task)}</p>`).join('')}</div>`).join('');return `<style>*{box-sizing:border-box}body{margin:0;font-family:Arial;color:#172b3a}.page{width:1120px;min-height:790px;padding:26px;background:#fff;page-break-after:always}.page:last-child{page-break-after:auto}.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #174c67;padding-bottom:10px;margin-bottom:14px}.head img{width:82px}.head h1{margin:0;color:#174c67}.meta{text-align:right;line-height:1.7}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}.card{border:1px solid #cbd8df;border-radius:10px;padding:10px;background:#f5faf8}.card b{display:block;font-size:20px;color:#174c67}.table{width:100%;border-collapse:collapse;font-size:8.6px;table-layout:fixed}.table th,.table td{border:1px solid #b7c7d0;padding:5px 3px;text-align:center}.table td.score-value{font-size:9.4px;font-weight:800;color:#102f43}.table td.net-value{font-weight:900;color:#0b5d42}.table td.score-point{font-size:10px;color:#123f68}.table th{background:#174c67;color:white}.table tbody tr:nth-child(even){background:#eef7f3}.table .avg td{background:#d3f0df;font-weight:bold}.ai{border:1px solid #b9d5c7;background:#eef9f3;border-radius:12px;padding:15px;line-height:1.6}.plan{display:grid;grid-template-columns:1fr 1fr;gap:8px}.day{border:1px solid #d4dfe4;border-radius:8px;padding:8px;break-inside:avoid}.day p{font-size:10px;margin:4px 0}</style><section class="page"><div class="head"><img src="/taskin-takip-sistemi-logo.png"><div><h1>LGS Öğrenci Deneme Raporu</h1><b>${esc(student.first_name)} ${esc(student.last_name)}</b></div><div class="meta">${esc(classInfo?.name||'LGS Grubu')}<br>${new Date().toLocaleDateString('tr-TR')}</div></div><div class="summary"><div class="card">Hedef Puan<b>${fmt(target)}</b></div><div class="card">Hedefi Geçme<b>${targetPassCount} kez</b></div><div class="card">Deneme Sayısı<b>${rows.length}</b></div></div><table class="table"><thead><tr><th rowspan="2">Tarih</th><th rowspan="2">Deneme</th>${lessons.map(l=>`<th colspan="2">${l.name}</th>`).join('')}<th rowspan="2">Top.D</th><th rowspan="2">Top.Net</th><th rowspan="2">Puan</th><th rowspan="2">Sıra</th></tr><tr>${lessons.map(()=>'<th>D</th><th>Net</th>').join('')}</tr></thead><tbody>${resultRows}${avgRow}</tbody></table></section><section class="page"><div class="head"><img src="/taskin-takip-sistemi-logo.png"><h1>Kişisel Analiz ve Çalışma Programı</h1><div class="meta">${new Date().toLocaleDateString('tr-TR')}</div></div><div class="ai"><b>Yapay Zekâ Destekli Analiz</b><p>${esc(analysis)}</p></div><h2>14 Günlük Çalışma Programı</h2><div class="plan">${planHtml||'<p>Program oluşturulmadı.</p>'}</div></section>`}
