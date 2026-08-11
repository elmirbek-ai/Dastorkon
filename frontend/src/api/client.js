import axios from 'axios'

const apiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  withCredentials: true,
})

export const KITCHEN_TOKEN_KEY = 'kitchen_access_token'

export const kitchenApiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  withCredentials: true,
})

kitchenApiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(KITCHEN_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const WAITER_TOKEN_KEY = 'waiter_access_token'

export const waiterApiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  withCredentials: true,
})

waiterApiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(WAITER_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default apiClient
