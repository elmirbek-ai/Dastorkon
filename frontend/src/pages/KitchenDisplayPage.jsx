import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { kitchenApiClient, KITCHEN_TOKEN_KEY } from '../api/client.js'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage, getLocalizedField, getStatusLabel } from '../i18n/index.js'
import useNotificationsSocket from '../realtime/useNotificationsSocket.js'

const ACTIVE_STATUSES = ['NEW', 'PREPARING', 'READY']
const READY_RETENTION_MS = 15 * 60 * 1000
const KITCHEN_POLL_INTERVAL_MS = 7000
const CONNECTED_POLL_INTERVAL_MS = 30000
const KITCHEN_NOTIFICATION_EVENTS = new Set([
  'order_created',
  'order_preparing',
  'order_ready',
  'order_delivered',
  'table_session_closed',
])

function formatMoney(value) {
  const amount = Number(value ?? 0)
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} сом`
}

function formatTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ky-KG', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 8a7 7 0 0 1 11.6-1.5L20 9M4 15l2.3 2.5A7 7 0 0 0 18 16" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" />
    </svg>
  )
}

function connectionStatusDisplay(status) {
  if (status === 'connected') return { label: 'Realtime', tone: 'connected' }
  if (status === 'connecting' || status === 'reconnecting') {
    return { label: 'Reconnecting', tone: 'reconnecting' }
  }
  return { label: 'Polling', tone: 'disconnected' }
}

function KitchenHeader({ connectionStatus, lastUpdated, refreshing, onRefresh, onLogout }) {
  const { t } = useLanguage()
  const connection = connectionStatusDisplay(connectionStatus)
  return (
    <header className="kitchen-header">
      <div className="kitchen-brand">
        <span aria-hidden="true">D</span>
        <div>
          <strong>Dastorkon</strong>
          <small>Kitchen Display</small>
        </div>
      </div>
      <div className="kitchen-header__actions">
        <LanguageSwitch />
        <p>
          <span>{t('common.updated')}</span>
          <strong>{lastUpdated ? formatTime(lastUpdated) : '—'}</strong>
        </p>
        <span
          className={`notifications-connection-status is-${connection.tone}`}
          role="status"
        >
          {connection.label}
        </span>
        <button type="button" onClick={onRefresh} disabled={refreshing} aria-label={t('common.refresh')}>
          <RefreshIcon />
          <span>{refreshing ? t('common.working') : t('common.refresh')}</span>
        </button>
        <button className="kitchen-logout" type="button" onClick={onLogout} aria-label={t('common.logout')}>
          <LogoutIcon />
          <span>{t('common.logout')}</span>
        </button>
      </div>
    </header>
  )
}

function KitchenOrderCard({ order, pending, onAdvance }) {
  const { language, t } = useLanguage()
  const actionLabel = order.status === 'NEW' ? t('kitchen.startPreparing') : t('kitchen.markReady')
  const canAdvance = order.status === 'NEW' || order.status === 'PREPARING'

  return (
    <article className={`kitchen-order-card kitchen-order-card--${order.status.toLowerCase()}`}>
      <div className="kitchen-order-card__top">
        <div>
          <strong>{t('customer.tableLabel', { number: order.table_number })}</strong>
          <span>{order.order_number}</span>
        </div>
        <span className={`kitchen-status kitchen-status--${order.status.toLowerCase()}`}>
          {getStatusLabel(order.status, language)}
        </span>
      </div>

      <div className="kitchen-order-meta">
        <span>{t('kitchen.acceptedAt')} <strong>{formatTime(order.created_at)}</strong></span>
        <span>{t('common.total')} <strong>{formatMoney(order.total_amount)}</strong></span>
      </div>

      {order.comment && <p className="kitchen-order-comment">{order.comment}</p>}

      <ul className="kitchen-order-items">
        {order.items.map((item) => (
          <li key={item.id}>
            <div>
              <b>{item.quantity}×</b>
              <strong>{getLocalizedField(item, 'name_at_order', language)}</strong>
            </div>
            {item.comment && <p>{t('kitchen.comment')}: {item.comment}</p>}
          </li>
        ))}
      </ul>

      {canAdvance ? (
        <button
          className="kitchen-order-action"
          type="button"
          onClick={() => onAdvance(order)}
          disabled={pending}
        >
          {pending ? <span className="kitchen-action-spinner" /> : actionLabel}
        </button>
      ) : (
        <div className="kitchen-ready-confirmation" aria-label={t('kitchen.ready')}>✓ {t('kitchen.ready')}</div>
      )}
    </article>
  )
}

function KitchenColumn({ column, orders, pendingOrderId, onAdvance }) {
  const { t } = useLanguage()
  const emptyKey = { NEW: 'kitchen.noNewOrders', PREPARING: 'kitchen.noPreparingOrders', READY: 'kitchen.noReadyOrders' }[column.status]
  return (
    <section className={`kitchen-column kitchen-column--${column.status.toLowerCase()}`}>
      <header className="kitchen-column__header">
        <div>
          <h2>{column.title}</h2>
          <p>{column.subtitle}</p>
        </div>
        <span>{orders.length}</span>
      </header>
      <div className="kitchen-column__orders">
        {orders.length === 0 ? (
          <div className="kitchen-empty-state">
            <span aria-hidden="true">✓</span>
            <p>{t(emptyKey)}</p>
          </div>
        ) : (
          orders.map((order) => (
            <KitchenOrderCard
              order={order}
              pending={pendingOrderId === order.id}
              onAdvance={onAdvance}
              key={order.id}
            />
          ))
        )}
      </div>
    </section>
  )
}

function KitchenDisplayPage() {
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const columns = useMemo(() => [
    { status: 'NEW', title: t('kitchen.newOrders'), subtitle: t('kitchen.noNewOrders') },
    { status: 'PREPARING', title: t('kitchen.preparing'), subtitle: t('kitchen.noPreparingOrders') },
    { status: 'READY', title: t('kitchen.ready'), subtitle: t('kitchen.noReadyOrders') },
  ], [t])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [pendingOrderId, setPendingOrderId] = useState(null)
  const socketToken = localStorage.getItem(KITCHEN_TOKEN_KEY)

  const logout = useCallback((authError = '') => {
    const message = typeof authError === 'string' ? authError : ''
    localStorage.removeItem(KITCHEN_TOKEN_KEY)
    navigate('/kitchen/login', {
      replace: true,
      ...(message ? { state: { authError: message } } : {}),
    })
  }, [navigate])

  const loadOrders = useCallback(async () => {
    try {
      const response = await kitchenApiClient.get('/api/kitchen/orders/')
      const fetchedOrders = response.data.filter((order) => ACTIVE_STATUSES.includes(order.status))
      const now = Date.now()
      setOrders((currentOrders) => {
        const fetchedIds = new Set(fetchedOrders.map((order) => order.id))
        const recentReady = currentOrders.filter(
          (order) => (
            order.status === 'READY'
            && !fetchedIds.has(order.id)
            && now - order._readyAt < READY_RETENTION_MS
          ),
        )
        return [...fetchedOrders, ...recentReady]
      })
      setLastUpdated(new Date())
      setError('')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logout(t('auth.sessionExpired'))
        return
      }
      setError(getBackendErrorMessage(requestError, language))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [language, logout, t])

  const handleNotification = useCallback((message) => {
    if (KITCHEN_NOTIFICATION_EVENTS.has(message?.event)) loadOrders()
  }, [loadOrders])

  const connectionStatus = useNotificationsSocket({
    token: socketToken,
    enabled: Boolean(socketToken),
    onMessage: handleNotification,
  })

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(loadOrders, 0)
    return () => window.clearTimeout(initialLoadTimer)
  }, [loadOrders])

  useEffect(() => {
    const pollInterval = connectionStatus === 'connected'
      ? CONNECTED_POLL_INTERVAL_MS
      : KITCHEN_POLL_INTERVAL_MS
    const pollTimer = window.setInterval(loadOrders, pollInterval)
    return () => window.clearInterval(pollTimer)
  }, [connectionStatus, loadOrders])

  const groupedOrders = useMemo(
    () => Object.fromEntries(
      columns.map((column) => [
        column.status,
        orders.filter((order) => order.status === column.status),
      ]),
    ),
    [columns, orders],
  )

  async function advanceOrder(order) {
    const action = order.status === 'NEW' ? 'preparing' : 'ready'
    setPendingOrderId(order.id)
    setError('')

    try {
      const response = await kitchenApiClient.post(
        `/api/kitchen/orders/${order.id}/${action}/`,
      )
      const updatedOrder = response.data.status === 'READY'
        ? { ...response.data, _readyAt: Date.now() }
        : response.data
      setOrders((currentOrders) => currentOrders.map(
        (currentOrder) => currentOrder.id === order.id ? updatedOrder : currentOrder,
      ))
      setLastUpdated(new Date())
      await loadOrders()
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logout(t('auth.sessionExpired'))
        return
      }
      setError(t('kitchen.statusChangeError'))
    } finally {
      setPendingOrderId(null)
    }
  }

  if (loading) {
    return (
      <main className="kitchen-loading">
        <span className="kitchen-screen-spinner" aria-hidden="true" />
        <strong>{t('common.loading')}</strong>
      </main>
    )
  }

  function refreshManually() {
    setRefreshing(true)
    loadOrders()
  }

  return (
    <main className="kitchen-display">
      <KitchenHeader
        connectionStatus={connectionStatus}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        onRefresh={refreshManually}
        onLogout={logout}
      />

      {error && <div className="kitchen-error-banner" role="alert">{error}</div>}

      <section className="kitchen-board" aria-label={t('kitchen.kitchenDisplay')}>
        {columns.map((column) => (
          <KitchenColumn
            column={column}
            orders={groupedOrders[column.status]}
            pendingOrderId={pendingOrderId}
            onAdvance={advanceOrder}
            key={column.status}
          />
        ))}
      </section>
    </main>
  )
}

export default KitchenDisplayPage
