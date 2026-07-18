export const AVATARS = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  src: `/avatars/avatar-${String(i + 1).padStart(2, '0')}.png`,
  label: `Avatar ${i + 1}`
}))

// 1-6: kız gözlüksüz, 7-12: kız gözlüklü
// 13-18: erkek gözlüksüz, 19-24: erkek gözlüklü
const POOLS = {
  girl_plain: [1, 2, 3, 4, 5, 6],
  girl_glasses: [7, 8, 9, 10, 11, 12],
  boy_plain: [13, 14, 15, 16, 17, 18],
  boy_glasses: [19, 20, 21, 22, 23, 24]
}

export function normalizeGender(value) {
  const text = String(value || '').trim().toLocaleLowerCase('tr-TR')
  if (['kız', 'kiz', 'female', 'girl'].includes(text)) return 'girl'
  if (['erkek', 'male', 'boy'].includes(text)) return 'boy'
  return ''
}

export function avatarPool(gender, wearsGlasses) {
  const normalized = normalizeGender(gender)
  if (!normalized) return AVATARS.map(item => item.id)
  return POOLS[`${normalized}_${wearsGlasses ? 'glasses' : 'plain'}`]
}

function stableIndex(student, length) {
  const seed = `${student?.id || ''}|${student?.student_number || ''}|${student?.first_name || ''}|${student?.last_name || ''}`
  let hash = 0
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return Math.abs(hash) % Math.max(1, length)
}

export function automaticAvatarId(student, gender, wearsGlasses) {
  const pool = avatarPool(gender, wearsGlasses)
  return pool[stableIndex(student, pool.length)]
}

export function nextAvatarId(currentId, gender, wearsGlasses) {
  const pool = avatarPool(gender, wearsGlasses)
  const currentIndex = pool.indexOf(Number(currentId))
  return pool[(currentIndex + 1 + pool.length) % pool.length]
}

export function avatarMatches(currentId, gender, wearsGlasses) {
  return avatarPool(gender, wearsGlasses).includes(Number(currentId))
}

export function avatarIdFor(student) {
  const explicit = Number(student?.avatar_id)
  if (explicit >= 1 && explicit <= AVATARS.length) return explicit
  return automaticAvatarId(student, student?.gender, Boolean(student?.wears_glasses))
}

export function avatarSrc(student) {
  return AVATARS[avatarIdFor(student) - 1].src
}
