import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Avatar, Box, Button, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack, TextField, Typography
} from '@mui/material'
import { Close, Save } from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { AVATARS, avatarMatches, leastUsedAvatarId, pairedAvatarId } from '../utils/avatars'
import { useSharedCloudState } from '../services/useSharedCloudState'
import {
  DEFAULT_STUDENT_PROFILE_FIELDS,
  STUDENT_PROFILE_SCHEMA_LOCAL_KEY,
  STUDENT_PROFILE_SCHEMA_STATE_KEY,
  mergeProfileFields
} from '../utils/studentProfileSchema'

export default function StudentProfileDialog({ open, student, seatingCards = [], onClose, onSaved }) {
  const [profile, setProfile] = useState({ tags:[], recognition_data:{}, notes:'', gender:'', wears_glasses:false })
  const [legacyCards, setLegacyCards] = useState([])
  const [schema] = useSharedCloudState({
    stateKey: STUDENT_PROFILE_SCHEMA_STATE_KEY,
    localKey: STUDENT_PROFILE_SCHEMA_LOCAL_KEY,
    fallback: DEFAULT_STUDENT_PROFILE_FIELDS,
    readOnly: true,
    onError: error => setError(error?.message || 'Profil etiketleri yüklenemedi.')
  })
  const [avatarId, setAvatarId] = useState(1)
  const [avatarUsage, setAvatarUsage] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open && student) load() }, [open, student?.id])

  async function load() {
    setError('')
    const [{ data:p, error:e }, { data:c }, { data:studentRows }] = await Promise.all([
      supabase.from('student_profiles').select('*').eq('student_id', student.id).maybeSingle(),
      supabase.from('student_information_cards').select('*').order('sort_order'),
      supabase.from('students').select('id,avatar_id').eq('is_active', true)
    ])
    if (e) { setError(e.message); return }
    const loaded = { tags:[], recognition_data:{}, notes:'', gender:'', wears_glasses:false, ...(p || {}) }
    loaded.gender = loaded.gender === 'girl' || loaded.gender === 'Kız' ? 'female' : loaded.gender === 'boy' || loaded.gender === 'Erkek' ? 'male' : loaded.gender
    loaded.wears_glasses = Boolean(loaded.wears_glasses || (loaded.tags || []).includes('Gözlüklü'))
    setProfile(loaded)
    setLegacyCards((c || []).map(card => ({ ...card, id:String(card.id), legacy_card_id:card.id })))
    const usage = (studentRows || []).reduce((acc, row) => {
      const id = Number(row.avatar_id)
      if (id && row.id !== student.id) acc[id] = (acc[id] || 0) + 1
      return acc
    }, {})
    setAvatarUsage(usage)
    const gender = loaded.gender === 'female' ? 'girl' : 'boy'
    setAvatarId(
      avatarMatches(student.avatar_id, gender, loaded.wears_glasses)
        ? Number(student.avatar_id)
        : leastUsedAvatarId(usage, gender, loaded.wears_glasses, null, student)
    )
  }

  const fields = useMemo(() => {
    const legacyTags = seatingCards.map(tag => ({
      id:`legacy-tag-${tag.id}`,
      label:tag.label,
      field_type:'checkbox',
      options:[]
    }))
    return mergeProfileFields(schema, legacyCards, legacyTags)
  }, [schema, legacyCards, seatingCards])

  function valueFor(field) {
    const data = profile.recognition_data || {}
    if (Object.prototype.hasOwnProperty.call(data, field.id)) return data[field.id]
    if (field.legacy_card_id && Object.prototype.hasOwnProperty.call(data, field.legacy_card_id)) return data[field.legacy_card_id]
    if (field.field_type === 'checkbox') return (profile.tags || []).includes(field.label)
    return ''
  }

  function setValue(field, value) {
    setProfile(current => {
      const nextData = { ...(current.recognition_data || {}), [field.id]:value }
      let nextTags = current.tags || []
      if (field.field_type === 'checkbox') {
        nextTags = value
          ? [...new Set([...nextTags, field.label])]
          : nextTags.filter(item => item !== field.label)
      }
      const next = { ...current, recognition_data:nextData, tags:nextTags }
      if (field.label === 'Gözlüklü') next.wears_glasses = Boolean(value)
      return next
    })
    if (field.label === 'Gözlüklü') {
      setAvatarId(current => pairedAvatarId(current, profile.gender === 'female' ? 'girl' : 'boy', Boolean(value), avatarUsage, student))
    }
  }

  function changeGender(gender) {
    setProfile(p => ({ ...p, gender }))
    setAvatarId(current => leastUsedAvatarId(avatarUsage, gender === 'female' ? 'girl' : 'boy', profile.wears_glasses, current, student))
  }

  function changeGlasses(checked) {
    setProfile(current => {
      const tags = current.tags || []
      return {
        ...current,
        wears_glasses:checked,
        tags:checked ? [...new Set([...tags, 'Gözlüklü'])] : tags.filter(x => x !== 'Gözlüklü')
      }
    })
    setAvatarId(current => pairedAvatarId(current, profile.gender === 'female' ? 'girl' : 'boy', checked, avatarUsage, student))
  }


  async function save() {
    setSaving(true)
    const tags = profile.tags || []
    const data = profile.recognition_data || {}
    const checked = label => tags.includes(label) || fields.some(field => field.label === label && Boolean(data[field.id]))
    const payload = {
      ...profile,
      gender: profile.gender === 'girl' || profile.gender === 'Kız' ? 'female' : profile.gender === 'boy' || profile.gender === 'Erkek' ? 'male' : profile.gender,
      student_id:student.id,
      wears_glasses:Boolean(profile.wears_glasses || checked('Gözlüklü')),
      height_group:checked('Kısa boylu') ? 'short' : checked('Uzun boylu') ? 'tall' : 'normal',
      talkative:checked('Çok konuşuyor'),
      hardworking:checked('Çalışkan'),
      needs_support:checked('Ders desteğine ihtiyacı var'),
      front_row:checked('Ön sırada oturmalı'),
      updated_at:new Date().toISOString()
    }
    delete payload.created_at

    const { error:profileError } = await supabase.from('student_profiles').upsert(payload, { onConflict:'student_id' })
    if (!profileError) {
      const { error:studentError } = await supabase.from('students').update({ avatar_id:avatarId }).eq('id', student.id)
      if (studentError) { setSaving(false); setError(studentError.message); return }
    }
    setSaving(false)
    if (profileError) setError(profileError.message)
    else { onSaved?.(); onClose() }
  }

  const avatar = AVATARS.find(item => item.id === avatarId) || AVATARS[0]

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle fontWeight={950}>
      Öğrenci Profili — {student?.first_name} {student?.last_name}
      <IconButton onClick={onClose} sx={{ position:'absolute', right:8, top:8 }}><Close /></IconButton>
    </DialogTitle>
    <DialogContent>
      {error && <Alert severity="error" sx={{ mb:2 }}>{error}</Alert>}
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p:2, borderRadius:3 }}>
          <Typography fontWeight={900} sx={{ mb:1.5 }}>Temel Bilgiler</Typography>
          <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ sm:'center' }}>
            <Box className="student-profile-avatar-frame"><Avatar src={avatar.src} imgProps={{ style:{ objectFit:'cover', objectPosition:'center' } }} sx={{ width:'100%', height:'100%' }} /></Box>
            <Box sx={{ flex:1, display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr' }, gap:1.5 }}>
              <TextField select label="Cinsiyet" value={profile.gender || ''} onChange={e => changeGender(e.target.value)}>
                <MenuItem value="female">Kız</MenuItem><MenuItem value="male">Erkek</MenuItem>
              </TextField>
              <FormControlLabel control={<Checkbox checked={Boolean(profile.wears_glasses)} onChange={e => changeGlasses(e.target.checked)} />} label="Gözlük kullanıyor" />
            </Box>
          </Stack>
        </Paper>

        <Box>
          <Typography fontWeight={950} sx={{ mb:1 }}>Profil Etiketleri ve Bilgileri</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb:1.5 }}>
            Ayarlarda tanımlanan bütün alanlar burada tek bölümde görünür.
          </Typography>
          {fields.length === 0 ? <Alert severity="info">Ayarlar bölümünden öğrenci profili etiketi ekleyebilirsin.</Alert>
            : <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr' }, gap:1.5 }}>
              {fields.filter(field => field.label !== 'Gözlüklü').map(field =>
                <Paper key={field.id} variant="outlined" sx={{ p:1.25, borderRadius:2 }}>
                  <Field card={field} value={valueFor(field)} setValue={value => setValue(field, value)} />
                </Paper>)}
            </Box>}
        </Box>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Vazgeç</Button>
      <Button variant="contained" startIcon={<Save />} onClick={save} disabled={saving || !profile.gender}>Kaydet</Button>
    </DialogActions>
  </Dialog>
}

function Field({ card, value, setValue }) {
  if (card.field_type === 'checkbox') return <FormControlLabel control={<Checkbox checked={Boolean(value)} onChange={e => setValue(e.target.checked)} />} label={card.label} />
  if (card.field_type === 'select') return <TextField fullWidth select label={card.label} value={value || ''} onChange={e => setValue(e.target.value)}>{(card.options || []).map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
  const type = card.field_type === 'phone' ? 'tel' : card.field_type === 'number' ? 'number' : card.field_type === 'date' ? 'date' : 'text'
  return <TextField fullWidth label={card.label} type={type} inputProps={card.field_type === 'number' ? { inputMode:'numeric', step:'any' } : undefined}
    InputLabelProps={card.field_type === 'date' ? { shrink:true } : undefined}
    multiline={card.label === 'Öğretmen notları'} minRows={card.label === 'Öğretmen notları' ? 3 : undefined}
    value={value ?? ''} onChange={e => setValue(e.target.value)} />
}
