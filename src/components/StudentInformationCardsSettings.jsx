import { useEffect, useRef, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Divider, IconButton, MenuItem,
  Paper, Stack, TextField, Typography
} from '@mui/material'
import { Add, DeleteOutline, ViewAgenda } from '@mui/icons-material'
import { supabase } from '../services/supabase'
import { useSharedCloudState } from '../services/useSharedCloudState'
import {
  DEFAULT_STUDENT_PROFILE_FIELDS,
  FIELD_TYPE_LABELS,
  STUDENT_PROFILE_SCHEMA_LOCAL_KEY,
  STUDENT_PROFILE_SCHEMA_STATE_KEY,
  mergeProfileFields
} from '../utils/studentProfileSchema'

const EMPTY_FIELD = { label: '', field_type: 'text', options: '' }

export default function StudentInformationCardsSettings({ onError, onMessage }) {
  const [fields, setFields, cloudReady] = useSharedCloudState({
    stateKey: STUDENT_PROFILE_SCHEMA_STATE_KEY,
    localKey: STUDENT_PROFILE_SCHEMA_LOCAL_KEY,
    fallback: DEFAULT_STUDENT_PROFILE_FIELDS,
    onError
  })
  const [newField, setNewField] = useState(EMPTY_FIELD)
  const [saving, setSaving] = useState(false)
  const migratedRef = useRef(false)

  useEffect(() => {
    if (!cloudReady || migratedRef.current) return
    migratedRef.current = true
    migrateLegacyFields()
  }, [cloudReady]) // eslint-disable-line react-hooks/exhaustive-deps

  async function migrateLegacyFields() {
    try {
      const { data: authData } = await supabase.auth.getUser()
      const teacherId = authData.user?.id
      const [cardsResult, tagsResult] = await Promise.all([
        supabase.from('student_information_cards').select('*').order('sort_order'),
        teacherId
          ? supabase.from('student_profile_tags').select('id,label').eq('teacher_id', teacherId).order('label')
          : Promise.resolve({ data: [] })
      ])

      const legacyCards = (cardsResult.data || []).map(card => ({
        id: `legacy-card-${card.id}`,
        label: card.label,
        field_type: card.field_type || 'text',
        options: card.options || [],
        legacy_card_id: card.id
      }))
      const legacyTags = (tagsResult.data || []).map(tag => ({
        id: `legacy-tag-${tag.id}`,
        label: tag.label,
        field_type: 'checkbox',
        options: [],
        legacy_tag_id: tag.id
      }))
      const merged = mergeProfileFields(fields, legacyCards, legacyTags)
      if (JSON.stringify(merged) !== JSON.stringify(fields)) setFields(merged)
    } catch (error) {
      onError?.(error?.message || 'Eski etiketler yüklenemedi.')
    }
  }

  async function addField() {
    const label = newField.label.trim().replace(/\s+/g, ' ')
    if (!label) return onError?.('Etiket adı zorunlu.')
    if (fields.some(item => item.label.localeCompare(label, 'tr', { sensitivity: 'base' }) === 0)) {
      return onError?.('Bu etiket zaten var.')
    }

    const options = newField.field_type === 'select'
      ? newField.options.split(',').map(item => item.trim()).filter(Boolean)
      : []
    if (newField.field_type === 'select' && options.length < 2) {
      return onError?.('Seçim listesi için virgülle ayrılmış en az iki seçenek gir.')
    }

    setSaving(true)
    const field = {
      id: `profile-custom-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
      label,
      field_type: newField.field_type,
      options,
      built_in: false
    }
    setFields(current => [...current, field])
    setNewField(EMPTY_FIELD)
    setSaving(false)
    onMessage?.(`“${label}” etiketi eklendi.`)
  }

  async function removeField(field) {
    if (!window.confirm(`“${field.label}” etiketi tüm öğrenci profillerinden kaldırılsın mı?`)) return
    setSaving(true)
    try {
      if (field.legacy_card_id) {
        const result = await supabase.from('student_information_cards').delete().eq('id', field.legacy_card_id)
        if (result.error) throw result.error
      }
      if (field.legacy_tag_id) {
        let result = await supabase.rpc('delete_student_profile_tag', { p_tag_id: field.legacy_tag_id })
        if (result.error) result = await supabase.from('student_profile_tags').delete().eq('id', field.legacy_tag_id)
        if (result.error) throw result.error
      }
      setFields(current => current.filter(item => String(item.id) !== String(field.id)))
      onMessage?.(`“${field.label}” etiketi silindi.`)
    } catch (error) {
      onError?.(error?.message || 'Etiket silinemedi.')
    } finally {
      setSaving(false)
    }
  }

  return <Box className="glass settings-card settings-term-card">
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
      <ViewAgenda color="primary" />
      <Typography variant="h6" fontWeight={900}>Öğrenci Profili</Typography>
    </Stack>
    <Typography color="text.secondary" sx={{ mb: 2 }}>
      Bütün profil etiketleri tek listede tutulur. Eklediğin alanlar tüm öğrencilerde, raporlarda ve oturma planı kurallarında otomatik görünür.
    </Typography>

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 1.5 }}>
      <TextField label="Etiket adı" placeholder="Örnek: Boy uzunluğu" value={newField.label}
        onChange={event => setNewField(current => ({ ...current, label: event.target.value }))}
        onKeyDown={event => { if (event.key === 'Enter' && newField.field_type !== 'select') addField() }} />
      <TextField select label="Veri tipi" value={newField.field_type}
        onChange={event => setNewField(current => ({ ...current, field_type: event.target.value }))}>
        {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
      </TextField>
    </Box>

    {newField.field_type === 'select' && <TextField fullWidth sx={{ mt: 1.5 }} label="Seçenekler"
      placeholder="Düşük, Orta, Yüksek" helperText="Seçenekleri virgülle ayır."
      value={newField.options} onChange={event => setNewField(current => ({ ...current, options: event.target.value }))} />}

    <Button sx={{ mt: 1.5 }} variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <Add />}
      onClick={addField} disabled={saving || !newField.label.trim()}>Etiket Ekle</Button>

    <Divider sx={{ my: 2 }} />
    {!cloudReady ? <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={26} /></Box>
      : fields.length === 0 ? <Alert severity="info">Henüz profil etiketi yok.</Alert>
      : <Stack spacing={1}>{fields.map(field => <Paper key={field.id} variant="outlined"
          sx={{ p: 1.25, display: 'flex', alignItems: 'center', borderRadius: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={850}>{field.label}</Typography>
            <Typography variant="caption" color="text.secondary">
              Öğrenci Profili • {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
              {Array.isArray(field.options) && field.options.length ? ` • ${field.options.join(', ')}` : ''}
            </Typography>
          </Box>
          <IconButton color="error" title="Etiketi sil" onClick={() => removeField(field)} disabled={saving}>
            <DeleteOutline />
          </IconButton>
        </Paper>)}</Stack>}
  </Box>
}
