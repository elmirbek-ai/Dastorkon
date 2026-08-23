import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { waiterApiClient, WAITER_TOKEN_KEY } from '../api/client.js'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage, getLocalizedField, getStatusLabel } from '../i18n/index.js'
import useNotificationsSocket from '../realtime/useNotificationsSocket.js'
import { getAvatarInitial } from '../utils/avatar.js'

const ACTIVE_WAITER_ORDER_STATUSES = ['NEW', 'PREPARING', 'READY', 'DELIVERED']
const unfinishedOrderStatuses = new Set(['NEW', 'PREPARING', 'READY'])
const WAITER_POLL_INTERVAL_MS = 8000
const CONNECTED_POLL_INTERVAL_MS = 30000
const WAITER_NOTIFICATION_EVENTS = new Set([
  'order_created',
  'order_available',
  'order_ready',
  'order_delivered',
  'waiter_call_created',
  'waiter_call_available',
  'waiter_call_accepted',
  'waiter_call_completed',
  'table_session_assigned',
  'table_session_closed',
])

function emptyOrderStatusCounts() {
  return Object.fromEntries(ACTIVE_WAITER_ORDER_STATUSES.map((status) => [status, 0]))
}

function formatMoney(value) {
  const amount = Number(value ?? 0)
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} сом`
}

function formatDateTime(value, language) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'ky-KG', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function timeAgo(value, language, translate) {
  if (!value) return '—'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return translate('waiter.justNow')
  if (minutes < 60) return translate('waiter.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return translate('waiter.hoursAgo', { count: hours })
  return formatDateTime(value, language)
}

function AppIcon({ name }) {
  const paths = {
    orders: <><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    tables: <><path d="M4 10h16M7 10v9m10-9v9M6 19h12" /><path d="M8 5h8v5H8z" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8" /><path d="M10 21h4" /></>,
    ready: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.6-1.5L20 9M4 15l2.3 2.5A7 7 0 0 0 18 16" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function WaiterHeader({ connectionStatus, notificationCount, onNotifications }) {
  const { t } = useLanguage()
  return (
    <header className="waiter-app-header">
      <div className="waiter-app-brand">
        <span aria-hidden="true">D</span>
        <div>
          <strong>Dastorkon</strong>
          <small>{t('customer.systemSubtitle')}</small>
        </div>
      </div>
      <div className="waiter-header-tools">
        <LanguageSwitch compact />
        <ConnectionStatus status={connectionStatus} />
        <button type="button" onClick={onNotifications} aria-label={t('waiter.calls')}>
          <AppIcon name="bell" />
          {notificationCount > 0 && <b>{notificationCount > 99 ? '99+' : notificationCount}</b>}
        </button>
      </div>
    </header>
  )
}

function WaiterProfileCard({ avatarInitial, shift, pending, actionsLocked, error, onStart, onOpenProfile }) {
  const { language, t } = useLanguage()
  return (
    <section className={`waiter-profile-card ${shift ? 'is-online' : ''}`}>
      <div className="waiter-profile-main">
        <span className="waiter-avatar" aria-hidden="true">{avatarInitial}</span>
        <div>
          <strong>{t('common.waiter')}</strong>
          <small>{t('common.waiter')}</small>
          <span><i aria-hidden="true" />{shift ? t('waiter.online') : t('waiter.offline')}</span>
        </div>
      </div>

      {shift ? (
        <button className="waiter-profile-shift" type="button" onClick={onOpenProfile}>
          <span>{t('waiter.shiftStatus')}</span>
          <strong>{t('admin.active')}</strong>
          <small>{formatDateTime(shift.started_at, language)}</small>
          <i><AppIcon name="chevron" /></i>
        </button>
      ) : (
        <button className="waiter-start-shift" type="button" onClick={onStart} disabled={actionsLocked}>
          {pending ? <span className="waiter-action-spinner" /> : t('waiter.startShift')}
        </button>
      )}
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </section>
  )
}

function WaiterBottomNav({ activeView, counts, onChange }) {
  const { t } = useLanguage()
  const navItems = [
    { id: 'overview', label: t('waiter.orders'), icon: 'orders' },
    { id: 'tables', label: t('waiter.tables'), icon: 'tables' },
    { id: 'calls', label: t('waiter.calls'), icon: 'bell' },
    { id: 'ready', label: t('kitchen.ready'), icon: 'ready' },
    { id: 'profile', label: t('waiter.profile'), icon: 'profile' },
  ]
  const selectedNav = activeView === 'new' ? 'overview' : activeView
  return (
    <nav className="waiter-bottom-nav" aria-label={t('waiter.dashboard')}>
      {navItems.map((item) => {
        const count = item.id === 'overview'
          ? counts.available
          : item.id === 'calls' ? counts.calls : item.id === 'ready' ? counts.ready : 0
        return (
          <button
            className={selectedNav === item.id ? 'is-active' : ''}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={selectedNav === item.id ? 'page' : undefined}
            key={item.id}
          >
            <span>
              <AppIcon name={item.icon} />
              {count > 0 && <b>{count > 99 ? '99+' : count}</b>}
            </span>
            <small>{item.label}</small>
          </button>
        )
      })}
    </nav>
  )
}

function OverviewSection({ icon, tone, title, count, onViewAll, children, emptyText }) {
  const { t } = useLanguage()
  return (
    <section className={`waiter-overview-section waiter-overview-section--${tone}`}>
      <header>
        <span className="waiter-overview-icon" aria-hidden="true"><AppIcon name={icon} /></span>
        <div>
          <h2>{title}</h2>
          <small>{t('waiter.activeCount', { count })}</small>
        </div>
        <b>{count}</b>
        <button type="button" onClick={onViewAll} aria-label={`${title}: ${t('waiter.viewAll')}`}>
          <AppIcon name="chevron" />
        </button>
      </header>
      <div className="waiter-overview-list">
        {count === 0 ? <p className="waiter-compact-empty">{emptyText}</p> : children}
      </div>
      {count > 0 && <button className="waiter-view-all" type="button" onClick={onViewAll}>{t('waiter.viewAll')}</button>}
    </section>
  )
}

function SessionFacts({ session }) {
  const { language, t } = useLanguage()
  return (
    <div className="waiter-session-facts">
      <span>{t('waiter.opened')}<strong>{timeAgo(session.created_at, language, t)}</strong></span>
      <span>{t('waiter.orders')}<strong>{session.orders_count}</strong></span>
      <span>{t('common.total')}<strong>{formatMoney(session.total_amount)}</strong></span>
    </div>
  )
}

function OrderStatusBadges({ counts }) {
  const { language, t } = useLanguage()
  const visibleStatuses = ACTIVE_WAITER_ORDER_STATUSES.filter((status) => counts[status] > 0)

  return (
    <ul className="waiter-order-statuses" aria-label={t('waiter.orderStatuses')}>
      {visibleStatuses.length === 0 ? (
        <li className="is-clear"><span>{t('waiter.noOpenOrders')}</span></li>
      ) : visibleStatuses.map((status) => (
        <li className={`is-${status.toLowerCase()}`} key={status}>
          <span>{getStatusLabel(status, language)}</span>
          <b>{counts[status]}</b>
        </li>
      ))}
    </ul>
  )
}

function NewOrderCard({ session, compact = false, pending, disabled, error, onAccept, referenceTime }) {
  const { language, t } = useLanguage()
  const ageMinutes = (referenceTime - new Date(session.created_at).getTime()) / 60000
  const highPriority = ageMinutes >= 5
  return (
    <article className={`waiter-new-card ${compact ? 'is-compact' : ''}`} aria-busy={pending}>
      <div className="waiter-priority-row">
        <span className={highPriority ? 'is-high' : ''}>
          {highPriority ? t('waiter.highPriority') : t('waiter.mediumPriority')}
        </span>
        <time>{timeAgo(session.created_at, language, t)}</time>
      </div>
      <div className="waiter-new-card__main">
        <div>
          <small>{t('waiter.sessionLabel', { number: session.id })}</small>
          <h3>{t('customer.tableLabel', { number: session.table.number })}</h3>
        </div>
        <strong>{t('waiter.orderCount', { count: session.orders_count })}</strong>
      </div>
      {!compact && <SessionFacts session={session} />}
      {compact && <p className="waiter-order-summary">{t('common.total')}: {formatMoney(session.total_amount)}</p>}
      <button
        type="button"
        onClick={() => onAccept(session)}
        disabled={disabled}
        aria-label={`${t('waiter.acceptTable')}: ${t('customer.tableLabel', { number: session.table.number })}`}
      >
        {pending ? <span className="waiter-action-spinner" /> : t('waiter.acceptTable')}
      </button>
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </article>
  )
}

function MyTableCard({ session, orderCounts, compact = false, pending, disabled, error, onClose }) {
  const { t } = useLanguage()
  const hasUnfinishedOrders = [...unfinishedOrderStatuses].some((status) => orderCounts[status] > 0)

  return (
    <article className={`waiter-my-table-card ${compact ? 'is-compact' : ''}`} aria-busy={pending}>
      <div className="waiter-list-card-heading">
        <div><small>{t('waiter.sessionLabel', { number: session.id })}</small><h3>{t('customer.tableLabel', { number: session.table.number })}</h3></div>
        <span>{t('admin.active')}</span>
      </div>
      <SessionFacts session={session} />
      <OrderStatusBadges counts={orderCounts} />
      {!compact && hasUnfinishedOrders && (
        <div className="waiter-table-warning" id={`table-warning-${session.id}`}>
          <strong>{t('waiter.cannotCloseTable')}</strong>
          <p>{t('waiter.unfinishedOrdersExist')}</p>
          <small>{t('waiter.deliverReadyOrdersFirst')}</small>
        </div>
      )}
      {!compact && (
        <button
          className={hasUnfinishedOrders ? 'is-blocked' : ''}
          type="button"
          onClick={() => onClose(session)}
          disabled={disabled || hasUnfinishedOrders}
          aria-describedby={hasUnfinishedOrders ? `table-warning-${session.id}` : undefined}
        >
          {pending ? <span className="waiter-dark-spinner" /> : t('waiter.closeTable')}
        </button>
      )}
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </article>
  )
}

function WaiterCallCard({ waiterCall, compact = false, pending, disabled, error, onAction }) {
  const { language, t } = useLanguage()
  const reasonKey = { WAITER_NEEDED: 'waiter.waiterNeeded', BILL_REQUEST: 'waiter.billRequest', EXTRA_ORDER: 'waiter.extraOrder', HELP_NEEDED: 'waiter.helpNeeded' }[waiterCall.reason]
  const normalizedStatus = String(waiterCall.status || '').toUpperCase()
  const statusClass = normalizedStatus.toLowerCase()
  const callStatus = normalizedStatus === 'NEW' ? t('waiter.waiting') : normalizedStatus === 'ACCEPTED' ? t('waiter.accepted') : t('waiter.completed')
  return (
    <article className={`waiter-call-row waiter-call-row--${statusClass} ${compact ? 'is-compact' : ''}`} aria-busy={pending}>
      <span className="waiter-call-row__icon" aria-hidden="true"><AppIcon name="bell" /></span>
      <div>
        <strong>{t('customer.tableLabel', { number: waiterCall.table_number })}</strong>
        <p>{reasonKey ? t(reasonKey) : t('waiter.call')}</p>
        <small>{timeAgo(waiterCall.created_at, language, t)}</small>
      </div>
      <span className={`waiter-call-status waiter-call-status--${statusClass}`} role="status">
        {callStatus}
      </span>
      {normalizedStatus !== 'DONE' && (
        <button type="button" onClick={() => onAction(waiterCall)} disabled={disabled}>
          {pending
            ? <span className="waiter-orange-spinner" />
            : normalizedStatus === 'NEW' ? t('waiter.acceptCall') : t('waiter.completeCall')}
        </button>
      )}
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </article>
  )
}

function itemSummary(order, language) {
  const items = Array.isArray(order.items) ? order.items : []
  return items.slice(0, 2).map((item) => `${item.quantity}× ${getLocalizedField(item, 'name_at_order', language)}`).join(', ')
}

function ReadyOrderCard({ order, compact = false, pending, disabled, error, onDeliver }) {
  const { language, t } = useLanguage()
  const items = Array.isArray(order.items) ? order.items : []
  const itemCount = items.reduce((count, item) => count + Number(item.quantity || 0), 0)
  return (
    <article className={`waiter-ready-row ${compact ? 'is-compact' : ''}`} aria-busy={pending}>
      <span className="waiter-ready-row__icon" aria-hidden="true"><AppIcon name="ready" /></span>
      <div className="waiter-ready-row__copy">
        <div><strong>{t('customer.tableLabel', { number: order.table_number })}</strong><small>№{order.order_number}</small></div>
        <p>{itemSummary(order, language)}</p>
        <div className="waiter-ready-row__meta">
          <time>{timeAgo(order.created_at, language, t)}</time>
          <span className="waiter-order-status-badge is-ready">{getStatusLabel(order.status, language)}</span>
          <span>{t('waiter.itemCount', { count: itemCount })}</span>
          <strong>{formatMoney(order.total_amount)}</strong>
        </div>
      </div>
      {!compact && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span><b>{item.quantity}×</b> {getLocalizedField(item, 'name_at_order', language)}</span>
              {item.comment && <small>{t('common.comments')}: {item.comment}</small>}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => onDeliver(order)} disabled={disabled}>
        {pending ? <span className="waiter-action-spinner" /> : t('waiter.deliverOrder')}
      </button>
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </article>
  )
}

function FullListView({ title, count, emptyText, emptyHelp, children }) {
  const { t } = useLanguage()
  return (
    <section className="waiter-full-view">
      <header><div><small>{t('waiter.dashboard')}</small><h1>{title}</h1></div><span>{count}</span></header>
      {count === 0
        ? <div className="waiter-full-empty"><span aria-hidden="true">✓</span><strong>{emptyText}</strong><p>{emptyHelp}</p></div>
        : <div className="waiter-full-list">{children}</div>}
    </section>
  )
}

function ProfilePanel({ avatarInitial, shift, refreshing, pending, actionsLocked, error, onRefresh, onStart, onEnd, onViewProfile, onLogout }) {
  const { language, t } = useLanguage()
  return (
    <section className="waiter-profile-panel">
      <header><span className="waiter-profile-avatar" aria-hidden="true">{avatarInitial}</span><div><h1>{t('common.waiter')}</h1><p>{t('waiter.dashboard')}</p></div></header>
      <div className={`waiter-profile-status ${shift ? 'is-active' : ''}`}>
        <span aria-hidden="true">{shift ? '✓' : '!'}</span>
        <div>
          <strong>{shift ? t('waiter.activeShift') : t('waiter.shiftNotStarted')}</strong>
          <small>{shift ? t('waiter.startedAt', { time: formatDateTime(shift.started_at, language) }) : t('waiter.startWorkHelp')}</small>
        </div>
      </div>
      <div className="waiter-profile-actions">
        <button type="button" onClick={onViewProfile}>{t('waiterProfile.myProfile')}</button>
        <button className={shift ? 'is-end-shift' : 'is-primary'} type="button" onClick={shift ? onEnd : onStart} disabled={actionsLocked}>
          {pending ? <span className="waiter-action-spinner" /> : shift ? t('waiter.endShift') : t('waiter.startShift')}
        </button>
        <button type="button" onClick={onRefresh} disabled={refreshing || actionsLocked}><AppIcon name="refresh" />{t('waiter.refreshData')}</button>
        <button className="is-danger" type="button" onClick={onLogout}><AppIcon name="logout" />{t('waiter.systemLogout')}</button>
      </div>
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </section>
  )
}

function WaiterDashboardPage() {
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const dashboardLoadInFlightRef = useRef(null)
  const pendingActionRef = useRef('')
  const [shift, setShift] = useState(null)
  const [availableSessions, setAvailableSessions] = useState([])
  const [mySessions, setMySessions] = useState([])
  const [waiterCalls, setWaiterCalls] = useState([])
  const [orders, setOrders] = useState([])
  const [activeView, setActiveView] = useState('overview')
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingAction, setPendingAction] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState(null)
  const [waiterProfile, setWaiterProfile] = useState(null)
  const socketToken = localStorage.getItem(WAITER_TOKEN_KEY)

  const logout = useCallback((authError = '') => {
    const message = typeof authError === 'string' ? authError : ''
    localStorage.removeItem(WAITER_TOKEN_KEY)
    navigate('/waiter/login', {
      replace: true,
      ...(message ? { state: { authError: message } } : {}),
    })
  }, [navigate])

  const handleUnauthorized = useCallback((requestError) => {
    if (requestError.response?.status !== 401) return false
    logout(t('auth.sessionExpired'))
    return true
  }, [logout, t])

  const loadDashboard = useCallback(async ({ refreshAfterCurrent = false } = {}) => {
    if (dashboardLoadInFlightRef.current) {
      if (!refreshAfterCurrent) return dashboardLoadInFlightRef.current
      await dashboardLoadInFlightRef.current
    }

    const loadPromise = (async () => {
      try {
        const shiftResponse = await waiterApiClient.get('/api/waiter/shifts/current/')
        const currentShift = shiftResponse.data
        setShift(currentShift)
        if (!currentShift) {
          setAvailableSessions([])
          setMySessions([])
          setWaiterCalls([])
          setOrders([])
          setLastUpdatedAt(Date.now())
          setError('')
          return
        }

        const [availableResponse, mineResponse, callsResponse, ordersResponse] = await Promise.all([
          waiterApiClient.get('/api/waiter/table-sessions/available/'),
          waiterApiClient.get('/api/waiter/table-sessions/my/'),
          waiterApiClient.get('/api/waiter/calls/'),
          waiterApiClient.get('/api/waiter/orders/'),
        ])
        setAvailableSessions(availableResponse.data)
        setMySessions(mineResponse.data)
        setWaiterCalls(callsResponse.data)
        setOrders(ordersResponse.data)
        setLastUpdatedAt(Date.now())
        setError('')
      } catch (requestError) {
        if (handleUnauthorized(requestError)) return
        setError(getBackendErrorMessage(requestError, language))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    })()

    dashboardLoadInFlightRef.current = loadPromise
    try {
      return await loadPromise
    } finally {
      if (dashboardLoadInFlightRef.current === loadPromise) {
        dashboardLoadInFlightRef.current = null
      }
    }
  }, [handleUnauthorized, language])

  const handleNotification = useCallback((message) => {
    if (WAITER_NOTIFICATION_EVENTS.has(message?.event)) loadDashboard()
  }, [loadDashboard])

  const connectionStatus = useNotificationsSocket({
    token: socketToken,
    enabled: Boolean(socketToken),
    onMessage: handleNotification,
  })

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(loadDashboard, 0)
    return () => window.clearTimeout(initialLoadTimer)
  }, [loadDashboard])

  useEffect(() => {
    const pollInterval = connectionStatus === 'connected'
      ? CONNECTED_POLL_INTERVAL_MS
      : WAITER_POLL_INTERVAL_MS
    const pollTimer = window.setInterval(loadDashboard, pollInterval)
    return () => window.clearInterval(pollTimer)
  }, [connectionStatus, loadDashboard])

  useEffect(() => {
    let active = true
    waiterApiClient.get('/api/waiter/profile/', { params: { lang: language } })
      .then((response) => active && setWaiterProfile(response.data.profile))
      .catch((requestError) => {
        if (active && requestError.response?.status === 401) handleUnauthorized(requestError)
      })
    return () => { active = false }
  }, [handleUnauthorized, language])

  const readyOrders = useMemo(() => orders.filter((order) => order.status === 'READY'), [orders])
  const orderCountsBySession = useMemo(() => {
    const countsBySession = new Map()

    orders.forEach((order) => {
      if (!ACTIVE_WAITER_ORDER_STATUSES.includes(order.status)) return
      const sessionId = Number(order.table_session)
      const counts = countsBySession.get(sessionId) || emptyOrderStatusCounts()
      counts[order.status] += 1
      countsBySession.set(sessionId, counts)
    })

    return countsBySession
  }, [orders])
  const counts = {
    available: availableSessions.length,
    tables: mySessions.length,
    calls: waiterCalls.length,
    ready: readyOrders.length,
  }
  const avatarInitial = getAvatarInitial(waiterProfile?.first_name, waiterProfile?.username)
  const actionsLocked = Boolean(pendingAction)

  async function runAction(key, request, fallbackError) {
    if (pendingActionRef.current) return

    pendingActionRef.current = key
    setPendingAction(key)
    setActionError(null)
    try {
      await request()
      await loadDashboard({ refreshAfterCurrent: true })
    } catch (requestError) {
      if (handleUnauthorized(requestError)) return
      const backendMessage = getBackendErrorMessage(requestError, language)
      setActionError({ key, message: requestError.response?.data ? backendMessage : fallbackError })
    } finally {
      if (pendingActionRef.current === key) pendingActionRef.current = ''
      setPendingAction((current) => current === key ? '' : current)
    }
  }

  function startShift() {
    return runAction('shift', () => waiterApiClient.post('/api/waiter/shifts/start/'), t('waiter.shiftActionError'))
  }

  function endShift() {
    return runAction('shift', () => waiterApiClient.post('/api/waiter/shifts/end/'), t('waiter.shiftActionError'))
  }

  function acceptSession(session) {
    return runAction(`session-${session.id}`, () => waiterApiClient.post(`/api/waiter/table-sessions/${session.id}/accept/`), t('errors.generic'))
  }

  function closeSession(session) {
    return runAction(`session-${session.id}`, () => waiterApiClient.post(`/api/waiter/table-sessions/${session.id}/close/`), t('errors.unfinishedOrders'))
  }

  function actOnCall(waiterCall) {
    const action = waiterCall.status === 'NEW' ? 'accept' : 'complete'
    return runAction(`call-${waiterCall.id}`, () => waiterApiClient.post(`/api/waiter/calls/${waiterCall.id}/${action}/`), t('errors.generic'))
  }

  function deliverOrder(order) {
    return runAction(`order-${order.id}`, () => waiterApiClient.post(`/api/waiter/orders/${order.id}/delivered/`), t('errors.generic'))
  }

  function refreshManually() {
    setRefreshing(true)
    loadDashboard()
  }

  function cardError(key) {
    return actionError?.key === key ? actionError.message : ''
  }

  function navigateView(view) {
    setActiveView(view)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) {
    return <main className="waiter-loading"><span className="waiter-screen-spinner" /><strong>{t('waiter.panelLoading')}</strong></main>
  }

  const newCards = (compact = false, limit) => availableSessions.slice(0, limit).map((session) => (
    <NewOrderCard session={session} compact={compact} pending={pendingAction === `session-${session.id}`} disabled={actionsLocked} error={cardError(`session-${session.id}`)} onAccept={acceptSession} referenceTime={lastUpdatedAt} key={session.id} />
  ))
  const tableCards = (compact = false, limit) => mySessions.slice(0, limit).map((session) => (
    <MyTableCard session={session} orderCounts={orderCountsBySession.get(Number(session.id)) || emptyOrderStatusCounts()} compact={compact} pending={pendingAction === `session-${session.id}`} disabled={actionsLocked} error={cardError(`session-${session.id}`)} onClose={closeSession} key={session.id} />
  ))
  const callCards = (compact = false, limit) => waiterCalls.slice(0, limit).map((waiterCall) => (
    <WaiterCallCard waiterCall={waiterCall} compact={compact} pending={pendingAction === `call-${waiterCall.id}`} disabled={actionsLocked} error={cardError(`call-${waiterCall.id}`)} onAction={actOnCall} key={waiterCall.id} />
  ))
  const readyCards = (compact = false, limit) => readyOrders.slice(0, limit).map((order) => (
    <ReadyOrderCard order={order} compact={compact} pending={pendingAction === `order-${order.id}`} disabled={actionsLocked} error={cardError(`order-${order.id}`)} onDeliver={deliverOrder} key={order.id} />
  ))

  return (
    <main className="waiter-mobile-app">
      <WaiterHeader connectionStatus={connectionStatus} notificationCount={counts.calls + counts.ready} onNotifications={() => navigateView('calls')} />
      <div className="waiter-app-content">
        {error && <div className="waiter-error-banner" role="alert">{error}</div>}
        {waiterProfile && !waiterProfile.profile_completed && (
          <div className="waiter-profile-incomplete-banner" role="status">
            <p>{t('waiterProfile.incompleteBanner')}</p>
            <button type="button" onClick={() => navigate('/waiter/profile')}>{t('waiterProfile.fillProfile')}</button>
          </div>
        )}
        {activeView !== 'profile' && (
          <WaiterProfileCard avatarInitial={avatarInitial} shift={shift} pending={pendingAction === 'shift'} actionsLocked={actionsLocked} error={cardError('shift')} onStart={startShift} onOpenProfile={() => navigateView('profile')} />
        )}
        {!shift && activeView !== 'profile' && <p className="waiter-shift-warning">{t('waiter.startToAccept')}</p>}
        {shift && activeView !== 'profile' && lastUpdatedAt > 0 && (
          <p className="waiter-dashboard-refreshed" role="status" aria-live="polite">
            {t('waiter.refreshedAt', { time: formatDateTime(lastUpdatedAt, language) })}
          </p>
        )}

        {activeView === 'overview' && (
          <div className="waiter-overview-grid">
            <OverviewSection icon="orders" tone="info" title={t('waiter.newOrders')} count={counts.available} onViewAll={() => navigateView('new')} emptyText={t('waiter.noNewOrders')}>
              {newCards(true, 3)}
            </OverviewSection>
            <OverviewSection icon="tables" tone="tables" title={t('waiter.myTables')} count={counts.tables} onViewAll={() => navigateView('tables')} emptyText={t('waiter.noAssignedTables')}>
              {tableCards(true, 2)}
            </OverviewSection>
            <OverviewSection icon="bell" tone="orange" title={t('waiter.calls')} count={counts.calls} onViewAll={() => navigateView('calls')} emptyText={t('waiter.noNewCalls')}>
              {callCards(true, 2)}
            </OverviewSection>
            <OverviewSection icon="ready" tone="success" title={t('waiter.readyOrders')} count={counts.ready} onViewAll={() => navigateView('ready')} emptyText={t('waiter.noReadyOrders')}>
              {readyCards(true, 2)}
            </OverviewSection>
          </div>
        )}

        {activeView === 'new' && <FullListView title={t('waiter.newOrders')} count={counts.available} emptyText={t('waiter.noNewOrders')} emptyHelp={t('waiter.noNewOrdersHelp')}>{newCards()}</FullListView>}
        {activeView === 'tables' && (
          <FullListView title={t('waiter.myTables')} count={counts.tables} emptyText={t('waiter.noAssignedTables')} emptyHelp={t('waiter.noAssignedTablesHelp')}>
            {tableCards()}
          </FullListView>
        )}
        {activeView === 'calls' && <FullListView title={t('waiter.calls')} count={counts.calls} emptyText={t('waiter.noNewCalls')} emptyHelp={t('waiter.noCallsHelp')}>{callCards()}</FullListView>}
        {activeView === 'ready' && <FullListView title={t('waiter.readyOrders')} count={counts.ready} emptyText={t('waiter.noReadyOrders')} emptyHelp={t('waiter.noReadyOrdersHelp')}>{readyCards()}</FullListView>}
        {activeView === 'profile' && <ProfilePanel avatarInitial={avatarInitial} shift={shift} refreshing={refreshing} pending={pendingAction === 'shift'} actionsLocked={actionsLocked} error={cardError('shift')} onRefresh={refreshManually} onStart={startShift} onEnd={endShift} onViewProfile={() => navigate('/waiter/profile')} onLogout={logout} />}
      </div>
      <WaiterBottomNav activeView={activeView} counts={counts} onChange={navigateView} />
    </main>
  )
}

export default WaiterDashboardPage
