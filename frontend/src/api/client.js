import axios from 'axios'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

export function resolveApiAssetUrl(value) {
  if (!value || value.startsWith('data:')) return value || ''

  try {
    const resolvedUrl = new URL(value, `${API_BASE_URL || window.location.origin}/`)
    const isLocalBackendUrl = (
      !API_BASE_URL
      && resolvedUrl.port === '8000'
      && ['127.0.0.1', 'localhost'].includes(resolvedUrl.hostname)
    )
    if (isLocalBackendUrl) {
      return new URL(
        `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`,
        window.location.origin,
      ).href
    }
    return resolvedUrl.href
  } catch {
    return value
  }
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

export const KITCHEN_TOKEN_KEY = 'kitchen_access_token'

export const kitchenApiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

kitchenApiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(KITCHEN_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const WAITER_TOKEN_KEY = 'waiter_access_token'

export const waiterApiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

waiterApiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(WAITER_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const ADMIN_TOKEN_KEY = 'admin_access_token'

export const adminApiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

adminApiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default apiClient
