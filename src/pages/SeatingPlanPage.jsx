import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { Add, AutoAwesome, Delete, Lock, LockOpen, Print, Save } from '@mui/icons-material'
import { supabase } from '../services/supabase'

const defaults = { orientation: 'landscape', columns: [5,5,5,5], seats: {}, locked_students: [], school_name: '', school_year: '' }
const rulesDefault = { glassesFront:true, shortFront:true, tallBack:true, separateTalkative:true, mixedGender:true, pairSupport:true }
const deskId = (c,r) => `${c}-${r}`
const seatId = (c,r,side) => `${c}-${r}-${side}`
const normalize = value => String(value || '').trim().toLocaleLowerCase('tr-TR')
const EMPTY_SEAT = '__TASKIN_EMPTY_SEAT__'

function migrateLegacySeats(seats = {}) {
  const migrated = {}
  Object.entries(seats || {}).forEach(([key, value]) => {
    const parts = key.split('-')
    if (parts.length === 2) migrated[`${key}-0`] = value
    else migrated[key] = value
  })
  return migrated
}

export default function SeatingPlanPage(){
  const [classes,setClasses]=useState([]), [classId,setClassId]=useState(''), [students,setStudents]=useState([]), [profiles,setProfiles]=useState({})
  const [plan,setPlan]=useState(defaults), [rules,setRules]=useState(rulesDefault), [loading,setLoading]=useState(true), [message,setMessage]=useState('')
  const [selectedStudentId,setSelectedStudentId]=useState('')
  const [touchTargetSeat,setTouchTargetSeat]=useState('')
  const printRef=useRef(null)
  const touchDrag=useRef(null)
  useEffect(()=>{loadClasses()},[])
  useEffect(()=>{if(classId) loadClass()},[classId])

  async function loadClasses(){
    const {data:u}=await supabase.auth.getUser(); if(!u.user)return
    const [{data:all},{data:active}]=await Promise.all([
      supabase.from('classes').select('id,name,sort_order').order('sort_order'),
      supabase.from('teacher_active_classes').select('class_id').eq('teacher_id',u.user.id)
    ])
    const ids=new Set((active||[]).map(x=>x.class_id)); const list=ids.size?(all||[]).filter(x=>ids.has(x.id)):(all||[])
    setClasses(list); setClassId(list[0]?.id||''); setLoading(false)
  }

  async function loadClass(){
    setLoading(true); const {data:u}=await supabase.auth.getUser()
    const [{data:ss},{data:pp},{data:sp}]=await Promise.all([
      supabase.from('students').select('id,student_number,first_name,last_name').eq('class_id',classId).eq('is_active',true).order('student_number'),
      supabase.from('student_profiles').select('*'),
      supabase.from('seating_plans').select('*').eq('teacher_id',u.user.id).eq('class_id',classId).eq('name','Normal Düzen').maybeSingle()
    ])
    setStudents(ss||[])
    setProfiles(Object.fromEntries((pp||[]).map(x=>[x.student_id,x])))
    setPlan(sp ? {...defaults,...sp,seats:migrateLegacySeats(sp.seats)} : {...defaults,seats:{}})
    setLoading(false)
  }

  const studentById=useMemo(()=>Object.fromEntries(students.map(s=>[s.id,s])),[students])
  const placed=new Set(Object.values(plan.seats||{}).filter(value=>value && value!==EMPTY_SEAT))
  const unplaced=students.filter(s=>!placed.has(s.id))
  const className=classes.find(x=>x.id===classId)?.name||''

  function setSeat(id,studentId){setPlan(p=>({...p,seats:{...p.seats,[id]:studentId||null}}))}
  function moveStudent(studentId,targetSeatId,sourceSeatId=''){
    if(!studentId||!targetSeatId)return
    setPlan(p=>{
      const seats={...p.seats}
      const previousTarget=seats[targetSeatId]
      Object.keys(seats).forEach(k=>{if(seats[k]===studentId)seats[k]=null})
      seats[targetSeatId]=studentId
      if(previousTarget && previousTarget!==EMPTY_SEAT && sourceSeatId && sourceSeatId!==targetSeatId) seats[sourceSeatId]=previousTarget
      return {...p,seats}
    })
    setSelectedStudentId('')
  }
  function dropStudent(e,id){
    e.preventDefault(); const sid=e.dataTransfer.getData('studentId'); if(!sid)return
    moveStudent(sid,id,e.dataTransfer.getData('sourceSeatId'))
  }
  function beginDrag(e,studentId,sourceSeatId=''){
    e.dataTransfer.setData('studentId',studentId)
    e.dataTransfer.setData('sourceSeatId',sourceSeatId)
    e.dataTransfer.effectAllowed='move'
  }
  function beginTouch(e,studentId,sourceSeatId=''){
    const touch=e.touches?.[0]
    if(!touch)return
    touchDrag.current={studentId,sourceSeatId}
    setSelectedStudentId(studentId)
    setTouchTargetSeat('')
  }
  function moveTouch(e){
    if(!touchDrag.current)return
    const touch=e.touches?.[0]
    if(!touch)return
    e.preventDefault()
    const target=document.elementFromPoint(touch.clientX,touch.clientY)?.closest?.('[data-seat-id]')
    setTouchTargetSeat(target?.dataset?.seatId||'')
  }
  function endTouch(e){
    const drag=touchDrag.current
    if(!drag)return
    const touch=e.changedTouches?.[0]
    const target=touch ? document.elementFromPoint(touch.clientX,touch.clientY)?.closest?.('[data-seat-id]') : null
    const targetId=target?.dataset?.seatId||touchTargetSeat
    if(targetId) moveStudent(drag.studentId,targetId,drag.sourceSeatId)
    touchDrag.current=null
    setTouchTargetSeat('')
  }
  function chooseSeat(id){
    if(selectedStudentId) moveStudent(selectedStudentId,id,'')
  }
  function reserveEmpty(id){
    const current=plan.seats[id]
    if(current && current!==EMPTY_SEAT) setSelectedStudentId(current)
    setSeat(id,EMPTY_SEAT)
  }

  function addColumn(){setPlan(p=>({...p,columns:[...p.columns,5]}))}
  function removeColumn(i){
    setPlan(p=>{
      const cols=p.columns.filter((_,x)=>x!==i), seats={}
      Object.entries(p.seats).forEach(([k,v])=>{
        const [c,r,side]=k.split('-').map(Number)
        if(c<i)seats[k]=v
        else if(c>i)seats[seatId(c-1,r,side||0)]=v
      })
      return {...p,columns:cols,seats}
    })
  }
  function rows(i,n){setPlan(p=>({...p,columns:p.columns.map((x,j)=>j===i?Math.max(1,Math.min(12,Number(n)||1)):x)}))}

  function profileHas(studentId, ...labels){
    const pr=profiles[studentId]||{}
    const tags=(pr.tags||[]).map(normalize)
    return labels.some(label=>tags.includes(normalize(label)))
  }
  function property(studentId,key){
    const pr=profiles[studentId]||{}
    if(key==='glasses') return !!pr.wears_glasses || profileHas(studentId,'Gözlüklü')
    if(key==='short') return pr.height_group==='short' || profileHas(studentId,'Kısa boylu')
    if(key==='tall') return pr.height_group==='tall' || profileHas(studentId,'Uzun boylu')
    if(key==='talkative') return !!pr.talkative || profileHas(studentId,'Çok konuşuyor')
    if(key==='hardworking') return !!pr.hardworking || profileHas(studentId,'Çalışkan')
    if(key==='support') return !!pr.needs_support || profileHas(studentId,'Ders desteğine ihtiyacı var','Ders çalışmıyor')
    if(key==='front') return !!pr.front_row || profileHas(studentId,'Ön sırada oturmalı')
    return false
  }
  function score(student,position,pairMate){
    const pr=profiles[student.id]||{}
    let value=Math.random()*3
    const front=position.row/(position.max-1||1)
    if(rules.glassesFront&&property(student.id,'glasses'))value+=(1-front)*10
    if(rules.shortFront&&property(student.id,'short'))value+=(1-front)*9
    if(rules.tallBack&&property(student.id,'tall'))value+=front*7
    if(property(student.id,'front'))value+=(1-front)*20
    if(pairMate){
      if(rules.separateTalkative&&property(student.id,'talkative')&&property(pairMate.id,'talkative'))value-=30
      if(rules.mixedGender&&pr.gender&&(profiles[pairMate.id]||{}).gender===pr.gender)value-=8
      if(rules.pairSupport&&((property(student.id,'hardworking')&&property(pairMate.id,'support'))||(property(student.id,'support')&&property(pairMate.id,'hardworking'))))value+=15
    }
    return value
  }

  function smartDistribute(){
    const locked=new Set(plan.locked_students||[]), seats={...plan.seats}
    const fixed=new Set(Object.entries(seats).filter(([,sid])=>locked.has(sid)).map(([,sid])=>sid))
    Object.keys(seats).forEach(k=>{if(seats[k]!==EMPTY_SEAT && !fixed.has(seats[k]))seats[k]=null})
    let pool=students.filter(s=>!fixed.has(s.id))
    const positions=[]
    plan.columns.forEach((count,c)=>Array.from({length:count}).forEach((_,r)=>{
      positions.push({id:seatId(c,r,0),col:c,row:r,side:0,max:count})
      positions.push({id:seatId(c,r,1),col:c,row:r,side:1,max:count})
    }))
    positions.forEach(pos=>{
      if(seats[pos.id])return
      const pairId=seats[seatId(pos.col,pos.row,pos.side===0?1:0)]
      const pairMate=studentById[pairId]
      pool.sort((a,b)=>score(b,pos,pairMate)-score(a,pos,pairMate))
      const chosen=pool.shift(); if(chosen)seats[pos.id]=chosen.id
    })
    setPlan(p=>({...p,seats}))
  }

  async function save(){
    const {data:u}=await supabase.auth.getUser()
    const payload={teacher_id:u.user.id,class_id:classId,name:'Normal Düzen',orientation:plan.orientation,columns:plan.columns,seats:plan.seats,locked_students:plan.locked_students,school_name:plan.school_name,school_year:plan.school_year,updated_at:new Date().toISOString()}
    const {error}=await supabase.from('seating_plans').upsert(payload,{onConflict:'teacher_id,class_id,name'})
    setMessage(error?error.message:'Oturma planı kaydedildi.')
  }
  function print(){
    let style=document.getElementById('taskin-print-page')
    if(!style){style=document.createElement('style');style.id='taskin-print-page';document.head.appendChild(style)}
    style.textContent=`@page { size: A4 ${plan.orientation}; margin: 0; }`
    window.print()
  }
  function toggleLock(studentId){
    if(!studentId)return
    setPlan(p=>({...p,locked_students:(p.locked_students||[]).includes(studentId)?p.locked_students.filter(x=>x!==studentId):[...(p.locked_students||[]),studentId]}))
  }

  function Seat({id}){
    const sid=plan.seats[id], reserved=sid===EMPTY_SEAT, st=studentById[sid], locked=(plan.locked_students||[]).includes(sid)
    return <div data-seat-id={id} className={`desk-seat ${st?'occupied':''} ${reserved?'reserved-empty':''} ${touchTargetSeat===id?'touch-drop-target':''}`} onClick={()=>chooseSeat(id)} onDragOver={e=>e.preventDefault()} onDrop={e=>dropStudent(e,id)}>
      {st?<>
        <div className={`seat-student ${selectedStudentId===st.id?'selected':''}`} draggable onClick={e=>{e.stopPropagation();setSelectedStudentId(st.id)}} onDragStart={e=>beginDrag(e,st.id,id)} onTouchStart={e=>beginTouch(e,st.id,id)} onTouchMove={moveTouch} onTouchEnd={endTouch}>{st.first_name} {st.last_name}<small>{st.student_number}</small></div>
        <button className="seat-lock" title={locked?'Sabitlemeyi kaldır':'Öğrenciyi sabitle'} onClick={e=>{e.stopPropagation();toggleLock(sid)}}>{locked?<Lock/>:<LockOpen/>}</button>
        <button className="seat-remove" title="Koltuktan kaldır" onClick={e=>{e.stopPropagation();setSeat(id,null)}}>×</button>
        <button className="seat-empty" title="Bu koltuğu boş bırak" onClick={e=>{e.stopPropagation();reserveEmpty(id)}}>Boş bırak</button>
      </>:reserved?<>
        <span className="reserved-label">Boş bırakıldı</span>
        <button className="seat-enable" onClick={e=>{e.stopPropagation();setSeat(id,null)}}>Kullan</button>
      </>:<>
        <span>{selectedStudentId?'Buraya yerleştir':'Boş'}</span>
        <button className="seat-empty empty-seat-action" onClick={e=>{e.stopPropagation();reserveEmpty(id)}}>Boş bırak</button>
      </>}
    </div>
  }

  if(loading)return <Box className="loader compact"><CircularProgress/></Box>
  return <Box>
    <Box className="page-head"><Box><Typography variant="h4" fontWeight={950}>Oturma Planı</Typography><Typography color="text.secondary">Her sırada iki öğrenci, akıllı dağıtım ve tek sayfa çıktı.</Typography></Box><Stack direction="row" spacing={1}><Button startIcon={<Save/>} variant="contained" onClick={save}>Kaydet</Button><Button startIcon={<Print/>} variant="outlined" onClick={print}>Yazdır / PDF</Button></Stack></Box>
    {message&&<Alert sx={{mb:2}} onClose={()=>setMessage('')}>{message}</Alert>}
    <Paper className="seating-toolbar" variant="outlined"><TextField select label="Sınıf" value={classId} onChange={e=>setClassId(e.target.value)}>{classes.map(c=><MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}</TextField><TextField label="Okul adı" value={plan.school_name} onChange={e=>setPlan(p=>({...p,school_name:e.target.value}))}/><TextField label="Eğitim yılı" value={plan.school_year} onChange={e=>setPlan(p=>({...p,school_year:e.target.value}))}/><TextField select label="Sayfa" value={plan.orientation} onChange={e=>setPlan(p=>({...p,orientation:e.target.value}))}><MenuItem value="landscape">Yatay</MenuItem><MenuItem value="portrait">Dikey</MenuItem></TextField></Paper>
    <Paper className="seating-rules" variant="outlined"><Typography fontWeight={900}>Akıllı dağıtım kuralları</Typography><Stack direction="row" flexWrap="wrap">{[['glassesFront','Gözlüklüler önde'],['shortFront','Kısa boylular önde'],['tallBack','Uzun boylular arkada'],['separateTalkative','Çok konuşanları ayır'],['mixedGender','Kız-erkek yan yana'],['pairSupport','Çalışkan-destek eşleştir']].map(([k,l])=><FormControlLabel key={k} control={<Checkbox checked={rules[k]} onChange={e=>setRules(r=>({...r,[k]:e.target.checked}))}/>} label={l}/>)}</Stack><Button variant="contained" color="secondary" startIcon={<AutoAwesome/>} onClick={smartDistribute}>Akıllı Dağıt</Button></Paper>
    <Box className="seating-workspace"><Paper className="student-pool" variant="outlined"><Typography fontWeight={900}>Yerleştirilmemiş Öğrenciler ({unplaced.length})</Typography><Typography variant="caption" color="text.secondary">Telefonda öğrenciyi sürükleyin veya öğrenciye dokunup koltuğu seçin.</Typography>{unplaced.map(s=><Chip className={selectedStudentId===s.id?'selected-student-chip':''} draggable onClick={()=>setSelectedStudentId(s.id)} onDragStart={e=>beginDrag(e,s.id)} onTouchStart={e=>beginTouch(e,s.id)} onTouchMove={moveTouch} onTouchEnd={endTouch} key={s.id} label={`${s.student_number} ${s.first_name} ${s.last_name}`} />)}</Paper>
      <Paper ref={printRef} className={`seating-print ${plan.orientation}`} variant="outlined"><div className="print-title"><b>{plan.school_name||'OKUL ADI'}</b><span>{className} SINIFI OTURMA PLANI</span><small>{plan.school_year} • {new Date().toLocaleDateString('tr-TR')}</small></div><div className="board">AKILLI TAHTA</div><div className="teacher-desk">ÖĞRETMEN MASASI</div><div className="seat-columns">{plan.columns.map((count,c)=><div className="seat-column" key={c}><div className="column-tools"><TextField size="small" type="number" label="Sıra" value={count} onChange={e=>rows(c,e.target.value)}/><Button size="small" color="error" onClick={()=>removeColumn(c)}><Delete/></Button></div>{Array.from({length:count}).map((_,r)=><div className="double-desk" key={deskId(c,r)}><Seat id={seatId(c,r,0)}/><Seat id={seatId(c,r,1)}/></div>)}</div>)}<Button className="add-column" startIcon={<Add/>} onClick={addColumn}>Sütun Ekle</Button></div></Paper></Box>
  </Box>
}
