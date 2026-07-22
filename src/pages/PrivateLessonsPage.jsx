import { useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { Archive, ArrowBack, ArrowForward, AssignmentTurnedIn, CancelRounded, CheckCircleRounded, DeleteOutline, Edit, PersonAdd, PictureAsPdf, ReplayCircleFilledRounded, Restore, Save, School, Science, UploadFile, Visibility } from '@mui/icons-material'
import { useSharedCloudState } from '../services/useSharedCloudState'
import { supabase } from '../services/supabase'
import { toAuthSafeUsername } from '../utils/username'
import { ONLINE_EXAM_ACCEPT, removeOnlineExamFile, uploadOnlineExamFile, validateOnlineExamFile } from '../services/onlineExamFiles'

const STATE_KEY='private-lessons-v1'
const LOCAL_KEY='taskin-private-lessons-v1'
const POOL_STATE_KEY='private-science-exam-pool-v1'
const POOL_LOCAL_KEY='taskin-private-science-exam-pool-v1'
const emptyStudent={fullName:'',studentNumber:'',username:'',password:'',address:'',hourlyFee:'',lessonMinutes:60,notes:''}
const emptyExam={name:'',answers:{},attachment:null,archived:false}
const emptyHomework={title:'',description:'',assignedDate:new Date().toISOString().slice(0,10),dueDate:'',status:'pending'}
const homeworkStatuses={
  pending:{label:'Kontrol Edilmedi',color:'default',bg:'#f1f5f9'},
  done:{label:'Yaptı',color:'success',bg:'#dcfce7'},
  partial:{label:'Kısmen Yaptı',color:'warning',bg:'#fef3c7'},
  not_done:{label:'Yapmadı',color:'error',bg:'#fee2e2'}
}
const ANSWERS=['A','B','C','D']
const statuses={
  done:{label:'Yapıldı',color:'#166534',bg:'#dcfce7',border:'#86efac',Icon:CheckCircleRounded},
  missed:{label:'Yapılmadı',color:'#991b1b',bg:'#fee2e2',border:'#fca5a5',Icon:CancelRounded},
  makeup:{label:'Telafi',color:'#854d0e',bg:'#fef3c7',border:'#facc15',Icon:ReplayCircleFilledRounded}
}
const pad=n=>String(n).padStart(2,'0')
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const money=value=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2}).format(Number(value||0))
const fmtDate=value=>value?new Date(value).toLocaleString('tr-TR'):'—'
const netOf=(correct,wrong)=>Number(correct||0)-Number(wrong||0)/3
const numeric=v=>Number(v||0)
const sortDate=(a,b)=>new Date(a.date||a.finishedAt||a.endAt||a.createdAt||0)-new Date(b.date||b.finishedAt||b.endAt||b.createdAt||0)
const resultValues=r=>({correct:numeric(r?.correct),wrong:numeric(r?.wrong),blank:numeric(r?.blank),net:Number(r?.net??netOf(r?.correct,r?.wrong))})

function NetLineChart({items}){
  if(!items.length) return <Alert severity="info">Grafik için henüz sonuç yok.</Alert>
  const width=760,height=250,padX=46,padY=32
  const values=items.map(x=>Number(x.net||0))
  const min=Math.min(0,...values),max=Math.max(1,...values)
  const range=Math.max(1,max-min)
  const points=items.map((x,i)=>({x:items.length===1?width/2:padX+i*(width-padX*2)/(items.length-1),y:height-padY-(Number(x.net||0)-min)*(height-padY*2)/range}))
  const poly=points.map(p=>`${p.x},${p.y}`).join(' ')
  return <Box sx={{width:'100%',overflowX:'auto'}}><svg viewBox={`0 0 ${width} ${height}`} style={{width:'100%',minWidth:560,display:'block'}} role="img" aria-label="Son 10 denemenin net çizgi grafiği">
    {[0,.25,.5,.75,1].map(t=>{const y=padY+t*(height-padY*2); const value=max-t*range; return <g key={t}><line x1={padX} x2={width-padX} y1={y} y2={y} stroke="currentColor" opacity=".12"/><text x={8} y={y+4} fontSize="12" fill="currentColor" opacity=".7">{value.toFixed(1)}</text></g>})}
    <polyline points={poly} fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/>
    {points.map((p,i)=><g key={items[i].id||i}><circle cx={p.x} cy={p.y} r="6" fill="currentColor"/><text x={p.x} y={height-8} textAnchor="middle" fontSize="11" fill="currentColor">{i+1}</text><text x={p.x} y={p.y-11} textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{Number(items[i].net).toFixed(2)}</text></g>)}
  </svg></Box>
}

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
  const [resultOpen,setResultOpen]=useState(false)
  const [resultAssignment,setResultAssignment]=useState(null)
  const [schoolOpen,setSchoolOpen]=useState(false)
  const [schoolForm,setSchoolForm]=useState({name:'',date:'',correct:'',wrong:'',schoolRank:''})
  const [showArchive,setShowArchive]=useState(false)
  const [homeworkOpen,setHomeworkOpen]=useState(false)
  const [homeworkForm,setHomeworkForm]=useState(emptyHomework)
  const [controlOpen,setControlOpen]=useState(false)
  const [controlHomework,setControlHomework]=useState(null)
  const [allHomeworkOpen,setAllHomeworkOpen]=useState(false)
  const [homeworkStudentFilter,setHomeworkStudentFilter]=useState('all')
  const [homeworkStatusFilter,setHomeworkStatusFilter]=useState('all')
  const selected=students.find(s=>s.id===selectedId)||students[0]||null

  function saveData(nextStudents){setData({...(data||{}),students:nextStudents})}
  function updateSelected(patch){if(!selected)return; saveData(students.map(s=>s.id===selected.id?{...s,...patch}:s))}
  function savePool(nextExams){setPoolData({...(poolData||{}),exams:nextExams})}
  function openNew(){setForm(emptyStudent);setFormOpen(true)}
  function openEditStudent(student){setSelectedId(student.id);setForm({...emptyStudent,...student});setFormOpen(true)}
  async function saveStudent(){
    if(!form.fullName.trim()||!form.username.trim()||!form.password.trim()) return alert('Ad soyad, kullanıcı adı ve şifre zorunludur.')
    const username=toAuthSafeUsername(form.username)
    const duplicatePrivate=students.some(s=>s.id!==form.id&&toAuthSafeUsername(s.username)===username)
    if(duplicatePrivate)return alert('Bu kullanıcı adı başka bir aktif öğrenci tarafından kullanılıyor. Lütfen farklı bir kullanıcı adı girin.')
    try{
      const {data:duplicateSchool,error}=await supabase
        .from('students')
        .select('id')
        .eq('is_active',true)
        .eq('username',username)
        .limit(1)
      if(error)throw error
      if(duplicateSchool?.length)return alert('Bu kullanıcı adı başka bir aktif öğrenci tarafından kullanılıyor. Lütfen farklı bir kullanıcı adı girin.')
    }catch(error){
      console.error('Kullanıcı adı kontrolü başarısız:',error)
      return alert('Kullanıcı adı kontrol edilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.')
    }
    const clean={...form,fullName:form.fullName.trim(),studentNumber:String(form.studentNumber||'').trim(),username,password:form.password.trim(),address:(form.address||'').trim(),hourlyFee:Number(form.hourlyFee||0),lessonMinutes:Number(form.lessonMinutes||60)}
    try{
      if(form.id){
        let authUserId=form.authUserId||form.auth_user_id||null
        if(authUserId){
          const {data:account,error:accountError}=await supabase.functions.invoke('student-account',{body:{action:'update_private_student',auth_user_id:authUserId,student_id:form.id,username,password:form.password,full_name:clean.fullName}})
          if(accountError||!account?.ok)throw new Error(account?.error||accountError?.message||'Öğrenci hesabı güncellenemedi.')
        }else{
          const {data:account,error:accountError}=await supabase.functions.invoke('student-account',{body:{action:'create_private_student',student:{id:form.id,username,password:form.password,full_name:clean.fullName}}})
          if(accountError||!account?.ok)throw new Error(account?.error||accountError?.message||'Öğrenci hesabı oluşturulamadı.')
          authUserId=account.auth_user_id
        }
        saveData(students.map(s=>s.id===form.id?{...s,...clean,authUserId}:s))
      }else{
        const id=crypto.randomUUID()
        const {data:account,error:accountError}=await supabase.functions.invoke('student-account',{body:{action:'create_private_student',student:{id,username,password:clean.password,full_name:clean.fullName}}})
        if(accountError||!account?.ok)throw new Error(account?.error||accountError?.message||'Öğrenci hesabı oluşturulamadı.')
        const item={...clean,id,authUserId:account.auth_user_id,lessons:{},homeworks:[],examAssignments:[],schoolExams:[]};saveData([...students,item]);setSelectedId(item.id)
      }
      setFormOpen(false)
    }catch(error){alert(error.message||'Öğrenci kaydedilemedi.')}
  }
  async function removeStudent(student){if(!window.confirm(`${student.fullName} ve tüm özel ders kayıtları silinsin mi?`))return;try{const authUserId=student.authUserId||student.auth_user_id;if(authUserId){const {data:account,error}=await supabase.functions.invoke('student-account',{body:{action:'delete_private_student',auth_user_id:authUserId}});if(error||!account?.ok)throw new Error(account?.error||error?.message||'Hesap silinemedi.')}}catch(error){return alert(error.message)}const next=students.filter(s=>s.id!==student.id);saveData(next);if(selected?.id===student.id)setSelectedId(next[0]?.id||null)}
  function openDay(key){if(!selected)return;const old=selected.lessons?.[key];setSelectedDate(key);setEntry(old?{...old}:{status:'done',payment:'unpaid',durationMinutes:selected.lessonMinutes||60,note:''});setDayOpen(true)}
  function saveDay(){const updated={...selected,lessons:{...(selected.lessons||{}),[selectedDate]:{...entry,durationMinutes:Number(entry.durationMinutes||selected.lessonMinutes||60)}}};saveData(students.map(s=>s.id===selected.id?updated:s));setDayOpen(false)}
  function deleteDay(){const lessons={...(selected.lessons||{})};delete lessons[selectedDate];updateSelected({lessons});setDayOpen(false)}

  function openNewHomework(){setHomeworkForm({...emptyHomework,assignedDate:new Date().toISOString().slice(0,10)});setHomeworkOpen(true)}
  function openEditHomework(item){setHomeworkForm({...emptyHomework,...item});setHomeworkOpen(true)}
  function saveHomework(){
    if(!homeworkForm.title.trim())return alert('Ödev başlığı zorunludur.')
    const item={...homeworkForm,id:homeworkForm.id||crypto.randomUUID(),title:homeworkForm.title.trim(),description:(homeworkForm.description||'').trim(),status:homeworkForm.status||'pending',updatedAt:new Date().toISOString()}
    const list=homeworkForm.id?(selected.homeworks||[]).map(x=>x.id===item.id?item:x):[item,...(selected.homeworks||[])]
    updateSelected({homeworks:list});setHomeworkOpen(false)
  }
  function deleteHomework(item){if(!window.confirm(`“${item.title}” ödevi silinsin mi?`))return;updateSelected({homeworks:(selected.homeworks||[]).filter(x=>x.id!==item.id)})}
  function openHomeworkControl(item){setControlHomework(item);setControlOpen(true)}
  function setHomeworkStatus(status){
    if(!controlHomework)return
    updateSelected({homeworks:(selected.homeworks||[]).map(x=>x.id===controlHomework.id?{...x,status,checkedAt:new Date().toISOString()}:x)})
    setControlOpen(false);setControlHomework(null)
  }

  function openNewExam(){setExamForm(emptyExam);setExamFile(null);setExamOpen(true)}
  function openEditExam(exam){setExamForm({...exam,answers:{...(exam.answers||{})}});setExamFile(null);setExamOpen(true)}
  async function saveExam(){
    if(!examForm.name.trim())return alert('Deneme adı zorunludur.')
    const missing=Array.from({length:20},(_,i)=>i+1).filter(q=>!examForm.answers?.[q]);if(missing.length)return alert(`Cevap anahtarı eksik: ${missing.join(', ')}`)
    const fileError=validateOnlineExamFile(examFile);if(fileError)return alert(fileError)
    setExamUploading(true)
    try{const id=examForm.id||crypto.randomUUID();let attachment=examForm.attachment||null;if(examFile){if(attachment)await removeOnlineExamFile(attachment).catch(()=>{});attachment=await uploadOnlineExamFile(examFile,'private-science',id)}const item={...examForm,id,name:examForm.name.trim(),attachment,archived:Boolean(examForm.archived),updatedAt:new Date().toISOString()};savePool(examForm.id?exams.map(e=>e.id===id?item:e):[...exams,{...item,createdAt:new Date().toISOString()}]);setExamOpen(false)}catch(error){alert(error.message||'Deneme kaydedilemedi.')}finally{setExamUploading(false)}
  }
  function archiveExam(exam){savePool(exams.map(e=>e.id===exam.id?{...e,archived:!e.archived}:e))}
  async function deleteExam(exam){const used=students.some(s=>(s.examAssignments||[]).some(a=>a.examId===exam.id));if(used)return alert('Bu deneme en az bir öğrenciye atanmış. Önce öğrenci atamalarını silmelisin.');if(!window.confirm(`${exam.name} kalıcı olarak silinsin mi?`))return;if(exam.attachment)await removeOnlineExamFile(exam.attachment).catch(()=>{});savePool(exams.filter(e=>e.id!==exam.id))}

  function openAssign(){const first=exams.find(e=>!e.archived);setAssignForm({examId:first?.id||'',startAt:'',endAt:''});setAssignOpen(true)}
  function assignExam(){if(!assignForm.examId||!assignForm.startAt||!assignForm.endAt)return alert('Deneme, başlangıç ve bitiş zamanı zorunludur.');if(new Date(assignForm.endAt)<=new Date(assignForm.startAt))return alert('Bitiş zamanı başlangıçtan sonra olmalıdır.');const assignment={id:crypto.randomUUID(),examId:assignForm.examId,startAt:assignForm.startAt,endAt:assignForm.endAt,status:'active',answers:{},result:null,archived:false,createdAt:new Date().toISOString()};updateSelected({examAssignments:[...(selected.examAssignments||[]),assignment]});setAssignOpen(false)}
  function editAssignment(a){setAssignForm({assignmentId:a.id,examId:a.examId,startAt:a.startAt,endAt:a.endAt});setAssignOpen(true)}
  function saveAssignmentEdit(){if(!assignForm.examId||!assignForm.startAt||!assignForm.endAt)return alert('Tüm alanlar zorunludur.');if(new Date(assignForm.endAt)<=new Date(assignForm.startAt))return alert('Bitiş zamanı başlangıçtan sonra olmalıdır.');updateSelected({examAssignments:(selected.examAssignments||[]).map(a=>a.id===assignForm.assignmentId?{...a,examId:assignForm.examId,startAt:assignForm.startAt,endAt:assignForm.endAt}:a)});setAssignOpen(false)}
  function cancelResult(a){if(!window.confirm('Sonuç silinsin ve deneme öğrenci ekranında tekrar aktif olsun mu?'))return;updateSelected({examAssignments:(selected.examAssignments||[]).map(x=>x.id===a.id?{...x,status:'active',answers:{},result:null,finishedAt:null,startedAt:null,archived:false}:x)})}
  function archiveAssignment(a){updateSelected({examAssignments:(selected.examAssignments||[]).map(x=>x.id===a.id?{...x,archived:!x.archived}:x)})}
  function deleteAssignment(a){if(!window.confirm('Bu deneme ataması kalıcı olarak silinsin mi?'))return;updateSelected({examAssignments:(selected.examAssignments||[]).filter(x=>x.id!==a.id)})}
  function showResult(a){setResultAssignment(a);setResultOpen(true)}

  function openSchool(item=null){setSchoolForm(item?{id:item.id,name:item.name||'',date:item.date||'',correct:String(item.correct??''),wrong:String(item.wrong??''),schoolRank:String(item.schoolRank??'')}:{name:'',date:'',correct:'',wrong:'',schoolRank:''});setSchoolOpen(true)}
  function updateSchoolScore(field,value){
    if(value==='')return setSchoolForm(current=>({...current,[field]:''}))
    const parsed=Math.max(0,Math.min(20,Math.floor(Number(value))))
    if(!Number.isFinite(parsed))return
    setSchoolForm(current=>{
      const other=field==='correct'?numeric(current.wrong):numeric(current.correct)
      if(parsed+other>20){alert('Doğru ve yanlış sayısının toplamı 20’yi geçemez.');return current}
      return {...current,[field]:String(parsed)}
    })
  }
  function saveSchool(){
    if(!schoolForm.name.trim()||!schoolForm.date)return alert('Deneme adı ve tarih zorunludur.')
    const correct=numeric(schoolForm.correct),wrong=numeric(schoolForm.wrong)
    if(correct<0||wrong<0||correct>20||wrong>20)return alert('Doğru ve yanlış sayıları 0 ile 20 arasında olmalıdır.')
    if(correct+wrong>20)return alert('Doğru ve yanlış sayısının toplamı 20’yi geçemez.')
    const blank=20-correct-wrong
    const item={...schoolForm,id:schoolForm.id||crypto.randomUUID(),name:schoolForm.name.trim(),correct,wrong,blank,net:netOf(correct,wrong),schoolRank:numeric(schoolForm.schoolRank)}
    const list=schoolForm.id?(selected.schoolExams||[]).map(x=>x.id===item.id?item:x):[...(selected.schoolExams||[]),item]
    updateSelected({schoolExams:list});setSchoolOpen(false)
  }
  function deleteSchool(id){if(!window.confirm('Okul denemesi silinsin mi?'))return;updateSelected({schoolExams:(selected.schoolExams||[]).filter(x=>x.id!==id)})}

  function exportPdf(){
    if(!selected)return
    try{
      const doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'})
      const pageWidth=210,pageHeight=297,margin=12
      const usable=pageWidth-margin*2
      const tr=value=>String(value??'').replace(/[çÇğĞıİöÖşŞüÜ]/g,ch=>({ç:'c',Ç:'C',ğ:'g',Ğ:'G',ı:'i',İ:'I',ö:'o',Ö:'O',ş:'s',Ş:'S',ü:'u',Ü:'U'}[ch]))
      const safe=value=>tr(value).replace(/[^\x20-\x7E]/g,'')
      const newPage=()=>{doc.addPage();return 15}
      let y=16

      doc.setTextColor(17,24,39)
      doc.setFont('helvetica','bold');doc.setFontSize(17)
      doc.text('Fen Deneme Sonuc Raporu',margin,y);y+=9

      doc.setFillColor(255,247,237);doc.setDrawColor(251,146,60)
      doc.roundedRect(margin,y,usable,22,2,2,'FD')
      doc.setTextColor(67,20,7);doc.setFont('helvetica','bold');doc.setFontSize(10)
      doc.text(`Adi Soyadi: ${safe(selected.fullName)}`,margin+4,y+6.5)
      doc.text(`Ogrenci Numarasi: ${safe(selected.studentNumber||selected.student_number||'—')}`,margin+4,y+13)
      doc.text(`Toplam Deneme: ${allResults.length}`,margin+103,y+6.5)
      doc.text(`Ortalama Net: ${averages?averages.net.toFixed(2):'—'}`,margin+103,y+13)
      y+=29

      const cols=[8,24,54,19,19,17,19,26]
      const headers=['No','Tur','Deneme Adi','Dogru','Yanlis','Bos','Net','Okul Sirasi']
      const drawHeader=()=>{
        let x=margin
        doc.setFont('helvetica','bold')
        doc.setFontSize(8)
        headers.forEach((h,i)=>{
          doc.setFillColor(255,237,213)
          doc.setDrawColor(251,146,60)
          doc.setTextColor(17,24,39)
          doc.rect(x,y,cols[i],8,'FD')
          doc.text(h,x+cols[i]/2,y+5.2,{align:'center'})
          x+=cols[i]
        })
        y+=8
        doc.setTextColor(17,24,39)
        doc.setFont('helvetica','normal')
      }
      drawHeader()
      if(!allResults.length){
        doc.setFillColor(255,255,255)
        doc.setDrawColor(203,213,225)
        doc.rect(margin,y,usable,10,'FD')
        doc.setTextColor(75,85,99)
        doc.setFont('helvetica','normal')
        doc.setFontSize(8.5)
        doc.text('Henuz deneme sonucu bulunmuyor.',margin+3,y+6.3)
        y+=10
      }else{
        allResults.forEach((row,index)=>{
          const nameLines=doc.splitTextToSize(safe(row.name),cols[2]-2.8)
          const rowH=Math.max(8,nameLines.length*4.2+3)
          if(y+rowH>pageHeight-18){y=newPage();drawHeader()}
          const cells=[String(index+1),safe(row.type),nameLines,String(row.correct??''),String(row.wrong??''),String(row.blank??''),Number(row.net||0).toFixed(2),row.schoolRank?String(row.schoolRank):'—']
          let x=margin
          doc.setFontSize(8)
          doc.setTextColor(17,24,39)
          doc.setDrawColor(203,213,225)
          cells.forEach((value,i)=>{
            doc.setFillColor(255,255,255)
            doc.rect(x,y,cols[i],rowH,'FD')
            if(Array.isArray(value))doc.text(value,x+1.4,y+4.2)
            else doc.text(safe(value),x+1.4,y+5.1)
            x+=cols[i]
          })
          y+=rowH
        })
      }

      if(averages){
        y+=4
        if(y+11>pageHeight-15)y=newPage()
        doc.setFillColor(255,247,237);doc.setDrawColor(253,186,116)
        doc.rect(margin,y,usable,10,'FD')
        doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(124,45,18)
        doc.text(`Ortalama net: ${averages.net.toFixed(2)}`,margin+3,y+6.5)
        y+=16
      }else y+=8

      if(y+73>pageHeight-15)y=newPage()
      doc.setTextColor(17,24,39);doc.setFont('helvetica','bold');doc.setFontSize(12)
      doc.text('Son 10 Denemenin Net Grafigi',margin,y);y+=7
      const chartX=margin+10,chartY=y,chartW=usable-20,chartH=55
      doc.setDrawColor(229,231,235);doc.setLineWidth(.2)
      if(lastTen.length){
        const vals=lastTen.map(x=>Number(x.net||0)),min=Math.min(0,...vals),max=Math.max(1,...vals),range=Math.max(1,max-min)
        for(let i=0;i<=4;i++){
          const gy=chartY+i*chartH/4
          doc.line(chartX,gy,chartX+chartW,gy)
          doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(107,114,128)
          doc.text((max-i*range/4).toFixed(1),margin,gy+1.8)
        }
        const pts=lastTen.map((item,i)=>({x:lastTen.length===1?chartX+chartW/2:chartX+i*chartW/(lastTen.length-1),y:chartY+chartH-(Number(item.net||0)-min)*chartH/range,v:Number(item.net||0)}))
        doc.setDrawColor(234,88,12);doc.setFillColor(234,88,12);doc.setLineWidth(1)
        for(let i=1;i<pts.length;i++)doc.line(pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y)
        pts.forEach((p,i)=>{
          doc.circle(p.x,p.y,1.4,'F')
          doc.setFontSize(7);doc.setTextColor(17,24,39)
          doc.text(p.v.toFixed(2),p.x,p.y-2.4,{align:'center'})
          doc.setTextColor(107,114,128);doc.text(String(i+1),p.x,chartY+chartH+5,{align:'center'})
        })
      }else{
        doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(107,114,128)
        doc.text('Grafik icin henuz sonuc yok.',chartX,chartY+12)
      }

      const fileName=`${safe(selected.fullName).trim().replace(/\s+/g,'_')||'ogrenci'}_fen_deneme_raporu.pdf`
      doc.save(fileName)
    }catch(error){
      console.error('PDF olusturma hatasi:',error)
      alert('PDF olusturulamadi. Lutfen tekrar deneyin.')
    }
  }

  const entries=Object.entries(selected?.lessons||{})
  const summary=useMemo(()=>{const done=entries.filter(([,x])=>x.status==='done');const paid=done.filter(([,x])=>x.payment==='paid');const unpaid=done.filter(([,x])=>x.payment!=='paid');const minutesOf=list=>list.reduce((sum,[,x])=>sum+Number(x.durationMinutes||selected?.lessonMinutes||60),0);const doneMinutes=minutesOf(done),paidMinutes=minutesOf(paid),unpaidMinutes=minutesOf(unpaid);const hourly=Number(selected?.hourlyFee||0);const paidFee=hourly*paidMinutes/60,unpaidFee=hourly*unpaidMinutes/60;return{doneMinutes,paidFee,unpaidFee,debt:unpaidFee}},[selected,entries])
  const first=new Date(month.getFullYear(),month.getMonth(),1),last=new Date(month.getFullYear(),month.getMonth()+1,0),start=(first.getDay()+6)%7
  const calendar=[...Array(start).fill(null),...Array.from({length:last.getDate()},(_,i)=>new Date(month.getFullYear(),month.getMonth(),i+1))]
  const activePool=exams.filter(e=>Boolean(e.archived)===showArchive)
  const assignments=(selected?.examAssignments||[]).filter(a=>Boolean(a.archived)===showArchive).sort(sortDate)
  const schoolExams=[...(selected?.schoolExams||[])].sort(sortDate)
  const homeworks=[...(selected?.homeworks||[])].sort((a,b)=>new Date(b.assignedDate||b.createdAt||0)-new Date(a.assignedDate||a.createdAt||0))
  const allHomeworks=students.flatMap(student=>(student.homeworks||[]).map(homework=>({...homework,studentId:student.id,studentName:student.fullName}))).filter(item=>(homeworkStudentFilter==='all'||item.studentId===homeworkStudentFilter)&&(homeworkStatusFilter==='all'||(item.status||'pending')===homeworkStatusFilter)).sort((a,b)=>new Date(b.assignedDate||b.createdAt||0)-new Date(a.assignedDate||a.createdAt||0))
  const onlineResults=(selected?.examAssignments||[]).filter(a=>a.result).map(a=>{const exam=exams.find(e=>e.id===a.examId);return{id:a.id,type:'Online',name:exam?.name||'Silinmiş deneme',date:a.finishedAt||a.endAt||a.createdAt,...resultValues(a.result),answers:a.answers||{},answerKey:exam?.answers||{}}})
  const allResults=[...onlineResults,...schoolExams.map(x=>({id:x.id,type:'Okul',name:x.name,date:x.date,correct:numeric(x.correct),wrong:numeric(x.wrong),blank:numeric(x.blank),net:Number(x.net),schoolRank:numeric(x.schoolRank)}))].sort(sortDate)
  const averages=allResults.length?{correct:allResults.reduce((s,x)=>s+x.correct,0)/allResults.length,wrong:allResults.reduce((s,x)=>s+x.wrong,0)/allResults.length,blank:allResults.reduce((s,x)=>s+x.blank,0)/allResults.length,net:allResults.reduce((s,x)=>s+x.net,0)/allResults.length}:null
  const lastTen=allResults.slice(-10)

  if(!ready||!poolReady)return <Box sx={{p:3}}><Typography>Yükleniyor…</Typography></Box>
  return <Box sx={{p:{xs:1.25,md:2}}}>
    <Stack spacing={2}>
      <Paper className="glass" sx={{p:2,borderRadius:3}}>
        <Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}} justifyContent="space-between"><Box><Typography variant="h5" fontWeight={950}>Özel Ders Öğrencileri</Typography><Typography variant="body2" color="text.secondary">Öğrenciler yukarıda; seçilen öğrencinin tüm bilgileri sayfanın tamamında görünür.</Typography></Box><Stack direction={{xs:'column',sm:'row'}} spacing={1}><Button variant="outlined" startIcon={<Visibility/>} onClick={()=>setAllHomeworkOpen(true)}>Tüm Ödev Durumları</Button><Button variant="contained" startIcon={<PersonAdd/>} onClick={openNew}>Öğrenci Ekle</Button></Stack></Stack>
        {students.length===0?<Alert severity="info" sx={{mt:2}}>Henüz özel ders öğrencisi eklenmedi.</Alert>:<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',md:'repeat(3,minmax(0,1fr))',xl:'repeat(4,minmax(0,1fr))'},gap:1.25,mt:2}}>{students.map(student=><Paper key={student.id} variant="outlined" onClick={()=>{setSelectedId(student.id);setTab(0)}} sx={{p:1.4,borderRadius:3,cursor:'pointer',borderWidth:selected?.id===student.id?3:1,borderColor:selected?.id===student.id?'#c2410c':'divider',bgcolor:selected?.id===student.id?'#f97316 !important':'transparent',color:selected?.id===student.id?'#fff':'inherit',boxShadow:selected?.id===student.id?'0 5px 16px rgba(194,65,12,.35)':'none','& .MuiTypography-root':{color:selected?.id===student.id?'#fff':undefined},'& .MuiIconButton-root':{color:selected?.id===student.id?'#fff':undefined}}}><Stack direction="row" spacing={1} alignItems="center"><Box sx={{flex:1,minWidth:0}}><Typography fontWeight={950} noWrap>{student.fullName}</Typography><Typography variant="caption" color="text.secondary" noWrap>@{student.username||'kullanıcı adı yok'}</Typography></Box><IconButton size="small" aria-label="Düzenle" onClick={e=>{e.stopPropagation();openEditStudent(student)}}><Edit fontSize="small"/></IconButton><IconButton size="small" color="error" aria-label="Sil" onClick={e=>{e.stopPropagation();removeStudent(student)}}><DeleteOutline fontSize="small"/></IconButton></Stack></Paper>)}</Box>}
      </Paper>

      <Paper className="glass" sx={{p:2,borderRadius:3}}>
        <Stack direction={{xs:'column',md:'row'}} spacing={1} justifyContent="space-between" alignItems={{md:'center'}}><Box><Typography variant="h6" fontWeight={950}>Fen Deneme Havuzu</Typography><Typography variant="body2" color="text.secondary">Denemeyi bir kez hazırla, öğrenci profilinden tarih ve saat seçerek ata.</Typography></Box><Stack direction="row" spacing={1}><Button variant="outlined" startIcon={showArchive?<Restore/>:<Archive/>} onClick={()=>setShowArchive(v=>!v)}>{showArchive?'Aktifleri Göster':'Arşivi Göster'}</Button><Button variant="contained" startIcon={<Science/>} onClick={openNewExam}>Deneme Oluştur</Button></Stack></Stack>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1.25,mt:2}}>{activePool.length===0?<Alert severity="info">Bu bölümde deneme yok.</Alert>:activePool.map(exam=><Paper key={exam.id} variant="outlined" sx={{p:1.5,borderRadius:3}}><Stack direction="row" spacing={1} alignItems="center"><Box sx={{flex:1,minWidth:0}}><Typography fontWeight={950} noWrap>{exam.name}</Typography><Typography variant="caption" color="text.secondary">20 soru {exam.attachment?'• Dosya yüklü':'• Dosya yok'}</Typography></Box><Button size="small" onClick={()=>openEditExam(exam)}>Düzenle</Button><IconButton onClick={()=>archiveExam(exam)}>{exam.archived?<Restore/>:<Archive/>}</IconButton><IconButton color="error" onClick={()=>deleteExam(exam)}><DeleteOutline/></IconButton></Stack></Paper>)}</Box>
      </Paper>

      {!selected?<Alert severity="info">Detayları görmek için bir öğrenci seç.</Alert>:<Paper className="glass" variant="outlined" sx={{p:0,borderRadius:3,overflow:'hidden',borderWidth:2,borderColor:'#f59e0b'}}>
        <Box sx={{p:2,'& .MuiPaper-outlined':{borderColor:'#f59e0b'}}}><Stack direction={{xs:'column',md:'row'}} spacing={1} alignItems={{md:'center'}} justifyContent="space-between"><Box><Typography variant="h5" fontWeight={950}>{selected.fullName}</Typography><Typography variant="body2" color="text.secondary">Kullanıcı adı: {selected.username||'—'} {selected.address?`• ${selected.address}`:''}</Typography></Box><Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<PictureAsPdf/>} onClick={exportPdf}>Tüm Sonuçları PDF Al</Button></Stack></Stack></Box>
        <Divider/>
        <Tabs value={tab} onChange={(_,v)=>setTab(v)} variant="scrollable" scrollButtons="auto"><Tab label="Takvim ve Ücret"/><Tab label="Ödevler"/><Tab label="Online Denemeler"/><Tab label="Okul Denemeleri"/><Tab label="Analiz"/></Tabs>
        <Box sx={{p:2}}>
          {tab===0&&<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'280px minmax(0,1fr)'},gap:2,alignItems:'start','& .MuiPaper-outlined':{borderColor:'#f59e0b'}}}><Stack spacing={1.25}><Paper variant="outlined" sx={{p:1.5,borderRadius:3}}><Typography variant="caption">Yapılan ders saati</Typography><Typography variant="h6" fontWeight={950}>{(summary.doneMinutes/60).toFixed(2)} saat</Typography></Paper><Paper variant="outlined" sx={{p:1.5,borderRadius:3}}><Typography variant="caption">Ödenen ders ücreti</Typography><Typography variant="h6" fontWeight={950}>{money(summary.paidFee)}</Typography></Paper><Paper variant="outlined" sx={{p:1.5,borderRadius:3}}><Typography variant="caption">Ödenmeyen ders ücreti</Typography><Typography variant="h6" fontWeight={950}>{money(summary.unpaidFee)}</Typography></Paper><Paper variant="outlined" sx={{p:1.5,borderRadius:3,bgcolor:'rgba(245,158,11,.10)'}}><Typography variant="caption">Toplam borç</Typography><Typography variant="h6" fontWeight={950}>{money(summary.debt)}</Typography></Paper></Stack><Paper variant="outlined" sx={{p:2,borderRadius:3}}><Stack direction="row" justifyContent="space-between" alignItems="center"><IconButton onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ArrowBack/></IconButton><Typography variant="h6" fontWeight={950}>{month.toLocaleDateString('tr-TR',{month:'long',year:'numeric'})}</Typography><IconButton onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ArrowForward/></IconButton></Stack><Box sx={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:.6,mt:1}}>{['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(x=><Typography key={x} align="center" variant="caption" fontWeight={900}>{x}</Typography>)}{calendar.map((d,i)=>{if(!d)return <Box key={`blank-${i}`}/>;const key=dateKey(d),rec=selected.lessons?.[key],st=rec?statuses[rec.status]:null;return <Button key={key} onClick={()=>openDay(key)} variant='outlined' sx={{minWidth:0,height:72,borderRadius:2,flexDirection:'column',bgcolor:rec?`${st?.bg} !important`:undefined,color:rec?`${st?.color} !important`:undefined,borderColor:rec?`${st?.border} !important`:undefined,borderWidth:rec?2:1,'&:hover':rec?{bgcolor:`${st.bg} !important`,filter:'brightness(.98)'}:{}}}><b>{d.getDate()}</b>{rec&&<><small style={{fontWeight:900,lineHeight:1.1}}>{st.label}</small><small style={{fontWeight:800,lineHeight:1.1}}>{rec.payment==='paid'?'Ödendi':'Ödenmedi'}</small></>}</Button>})}</Box></Paper></Box>}

          {tab===1&&<Paper variant="outlined" sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} justifyContent="space-between" sx={{mb:2}}><Box><Typography variant="h6" fontWeight={950}>Ödevler</Typography><Typography variant="body2" color="text.secondary">Ödev ekle; düzenle, sil veya kontrol ederek yapılma durumunu seç.</Typography></Box><Button variant="contained" startIcon={<AssignmentTurnedIn/>} onClick={openNewHomework}>Ödev Ver</Button></Stack>{homeworks.length===0?<Alert severity="info">Bu öğrenciye henüz ödev verilmedi.</Alert>:<Stack spacing={1.25}>{homeworks.map(item=>{const state=homeworkStatuses[item.status||'pending']||homeworkStatuses.pending;return <Paper key={item.id} variant="outlined" sx={{p:1.5,borderRadius:3,bgcolor:state.bg}}><Stack direction={{xs:'column',md:'row'}} spacing={1} alignItems={{md:'center'}}><Box sx={{flex:1,minWidth:0}}><Typography fontWeight={950}>{item.title}</Typography>{item.description&&<Typography variant="body2" color="text.secondary">{item.description}</Typography>}<Typography variant="caption" color="text.secondary">Veriliş: {item.assignedDate?new Date(`${item.assignedDate}T12:00:00`).toLocaleDateString('tr-TR'):'—'} • Teslim: {item.dueDate?new Date(`${item.dueDate}T12:00:00`).toLocaleDateString('tr-TR'):'—'}</Typography></Box><Chip color={state.color} label={state.label}/><Button size="small" startIcon={<Edit/>} onClick={()=>openEditHomework(item)}>Düzenle</Button><Button size="small" color="error" startIcon={<DeleteOutline/>} onClick={()=>deleteHomework(item)}>Sil</Button><Button size="small" variant="contained" startIcon={<AssignmentTurnedIn/>} onClick={()=>openHomeworkControl(item)}>Kontrol</Button></Stack></Paper>})}</Stack>}</Paper>}

          {tab===2&&<Paper variant="outlined" sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} justifyContent="space-between" sx={{mb:2}}><Box><Typography variant="h6" fontWeight={950}>Online Denemeler</Typography><Typography variant="body2" color="text.secondary">Atanan denemeleri düzenle, sil, sonucu gör veya sonucu iptal ederek tekrar aktif et.</Typography></Box><Button variant="contained" startIcon={<AssignmentTurnedIn/>} onClick={openAssign}>Deneme Ata</Button></Stack>{assignments.length===0?<Alert severity="info">Bu bölümde deneme yok.</Alert>:<Stack spacing={1.25}>{assignments.map(a=>{const e=exams.find(x=>x.id===a.examId);return <Paper key={a.id} variant="outlined" sx={{p:1.5,borderRadius:3}}><Stack direction={{xs:'column',lg:'row'}} spacing={1} alignItems={{lg:'center'}}><Box sx={{flex:1}}><Typography fontWeight={950}>{e?.name||'Silinmiş deneme'}</Typography><Typography variant="body2" color="text.secondary">{fmtDate(a.startAt)} – {fmtDate(a.endAt)}</Typography></Box><Chip label={a.result?'Tamamlandı':a.status==='active'?'Aktif':'Bekliyor'} color={a.result?'success':'info'}/><Button size="small" startIcon={<Edit/>} onClick={()=>editAssignment(a)}>Düzenle</Button><Button size="small" color="error" startIcon={<DeleteOutline/>} onClick={()=>deleteAssignment(a)}>Sil</Button>{a.result&&<Button size="small" startIcon={<Visibility/>} onClick={()=>showResult(a)}>Sonucu Gör</Button>}{a.result&&<Button size="small" color="warning" onClick={()=>cancelResult(a)}>İptal Et</Button>}<Button size="small" startIcon={a.archived?<Restore/>:<Archive/>} onClick={()=>archiveAssignment(a)}>{a.archived?'Geri Al':'Arşivle'}</Button></Stack></Paper>})}</Stack>}</Paper>}

          {tab===3&&<Paper variant="outlined" sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} justifyContent="space-between" sx={{mb:2}}><Box><Typography variant="h6" fontWeight={950}>Okul Denemeleri – Fen</Typography><Typography variant="body2" color="text.secondary">Deneme adı, tarih, doğru, yanlış ve okul sırası girilir; boş ve net otomatik hesaplanır.</Typography></Box><Button variant="contained" startIcon={<School/>} onClick={()=>openSchool()}>Sonuç Ekle</Button></Stack>{schoolExams.length===0?<Alert severity="info">Henüz okul denemesi eklenmedi.</Alert>:<Stack spacing={1}>{schoolExams.map(x=><Paper key={x.id} variant="outlined" sx={{p:1.5,borderRadius:3}}><Stack direction={{xs:'column',md:'row'}} spacing={1} alignItems={{md:'center'}}><Box sx={{flex:1}}><Typography fontWeight={950}>{x.name}</Typography><Typography variant="caption" color="text.secondary">{new Date(`${x.date}T12:00:00`).toLocaleDateString('tr-TR')}</Typography></Box><Chip label={`${x.correct} D • ${x.wrong} Y`}/><Chip color="primary" label={`${Number(x.net).toFixed(2)} net`}/><Chip color="secondary" label={`Okul sırası: ${x.schoolRank||'—'}`}/><Button size="small" onClick={()=>openSchool(x)}>Düzenle</Button><IconButton color="error" onClick={()=>deleteSchool(x.id)}><DeleteOutline/></IconButton></Stack></Paper>)}</Stack>}</Paper>}

          {tab===4&&<Stack spacing={2}><Paper variant="outlined" sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={1}><Box><Typography variant="h6" fontWeight={950}>Tüm Deneme Sonuçları</Typography><Typography variant="body2" color="text.secondary">İlk deneme üstte, sonraki denemeler altta tarih sırasına göre gösterilir.</Typography></Box><Stack direction="row" spacing={1}><Chip sx={{bgcolor:'#16a34a',color:'#fff',fontWeight:900}} label="Doğru"/><Chip sx={{bgcolor:'#dc2626',color:'#fff',fontWeight:900}} label="Yanlış"/><Chip sx={{bgcolor:'#f59e0b',color:'#fff',fontWeight:900}} label="Boş"/></Stack></Stack><Divider sx={{my:2}}/>{allResults.length===0?<Alert severity="info">Henüz tamamlanmış deneme sonucu yok.</Alert>:<Stack spacing={1}>{allResults.map((x,i)=><Paper key={`${x.type}-${x.id}`} variant="outlined" sx={{p:1.5,borderRadius:3}}><Stack direction={{xs:'column',md:'row'}} spacing={1} alignItems={{md:'center'}}><Box sx={{flex:1}}><Typography fontWeight={950}>{i+1}. {x.name}</Typography><Typography variant="caption" color="text.secondary">{x.type} • {new Date(x.date).toLocaleDateString('tr-TR')}</Typography></Box><Chip sx={{bgcolor:'#16a34a',color:'#fff'}} label={`${x.correct.toFixed(0)} Doğru`}/><Chip sx={{bgcolor:'#dc2626',color:'#fff'}} label={`${x.wrong.toFixed(0)} Yanlış`}/><Chip sx={{bgcolor:'#f59e0b',color:'#fff'}} label={`${x.blank.toFixed(0)} Boş`}/><Chip color="primary" label={`${x.net.toFixed(2)} Net`}/>{x.type==='Okul'&&<Chip color="secondary" label={`Okul: ${x.schoolRank||'—'}`}/>}</Stack>{x.type==='Online'&&Object.keys(x.answerKey||{}).length>0&&<Box sx={{display:'grid',gridTemplateColumns:'repeat(10,minmax(30px,1fr))',gap:.5,mt:1.25}}>{Array.from({length:20},(_,q)=>q+1).map(q=>{const given=x.answers?.[q]||x.answers?.[String(q)]||'';const key=x.answerKey?.[q]||x.answerKey?.[String(q)]||'';const state=!given?'blank':given===key?'correct':'wrong';const bg=state==='correct'?'#16a34a':state==='wrong'?'#dc2626':'#f59e0b';return <Box key={q} title={`${q}. soru: ${given||'Boş'} / ${key}`} sx={{bgcolor:bg,color:'#fff',borderRadius:1,textAlign:'center',py:.5,fontWeight:900,fontSize:12}}>{q}</Box>})}</Box>}</Paper>)}<Paper sx={{p:1.5,borderRadius:3,bgcolor:'action.hover'}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Typography fontWeight={950} sx={{flex:1}}>Ortalama</Typography><Chip label={`${averages.correct.toFixed(2)} Doğru`}/><Chip label={`${averages.wrong.toFixed(2)} Yanlış`}/><Chip label={`${averages.blank.toFixed(2)} Boş`}/><Chip color="primary" label={`${averages.net.toFixed(2)} Net`}/></Stack></Paper></Stack>}</Paper><Paper variant="outlined" sx={{p:2,borderRadius:3}}><Typography variant="h6" fontWeight={950}>Son 10 Denemenin Net Grafiği</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1}}>Online ve okul denemeleri birlikte değerlendirilir.</Typography><NetLineChart items={lastTen}/></Paper></Stack>}
        </Box>
      </Paper>}
    </Stack>



    <Dialog open={homeworkOpen} onClose={()=>setHomeworkOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={950}>{homeworkForm.id?'Ödevi Düzenle':'Ödev Ver'}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField required label="Ödev başlığı" value={homeworkForm.title} onChange={e=>setHomeworkForm({...homeworkForm,title:e.target.value})}/><TextField multiline minRows={3} label="Açıklama" value={homeworkForm.description||''} onChange={e=>setHomeworkForm({...homeworkForm,description:e.target.value})}/><TextField type="date" label="Veriliş tarihi" value={homeworkForm.assignedDate||''} onChange={e=>setHomeworkForm({...homeworkForm,assignedDate:e.target.value})} InputLabelProps={{shrink:true}}/><TextField type="date" label="Teslim tarihi" value={homeworkForm.dueDate||''} onChange={e=>setHomeworkForm({...homeworkForm,dueDate:e.target.value})} InputLabelProps={{shrink:true}}/></Stack></DialogContent><DialogActions><Button onClick={()=>setHomeworkOpen(false)}>Vazgeç</Button><Button variant="contained" startIcon={<Save/>} onClick={saveHomework}>Kaydet</Button></DialogActions></Dialog>
    <Dialog open={controlOpen} onClose={()=>setControlOpen(false)} fullWidth maxWidth="xs"><DialogTitle fontWeight={950}>Ödev Kontrolü</DialogTitle><DialogContent><Typography fontWeight={900} sx={{mb:2}}>{controlHomework?.title}</Typography><Stack spacing={1}><Button variant="contained" color="success" onClick={()=>setHomeworkStatus('done')}>Yaptı</Button><Button variant="contained" color="warning" onClick={()=>setHomeworkStatus('partial')}>Kısmen Yaptı</Button><Button variant="contained" color="error" onClick={()=>setHomeworkStatus('not_done')}>Yapmadı</Button><Button variant="outlined" onClick={()=>setHomeworkStatus('pending')}>Kontrol Edilmedi</Button></Stack></DialogContent><DialogActions><Button onClick={()=>setControlOpen(false)}>Kapat</Button></DialogActions></Dialog>
    <Dialog open={allHomeworkOpen} onClose={()=>setAllHomeworkOpen(false)} fullWidth maxWidth="lg"><DialogTitle fontWeight={950}>Tüm Ödev Durumları</DialogTitle><DialogContent dividers><Stack direction={{xs:'column',sm:'row'}} spacing={1.5} sx={{mb:2}}><TextField select fullWidth label="Öğrenci" value={homeworkStudentFilter} onChange={e=>setHomeworkStudentFilter(e.target.value)}><MenuItem value="all">Tüm öğrenciler</MenuItem>{students.map(student=><MenuItem key={student.id} value={student.id}>{student.fullName}</MenuItem>)}</TextField><TextField select fullWidth label="Durum" value={homeworkStatusFilter} onChange={e=>setHomeworkStatusFilter(e.target.value)}><MenuItem value="all">Tüm durumlar</MenuItem>{Object.entries(homeworkStatuses).map(([key,value])=><MenuItem key={key} value={key}>{value.label}</MenuItem>)}</TextField></Stack>{allHomeworks.length===0?<Alert severity="info">Seçilen filtrelere uygun ödev bulunamadı.</Alert>:<Stack spacing={1}>{allHomeworks.map(item=>{const state=homeworkStatuses[item.status||'pending']||homeworkStatuses.pending;return <Paper key={`${item.studentId}-${item.id}`} variant="outlined" sx={{p:1.5,borderRadius:3,bgcolor:state.bg}}><Stack direction={{xs:'column',md:'row'}} spacing={1} alignItems={{md:'center'}}><Box sx={{minWidth:{md:180}}}><Typography fontWeight={950}>{item.studentName}</Typography></Box><Box sx={{flex:1}}><Typography fontWeight={900}>{item.title}</Typography><Typography variant="caption" color="text.secondary">Teslim: {item.dueDate?new Date(`${item.dueDate}T12:00:00`).toLocaleDateString('tr-TR'):'—'}</Typography></Box><Chip color={state.color} label={state.label}/></Stack></Paper>})}</Stack>}</DialogContent><DialogActions><Button onClick={()=>setAllHomeworkOpen(false)}>Kapat</Button></DialogActions></Dialog>
    <Dialog open={formOpen} onClose={()=>setFormOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={950}>{form.id?'Öğrenciyi Düzenle':'Özel Ders Öğrencisi Ekle'}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField required label="Ad Soyad" value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/><TextField label="Öğrenci Numarası (isteğe bağlı)" value={form.studentNumber||''} onChange={e=>setForm({...form,studentNumber:e.target.value})}/><TextField required label="Kullanıcı adı" value={form.username||''} onChange={e=>setForm({...form,username:e.target.value})}/><TextField required label="Şifre" value={form.password||''} onChange={e=>setForm({...form,password:e.target.value})}/><TextField label="Adres (zorunlu değil)" multiline minRows={2} value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})}/><TextField label="Saatlik ders ücreti (TL)" type="number" value={form.hourlyFee} onChange={e=>setForm({...form,hourlyFee:e.target.value})}/><TextField select label="Varsayılan ders süresi" value={form.lessonMinutes||60} onChange={e=>setForm({...form,lessonMinutes:Number(e.target.value)})}>{[40,60,80,90,120].map(x=><MenuItem key={x} value={x}>{x} dakika</MenuItem>)}</TextField></Stack></DialogContent><DialogActions><Button onClick={()=>setFormOpen(false)}>Vazgeç</Button><Button variant="contained" startIcon={<Save/>} onClick={saveStudent}>Kaydet</Button></DialogActions></Dialog>
    <Dialog open={dayOpen} onClose={()=>setDayOpen(false)} fullWidth maxWidth="xs"><DialogTitle fontWeight={950}>{selectedDate&&new Date(`${selectedDate}T12:00:00`).toLocaleDateString('tr-TR')}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField select label="Ders durumu" value={entry.status} onChange={e=>setEntry({...entry,status:e.target.value})}>{Object.entries(statuses).map(([k,v])=><MenuItem key={k} value={k}>{v.label}</MenuItem>)}</TextField><TextField select label="Ödeme durumu" value={entry.payment} onChange={e=>setEntry({...entry,payment:e.target.value})}><MenuItem value="paid">Ödendi</MenuItem><MenuItem value="unpaid">Ödenmedi</MenuItem></TextField><TextField type="number" label="Ders süresi (dakika)" value={entry.durationMinutes} onChange={e=>setEntry({...entry,durationMinutes:e.target.value})}/><TextField multiline minRows={2} label="Ders notu / ödev" value={entry.note||''} onChange={e=>setEntry({...entry,note:e.target.value})}/></Stack></DialogContent><DialogActions><Button color="error" onClick={deleteDay}>Kaydı Sil</Button><Box sx={{flex:1}}/><Button onClick={()=>setDayOpen(false)}>Vazgeç</Button><Button variant="contained" onClick={saveDay}>Kaydet</Button></DialogActions></Dialog>
    <Dialog open={examOpen} onClose={()=>setExamOpen(false)} fullWidth maxWidth="md"><DialogTitle fontWeight={950}>{examForm.id?'Denemeyi Düzenle':'Fen Denemesi Oluştur'}</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{pt:1}}><TextField label="Deneme adı" value={examForm.name} onChange={e=>setExamForm({...examForm,name:e.target.value})}/><Paper variant="outlined" sx={{p:2,borderRadius:3}}><Typography fontWeight={900}>Deneme Dosyası (isteğe bağlı)</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1}}>PDF, JPG, PNG veya WEBP • En fazla 20 MB</Typography><Button component="label" variant="outlined" startIcon={<UploadFile/>}>{examFile?.name||examForm.attachment?.name||'Dosya Seç'}<input hidden type="file" accept={ONLINE_EXAM_ACCEPT} onChange={e=>setExamFile(e.target.files?.[0]||null)}/></Button></Paper><Typography variant="h6" fontWeight={950}>20 Soruluk Cevap Anahtarı</Typography><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr'},gap:2}}>{[1,11].map(start=><Stack key={start} spacing={1}>{Array.from({length:10},(_,i)=>start+i).map(q=><Paper key={q} variant="outlined" sx={{p:.75,display:'grid',gridTemplateColumns:'32px repeat(4,1fr)',gap:.5,alignItems:'center'}}><b>{q}</b>{ANSWERS.map(a=><Button key={a} size="small" variant={examForm.answers?.[q]===a?'contained':'outlined'} onClick={()=>setExamForm({...examForm,answers:{...(examForm.answers||{}),[q]:a}})}>{a}</Button>)}</Paper>)}</Stack>)}</Box></Stack></DialogContent><DialogActions><Button onClick={()=>setExamOpen(false)}>Vazgeç</Button><Button variant="contained" disabled={examUploading} onClick={saveExam}>{examUploading?'Yükleniyor…':'Kaydet'}</Button></DialogActions></Dialog>
    <Dialog open={assignOpen} onClose={()=>setAssignOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={950}>{assignForm.assignmentId?'Deneme Atamasını Düzenle':'Deneme Ata'}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField select label="Deneme" value={assignForm.examId} onChange={e=>setAssignForm({...assignForm,examId:e.target.value})}>{exams.filter(e=>!e.archived).map(e=><MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}</TextField><TextField type="datetime-local" label="Başlangıç" value={assignForm.startAt} onChange={e=>setAssignForm({...assignForm,startAt:e.target.value})} InputLabelProps={{shrink:true}}/><TextField type="datetime-local" label="Bitiş" value={assignForm.endAt} onChange={e=>setAssignForm({...assignForm,endAt:e.target.value})} InputLabelProps={{shrink:true}}/></Stack></DialogContent><DialogActions><Button onClick={()=>setAssignOpen(false)}>Vazgeç</Button><Button variant="contained" onClick={assignForm.assignmentId?saveAssignmentEdit:assignExam}>{assignForm.assignmentId?'Kaydet':'Öğrenciye Gönder'}</Button></DialogActions></Dialog>
    <Dialog open={resultOpen} onClose={()=>setResultOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={950}>Online Deneme Sonucu</DialogTitle><DialogContent>{resultAssignment&&(()=>{const e=exams.find(x=>x.id===resultAssignment.examId);const r=resultValues(resultAssignment.result);return <Stack spacing={2} sx={{mt:1}}><Typography variant="h6" fontWeight={950}>{e?.name||'Deneme'}</Typography><Stack direction="row" spacing={1} flexWrap="wrap"><Chip sx={{bgcolor:'#16a34a',color:'#fff'}} label={`${r.correct} Doğru`}/><Chip sx={{bgcolor:'#dc2626',color:'#fff'}} label={`${r.wrong} Yanlış`}/><Chip sx={{bgcolor:'#f59e0b',color:'#fff'}} label={`${r.blank} Boş`}/><Chip color="primary" label={`${r.net.toFixed(2)} Net`}/></Stack><Box sx={{display:'grid',gridTemplateColumns:'repeat(10,1fr)',gap:.6}}>{Array.from({length:20},(_,i)=>i+1).map(q=>{const given=resultAssignment.answers?.[q]||resultAssignment.answers?.[String(q)]||'';const key=e?.answers?.[q]||e?.answers?.[String(q)]||'';const bg=!given?'#f59e0b':given===key?'#16a34a':'#dc2626';return <Box key={q} sx={{bgcolor:bg,color:'#fff',borderRadius:1,p:.7,textAlign:'center',fontWeight:950}}>{q}</Box>})}</Box></Stack>})()}</DialogContent><DialogActions><Button onClick={()=>setResultOpen(false)}>Kapat</Button></DialogActions></Dialog>
    <Dialog open={schoolOpen} onClose={()=>setSchoolOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={950}>{schoolForm.id?'Okul Denemesini Düzenle':'Okul Denemesi Fen Sonucu'}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField label="Deneme adı" value={schoolForm.name} onChange={e=>setSchoolForm({...schoolForm,name:e.target.value})}/><TextField type="date" label="Tarih" value={schoolForm.date} onChange={e=>setSchoolForm({...schoolForm,date:e.target.value})} InputLabelProps={{shrink:true}}/><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,1fr)'},gap:1}}><TextField type="number" label="Doğru" value={schoolForm.correct} inputProps={{min:0,max:20,step:1}} helperText={`Doğru + yanlış en fazla 20 olabilir. Kalan: ${Math.max(0,20-numeric(schoolForm.correct)-numeric(schoolForm.wrong))}`} onChange={e=>updateSchoolScore('correct',e.target.value)}/><TextField type="number" label="Yanlış" value={schoolForm.wrong} inputProps={{min:0,max:20,step:1}} helperText={`Doğru + yanlış: ${numeric(schoolForm.correct)+numeric(schoolForm.wrong)} / 20`} onChange={e=>updateSchoolScore('wrong',e.target.value)}/><TextField label="Boş" value={Math.max(0,20-numeric(schoolForm.correct)-numeric(schoolForm.wrong))} InputProps={{readOnly:true}} helperText="Otomatik hesaplanır"/><TextField label="Net" value={netOf(numeric(schoolForm.correct),numeric(schoolForm.wrong)).toFixed(2)} InputProps={{readOnly:true}} helperText="Doğru − (Yanlış ÷ 3)"/><TextField type="number" label="Okul sırası" value={schoolForm.schoolRank} inputProps={{min:0,step:1}} onChange={e=>setSchoolForm({...schoolForm,schoolRank:e.target.value})}/></Box></Stack></DialogContent><DialogActions><Button onClick={()=>setSchoolOpen(false)}>Vazgeç</Button><Button variant="contained" onClick={saveSchool}>Kaydet</Button></DialogActions></Dialog>
  </Box>
}
