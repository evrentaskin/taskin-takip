import { useMemo, useState } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { Add, ArrowBack, ArrowForward, DeleteOutline, Edit, PersonAdd, Save } from '@mui/icons-material'
import { useSharedCloudState } from '../services/useSharedCloudState'

const STATE_KEY='private-lessons-v1'
const LOCAL_KEY='taskin-private-lessons-v1'
const emptyStudent={ fullName:'', address:'', hourlyFee:'', lessonMinutes:60, notes:'' }
const statuses={ done:{label:'Yapıldı',color:'#2e7d32',bg:'#e8f5e9'}, missed:{label:'Yapılmadı',color:'#c62828',bg:'#ffebee'}, makeup:{label:'Telafi yapılacak',color:'#ef6c00',bg:'#fff3e0'} }

const pad=n=>String(n).padStart(2,'0')
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const money=value=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2}).format(Number(value||0))

export default function PrivateLessonsPage(){
  const [data,setData,ready]=useSharedCloudState({stateKey:STATE_KEY,localKey:LOCAL_KEY,fallback:{students:[]}})
  const students=Array.isArray(data?.students)?data.students:[]
  const [selectedId,setSelectedId]=useState(null)
  const [formOpen,setFormOpen]=useState(false)
  const [form,setForm]=useState(emptyStudent)
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1))
  const [dayOpen,setDayOpen]=useState(false)
  const [selectedDate,setSelectedDate]=useState('')
  const [entry,setEntry]=useState({status:'done',payment:'unpaid',durationMinutes:60,note:''})
  const selected=students.find(s=>s.id===selectedId)||students[0]||null

  function saveData(nextStudents){ setData({...(data||{}),students:nextStudents}) }
  function openNew(){ setForm(emptyStudent); setFormOpen(true) }
  function openEdit(){ if(!selected)return; setForm({...selected}); setFormOpen(true) }
  function saveStudent(){
    if(!form.fullName.trim()) return
    if(form.id) saveData(students.map(s=>s.id===form.id?{...s,...form,fullName:form.fullName.trim(),hourlyFee:Number(form.hourlyFee||0),lessonMinutes:Number(form.lessonMinutes||60)}:s))
    else { const item={...form,id:crypto.randomUUID(),fullName:form.fullName.trim(),hourlyFee:Number(form.hourlyFee||0),lessonMinutes:Number(form.lessonMinutes||60),lessons:{}}; saveData([...students,item]); setSelectedId(item.id) }
    setFormOpen(false)
  }
  function removeStudent(){ if(!selected||!window.confirm(`${selected.fullName} silinsin mi?`))return; const next=students.filter(s=>s.id!==selected.id); saveData(next); setSelectedId(next[0]?.id||null) }
  function openDay(key){ if(!selected)return; const old=selected.lessons?.[key]; setSelectedDate(key); setEntry(old?{...old}:{status:'done',payment:'unpaid',durationMinutes:selected.lessonMinutes||60,note:''}); setDayOpen(true) }
  function saveDay(){ const updated={...selected,lessons:{...(selected.lessons||{}),[selectedDate]:{...entry,durationMinutes:Number(entry.durationMinutes||selected.lessonMinutes||60)}}}; saveData(students.map(s=>s.id===selected.id?updated:s)); setDayOpen(false) }
  function deleteDay(){ const lessons={...(selected.lessons||{})}; delete lessons[selectedDate]; saveData(students.map(s=>s.id===selected.id?{...s,lessons}:s)); setDayOpen(false) }

  const entries=Object.entries(selected?.lessons||{})
  const summary=useMemo(()=>{
    const done=entries.filter(([,x])=>x.status==='done')
    const unpaid=done.filter(([,x])=>x.payment!=='paid')
    const unpaidMinutes=unpaid.reduce((sum,[,x])=>sum+Number(x.durationMinutes||selected?.lessonMinutes||60),0)
    const debt=unpaid.reduce((sum,[,x])=>sum+(Number(selected?.hourlyFee||0)*Number(x.durationMinutes||selected?.lessonMinutes||60)/60),0)
    return {total:entries.length,done:done.length,makeup:entries.filter(([,x])=>x.status==='makeup').length,unpaid:unpaid.length,unpaidMinutes,debt}
  },[selectedId,students])

  const days=useMemo(()=>{
    const first=new Date(month.getFullYear(),month.getMonth(),1); const start=(first.getDay()+6)%7; const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    return [...Array(start).fill(null),...Array.from({length:count},(_,i)=>new Date(month.getFullYear(),month.getMonth(),i+1))]
  },[month])

  if(!ready) return <Box className="page"><Typography>Özel ders verileri yükleniyor…</Typography></Box>
  return <Box className="page">
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} justifyContent="space-between" sx={{mb:2}}><Box><Typography variant="h4" fontWeight={950}>Özel Dersler</Typography><Typography color="text.secondary">Ders, ödeme ve haftalık ödev takibi</Typography></Box><Button variant="contained" startIcon={<PersonAdd/>} onClick={openNew}>Öğrenci Ekle</Button></Stack>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'280px 1fr'},gap:2}}>
      <Paper className="glass" sx={{p:1.5,borderRadius:3,height:'fit-content'}}>
        <Typography fontWeight={900} sx={{mb:1}}>Öğrenciler</Typography>
        {students.length===0?<Alert severity="info">Henüz özel ders öğrencisi yok.</Alert>:<Stack spacing={1}>{students.map(s=><Button key={s.id} variant={selected?.id===s.id?'contained':'outlined'} onClick={()=>setSelectedId(s.id)} sx={{justifyContent:'flex-start'}}>{s.fullName}</Button>)}</Stack>}
      </Paper>
      {!selected?<Paper className="glass" sx={{p:3,borderRadius:3}}><Typography>Başlamak için öğrenci ekle.</Typography></Paper>:<Stack spacing={2}>
        <Paper className="glass" sx={{p:2,borderRadius:3}}><Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Box sx={{flex:1}}><Typography variant="h5" fontWeight={950}>{selected.fullName}</Typography><Typography color="text.secondary">{selected.address||'Adres girilmedi'}</Typography><Typography fontWeight={800} sx={{mt:.5}}>Saatlik ücret: {money(selected.hourlyFee)} • Ders süresi: {selected.lessonMinutes||60} dk</Typography></Box><IconButton onClick={openEdit}><Edit/></IconButton><IconButton color="error" onClick={removeStudent}><DeleteOutline/></IconButton></Stack></Paper>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'1fr 280px'},gap:2}}>
          <Paper className="glass" sx={{p:2,borderRadius:3}}>
            <Stack direction="row" alignItems="center" justifyContent="space-between"><IconButton onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ArrowBack/></IconButton><Typography fontWeight={950}>{month.toLocaleDateString('tr-TR',{month:'long',year:'numeric'})}</Typography><IconButton onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ArrowForward/></IconButton></Stack>
            <Box className="private-calendar"><>{['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(x=><Typography key={x} className="private-calendar-head">{x}</Typography>)}</>{days.map((d,i)=>{if(!d)return <Box key={`e${i}`}/>; const key=dateKey(d); const rec=selected.lessons?.[key]; const style=rec?statuses[rec.status]:null; return <Button key={key} onClick={()=>openDay(key)} className="private-calendar-day" sx={{backgroundColor:style?.bg||'transparent',color:style?.color||'inherit',borderColor:style?.color||'rgba(0,0,0,.12)'}}><b>{d.getDate()}</b>{rec&&<small>{statuses[rec.status]?.label}</small>}{rec&&<small>{rec.payment==='paid'?'Ödendi':'Ödenmedi'}</small>}</Button>})}</Box>
          </Paper>
          <Stack spacing={1.25}>
            {[['Toplam kayıt',summary.total],['Yapılan ders',summary.done],['Telafi bekleyen',summary.makeup],['Ödenmemiş ders',summary.unpaid],['Ödenmemiş süre',`${Math.floor(summary.unpaidMinutes/60)} sa ${summary.unpaidMinutes%60} dk`],['Toplam borç',money(summary.debt)]].map(([a,b])=><Paper key={a} className="glass" sx={{p:1.5,borderRadius:3}}><Typography variant="caption" color="text.secondary">{a}</Typography><Typography variant="h6" fontWeight={950}>{b}</Typography></Paper>)}
          </Stack>
        </Box>
        <Paper className="glass" sx={{p:2,borderRadius:3}}><Typography fontWeight={900} sx={{mb:1}}>Notlar / Haftalık Ödevler</Typography><TextField fullWidth multiline minRows={4} value={selected.notes||''} onChange={e=>saveData(students.map(s=>s.id===selected.id?{...s,notes:e.target.value}:s))} placeholder="Bu haftanın ödevi, işlenen konu veya öğrenci notu…"/></Paper>
      </Stack>}
    </Box>

    <Dialog open={formOpen} onClose={()=>setFormOpen(false)} fullWidth maxWidth="sm"><DialogTitle fontWeight={950}>{form.id?'Öğrenciyi Düzenle':'Özel Ders Öğrencisi Ekle'}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField required label="Ad Soyad" value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/><TextField label="Adres (isteğe bağlı)" multiline minRows={2} value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})}/><TextField label="Saatlik ders ücreti (TL)" type="number" value={form.hourlyFee} onChange={e=>setForm({...form,hourlyFee:e.target.value})}/><TextField select label="Varsayılan ders süresi" value={form.lessonMinutes||60} onChange={e=>setForm({...form,lessonMinutes:Number(e.target.value)})}>{[40,60,80,90,120].map(x=><MenuItem key={x} value={x}>{x} dakika</MenuItem>)}</TextField></Stack></DialogContent><DialogActions><Button onClick={()=>setFormOpen(false)}>Vazgeç</Button><Button variant="contained" startIcon={<Save/>} disabled={!form.fullName.trim()} onClick={saveStudent}>Kaydet</Button></DialogActions></Dialog>

    <Dialog open={dayOpen} onClose={()=>setDayOpen(false)} fullWidth maxWidth="xs"><DialogTitle fontWeight={950}>{selectedDate&&new Date(`${selectedDate}T12:00:00`).toLocaleDateString('tr-TR')}</DialogTitle><DialogContent><Stack spacing={2} sx={{mt:1}}><TextField select label="Ders durumu" value={entry.status} onChange={e=>setEntry({...entry,status:e.target.value})}>{Object.entries(statuses).map(([k,v])=><MenuItem key={k} value={k}>{v.label}</MenuItem>)}</TextField><TextField select label="Ödeme durumu" value={entry.payment} onChange={e=>setEntry({...entry,payment:e.target.value})}><MenuItem value="paid">Ödendi</MenuItem><MenuItem value="unpaid">Ödenmedi</MenuItem></TextField><TextField type="number" label="Ders süresi (dakika)" value={entry.durationMinutes} onChange={e=>setEntry({...entry,durationMinutes:e.target.value})}/><TextField multiline minRows={2} label="Ders notu / ödev" value={entry.note||''} onChange={e=>setEntry({...entry,note:e.target.value})}/></Stack></DialogContent><DialogActions><Button color="error" onClick={deleteDay}>Kaydı Sil</Button><Box sx={{flex:1}}/><Button onClick={()=>setDayOpen(false)}>Vazgeç</Button><Button variant="contained" onClick={saveDay}>Kaydet</Button></DialogActions></Dialog>
  </Box>
}
