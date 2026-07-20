import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Divider, IconButton, Paper, Stack, TextField, Typography } from '@mui/material'
import { Add, DeleteOutline, LocalOffer } from '@mui/icons-material'
import { supabase } from '../services/supabase'

export default function StudentProfileTagsSettings({ onError, onMessage }) {
  const [tags, setTags] = useState([])
  const [label, setLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadTags() }, [])

  async function loadTags() {
    setLoading(true)
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) { setLoading(false); return }
    await supabase.rpc('initialize_student_profile_tags')
    const { data, error } = await supabase.from('student_profile_tags').select('id,label').eq('teacher_id', authData.user.id).order('label')
    if (error) onError?.(error.message)
    else setTags(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function addTag() {
    const value = label.trim().replace(/\s+/g, ' ')
    if (!value) return onError?.('Etiket adı zorunlu.')
    if (tags.some(item => item.label.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'))) return onError?.('Bu etiket zaten var.')
    setSaving(true)
    const { data: authData } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('student_profile_tags').insert({ teacher_id: authData.user.id, label:value }).select('id,label').single()
    setSaving(false)
    if (error) return onError?.(error.message)
    setTags(current => [...current, data].sort((a,b) => a.label.localeCompare(b.label, 'tr')))
    setLabel('')
    onMessage?.(`“${value}” etiketi eklendi.`)
  }

  async function removeTag(tag) {
    if (!window.confirm(`“${tag.label}” etiketi tüm öğrenci profillerinden kaldırılsın mı?`)) return
    setSaving(true)
    let { error } = await supabase.rpc('delete_student_profile_tag', { p_tag_id:tag.id })
    if (error) {
      // Eski kurulumlarda RPC yoksa en azından etiketi katalogdan sil.
      const fallback = await supabase.from('student_profile_tags').delete().eq('id', tag.id)
      error = fallback.error
    }
    setSaving(false)
    if (error) return onError?.(error.message)
    setTags(current => current.filter(item => item.id !== tag.id))
    onMessage?.(`“${tag.label}” etiketi silindi.`)
  }

  return <Box className="glass settings-card settings-term-card">
    <Stack direction="row" spacing={1} alignItems="center" sx={{mb:1}}><LocalOffer color="primary"/><Typography variant="h6" fontWeight={900}>Öğrenci Profil Etiketleri</Typography></Stack>
    <Typography color="text.secondary" sx={{mb:2}}>Oturma bilgilerinde görünen etiketleri buradan ekleyip silebilirsin.</Typography>
    <Stack direction={{xs:'column',sm:'row'}} spacing={1.5}>
      <TextField fullWidth label="Etiket adı" placeholder="Örnek: Kapıya yakın oturmalı" value={label} onChange={e=>setLabel(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addTag() }}/>
      <Button variant="contained" startIcon={saving?<CircularProgress size={16}/>:<Add/>} onClick={addTag} disabled={saving || !label.trim()}>Etiket Ekle</Button>
    </Stack>
    <Divider sx={{my:2}}/>
    {loading ? <Box sx={{textAlign:'center',py:2}}><CircularProgress size={26}/></Box> : tags.length===0 ? <Alert severity="info">Henüz etiket yok.</Alert> : <Stack spacing={1}>{tags.map(tag=><Paper key={tag.id} variant="outlined" sx={{p:1.25,display:'flex',alignItems:'center',borderRadius:2}}><Typography fontWeight={850} sx={{flex:1}}>{tag.label}</Typography><IconButton color="error" title="Etiketi sil" onClick={()=>removeTag(tag)}><DeleteOutline/></IconButton></Paper>)}</Stack>}
  </Box>
}
