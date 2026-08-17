export const STUDENT_PROFILE_SCHEMA_STATE_KEY = 'student-profile-schema-v3'
export const STUDENT_PROFILE_SCHEMA_LOCAL_KEY = 'taskin-student-profile-schema-v3'

export const FIELD_TYPE_LABELS = {
  checkbox: 'Evet / Hayır',
  text: 'Yazı',
  number: 'Sayı',
  date: 'Tarih',
  phone: 'Telefon',
  select: 'Seçim listesi'
}

const RAW_DEFAULT_FIELDS = [
  ['Anne adı','text'],['Baba adı','text'],['Anne telefonu','phone'],['Baba telefonu','phone'],
  ['Anne sağ','checkbox'],['Baba sağ','checkbox'],['Anne çalışıyor','checkbox'],['Baba çalışıyor','checkbox'],
  ['Kiminle yaşıyor','text'],['Kardeş sayısı','number'],['Çalışma odası var','checkbox'],['İnternet var','checkbox'],
  ['Bilgisayar var','checkbox'],['Tablet var','checkbox'],['Maddi durum','select',['Düşük','Orta','İyi']],['Kaynak desteği gerekiyor','checkbox'],
  ['Servis kullanıyor','checkbox'],['Burslu','checkbox'],['Kronik hastalık','text'],['Alerji','text'],
  ['Göz problemi','text'],['İşitme problemi','text'],['Özel ders','checkbox'],['Etüt','checkbox'],
  ['RAM','checkbox'],['Rehberlik','checkbox'],['Öğretmen notları','text'],
  ['Gözlüklü','checkbox'],['Kısa boylu','checkbox'],['Uzun boylu','checkbox'],['Çok konuşuyor','checkbox'],
  ['Çalışkan','checkbox'],['Ders desteğine ihtiyacı var','checkbox'],['Ön sırada oturmalı','checkbox']
]

export const DEFAULT_STUDENT_PROFILE_FIELDS = RAW_DEFAULT_FIELDS.map((item, index) => ({
  id: `default-${index}`,
  label: item[0],
  field_type: item[1],
  options: item[2] || [],
  built_in: true
}))

export function normalizeProfileField(field, index = 0) {
  return {
    id: String(field.id || `profile-custom-${Date.now()}-${index}`),
    label: String(field.label || '').trim(),
    field_type: FIELD_TYPE_LABELS[field.field_type] ? field.field_type : 'text',
    options: Array.isArray(field.options) ? field.options : [],
    built_in: Boolean(field.built_in),
    legacy_card_id: field.legacy_card_id || null,
    legacy_tag_id: field.legacy_tag_id || null
  }
}

export function mergeProfileFields(...groups) {
  const merged = []
  groups.flat().filter(Boolean).forEach((raw, index) => {
    const field = normalizeProfileField(raw, index)
    if (!field.label) return
    const duplicate = merged.find(item => item.label.localeCompare(field.label, 'tr', { sensitivity: 'base' }) === 0)
    if (!duplicate) merged.push(field)
  })
  return merged
}
