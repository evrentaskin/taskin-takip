export const normalizeUsername = value => String(value ?? '')
  .trim()
  .replace(/\s+/g, '')
  .toLocaleLowerCase('tr-TR')

export const toAuthSafeUsername = value => normalizeUsername(value)
  .replaceAll('ı', 'i')
  .replaceAll('ş', 's')
  .replaceAll('ğ', 'g')
  .replaceAll('ü', 'u')
  .replaceAll('ö', 'o')
  .replaceAll('ç', 'c')

export const isValidUsername = value => /^[a-z0-9._-]{1,30}$/.test(toAuthSafeUsername(value))
export const USERNAME_HELP = '1-30 karakter; harf, rakam, nokta, tire ve alt çizgi kullanılabilir.'
