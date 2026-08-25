import { translations } from './translations.js'

export const SUPPORTED_LANGUAGES = ['ky', 'ru']
export const DEFAULT_LANGUAGE = 'ky'
export const LANGUAGE_STORAGE_KEY = 'dastorkon_language'
const LEGACY_LANGUAGE_STORAGE_KEY = 'dastorkon_customer_language'
const DEFAULT_ORDER_SOURCE = 'CUSTOMER_QR'

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
  if (typeof key !== 'string' || !key.trim()) return undefined
  return key.split('.').reduce((value, part) => value?.[part], translations[normalizeLanguage(language)])
}

export function t(language, key, params = {}) {
  const normalized = normalizeLanguage(language)
  const value = lookup(normalized, key) ?? lookup(DEFAULT_LANGUAGE, key) ?? key
  if (typeof value !== 'string') return typeof key === 'string' ? key : ''
  const safeParams = params && typeof params === 'object' ? params : {}
  return value.replace(/\{(\w+)\}/g, (match, name) => safeParams[name] ?? match)
}

function localizedKeys(baseField, language) {
  if (typeof baseField !== 'string' || !baseField) return []
  const suffix = normalizeLanguage(language)
  if (baseField.endsWith('_at_order')) {
    const stem = baseField.slice(0, -'_at_order'.length)
    return [`${stem}_${suffix}_at_order`, `${baseField}_${suffix}`]
  }
  return [`${baseField}_${suffix}`]
}

export function getLocalizedField(item, baseField, language) {
  if (!item || typeof item !== 'object' || typeof baseField !== 'string' || !baseField) return ''
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

export function getOrderSourceLabel(source, language) {
  const normalizedSource = String(source || DEFAULT_ORDER_SOURCE).toUpperCase()
  const key = `orderSource.${normalizedSource}`
  const label = t(language, key)
  return label === key ? normalizedSource : label
}

function firstErrorText(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstErrorText(item)
      if (message) return message
    }
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const message = firstErrorText(item)
      if (message) return message
    }
  }
  return ''
}

function errorText(error) {
  const responseMessage = firstErrorText(error?.response?.data)
  if (responseMessage) return responseMessage
  if (typeof error?.message === 'string') return error.message
  return ''
}

export function getBackendErrorMessage(error, language) {
  const message = errorText(error)
  const lowered = message.toLowerCase()
  if (lowered.includes('table session has unfinished orders')) return t(language, 'errors.unfinishedOrders')
  if (lowered.includes('table session is assigned to another waiter')) return t(language, 'errors.tableAssignedToAnotherWaiter')
  if (lowered.includes('active waiter shift is required') || lowered.includes('waiter has no active shift')) return t(language, 'errors.activeWaiterShiftRequired')
  if (lowered.includes('table not found or inactive')) return t(language, 'errors.manualOrderTableUnavailable')
  if (lowered.includes('customer session cookie is required')) return t(language, 'errors.customerSessionRequired')
  if (lowered.includes('menu item is unavailable')) return t(language, 'errors.menuItemUnavailable')
  if (lowered.includes('modifier option is unavailable') || lowered.includes('modifier group is unavailable')) return t(language, 'errors.modifierUnavailable')
  if (lowered.includes('modifier') || lowered.includes('required modifier group')) return t(language, 'errors.modifierInvalid')
  if (!error?.response) return t(language, 'errors.network')
  if (error.response.status === 401 || error.response.status === 403) return t(language, 'errors.unauthorized')
  return t(language, 'errors.generic')
}
