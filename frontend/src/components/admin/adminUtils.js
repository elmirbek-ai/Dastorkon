export const orderStatusLabels = {
  NEW: 'Жаңы',
  PREPARING: 'Даярдалууда',
  READY: 'Даяр',
  DELIVERED: 'Жеткирилди',
  COMPLETED: 'Жабылды',
  CANCELLED: 'Жокко чыгарылды',
}

export const roleLabels = {
  ADMIN: 'Админ',
  WAITER: 'Официант',
  KITCHEN: 'Ашкана',
}

const apiErrorTranslations = {
  'category must belong to the same restaurant': 'Категория ушул ресторанга тиешелүү болушу керек.',
  'table has an active session': 'Бул столдо активдүү сессия бар.',
  'you cannot deactivate your own account': 'Өз аккаунтуңузду өчүрө албайсыз.',
  'restaurant not found': 'Ресторан табылган жок.',
  'order not found': 'Заказ табылган жок.',
  'this field is required': 'Бул талаа милдеттүү.',
  'a user with that username already exists': 'Бул username менен аккаунт мурунтан бар.',
  'passwords do not match': 'Паролдор дал келген жок.',
  'user is inactive': 'Бул аккаунт өчүрүлгөн.',
  'the fields restaurant, number must make a unique set': 'Мындай номердеги стол мурунтан бар.',
  'invalid input': 'Берилген маалымат туура эмес.',
  'the submitted data was not a file. check the encoding type on the form': 'Сүрөт файлы туура жөнөтүлгөн жок.',
  'upload a valid image. the file you uploaded was either not an image or a corrupted image': 'Жарактуу сүрөт файлын тандаңыз.',
  'no file was submitted': 'Сүрөт файлы тандалган жок.',
  'a valid number is required': 'Бааны сан менен туура жазыңыз.',
  'select a valid choice. that choice is not one of the available choices': 'Туура категорияны тандаңыз.',
}

function collectMessages(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectMessages)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectMessages)
  return []
}

function translateMessage(message) {
  const trimmed = message.trim()
  const key = trimmed.toLowerCase().replace(/[.!?]+$/, '')
  if (apiErrorTranslations[key]) return apiErrorTranslations[key]
  if (key.includes('not found')) return 'Суралган маалымат табылган жок.'
  if (key.includes('permission') || key.includes('not allowed') || key.includes('forbidden')) return 'Бул аракетке уруксат жок.'
  if (key.includes('authentication') || key.includes('token') || key.includes('unauthorized')) return 'Сессияңыз аяктады. Кайра кириңиз.'
  return trimmed
}

export function extractAdminError(error, fallback = 'Аракет аткарылган жок. Кайра аракет кылыңыз.') {
  const messages = collectMessages(error.response?.data)
  if (!messages.length) return fallback
  return [...new Set(messages.map(translateMessage))].join(' ')
}

export function formatAdminMoney(value, currency = 'сом') {
  const amount = Number(value ?? 0)
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ${currency}`
}

export function formatAdminDate(value, withTime = true) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ky-KG', {
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value))
}

export function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function adminImageUrl(value) {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  const base = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  return `${base.replace(/\/$/, '')}/${value.replace(/^\//, '')}`
}
