import apiClient, { ADMIN_TOKEN_KEY, KITCHEN_TOKEN_KEY, WAITER_TOKEN_KEY } from '../api/client.js'
import { getStoredLanguage, t } from '../i18n/index.js'

export const roleDestinations = {
  ADMIN: '/admin/dashboard',
  WAITER: '/waiter/dashboard',
  KITCHEN: '/kitchen/orders',
}

export const roleLoginPaths = {
  ADMIN: '/login',
  WAITER: '/login',
  KITCHEN: '/login',
}

export const roleTokenKeys = {
  ADMIN: ADMIN_TOKEN_KEY,
  WAITER: WAITER_TOKEN_KEY,
  KITCHEN: KITCHEN_TOKEN_KEY,
}

function localizedWrongRole(language = getStoredLanguage()) {
  return t(language, 'auth.roleNotAllowed')
}

export function getTokenExpiryMs(token) {
  try {
    const payload = token.split('.')[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = JSON.parse(window.atob(padded))
    return Number(decoded.exp) * 1000 || 0
  } catch {
    return 0
  }
}

export async function getCurrentUser(accessToken) {
  const response = await apiClient.get('/api/auth/me/', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return response.data
}

export async function loginForRole({ username, password, expectedRole, tokenKey }) {
  const tokenResponse = await apiClient.post('/api/auth/token/', { username, password })
  const user = await getCurrentUser(tokenResponse.data.access)
  if (!user.is_active || user.role !== expectedRole) {
    const error = new Error(localizedWrongRole())
    error.code = user.is_active ? 'WRONG_ROLE' : 'INACTIVE'
    throw error
  }
  localStorage.setItem(tokenKey, tokenResponse.data.access)
  return user
}

export async function loginForStaff({ username, password }) {
  const tokenResponse = await apiClient.post('/api/auth/token/', { username, password })
  const user = await getCurrentUser(tokenResponse.data.access)

  if (!user.is_active) {
    const error = new Error(t(getStoredLanguage(), 'auth.inactive'))
    error.code = 'INACTIVE'
    throw error
  }

  const tokenKey = roleTokenKeys[user.role]
  if (!tokenKey || !roleDestinations[user.role]) {
    const error = new Error(t(getStoredLanguage(), 'auth.unsupportedRole'))
    error.code = 'UNSUPPORTED_ROLE'
    throw error
  }

  localStorage.setItem(tokenKey, tokenResponse.data.access)
  return user
}

export async function verifyRoleToken({ tokenKey, expectedRole }) {
  const token = localStorage.getItem(tokenKey)
  if (!token) return { status: 'missing' }
  if (getTokenExpiryMs(token) <= Date.now()) {
    localStorage.removeItem(tokenKey)
    return { status: 'denied', message: t(getStoredLanguage(), 'auth.sessionExpired') }
  }
  try {
    const user = await getCurrentUser(token)
    if (!user.is_active || user.role !== expectedRole) {
      localStorage.removeItem(tokenKey)
      return { status: 'denied', message: user.is_active ? localizedWrongRole() : t(getStoredLanguage(), 'auth.inactive') }
    }
    return { status: 'valid', user, expiresAt: getTokenExpiryMs(token) }
  } catch (error) {
    localStorage.removeItem(tokenKey)
    const detail = error.response?.data?.detail
    const inactive = typeof detail === 'string' && detail.toLowerCase().includes('inactive')
    return { status: 'denied', message: inactive ? t(getStoredLanguage(), 'auth.inactive') : t(getStoredLanguage(), 'auth.sessionExpired') }
  }
}

export async function verifyStaffSession() {
  const storedRoles = Object.entries(roleTokenKeys).filter(([, tokenKey]) => localStorage.getItem(tokenKey))
  if (storedRoles.length === 0) return { status: 'missing' }

  const results = await Promise.all(storedRoles.map(async ([role, tokenKey]) => ({
    role,
    result: await verifyRoleToken({ tokenKey, expectedRole: role }),
  })))
  const validSession = results.find(({ result }) => result.status === 'valid')
  if (validSession) return { ...validSession.result, role: validSession.role }

  return results.find(({ result }) => result.status === 'denied')?.result || { status: 'missing' }
}

export function staffLoginError(error, language = getStoredLanguage()) {
  if (error.code === 'UNSUPPORTED_ROLE') return t(language, 'auth.unsupportedRole')
  if (error.code === 'INACTIVE') return t(language, 'auth.inactive')
  const detail = error.response?.data?.detail
  if (typeof detail === 'string' && detail.toLowerCase().includes('inactive')) return t(language, 'auth.inactive')
  return t(language, 'auth.invalidCredentials')
}

export function roleLoginError(error, expectedRole, language = getStoredLanguage()) {
  if (error.code === 'WRONG_ROLE') return localizedWrongRole(language)
  return staffLoginError(error, language)
}
