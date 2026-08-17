import * as XLSX from 'xlsx'

export const YEARLY_PLAN_GRADES = ['5', '6', '7', '8']
export const YEARLY_PLAN_STATE_KEY = 'science-yearly-plans-v1'
export const YEARLY_PLAN_LOCAL_KEY = 'taskin_science_yearly_plans_v1'

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[İIıi]/g, 'i')
    .replace(/[Şş]/g, 's')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .replace(/[^a-z0-9]/g, '')
}

function asIsoDate(value) {
  if (value == null || value === '') return ''

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }

  const text = String(value).trim()
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`

  const tr = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (tr) return `${tr[3]}-${tr[2].padStart(2, '0')}-${tr[1].padStart(2, '0')}`

  const parsedDate = new Date(text)
  if (!Number.isNaN(parsedDate.getTime())) {
    return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`
  }
  return ''
}

export function parseYearlyPlanWorkbook(file, grade) {
  return file.arrayBuffer().then(buffer => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) throw new Error('Excel dosyasında okunabilir bir sayfa bulunamadı.')

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })
    if (!rows.length) throw new Error('Excel dosyasında veri bulunamadı.')

    const entries = rows.map((row, index) => {
      const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]))
      const startDate = asIsoDate(normalized.haftabaslangic || normalized.baslangictarihi || normalized.baslangic || normalized.tarih)
      const endDate = asIsoDate(normalized.haftabitis || normalized.bitistarihi || normalized.bitis) || startDate
      const unit = String(normalized.unite || normalized.konu || '').trim()
      const outcome = String(normalized.kazanim || normalized.kazanimlar || '').trim()

      if (!startDate && !endDate && !unit && !outcome) return null
      if (!startDate) throw new Error(`${index + 2}. satırda Hafta Başlangıç tarihi eksik veya geçersiz.`)
      if (!outcome) throw new Error(`${index + 2}. satırda Kazanım alanı boş.`)
      if (endDate < startDate) throw new Error(`${index + 2}. satırda Hafta Bitiş tarihi başlangıçtan önce.`)

      return {
        id: `${grade}-${startDate}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        grade: String(grade),
        startDate,
        endDate,
        unit,
        outcome
      }
    }).filter(Boolean)

    if (!entries.length) throw new Error('Geçerli yıllık plan satırı bulunamadı.')
    return entries.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate))
  })
}

export function formatPlanDateRange(startDate, endDate) {
  const formatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  const start = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate || startDate}T12:00:00`)
  if (startDate === endDate) return formatter.format(start)
  return `${formatter.format(start)} – ${formatter.format(end)}`
}

export function todayIso() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function currentPlanIndex(entries, dateIso = todayIso()) {
  if (!entries.length) return -1
  const exact = entries.findIndex(item => item.startDate <= dateIso && item.endDate >= dateIso)
  if (exact >= 0) return exact

  const future = entries.findIndex(item => item.startDate > dateIso)
  if (future === 0) return 0
  if (future > 0) return future - 1
  return entries.length - 1
}
