import apiClient from '../api/client.js'
import { getStoredLanguage, t } from '../i18n/index.js'

export const roleDestinations = {
  ADMIN: '/admin/dashboard',
  WAITER: '/waiter/dashboard',
  KITCHEN: '/kitchen/orders',
}

export const roleLoginPaths = {
  ADMIN: '/admin/login',
  WAITER: '/waiter/login',
  KITCHEN: '/kitchen/login',
}

function localizedWrongRole(language = getStoredLanguage()) {
  return t(language, 'auth.roleNotAllowed')
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

export async function verifyRoleToken({ tokenKey, expectedRole }) {
  const token = localStorage.getItem(tokenKey)
  if (!token) return { status: 'missing' }
  try {
    const user = await getCurrentUser(token)
    if (!user.is_active || user.role !== expectedRole) {
      localStorage.removeItem(tokenKey)
      return { status: 'denied', message: user.is_active ? localizedWrongRole() : t(getStoredLanguage(), 'auth.inactive') }
    }
    return { status: 'valid', user }
  } catch (error) {
    localStorage.removeItem(tokenKey)
    const detail = error.response?.data?.detail
    const inactive = typeof detail === 'string' && detail.toLowerCase().includes('inactive')
    return { status: 'denied', message: inactive ? t(getStoredLanguage(), 'auth.inactive') : t(getStoredLanguage(), 'auth.sessionExpired') }
  }
}

export function roleLoginError(error, expectedRole, language = getStoredLanguage()) {
  if (error.code === 'WRONG_ROLE') return localizedWrongRole(language)
  if (error.code === 'INACTIVE') return t(language, 'auth.inactive')
  const detail = error.response?.data?.detail
  if (typeof detail === 'string' && detail.toLowerCase().includes('inactive')) return t(language, 'auth.inactive')
  if (typeof detail === 'string' && detail.toLowerCase().includes('no active account')) {
    return t(language, 'auth.invalidCredentials')
  }
  return t(language, 'auth.invalidCredentials')
}
