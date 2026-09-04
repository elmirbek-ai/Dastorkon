import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { kitchenApiClient, KITCHEN_TOKEN_KEY } from '../api/client.js'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage, getLocalizedField, getOrderSourceLabel, getStatusLabel } from '../i18n/index.js'
import useNotificationsSocket from '../realtime/useNotificationsSocket.js'

const ACTIVE_STATUSES = ['NEW', 'PREPARING', 'READY']
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

function formatTime(value, language) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'ky-KG', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatOrderAge(value, referenceTime, translate) {
  if (!value) return '—'
  const createdAt = new Date(value).getTime()
  if (Number.isNaN(createdAt)) return '—'
  const effectiveReferenceTime = referenceTime || createdAt
  const minutes = Math.max(0, Math.floor((effectiveReferenceTime - createdAt) / 60000))
  if (minutes < 1) return translate('kitchen.justNow')
  if (minutes < 60) return translate('kitchen.minutesAgo', { count: minutes })
  return translate('kitchen.hoursAgo', { count: Math.floor(minutes / 60) })
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

function KitchenHeader({ connectionStatus, lastUpdated, refreshing, actionPending, onRefresh, onLogout }) {
  const { language, t } = useLanguage()
  return (
    <header className="kitchen-header">
      <div className="kitchen-brand">
        <span aria-hidden="true">D</span>
        <div>
          <strong>Dastorkon</strong>
          <small>{t('kitchen.kitchenDisplay')}</small>
        </div>
      </div>
      <div className="kitchen-header__actions">
        <LanguageSwitch />
        <p>
          <span>{t('common.updated')}</span>
          <strong>{lastUpdated ? formatTime(lastUpdated, language) : '—'}</strong>
        </p>
        <ConnectionStatus status={connectionStatus} />
        <button type="button" onClick={onRefresh} disabled={refreshing || actionPending} aria-label={t('common.refresh')}>
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

function KitchenQueueSummary({ groupedOrders }) {
  const { language, t } = useLanguage()
  const activeCount = groupedOrders.NEW.length + groupedOrders.PREPARING.length
  const queueStatuses = [
    ['NEW', groupedOrders.NEW.length],
    ['PREPARING', groupedOrders.PREPARING.length],
    ['READY', groupedOrders.READY.length],
  ]

  return (
    <section
      className={`kitchen-queue-summary ${activeCount === 0 ? 'is-clear' : ''}`}
      aria-label={t('kitchen.workQueue')}
      aria-live="polite"
    >
      <div>
        <strong>{activeCount === 0 ? t('kitchen.noActiveWork') : t('kitchen.activeWork')}</strong>
        <small>{activeCount === 0 ? t('kitchen.noActiveWorkHelp') : t('kitchen.activeWorkHelp', { count: activeCount })}</small>
      </div>
      <ul>
        {queueStatuses.map(([status, count]) => (
          <li className={`is-${status.toLowerCase()}`} key={status}>
            <span>{getStatusLabel(status, language)}</span>
            <b>{count}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

function KitchenOrderCard({ order, pending, actionsLocked, referenceTime, onAdvance }) {
  const { language, t } = useLanguage()
  const status = String(order.status || '').toUpperCase()
  const items = Array.isArray(order.items) ? order.items : []
  const itemCount = items.reduce((count, item) => count + Number(item.quantity || 0), 0)
  const actionLabel = status === 'NEW' ? t('kitchen.startPreparing') : t('kitchen.markReady')
  const canAdvance = status === 'NEW' || status === 'PREPARING'

  return (
    <article className={`kitchen-order-card kitchen-order-card--${status.toLowerCase()}`} aria-busy={pending}>
      <div className="kitchen-order-card__top">
        <div>
          <strong>{t('customer.tableLabel', { number: order.table_number })}</strong>
          <span>{t('kitchen.orderNumber')}: №{order.order_number}</span>
          <em className={`kitchen-order-source is-${String(order.source).toLowerCase()}`}>{getOrderSourceLabel(order.source, language)}</em>
        </div>
        <span className={`kitchen-status kitchen-status--${status.toLowerCase()}`} role="status">
          {getStatusLabel(status, language)}
        </span>
      </div>

      <div className="kitchen-order-meta">
        <span>{t('kitchen.acceptedAt')} <strong>{formatTime(order.created_at, language)}</strong></span>
        <span>{t('kitchen.orderAge')} <strong>{formatOrderAge(order.created_at, referenceTime, t)}</strong></span>
        <span>{t('kitchen.itemCountLabel')} <strong>{itemCount}</strong></span>
        <span>{t('common.total')} <strong>{formatMoney(order.total_amount)}</strong></span>
      </div>

      {order.comment && <p className="kitchen-order-comment"><b>{t('kitchen.kitchenNote')}:</b> {order.comment}</p>}

      <ul className="kitchen-order-items">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <b>{item.quantity}×</b>
              <strong>{getLocalizedField(item, 'name_at_order', language)}</strong>
            </div>
            {item.comment && <p><b>{t('kitchen.kitchenNote')}:</b> {item.comment}</p>}
          </li>
        ))}
      </ul>

      {canAdvance ? (
        <button
          className="kitchen-order-action"
          type="button"
          onClick={() => onAdvance(order)}
          disabled={actionsLocked}
          aria-label={`${actionLabel}: ${t('customer.tableLabel', { number: order.table_number })}`}
        >
          {pending ? <span className="kitchen-action-spinner" /> : actionLabel}
        </button>
      ) : (
        <div className="kitchen-ready-confirmation" role="status">✓ {t('kitchen.readyConfirmation')}</div>
      )}
    </article>
  )
}

function KitchenColumn({ column, orders, pendingOrderId, actionsLocked, referenceTime, onAdvance }) {
  const { t } = useLanguage()
  const emptyState = {
    NEW: ['kitchen.noNewOrders', 'kitchen.noNewOrdersHelp'],
    PREPARING: ['kitchen.noPreparingOrders', 'kitchen.noPreparingOrdersHelp'],
    READY: ['kitchen.noReadyOrders', 'kitchen.noReadyOrdersHelp'],
  }[column.status]
  const headingId = `kitchen-column-${column.status.toLowerCase()}`
  return (
    <section className={`kitchen-column kitchen-column--${column.status.toLowerCase()}`} aria-labelledby={headingId}>
      <header className="kitchen-column__header">
        <div>
          <h2 id={headingId}>{column.title}</h2>
          <p>{column.subtitle}</p>
        </div>
        <span>{orders.length}</span>
      </header>
      <div className="kitchen-column__orders">
        {orders.length === 0 ? (
          <div className="kitchen-empty-state">
            <span aria-hidden="true">✓</span>
            <strong>{t(emptyState[0])}</strong>
            <p>{t(emptyState[1])}</p>
          </div>
        ) : (
          orders.map((order) => (
            <KitchenOrderCard
              order={order}
              pending={pendingOrderId === order.id}
              actionsLocked={actionsLocked}
              referenceTime={referenceTime}
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
    { status: 'NEW', title: t('kitchen.newOrders'), subtitle: t('kitchen.newQueueHelp') },
    { status: 'PREPARING', title: t('kitchen.preparing'), subtitle: t('kitchen.preparingQueueHelp') },
    { status: 'READY', title: t('kitchen.ready'), subtitle: t('kitchen.readyQueueHelp') },
  ], [t])
  const loadOrdersInFlightRef = useRef(null)
  const pendingOrderIdRef = useRef(null)
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

  const loadOrders = useCallback(async ({ refreshAfterCurrent = false } = {}) => {
    if (loadOrdersInFlightRef.current) {
      if (!refreshAfterCurrent) return loadOrdersInFlightRef.current
      await loadOrdersInFlightRef.current
    }

    const loadPromise = (async () => {
      try {
        const response = await kitchenApiClient.get('/api/kitchen/orders/')
        const responseOrders = Array.isArray(response.data) ? response.data : []
        const fetchedOrders = responseOrders.filter((order) => ACTIVE_STATUSES.includes(order.status))
        setOrders(fetchedOrders)
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
    })()

    loadOrdersInFlightRef.current = loadPromise
    try {
      return await loadPromise
    } finally {
      if (loadOrdersInFlightRef.current === loadPromise) {
        loadOrdersInFlightRef.current = null
      }
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
    if (pendingOrderIdRef.current !== null) return

    const status = String(order.status || '').toUpperCase()
    if (status !== 'NEW' && status !== 'PREPARING') return
    const action = status === 'NEW' ? 'preparing' : 'ready'
    pendingOrderIdRef.current = order.id
    setPendingOrderId(order.id)
    setError('')

    try {
      const response = await kitchenApiClient.post(
        `/api/kitchen/orders/${order.id}/${action}/`,
      )
      const updatedOrder = response.data
      setOrders((currentOrders) => currentOrders.map(
        (currentOrder) => currentOrder.id === order.id ? updatedOrder : currentOrder,
      ))
      setLastUpdated(new Date())
      await loadOrders({ refreshAfterCurrent: true })
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logout(t('auth.sessionExpired'))
        return
      }
      setError(t('kitchen.statusChangeError'))
    } finally {
      if (pendingOrderIdRef.current === order.id) pendingOrderIdRef.current = null
      setPendingOrderId((current) => current === order.id ? null : current)
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
        actionPending={pendingOrderId !== null}
        onRefresh={refreshManually}
        onLogout={logout}
      />

      {error && <div className="kitchen-error-banner" role="alert">{error}</div>}

      <KitchenQueueSummary groupedOrders={groupedOrders} />

      <section className="kitchen-board" aria-label={t('kitchen.kitchenDisplay')}>
        {columns.map((column) => (
          <KitchenColumn
            column={column}
            orders={groupedOrders[column.status]}
            pendingOrderId={pendingOrderId}
            actionsLocked={pendingOrderId !== null}
            referenceTime={lastUpdated?.getTime() || 0}
            onAdvance={advanceOrder}
            key={column.status}
          />
        ))}
      </section>
    </main>
  )
}

export default KitchenDisplayPage
