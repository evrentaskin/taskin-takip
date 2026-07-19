import { supabase } from './supabase'

export const ONLINE_EXAM_BUCKET = 'online-exam-files'
export const ONLINE_EXAM_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp'
export const MAX_ONLINE_EXAM_FILE_BYTES = 20 * 1024 * 1024

const safeName = name => String(name || 'deneme-dosyasi')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-').replace(/^-|-$/g, '') || 'deneme-dosyasi'

export function validateOnlineExamFile(file) {
  if (!file) return ''
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) return 'Yalnızca PDF, JPG, PNG veya WEBP yükleyebilirsin.'
  if (file.size > MAX_ONLINE_EXAM_FILE_BYTES) return 'Dosya boyutu en fazla 20 MB olabilir.'
  return ''
}

export async function uploadOnlineExamFile(file, examType, examId) {
  const validation = validateOnlineExamFile(file)
  if (validation) throw new Error(validation)
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const path = `${examType}/${examId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(ONLINE_EXAM_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type
  })
  if (error) throw error
  return { bucket: ONLINE_EXAM_BUCKET, path, name: safeName(file.name), mimeType: file.type, size: file.size }
}

export async function removeOnlineExamFile(attachment) {
  if (!attachment?.path) return
  const { error } = await supabase.storage.from(attachment.bucket || ONLINE_EXAM_BUCKET).remove([attachment.path])
  if (error) throw error
}

export async function openOnlineExamFile(attachment, { download = false } = {}) {
  if (!attachment?.path) throw new Error('Deneme dosyası bulunamadı.')
  const options = download ? { download: attachment.name || 'deneme-dosyasi' } : undefined
  const { data, error } = await supabase.storage
    .from(attachment.bucket || ONLINE_EXAM_BUCKET)
    .createSignedUrl(attachment.path, 120, options)
  if (error) throw error
  const popup = window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  if (!popup) window.location.href = data.signedUrl
}
