import { useMemo, useState } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { Archive, ArrowBack, ArrowForward, AssignmentTurnedIn, CancelRounded, CheckCircleRounded, DeleteOutline, Edit, PersonAdd, ReplayCircleFilledRounded, Restore, Save, School, Science, UploadFile } from '@mui/icons-material'
import { useSharedCloudState } from '../services/useSharedCloudState'
import { ONLINE_EXAM_ACCEPT, removeOnlineExamFile, uploadOnlineExamFile, validateOnlineExamFile } from '../services/onlineExamFiles'

const STATE_KEY='private-lessons-v1'
const LOCAL_KEY='taskin-private-lessons-v1'
const POOL_STATE_KEY='private-science-exam-pool-v1'
const POOL_LOCAL_KEY='taskin-private-science-exam-pool-v1'
const emptyStudent={ fullName:'', address:'', hourlyFee:'', lessonMinutes:60, notes:'' }
const emptyExam={name:'',answers:{},attachment:null,archived:false}
const ANSWERS=['A','B','C','D']
const statuses={
  done:{label:'Yapıldı',color:'#ffffff',bg:'#16a34a',border:'#15803d',Icon:CheckCircleRounded},
  missed:{label:'Yapılmadı',color:'#ffffff',bg:'#dc2626',border:'#b91c1c',Icon:CancelRounded},
  makeup:{label:'Telafi yapılacak',color:'#ffffff',bg:'#f59e0b',border:'#d97706',Icon:ReplayCircleFilledRounded}
}
const pad=n=>String(n).padStart(2,'0')
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const money=value=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2}).format(Number(value||0))
const fmtDate=value=>value?new Date(value).toLocaleString('tr-TR'):'—'
const netOf=(correct,wrong)=>Number(correct||0)-Number(wrong||0)/3

export default function PrivateLessonsPage(){
  const [data,setData,ready]=useSharedCloudState({stateKey:STATE_KEY,localKey:LOCAL_KEY,fallback:{students:[]}})
  const [poolData,setPoolData,poolReady]=useSharedCloudState({stateKey:POOL_STATE_KEY,localKey:POOL_LOCAL_KEY,fallback:{exams:[]}})
  const students=Array.isArray(data?.students)?data.students:[]
  const exams=Array.isArray(poolData?.exams)?poolData.exams:[]
  const [selectedId,setSelectedId]=useState(null)
  const [formOpen,setFormOpen]=useState(false)
  const [form,setForm]=useState(emptyStudent)
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1))
  const [dayOpen,setDayOpen]=useState(false)
  const [selectedDate,setSelectedDate]=useState('')
  const [entry,setEntry]=useState({status:'done',payment:'unpaid',durationMinutes:60,note:''})
  const [tab,setTab]=useState(0)
  const [examOpen,setExamOpen]=useState(false)
  const [examForm,setExamForm]=useState(emptyExam)
  const [examFile,setExamFile]=useState(null)
  const [examUploading,setExamUploading]=useState(false)
  const [assignOpen,setAssignOpen]=useState(false)
  const [assignForm,setAssignForm]=useState({examId:'',startAt:'',endAt:''})
  const [schoolOpen,setSchoolOpen]=useState(false)
  const [schoolForm,setSchoolForm]=useState({name:'',date:'',correct:'',wrong:'',blank:'',schoolRank:'',totalStudents:''})
  const [showArchive,setShowArchive]=useState(false)
  const selected=students.find(s=>s.id===selectedId)||students[0]||null

  function saveData(nextStudents){ setData({...(data||{}),students:nextStudents}) }
  function updateSelected(patch){ if(!selected)return; saveData(students.map(s=>s.id===selected.id?{...s,...patch}:s)) }
  function savePool(nextExams){ setPoolData({...(poolData||{}),exams:nextExams}) }
  function openNew(){ setForm(emptyStudent); setFormOpen(true) }
  function openEdit(){ if(!selected)return; setForm({...selected}); setFormOpen(true) }
  function saveStudent(){
    if(!form.fullName.trim()) return
    if(form.id) saveData(students.map(s=>s.id===form.id?{...s,...form,fullName:form.fullName.trim(),hourlyFee:Number(form.hourlyFee||0),lessonMinutes:Number(form.lessonMinutes||60)}:s))
    else { const item={...form,id:crypto.randomUUID(),fullName:form.fullName.trim(),hourlyFee:Number(form.hourlyFee||0),lessonMinutes:Number(form.lessonMinutes||60),lessons:{},examAssignments:[],schoolExams:[]}; saveData([...students,item]); setSelectedId(item.id) }
    setFormOpen(false)
  }
  function removeStudent(){ if(!selected||!window.confirm(`${selected.fullName} silinsin mi?`))return; const next=students.filter(s=>s.id!==selected.id); saveData(next); setSelectedId(next[0]?.id||null) }
  function openDay(key){ if(!selected)return; const old=selected.lessons?.[key]; setSelectedDate(key); setEntry(old?{...old}:{status:'done',payment:'unpaid',durationMinutes:selected.lessonMinutes||60,note:''}); setDayOpen(true) }
  function saveDay(){ const updated={...selected,lessons:{...(selected.lessons||{}),[selectedDate]:{...entry,durationMinutes:Number(entry.durationMinutes||selected.lessonMinutes||60)}}}; saveData(students.map(s=>s.id===selected.id?updated:s)); setDayOpen(false) }
  function deleteDay(){ const lessons={...(selected.lessons||{})}; delete lessons[selectedDate]; updateSelected({lessons}); setDayOpen(false) }

  function openNewExam(){ setExamForm(emptyExam); setExamFile(null); setExamOpen(true) }
  function openEditExam(exam){ setExamForm({...exam,answers:{...(exam.answers||{})}}); setExamFile(null); setExamOpen(true) }
  async function saveExam(){
    if(!examForm.name.trim()) return alert('Deneme adı zorunludur.')
    const missing=Array.from({length:20},(_,i)=>i+1).filter(q=>!examForm.answers?.[q])
    if(missing.length) return alert(`Cevap anahtarı eksik: ${missing.join(', ')}`)
    const fileError=validateOnlineExamFile(examFile); if(fileError)return alert(fileError)
    setExamUploading(true)
    try{
      const id=examForm.id||crypto.randomUUID(); let attachment=examForm.attachment||null
      if(examFile){ if(attachment) await removeOnlineExamFile(attachment).catch(()=>{}); attachment=await uploadOnlineExamFile(examFile,'private-science',id) }
      const item={...examForm,id,name:examForm.name.trim(),attachment,archived:Boolean(examForm.archived),updatedAt:new Date().toISOString()}
      savePool(examForm.id?exams.map(e=>e.id===id?item:e):[...exams,{...item,createdAt:new Date().toISOString()}])
      setExamOpen(false)
    }catch(error){ alert(error.message||'Deneme kaydedilemedi.') }finally{ setExamUploading(false) }
  }
  function archiveExam(exam){ savePool(exams.map(e=>e.id===exam.id?{...e,archived:!e.archived}:e)) }
  async function deleteExam(exam){
    const used=students.some(s=>(s.examAssignments||[]).some(a=>a.examId===exam.id))
    if(used) return alert('Bu deneme en az bir öğrenciye atanmış. Önce öğrenci atamalarını silmelisin.')
    if(!window.confirm(`${exam.name} kalıcı olarak silinsin mi?`))return
    if(exam.attachment) await removeOnlineExamFile(exam.attachment).catch(()=>{})
    savePool(exams.filter(e=>e.id!==exam.id))
  }

  function openAssign(){ const first=exams.find(e=>!e.archived); setAssignForm({examId:first?.id||'',startAt:'',endAt:''}); setAssignOpen(true) }
  function assignExam(){
    if(!assignForm.examId||!assignForm.startAt||!assignForm.endAt)return alert('Deneme, başlangıç ve bitiş zamanı zorunludur.')
    if(new Date(assignForm.endAt)<=new Date(assignForm.startAt))return alert('Bitiş zamanı başlangıçtan sonra olmalıdır.')
    const assignment={id:crypto.randomUUID(),examId:assignForm.examId,startAt:assignForm.startAt,endAt:assignForm.endAt,status:'active',answers:{},result:null,archived:false,createdAt:new Date().toISOString()}
    updateSelected({examAssignments:[...(selected.examAssignments||[]),assignment]}); setAssignOpen(false)
  }
  function editAssignment(a){ setAssignForm({assignmentId:a.id,examId:a.examId,startAt:a.startAt,endAt:a.endAt}); setAssignOpen(true) }
  function saveAssignmentEdit(){
    if(new Date(assignForm.endAt)<=new Date(assignForm.startAt))return alert('Bitiş zamanı başlangıçtan sonra olmalıdır.')
    updateSelected({examAssignments:(selected.examAssignments||[]).map(a=>a.id===assignForm.assignmentId?{...a,examId:assignForm.examId,startAt:assignForm.startAt,endAt:assignForm.endAt}:a)}); setAssignOpen(false)
  }
  function cancelResult(a){
    if(!window.confirm('Sonuç silinsin ve deneme öğrenci ekranında tekrar aktif olsun mu?'))return
    updateSelected({examAssignments:(selected.examAssignments||[]).map(x=>x.id===a.id?{...x,status:'active',answers:{},result:null,finishedAt:null,startedAt:null,archived:false}:x)})
  }
  function archiveAssignment(a){ updateSelected({examAssignments:(selected.examAssignments||[]).map(x=>x.id===a.id?{...x,archived:!x.archived}:x)}) }
  function deleteAssignment(a){ if(!window.confirm('Bu deneme ataması kalıcı olarak silinsin mi?'))return; updateSelected({examAssignments:(selected.examAssignments||[]).filter(x=>x.id!==a.id)}) }

  function openSchool(){ setSchoolForm({name:'',date:'',correct:'',wrong:'',blank:'',schoolRank:'',totalStudents:''}); setSchoolOpen(true) }
  function saveSchool(){
    if(!schoolForm.name.trim()||!schoolForm.date)return alert('Deneme adı ve tarih zorunludur.')
    const item={...schoolForm,id:crypto.randomUUID(),correct:Number(schoolForm.correct||0),wrong:Number(schoolForm.wrong||0),blank:Number(schoolForm.blank||0),schoolRank:Number(schoolForm.schoolRank||0),totalStudents:Number(schoolForm.totalStudents||0)}
    item.net=netOf(item.correct,item.wrong)
    updateSelected({schoolExams:[...(selected.schoolExams||[]),item]}); setSchoolOpen(false)
  }
  function deleteSchool(id){ if(!window.confirm('Okul denemesi silinsin mi?'))return; updateSelected({schoolExams:(selected.schoolExams||[]).filter(x=>x.id!==id)}) }

  const entries=Object.entries(selected?.lessons||{})
  const summary=useMemo(()=>{ const done=entries.filter(([,x])=>x.status==='done'); const unpaid=done.filter(([,x])=>x.payment!=='paid'); const unpaidMinutes=unpaid.reduce((sum,[,x])=>sum+Number(x.durationMinutes||selected?.lessonMinutes||60),0); const debt=unpaid.reduce((sum,[,x])=>sum+(Number(selected?.hourlyFee||0)*Number(x.durationMinutes||selected?.lessonMinutes||60)/60),0); return {total:entries.length,done:done.length,makeup:entries.filter(([,x])=>x.status==='makeup').length,unpaid:unpaid.length,unpaidMinutes,debt} },[selectedId,students])
  const days=useMemo(()=>{ const first=new Date(month.getFullYear(),month.getMonth(),1); const start=(first.getDay()+6)%7; const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate(); return [...Array(start).fill(null),...Array.from({length:count},(_,i)=>new Date(month.getFullYear(),month.getMonth(),i+1))] },[month])
  const visiblePool=exams.filter(e=>Boolean(e.archived)===showArchive)
  const assignments=(selected?.examAssignments||[]).filter(a=>Boolean(a.archived)===showArchive).sort((a,b)=>String(a.startAt).localeCompare(String(b.startAt)))
  const schoolExams=[...(selected?.schoolExams||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date)))

  if(!ready||!poolReady) return <Box className="page"><Typography>Özel ders verileri yükleniyor…</Typography></Box>
  return <Box className="page">
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} justifyContent="space-between" sx={{mb:2}}><Box><Typography variant="h4" fontWeight={950}>Özel Dersler</Typography><Typography color="text.secondary">Ders, ücret ve Fen denemesi takibi</Typography></Box><Button variant="contained" startIcon={<PersonAdd/>} onClick={openNew}>Öğrenci Ekle</Button></Stack>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'280px 1fr'},gap:2}}>
      <Paper className="glass" sx={{p:1.5,borderRadius:3,height:'fit-content'}}><Typography fontWeight={900} sx={{mb:1}}>Öğrenciler</Typography>{students.length===0?<Alert severity="info">Henüz özel ders öğrencisi yok.</Alert>:<Stack spacing={1}>{students.map(s=><Button key={s.id} variant={selected?.id===s.id?'contained':'outlined'} onClick={()=>setSelectedId(s.id)} sx={{justifyContent:'flex-start'}}>{s.fullName}</Button>)}</Stack>}</Paper>
      {!selected?<Paper className="glass" sx={{p:3,borderRadius:3}}><Typography>Başlamak için öğrenci ekle.</Typography></Paper>:<Stack spacing={2}>
        <Paper className="glass" sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Box sx={{flex:1}}><Typography variant="h5" fontWeight={950}>{selected.fullName}</Typography><Typography color="text.secondary">{selected.address||'Adres girilmedi'}</Typography><Typography fontWeight={800} sx={{mt:.5}}>Saatlik ücret: {money(selected.hourlyFee)} • Ders süresi: {selected.lessonMinutes||60} dk</Typography></Box><Button variant="contained" startIcon={<AssignmentTurnedIn/>} onClick={openAssign}>Deneme Ata</Button><IconButton onClick={openEdit}><Edit/></IconButton><IconButton color="error" onClick={removeStudent}><DeleteOutline/></IconButton></Stack></Paper>
        <Paper className="glass" sx={{borderRadius:3,overflow:'hidden'}}><Tabs value={tab} onChange={(_,v)=>setTab(v)} variant="scrollable" scrollButtons="auto"><Tab label="Takvim ve Ücret"/><Tab label="Deneme Havuzu"/><Tab label="Öğrenci Denemeleri"/><Tab label="Okul Denemeleri"/><Tab label="Analiz"/></Tabs></Paper>

        {tab===0&&<><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'1fr 280px'},gap:2}}><Paper className="glass" sx={{p:2,borderRadius:3}}><Stack direction="row" alignItems="center" justifyContent="space-between"><IconButton onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ArrowBack/></IconButton><Typography fontWeight={950}>{month.toLocaleDateString('tr-TR',{month:'long',year:'numeric'})}</Typography><IconButton onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ArrowForward/></IconButton></Stack><Box className="private-calendar"><>{['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(x=><Typography key={x} className="private-calendar-head">{x}</Typography>)}</>{days.map((d,i)=>{if(!d)return <Box key={`e${i}`}/>; const key=dateKey(d); const rec=selected.lessons?.[key]; const style=rec?statuses[rec.status]:null; const StatusIcon=style?.Icon; return <Button key={key} onClick={()=>openDay(key)} className={`private-calendar-day ${rec?`is-${rec.status}`:''}`} sx={{backgroundColor:style?.bg||'transparent',color:style?.color||'inherit',borderColor:style?.border||'rgba(0,0,0,.12)'}}><b>{d.getDate()}</b>{rec&&<span className="private-calendar-status-icon">{StatusIcon&&<StatusIcon fontSize="inherit"/>}</span>}{rec&&<small>{statuses[rec.status]?.label}</small>}{rec&&<small className="private-calendar-payment">{rec.payment==='paid'?'Ödendi':'Ödenmedi'}</small>}</Button>})}</Box></Paper><Stack spacing={1.25}>{[['Toplam kayıt',summary.total],['Yapılan ders',summary.done],['Telafi bekleyen',summary.makeup],['Ödenmemiş ders',summary.unpaid],['Ödenmemiş süre',`${Math.floor(summary.unpaidMinutes/60)} sa ${summary.unpaidMinutes%60} dk`],['Toplam borç',money(summary.debt)]].map(([a,b])=><Paper key={a} className="glass" sx={{p:1.5,borderRadius:3}}><Typography variant="caption" color="text.secondary">{a}</Typography><Typography variant="h6" fontWeight={950}>{b}</Typography></Paper>)}</Stack></Box><Paper className="glass" sx={{p:2,borderRadius:3}}><Typography fontWeight={900} sx={{mb:1}}>Notlar / Haftalık Ödevler</Typography><TextField fullWidth multiline minRows={4} value={selected.notes||''} onChange={e=>updateSelected({notes:e.target.value})} placeholder="Bu haftanın ödevi, işlenen konu veya öğrenci notu…"/></Paper></>}

        {tab===1&&<Paper className="glass" sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} justifyContent="space-between" sx={{mb:2}}><Box><Typography variant="h6" fontWeight={950}>Fen Deneme Havuzu</Typography><Typography variant="body2" color="text.secondary">Denemeyi bir kez oluştur, farklı öğrencilere farklı zamanlarda ata.</Typography></Box><Stack direction="row" spacing={1}><Button variant="outlined" startIcon={showArchive?<Restore/>:<Archive/>} onClick={()=>setShowArchive(!showArchive)}>{showArchive?'Aktifleri Göster':'Arşiv'}</Button><Button variant="contained" startIcon={<Science/>} onClick={openNewExam}>Yeni Deneme</Button></Stack></Stack>{visiblePool.length===0?<Alert severity="info">{showArchive?'Arşivde deneme yok.':'Henüz deneme oluşturulmadı.'}</Alert>:<Stack spacing={1.25}>{visiblePool.map(e=><Paper key={e.id} variant="outlined" sx={{p:1.5,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Box sx={{flex:1}}><Typography fontWeight={950}>{e.name}</Typography><Typography variant="caption" color="text.secondary">20 soru • {e.attachment?'Dosya yüklü':'Dosya yok'} • Cevap anahtarı hazır</Typography></Box><Button size="small" startIcon={<Edit/>} onClick={()=>openEditExam(e)}>Düzenle</Button><Button size="small" startIcon={e.archived?<Restore/>:<Archive/>} onClick={()=>archiveExam(e)}>{e.archived?'Geri Al':'Arşivle'}</Button><IconButton color="error" onClick={()=>deleteExam(e)}><DeleteOutline/></IconButton></Stack></Paper>)}</Stack>}</Paper>}

        {tab===2&&<Paper className="glass" sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} justifyContent="space-between" sx={{mb:2}}><Box><Typography variant="h6" fontWeight={950}>Öğrencinin Denemeleri</Typography><Typography variant="body2" color="text.secondary">İlk deneme üstte, sonraki denemeler altta tarih sırasıyla görünür.</Typography></Box><Stack direction="row" spacing={1}><Button variant="outlined" onClick={()=>setShowArchive(!showArchive)}>{showArchive?'Aktifleri Göster':'Arşiv'}</Button><Button variant="contained" onClick={openAssign}>Deneme Ata</Button></Stack></Stack>{assignments.length===0?<Alert severity="info">Bu bölümde deneme yok.</Alert>:<Stack spacing={1.25}>{assignments.map(a=>{const e=exams.find(x=>x.id===a.examId); return <Paper key={a.id} variant="outlined" sx={{p:1.5,borderRadius:3}}><Stack direction={{xs:'column',md:'row'}} spacing={1.25} alignItems={{md:'center'}}><Box sx={{flex:1}}><Typography fontWeight={950}>{e?.name||'Silinmiş deneme'}</Typography><Typography variant="body2" color="text.secondary">{fmtDate(a.startAt)} – {fmtDate(a.endAt)}</Typography></Box><Chip label={a.result?'Tamamlandı':a.status==='active'?'Aktif':'Bekliyor'} color={a.result?'success':'info'}/><Button size="small" onClick={()=>editAssignment(a)}>Değiştir</Button>{a.result&&<Button size="small" color="warning" onClick={()=>cancelResult(a)}>Sonucu İptal Et</Button>}<Button size="small" startIcon={a.archived?<Restore/>:<Archive/>} onClick={()=>archiveAssignment(a)}>{a.archived?'Geri Al':'Arşivle'}</Button><IconButton color="error" onClick={()=>deleteAssignment(a)}><DeleteOutline/></IconButton></Stack></Paper>})}</Stack>}</Paper>}

        {tab===3&&<Paper className="glass" sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} justifyContent="space-between" sx={{mb:2}}><Box><Typography variant="h6" fontWeight={950}>Okul Denemeleri – Fen</Typography><Typography variant="body2" color="text.secondary">Okulda yapılan denemelerin Fen sonuçlarını ve okul sırasını elle gir.</Typography></Box><Button variant="contained" startIcon={<School/>} onClick={openSchool}>Sonuç Ekle</Button></Stack>{schoolExams.length===0?<Alert severity="info">Henüz okul denemesi eklenmedi.</Alert>:<Stack spacing={1}>{schoolExams.map(x=><Paper key={x.id} variant="outlined" sx={{p:1.5,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Box sx={{flex:1}}><Typography fontWeight={950}>{x.name}</Typography><Typography variant="caption" color="text.secondary">{new Date(`${x.date}T12:00:00`).toLocaleDateString('tr-TR')}</Typography></Box><Chip label={`${x.correct} D • ${x.wrong} Y • ${x.blank} B`}/><Chip color="primary" label={`${x.net.toFixed(2)} net`}/><Chip color="secondary" label={`Okul: ${x.schoolRank||'—'} / ${x.totalStudents||'—'}`}/><IconButton color="error" onClick={()=>deleteSchool(x.id)}><DeleteOutline/></IconButton></Stack></Paper>)}</Stack>}</Paper>}

        {tab===4&&<Paper className="glass" sx={{p:2,borderRadius:3}}><Typography variant="h6" fontWeight={950}>Deneme Analizi</Typography><Typography color="text.secondary" sx={{mb:2}}>Öğrenci tarafı tamamlandığında online sonuçlar burada soru bazlı gösterilecek.</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={1}><Chip sx={{bgcolor:'#16a34a',color:'#fff',fontWeight:900}} label="Doğru • Yeşil"/><Chip sx={{bgcolor:'#dc2626',color:'#fff',fontWeight:900}} label="Yanlış • Kırmızı"/><Chip sx={{bgcolor:'#f59e0b',color:'#fff',fontWeight:900}} label="Boş • Sarı"/></Stack><Divider sx={{my:2}}/><Typography fontWeight={900}>Kayıt özeti</Typography><Typography>Online deneme ataması: {(selected.examAssignments||[]).length}</Typography><Typography>Okul denemesi: {(selected.schoolExams||[]).length}</Typography></Paper>}
      </Stack>}
    </Box>

    <Dialog open={formOpen} onClose={()=>setFormOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={950}>{form.id?'Öğrenciyi Düzenle':'Özel Ders Öğrencisi Ekle'}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField required label="Ad Soyad" value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/><TextField label="Adres (isteğe bağlı)" multiline minRows={2} value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})}/><TextField label="Saatlik ders ücreti (TL)" type="number" value={form.hourlyFee} onChange={e=>setForm({...form,hourlyFee:e.target.value})}/><TextField select label="Varsayılan ders süresi" value={form.lessonMinutes||60} onChange={e=>setForm({...form,lessonMinutes:Number(e.target.value)})}>{[40,60,80,90,120].map(x=><MenuItem key={x} value={x}>{x} dakika</MenuItem>)}</TextField></Stack></DialogContent><DialogActions><Button onClick={()=>setFormOpen(false)}>Vazgeç</Button><Button variant="contained" startIcon={<Save/>} disabled={!form.fullName.trim()} onClick={saveStudent}>Kaydet</Button></DialogActions></Dialog>
    <Dialog open={dayOpen} onClose={()=>setDayOpen(false)} fullWidth maxWidth="xs"><DialogTitle fontWeight={950}>{selectedDate&&new Date(`${selectedDate}T12:00:00`).toLocaleDateString('tr-TR')}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField select label="Ders durumu" value={entry.status} onChange={e=>setEntry({...entry,status:e.target.value})}>{Object.entries(statuses).map(([k,v])=><MenuItem key={k} value={k}>{v.label}</MenuItem>)}</TextField><TextField select label="Ödeme durumu" value={entry.payment} onChange={e=>setEntry({...entry,payment:e.target.value})}><MenuItem value="paid">Ödendi</MenuItem><MenuItem value="unpaid">Ödenmedi</MenuItem></TextField><TextField type="number" label="Ders süresi (dakika)" value={entry.durationMinutes} onChange={e=>setEntry({...entry,durationMinutes:e.target.value})}/><TextField multiline minRows={2} label="Ders notu / ödev" value={entry.note||''} onChange={e=>setEntry({...entry,note:e.target.value})}/></Stack></DialogContent><DialogActions><Button color="error" onClick={deleteDay}>Kaydı Sil</Button><Box sx={{flex:1}}/><Button onClick={()=>setDayOpen(false)}>Vazgeç</Button><Button variant="contained" onClick={saveDay}>Kaydet</Button></DialogActions></Dialog>

    <Dialog open={examOpen} onClose={()=>setExamOpen(false)} fullWidth maxWidth="md"><DialogTitle fontWeight={950}>{examForm.id?'Denemeyi Düzenle':'Fen Denemesi Oluştur'}</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{pt:1}}><TextField label="Deneme adı" value={examForm.name} onChange={e=>setExamForm({...examForm,name:e.target.value})}/><Paper variant="outlined" sx={{p:2,borderRadius:3}}><Typography fontWeight={900}>Deneme Dosyası (isteğe bağlı)</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1}}>PDF, JPG, PNG veya WEBP • En fazla 20 MB</Typography><Button component="label" variant="outlined" startIcon={<UploadFile/>}>{examFile?.name||examForm.attachment?.name||'Dosya Seç'}<input hidden type="file" accept={ONLINE_EXAM_ACCEPT} onChange={e=>setExamFile(e.target.files?.[0]||null)}/></Button></Paper><Typography variant="h6" fontWeight={950}>20 Soruluk Cevap Anahtarı</Typography><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr'},gap:2}}>{[1,11].map(start=><Stack key={start} spacing={1}>{Array.from({length:10},(_,i)=>start+i).map(q=><Paper key={q} variant="outlined" sx={{p:.75,display:'grid',gridTemplateColumns:'32px repeat(4,1fr)',gap:.5,alignItems:'center'}}><b>{q}</b>{ANSWERS.map(a=><Button key={a} size="small" variant={examForm.answers?.[q]===a?'contained':'outlined'} onClick={()=>setExamForm({...examForm,answers:{...(examForm.answers||{}),[q]:a}})}>{a}</Button>)}</Paper>)}</Stack>)}</Box></Stack></DialogContent><DialogActions><Button onClick={()=>setExamOpen(false)}>Vazgeç</Button><Button variant="contained" disabled={examUploading} onClick={saveExam}>{examUploading?'Yükleniyor…':'Kaydet'}</Button></DialogActions></Dialog>

    <Dialog open={assignOpen} onClose={()=>setAssignOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={950}>{assignForm.assignmentId?'Deneme Atamasını Değiştir':'Deneme Ata'}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField select label="Deneme" value={assignForm.examId} onChange={e=>setAssignForm({...assignForm,examId:e.target.value})}>{exams.filter(e=>!e.archived).map(e=><MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}</TextField><TextField type="datetime-local" label="Başlangıç" value={assignForm.startAt} onChange={e=>setAssignForm({...assignForm,startAt:e.target.value})} InputLabelProps={{shrink:true}}/><TextField type="datetime-local" label="Bitiş" value={assignForm.endAt} onChange={e=>setAssignForm({...assignForm,endAt:e.target.value})} InputLabelProps={{shrink:true}}/></Stack></DialogContent><DialogActions><Button onClick={()=>setAssignOpen(false)}>Vazgeç</Button><Button variant="contained" onClick={assignForm.assignmentId?saveAssignmentEdit:assignExam}>{assignForm.assignmentId?'Kaydet':'Öğrenciye Gönder'}</Button></DialogActions></Dialog>

    <Dialog open={schoolOpen} onClose={()=>setSchoolOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={950}>Okul Denemesi Fen Sonucu</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField label="Deneme adı" value={schoolForm.name} onChange={e=>setSchoolForm({...schoolForm,name:e.target.value})}/><TextField type="date" label="Tarih" value={schoolForm.date} onChange={e=>setSchoolForm({...schoolForm,date:e.target.value})} InputLabelProps={{shrink:true}}/><Box sx={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:1}}><TextField type="number" label="Doğru" value={schoolForm.correct} onChange={e=>setSchoolForm({...schoolForm,correct:e.target.value})}/><TextField type="number" label="Yanlış" value={schoolForm.wrong} onChange={e=>setSchoolForm({...schoolForm,wrong:e.target.value})}/><TextField type="number" label="Boş" value={schoolForm.blank} onChange={e=>setSchoolForm({...schoolForm,blank:e.target.value})}/></Box><Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}><TextField type="number" label="Okul sırası" value={schoolForm.schoolRank} onChange={e=>setSchoolForm({...schoolForm,schoolRank:e.target.value})}/><TextField type="number" label="Toplam öğrenci" value={schoolForm.totalStudents} onChange={e=>setSchoolForm({...schoolForm,totalStudents:e.target.value})}/></Box></Stack></DialogContent><DialogActions><Button onClick={()=>setSchoolOpen(false)}>Vazgeç</Button><Button variant="contained" onClick={saveSchool}>Kaydet</Button></DialogActions></Dialog>
  </Box>
}
