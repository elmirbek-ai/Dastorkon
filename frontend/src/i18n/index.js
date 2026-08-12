import { translations } from './translations.js'

export const SUPPORTED_LANGUAGES = ['ky', 'ru']
export const DEFAULT_LANGUAGE = 'ky'
export const LANGUAGE_STORAGE_KEY = 'dastorkon_language'
const LEGACY_LANGUAGE_STORAGE_KEY = 'dastorkon_customer_language'

export function normalizeLanguage(language) {
  const normalized = String(language || '').trim().toLowerCase()
  if (normalized === 'kg' || normalized === 'ky' || normalized.startsWith('ky-')) return 'ky'
  if (normalized === 'ru' || normalized.startsWith('ru-')) return 'ru'
  return DEFAULT_LANGUAGE
}

export function getStoredLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored) return normalizeLanguage(stored)
  const legacy = window.localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY)
  if (legacy) {
    const migrated = normalizeLanguage(legacy)
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, migrated)
    return migrated
  }
  return DEFAULT_LANGUAGE
}

export function setStoredLanguage(language) {
  const normalized = normalizeLanguage(language)
  if (typeof window !== 'undefined') window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized)
  return normalized
}

function lookup(language, key) {
  return key.split('.').reduce((value, part) => value?.[part], translations[normalizeLanguage(language)])
}

export function t(language, key, params = {}) {
  const normalized = normalizeLanguage(language)
  const value = lookup(normalized, key) ?? lookup(DEFAULT_LANGUAGE, key) ?? key
  if (typeof value !== 'string') return key
  return value.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match)
}

function localizedKeys(baseField, language) {
  const suffix = normalizeLanguage(language)
  if (baseField.endsWith('_at_order')) {
    const stem = baseField.slice(0, -'_at_order'.length)
    return [`${stem}_${suffix}_at_order`, `${baseField}_${suffix}`]
  }
  return [`${baseField}_${suffix}`]
}

export function getLocalizedField(item, baseField, language) {
  if (!item) return ''
  const normalized = normalizeLanguage(language)
  const fallbackLanguage = normalized === 'ky' ? 'ru' : 'ky'
  const keys = [
    ...localizedKeys(baseField, normalized),
    ...localizedKeys(baseField, fallbackLanguage),
    baseField,
  ]
  for (const key of keys) {
    const value = item[key]
    if (value !== null && value !== undefined && String(value).trim()) return value
  }
  return ''
}

export function getStatusLabel(status, language) {
  const normalizedStatus = String(status || '').toUpperCase()
  const key = `status.${normalizedStatus}`
  const label = t(language, key)
  return label === key ? normalizedStatus : label
}

export function getRoleLabel(role, language) {
  const normalizedRole = String(role || '').toUpperCase()
  const key = `role.${normalizedRole}`
  const label = t(language, key)
  return label === key ? normalizedRole : label
}

function errorText(error) {
  const data = error?.response?.data
  if (typeof data === 'string') return data
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.error === 'string') return data.error
  if (typeof error?.message === 'string') return error.message
  return ''
}

export function getBackendErrorMessage(error, language) {
  const message = errorText(error)
  const lowered = message.toLowerCase()
  if (lowered.includes('table session has unfinished orders')) return t(language, 'errors.unfinishedOrders')
  if (lowered.includes('customer session cookie is required')) return t(language, 'errors.customerSessionRequired')
  if (!error?.response) return t(language, 'errors.network')
  if (error.response.status === 401 || error.response.status === 403) return t(language, 'errors.unauthorized')
  return t(language, 'errors.generic')
}
