import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Divider, IconButton, MenuItem,
  Paper, Stack, TextField, Typography
} from '@mui/material'
import { Add, DeleteOutline, ViewAgenda } from '@mui/icons-material'
import { supabase } from '../services/supabase'

const EMPTY_CARD = { label: '', group_name: 'recognition', field_type: 'checkbox', options: '' }

const FIELD_TYPE_LABELS = {
  checkbox: 'Evet / Hayır',
  text: 'Yazı',
  number: 'Sayı',
  date: 'Tarih',
  phone: 'Telefon',
  select: 'Seçim listesi'
}

const GROUP_LABELS = {
  seating: 'Oturma Bilgileri',
  recognition: 'Öğrenci Tanıma'
}

export default function StudentInformationCardsSettings({ onError, onMessage }) {
  const [cards, setCards] = useState([])
  const [newCard, setNewCard] = useState(EMPTY_CARD)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadCards() }, [])

  async function loadCards() {
    setLoading(true)
    const { data, error } = await supabase
      .from('student_information_cards')
      .select('*')
      .order('sort_order')

    if (error) onError?.(error.message)
    else setCards(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function addCard() {
    const label = newCard.label.trim()
    if (!label) return onError?.('Bilgi kartı adı zorunlu.')

    const options = newCard.field_type === 'select'
      ? newCard.options.split(',').map(item => item.trim()).filter(Boolean)
      : []

    if (newCard.field_type === 'select' && options.length < 2) {
      return onError?.('Seçim listesi için virgülle ayrılmış en az iki seçenek gir.')
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('student_information_cards')
      .insert({
        label,
        group_name: newCard.group_name,
        field_type: newCard.field_type,
        options,
        sort_order: cards.length
      })
      .select()
      .single()

    setSaving(false)
    if (error) return onError?.(error.message)

    setCards(current => [...current, data])
    setNewCard(EMPTY_CARD)
    onMessage?.(`“${label}” bilgi kartı eklendi.`)
  }

  async function removeCard(card) {
    if (!window.confirm(`“${card.label}” bilgi kartı tüm öğrencilerden silinsin mi?`)) return

    const { error } = await supabase
      .from('student_information_cards')
      .delete()
      .eq('id', card.id)

    if (error) return onError?.(error.message)

    setCards(current => current.filter(item => item.id !== card.id))
    onMessage?.(`“${card.label}” bilgi kartı silindi.`)
  }

  return (
    <Box className="glass settings-card settings-term-card">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <ViewAgenda color="primary" />
        <Typography variant="h6" fontWeight={900}>Öğrenci Bilgi Kartları</Typography>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Öğrenci profillerinde kullanılacak özel bilgi alanlarını buradan ekleyip silebilirsin. Yönetim düğmesi öğrenci profillerinde gösterilmez.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, gap: 1.5 }}>
        <TextField
          label="Kart adı"
          placeholder="Örnek: Boy (cm)"
          value={newCard.label}
          onChange={event => setNewCard(current => ({ ...current, label: event.target.value }))}
        />
        <TextField
          select
          label="Bölüm"
          value={newCard.group_name}
          onChange={event => setNewCard(current => ({ ...current, group_name: event.target.value }))}
        >
          <MenuItem value="recognition">Öğrenci Tanıma</MenuItem>
          <MenuItem value="seating">Oturma Bilgileri</MenuItem>
        </TextField>
        <TextField
          select
          label="Veri tipi"
          value={newCard.field_type}
          onChange={event => setNewCard(current => ({ ...current, field_type: event.target.value }))}
        >
          {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>{label}</MenuItem>
          ))}
        </TextField>
      </Box>

      {newCard.field_type === 'select' && (
        <TextField
          fullWidth
          sx={{ mt: 1.5 }}
          label="Seçenekler"
          placeholder="Düşük, Orta, İyi"
          helperText="Seçenekleri virgülle ayır."
          value={newCard.options}
          onChange={event => setNewCard(current => ({ ...current, options: event.target.value }))}
        />
      )}

      <Button
        sx={{ mt: 1.5 }}
        variant="contained"
        startIcon={saving ? <CircularProgress size={16} /> : <Add />}
        onClick={addCard}
        disabled={saving || !newCard.label.trim()}
      >
        Bilgi Kartı Ekle
      </Button>

      <Divider sx={{ my: 2 }} />

      {loading ? (
        <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={26} /></Box>
      ) : cards.length === 0 ? (
        <Alert severity="info">Henüz özel bilgi kartı eklenmemiş.</Alert>
      ) : (
        <Stack spacing={1}>
          {cards.map(card => (
            <Paper key={card.id} variant="outlined" sx={{ p: 1.25, display: 'flex', alignItems: 'center', borderRadius: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontWeight={850}>{card.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {GROUP_LABELS[card.group_name] || card.group_name} • {FIELD_TYPE_LABELS[card.field_type] || card.field_type}
                  {Array.isArray(card.options) && card.options.length ? ` • ${card.options.join(', ')}` : ''}
                </Typography>
              </Box>
              <IconButton color="error" title="Bilgi kartını sil" onClick={() => removeCard(card)}>
                <DeleteOutline />
              </IconButton>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  )
}
