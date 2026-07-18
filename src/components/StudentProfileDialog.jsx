import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Avatar, Box, Button, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Paper, Stack,
  Tab, Tabs, TextField, Typography
} from '@mui/material'
import { Add, Autorenew, Close, Delete, Save, Settings } from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { AVATARS, automaticAvatarId, avatarMatches, nextAvatarId } from '../utils/avatars'

const DEFAULT_CARDS = [
  ['Anne adı','recognition','text'],['Baba adı','recognition','text'],['Anne telefonu','recognition','phone'],['Baba telefonu','recognition','phone'],
  ['Anne sağ','recognition','checkbox'],['Baba sağ','recognition','checkbox'],['Anne çalışıyor','recognition','checkbox'],['Baba çalışıyor','recognition','checkbox'],
  ['Kiminle yaşıyor','recognition','text'],['Kardeş sayısı','recognition','number'],['Çalışma odası var','recognition','checkbox'],['İnternet var','recognition','checkbox'],
  ['Bilgisayar var','recognition','checkbox'],['Tablet var','recognition','checkbox'],['Maddi durum','recognition','select'],['Kaynak desteği gerekiyor','recognition','checkbox'],
  ['Servis kullanıyor','recognition','checkbox'],['Burslu','recognition','checkbox'],['Kronik hastalık','recognition','text'],['Alerji','recognition','text'],
  ['Göz problemi','recognition','text'],['İşitme problemi','recognition','text'],['Özel ders','recognition','checkbox'],['Etüt','recognition','checkbox'],
  ['RAM','recognition','checkbox'],['Rehberlik','recognition','checkbox'],['Öğretmen notları','recognition','text']
].map((x,i)=>({ id:`default-${i}`, label:x[0], group_name:x[1], field_type:x[2], options:x[0]==='Maddi durum'?['Düşük','Orta','İyi']:[] }))

export default function StudentProfileDialog({ open, student, seatingCards, onClose, onSaved }) {
  const [tab, setTab] = useState(0)
  const [profile, setProfile] = useState({ tags:[], recognition_data:{}, notes:'', gender:'', wears_glasses:false })
  const [cards, setCards] = useState(DEFAULT_CARDS)
  const [avatarId, setAvatarId] = useState(1)
  const [manage, setManage] = useState(false)
  const [newCard, setNewCard] = useState({ label:'', group_name:'recognition', field_type:'checkbox', options:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open && student) load() }, [open, student?.id])

  async function load() {
    setError('')
    const [{ data:p, error:e }, { data:c }] = await Promise.all([
      supabase.from('student_profiles').select('*').eq('student_id', student.id).maybeSingle(),
      supabase.from('student_information_cards').select('*').order('sort_order')
    ])
    if (e) { setError(e.message); return }
    const loaded = { tags:[], recognition_data:{}, notes:'', gender:'', wears_glasses:false, ...(p || {}) }
    // Eski avatar değerlerini veritabanının kabul ettiği standart değerlere dönüştür.
    loaded.gender = loaded.gender === 'girl' || loaded.gender === 'Kız' ? 'female' : loaded.gender === 'boy' || loaded.gender === 'Erkek' ? 'male' : loaded.gender
    loaded.wears_glasses = Boolean(loaded.wears_glasses || (loaded.tags || []).includes('Gözlüklü'))
    setProfile(loaded)
    setAvatarId(
      avatarMatches(student.avatar_id, loaded.gender === 'female' ? 'girl' : 'boy', loaded.wears_glasses)
        ? Number(student.avatar_id)
        : automaticAvatarId(student, loaded.gender === 'female' ? 'girl' : 'boy', loaded.wears_glasses)
    )
    if (c?.length) setCards(c)
  }

  const recognition = useMemo(() => cards.filter(x => x.group_name === 'recognition'), [cards])

  function setValue(id, value) {
    setProfile(p => ({ ...p, recognition_data:{ ...(p.recognition_data || {}), [id]:value } }))
  }

  function toggleTag(label) {
    setProfile(p => ({
      ...p,
      tags:(p.tags || []).includes(label) ? p.tags.filter(x => x !== label) : [...(p.tags || []), label]
    }))
  }

  function changeGender(gender) {
    setProfile(p => ({ ...p, gender }))
    setAvatarId(automaticAvatarId(student, gender === 'female' ? 'girl' : 'boy', profile.wears_glasses))
  }

  function changeGlasses(checked) {
    setProfile(p => {
      const tags = p.tags || []
      const nextTags = checked
        ? [...new Set([...tags, 'Gözlüklü'])]
        : tags.filter(x => x !== 'Gözlüklü')
      return { ...p, wears_glasses:checked, tags:nextTags }
    })
    setAvatarId(automaticAvatarId(student, profile.gender === 'female' ? 'girl' : 'boy', checked))
  }

  function refreshAvatar() {
    setAvatarId(current => nextAvatarId(current, profile.gender === 'female' ? 'girl' : 'boy', profile.wears_glasses))
  }

  async function save() {
    setSaving(true)
    const tags = profile.tags || []
    const has = label => tags.includes(label)
    const payload = {
      ...profile,
      gender: profile.gender === 'girl' || profile.gender === 'Kız' ? 'female' : profile.gender === 'boy' || profile.gender === 'Erkek' ? 'male' : profile.gender,
      student_id:student.id,
      wears_glasses:Boolean(profile.wears_glasses),
      height_group:has('Kısa boylu') ? 'short' : has('Uzun boylu') ? 'tall' : 'normal',
      talkative:has('Çok konuşuyor'),
      hardworking:has('Çalışkan'),
      needs_support:has('Ders desteğine ihtiyacı var'),
      front_row:has('Ön sırada oturmalı'),
      updated_at:new Date().toISOString()
    }
    delete payload.created_at

    const { error:profileError } = await supabase
      .from('student_profiles')
      .upsert(payload, { onConflict:'student_id' })

    if (!profileError) {
      const { error:studentError } = await supabase
        .from('students')
        .update({ avatar_id:avatarId })
        .eq('id', student.id)
      if (studentError) {
        setSaving(false)
        setError(studentError.message)
        return
      }
    }

    setSaving(false)
    if (profileError) setError(profileError.message)
    else { onSaved?.(); onClose() }
  }

  async function addCard() {
    if (!newCard.label.trim()) return
    const options = newCard.field_type === 'select'
      ? newCard.options.split(',').map(x => x.trim()).filter(Boolean)
      : []
    const { data, error } = await supabase
      .from('student_information_cards')
      .insert({ ...newCard, label:newCard.label.trim(), options })
      .select().single()
    if (error) { setError(error.message); return }
    setCards(x => [...x, data])
    setNewCard({ label:'', group_name:'recognition', field_type:'checkbox', options:'' })
  }

  async function removeCard(card) {
    if (!confirm(`“${card.label}” bilgi kartı tüm öğrencilerden silinsin mi?`)) return
    const { error } = await supabase.from('student_information_cards').delete().eq('id', card.id)
    if (error) setError(error.message)
    else setCards(x => x.filter(y => y.id !== card.id))
  }

  const avatar = AVATARS.find(item => item.id === avatarId) || AVATARS[0]

  return <>
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle fontWeight={950}>
        Öğrenci Profili — {student?.first_name} {student?.last_name}
        <IconButton onClick={onClose} sx={{ position:'absolute', right:8, top:8 }}><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb:2 }}>{error}</Alert>}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Tabs value={tab} onChange={(_,v) => setTab(v)}>
            <Tab label="Oturma Bilgileri" />
            <Tab label="Öğrenci Tanıma" />
          </Tabs>
          <Button startIcon={<Settings />} onClick={() => setManage(true)}>Bilgi Kartı Yönetimi</Button>
        </Stack>
        <Divider sx={{ mb:2 }} />

        {tab === 0 ? <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p:2, borderRadius:3 }}>
            <Typography fontWeight={900} sx={{ mb:1.5 }}>Otomatik Avatar</Typography>
            <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ sm:'center' }}>
              <Avatar src={avatar.src} sx={{ width:82, height:82 }} />
              <Box sx={{ flex:1, display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr' }, gap:1.5 }}>
                <TextField select label="Cinsiyet" value={profile.gender || ''} onChange={e => changeGender(e.target.value)}>
                  <MenuItem value="female">Kız</MenuItem>
                  <MenuItem value="male">Erkek</MenuItem>
                </TextField>
                <FormControlLabel
                  control={<Checkbox checked={Boolean(profile.wears_glasses)} onChange={e => changeGlasses(e.target.checked)} />}
                  label="Gözlük kullanıyor"
                />
              </Box>
              <Button variant="outlined" startIcon={<Autorenew />} onClick={refreshAvatar} disabled={!profile.gender}>
                Avatarı Yenile
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt:1 }}>
              Avatar; cinsiyet ve gözlük bilgisine göre seçilir. Yenileme yalnızca uygun gruptaki saç ve yüz görünümünü değiştirir.
            </Typography>
          </Paper>

          <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr' }, gap:1 }}>
            {seatingCards.filter(card => card.label !== 'Gözlüklü').map(card =>
              <Paper key={card.id} variant="outlined" sx={{ p:1, borderRadius:2 }}>
                <FormControlLabel
                  control={<Checkbox checked={(profile.tags || []).includes(card.label)} onChange={() => toggleTag(card.label)} />}
                  label={card.label}
                />
              </Paper>
            )}
          </Box>
        </Stack> :
          <Stack spacing={2}>
            {recognition.map(card => <Field key={card.id} card={card} value={(profile.recognition_data || {})[card.id]} setValue={setValue} />)}
          </Stack>
        }
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" startIcon={<Save />} onClick={save} disabled={saving || !profile.gender}>Kaydet</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={manage} onClose={() => setManage(false)} fullWidth maxWidth="sm">
      <DialogTitle>Bilgi Kartı Yönetimi</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt:1 }}>
          <TextField label="Kart adı" value={newCard.label} onChange={e => setNewCard(x => ({ ...x, label:e.target.value }))} />
          <TextField select label="Grup" value={newCard.group_name} onChange={e => setNewCard(x => ({ ...x, group_name:e.target.value }))}>
            <MenuItem value="seating">Oturma Bilgileri</MenuItem>
            <MenuItem value="recognition">Öğrenci Tanıma</MenuItem>
          </TextField>
          <TextField select label="Veri tipi" value={newCard.field_type} onChange={e => setNewCard(x => ({ ...x, field_type:e.target.value }))}>
            {['checkbox','text','number','date','phone','select'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
          </TextField>
          {newCard.field_type === 'select' &&
            <TextField label="Seçenekler (virgülle)" value={newCard.options} onChange={e => setNewCard(x => ({ ...x, options:e.target.value }))} />
          }
          <Button variant="contained" startIcon={<Add />} onClick={addCard}>Bilgi Kartı Ekle</Button>
          <Divider />
          {cards.filter(x => !String(x.id).startsWith('default-')).map(card =>
            <Paper key={card.id} variant="outlined" sx={{ p:1, display:'flex', alignItems:'center' }}>
              <Box sx={{ flex:1 }}>
                <b>{card.label}</b>
                <Typography variant="caption" display="block">{card.group_name} • {card.field_type}</Typography>
              </Box>
              <IconButton color="error" onClick={() => removeCard(card)}><Delete /></IconButton>
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={() => setManage(false)}>Kapat</Button></DialogActions>
    </Dialog>
  </>
}

function Field({ card, value, setValue }) {
  if (card.field_type === 'checkbox') return <FormControlLabel control={<Checkbox checked={Boolean(value)} onChange={e => setValue(card.id, e.target.checked)} />} label={card.label} />
  if (card.field_type === 'select') return <TextField select label={card.label} value={value || ''} onChange={e => setValue(card.id, e.target.value)}>{(card.options || []).map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
  return <TextField label={card.label} type={card.field_type === 'phone' ? 'tel' : card.field_type} multiline={card.label === 'Öğretmen notları'} minRows={card.label === 'Öğretmen notları' ? 3 : undefined} value={value || ''} onChange={e => setValue(card.id, e.target.value)} />
}
