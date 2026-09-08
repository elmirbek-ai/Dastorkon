import apiClient from '../api/client.js'
import { addMoney } from '../utils/money.js'

export const EMPTY_CART = { items: [], total: '0.00' }
export const EMPTY_ORDERS = { orders: [], total_amount: '0.00' }
export const CUSTOMER_REQUEST_CONFIG = { timeout: 15000 }

export function getCustomerApiBasePath(qrToken) {
  return `/api/public/qr/${encodeURIComponent(qrToken)}`
}

export function getCustomerMenuPath(qrToken) {
  return `/menu/${encodeURIComponent(qrToken)}`
}

export function normalizeCustomerMenu(data) {
  if (!data || typeof data !== 'object' || !data.table) return null
  return {
    ...data,
    categories: Array.isArray(data.categories)
      ? data.categories.map((category) => ({
          ...category,
          items: Array.isArray(category?.items) ? category.items : [],
        }))
      : [],
  }
}

export function normalizeCustomerCart(data) {
  if (!data || typeof data !== 'object') return EMPTY_CART
  return { ...data, items: Array.isArray(data.items) ? data.items : [] }
}

export function normalizeCustomerOrders(data) {
  if (!data || typeof data !== 'object') return EMPTY_ORDERS
  return { ...data, orders: Array.isArray(data.orders) ? data.orders : [] }
}

export function applyCustomerCartItemMutation(cart, cartItemId, updatedItem = null) {
  const currentItems = Array.isArray(cart?.items) ? cart.items : []
  const items = updatedItem
    ? currentItems.map((item) => item.id === cartItemId ? updatedItem : item)
    : currentItems.filter((item) => item.id !== cartItemId)
  const total = addMoney(items.map((item) => item.line_total))
  return { ...cart, items, total }
}

export function getCustomerMenuItemsById(menu) {
  return new Map(
    (menu?.categories || []).flatMap((category) => category.items)
      .map((item) => [item.id, item]),
  )
}

export function customerCartItemIsUnavailable(cartItem, menuItem) {
  return cartItem.is_available === false
    || !menuItem
    || menuItem.is_available === false
}

export function formatCustomerMoney(value) {
  const amount = Number(value ?? 0)
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} сом`
}

export async function loadCustomerData(basePath, { includeOrders = false } = {}) {
  const sessionResponse = await apiClient.post(
    `${basePath}/session/`,
    undefined,
    CUSTOMER_REQUEST_CONFIG,
  )
  const requests = [
    apiClient.get(`${basePath}/menu/`, CUSTOMER_REQUEST_CONFIG),
    apiClient.get(`${basePath}/cart/`, CUSTOMER_REQUEST_CONFIG),
  ]
  if (includeOrders) requests.push(apiClient.get(`${basePath}/orders/`, CUSTOMER_REQUEST_CONFIG))

  const [menuResponse, cartResponse, ordersResponse] = await Promise.all(requests)
  const menu = normalizeCustomerMenu(menuResponse.data)
  if (!menu) throw new Error('Invalid customer menu response')

  return {
    session: sessionResponse.data,
    menu,
    cart: normalizeCustomerCart(cartResponse.data),
    orders: includeOrders ? normalizeCustomerOrders(ordersResponse.data) : undefined,
  }
}
