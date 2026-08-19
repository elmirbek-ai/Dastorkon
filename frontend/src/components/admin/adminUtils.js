export function extractAdminError(error, fallback, language = getStoredLanguage()) {
  const localized = getBackendErrorMessage(error, language)
  return localized || fallback
}

export function formatAdminMoney(value, currency = 'сом') {
  const amount = Number(value ?? 0)
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ${currency}`
}

export function formatAdminDate(value, withTime = true) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(getStoredLanguage() === 'ru' ? 'ru-RU' : 'ky-KG', {
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
  return resolveApiAssetUrl(value)
}
import { getBackendErrorMessage, getStoredLanguage } from '../../i18n/index.js'
import { resolveApiAssetUrl } from '../../api/client.js'
