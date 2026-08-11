import apiClient from '../api/client.js'

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

export const wrongRoleMessages = {
  ADMIN: 'Бул аккаунт админ панели үчүн эмес.',
  WAITER: 'Бул аккаунт официант панели үчүн эмес.',
  KITCHEN: 'Бул аккаунт ашкана панели үчүн эмес.',
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
    const error = new Error(wrongRoleMessages[expectedRole])
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
      return { status: 'denied', message: user.is_active ? wrongRoleMessages[expectedRole] : 'Бул аккаунт өчүрүлгөн.' }
    }
    return { status: 'valid', user }
  } catch (error) {
    localStorage.removeItem(tokenKey)
    const detail = error.response?.data?.detail
    const inactive = typeof detail === 'string' && detail.toLowerCase().includes('inactive')
    return { status: 'denied', message: inactive ? 'Бул аккаунт өчүрүлгөн.' : 'Сессияңыз аяктады. Кайра кириңиз.' }
  }
}

export function roleLoginError(error, expectedRole) {
  if (error.code === 'WRONG_ROLE') return wrongRoleMessages[expectedRole]
  if (error.code === 'INACTIVE') return 'Бул аккаунт өчүрүлгөн.'
  const detail = error.response?.data?.detail
  if (typeof detail === 'string' && detail.toLowerCase().includes('inactive')) return 'Бул аккаунт өчүрүлгөн.'
  if (typeof detail === 'string' && detail.toLowerCase().includes('no active account')) {
    return 'Логин же пароль туура эмес же аккаунт өчүрүлгөн.'
  }
  return 'Логин же пароль туура эмес.'
}
