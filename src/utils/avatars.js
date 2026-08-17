export const AVATARS = [
  ...Array.from({ length: 8 }, (_, i) => ({ id:i + 1, gender:'girl', glasses:false, variant:i, src:`/avatars/girl_${String(i + 1).padStart(2, '0')}.png`, label:`Kız Avatar ${i + 1}` })),
  ...Array.from({ length: 8 }, (_, i) => ({ id:i + 9, gender:'girl', glasses:true, variant:i, src:`/avatars/girl_glasses_${String(i + 1).padStart(2, '0')}.png`, label:`Gözlüklü Kız Avatar ${i + 1}` })),
  ...Array.from({ length: 8 }, (_, i) => ({ id:i + 17, gender:'boy', glasses:false, variant:i, src:`/avatars/boy_${String(i + 1).padStart(2, '0')}.png`, label:`Erkek Avatar ${i + 1}` })),
  ...Array.from({ length: 8 }, (_, i) => ({ id:i + 25, gender:'boy', glasses:true, variant:i, src:`/avatars/boy_glasses_${String(i + 1).padStart(2, '0')}.png`, label:`Gözlüklü Erkek Avatar ${i + 1}` }))
]

export function normalizeGender(value) {
  const text = String(value || '').trim().toLocaleLowerCase('tr-TR')
  if (['kız', 'kiz', 'female', 'girl'].includes(text)) return 'girl'
  if (['erkek', 'male', 'boy'].includes(text)) return 'boy'
  return ''
}

export function avatarPool(gender, wearsGlasses) {
  const normalized = normalizeGender(gender)
  if (!normalized) return AVATARS
  return AVATARS.filter(item => item.gender === normalized && item.glasses === Boolean(wearsGlasses))
}

function stableIndex(student, length) {
  const seed = `${student?.id || ''}|${student?.student_number || ''}|${student?.first_name || ''}|${student?.last_name || ''}`
  let hash = 0
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return Math.abs(hash) % Math.max(1, length)
}

export function automaticAvatarId(student, gender, wearsGlasses) {
  const pool = avatarPool(gender, wearsGlasses)
  return pool[stableIndex(student, pool.length)]?.id || AVATARS[0].id
}

export function leastUsedAvatarId(usage = {}, gender, wearsGlasses, excludeId = null, student = null) {
  const pool = avatarPool(gender, wearsGlasses).filter(item => item.id !== Number(excludeId))
  if (!pool.length) return automaticAvatarId(student, gender, wearsGlasses)
  const minimum = Math.min(...pool.map(item => Number(usage[item.id] || 0)))
  const leastUsed = pool.filter(item => Number(usage[item.id] || 0) === minimum)
  return leastUsed[stableIndex(student, leastUsed.length)]?.id || leastUsed[0].id
}

export function pairedAvatarId(currentId, gender, wearsGlasses, usage = {}, student = null) {
  const current = AVATARS.find(item => item.id === Number(currentId))
  const normalized = normalizeGender(gender)
  if (current && current.gender === normalized) {
    const pair = AVATARS.find(item => item.gender === normalized && item.glasses === Boolean(wearsGlasses) && item.variant === current.variant)
    if (pair) return pair.id
  }
  return leastUsedAvatarId(usage, normalized, wearsGlasses, null, student)
}

export function nextAvatarId(currentId, gender, wearsGlasses, usage = {}, student = null) {
  return leastUsedAvatarId(usage, gender, wearsGlasses, currentId, student)
}

export function avatarMatches(currentId, gender, wearsGlasses) {
  return avatarPool(gender, wearsGlasses).some(item => item.id === Number(currentId))
}

export function avatarIdFor(student) {
  const explicit = Number(student?.avatar_id)
  if (AVATARS.some(item => item.id === explicit)) return explicit
  return automaticAvatarId(student, student?.gender, Boolean(student?.wears_glasses))
}

export function avatarSrc(student) {
  return AVATARS.find(item => item.id === avatarIdFor(student))?.src || AVATARS[0].src
}
