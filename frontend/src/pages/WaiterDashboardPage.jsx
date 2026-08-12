import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { waiterApiClient, WAITER_TOKEN_KEY } from '../api/client.js'

const callReasons = {
  WAITER_NEEDED: 'Официант керек',
  BILL_REQUEST: 'Эсеп сурайм',
  EXTRA_ORDER: 'Кошумча заказ',
  HELP_NEEDED: 'Жардам керек',
}

const callStatuses = {
  NEW: 'Жаңы',
  ACCEPTED: 'Кабыл алынды',
  DONE: 'Бүттү',
}

const unfinishedOrderStatuses = new Set(['NEW', 'PREPARING', 'READY'])

const backendErrorTranslations = {
  'table session has unfinished orders': 'Столду азыр жабууга болбойт. Адегенде бардык заказдарды жеткириңиз.',
  'table session is not active': 'Бул столдун сессиясы активдүү эмес.',
  'table session not found': 'Столдун сессиясы табылган жок.',
  'an active waiter shift is required': 'Бул аракет үчүн активдүү смена керек.',
  'waiter is not assigned to this order': 'Бул заказ сизге дайындалган эмес.',
  'order not found': 'Заказ табылган жок.',
  'waiter call not found': 'Чакыруу табылган жок.',
  'authentication credentials were not provided': 'Сессияңыз аяктады. Кайра кириңиз.',
  'invalid input': 'Берилген маалымат туура эмес.',
}

const navItems = [
  { id: 'overview', label: 'Заказдар', icon: 'orders' },
  { id: 'tables', label: 'Столдор', icon: 'tables' },
  { id: 'calls', label: 'Чакыруулар', icon: 'bell' },
  { id: 'ready', label: 'Даяр', icon: 'ready' },
  { id: 'profile', label: 'Профиль', icon: 'profile' },
]

function formatMoney(value) {
  const amount = Number(value ?? 0)
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} сом`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ky-KG', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function timeAgo(value) {
  if (!value) return '—'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'Азыр эле'
  if (minutes < 60) return `${minutes} мүн мурун`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} саат мурун`
  return formatDateTime(value)
}

function normalizeBackendError(message, fallback) {
  if (typeof message !== 'string' || !message.trim()) return fallback
  const trimmed = message.trim()
  const key = trimmed.toLowerCase().replace(/[.!?]+$/, '')
  if (backendErrorTranslations[key]) return backendErrorTranslations[key]
  if (key.includes('not found')) return 'Суралган маалымат табылган жок.'
  if (key.includes('permission') || key.includes('not allowed') || key.includes('forbidden')) {
    return 'Бул аракетти аткарууга уруксат жок.'
  }
  if (key.includes('authentication') || key.includes('unauthorized') || key.includes('token')) {
    return 'Сессияңыз аяктады. Кайра кириңиз.'
  }
  return trimmed
}

function collectApiMessages(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectApiMessages)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectApiMessages)
  return []
}

function extractApiError(error, fallback) {
  const messages = collectApiMessages(error.response?.data)
  if (!messages.length) return fallback
  return [...new Set(messages.map((message) => normalizeBackendError(message, fallback)))].join(' ')
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

function WaiterHeader({ notificationCount, onNotifications }) {
  return (
    <header className="waiter-app-header">
      <div className="waiter-app-brand">
        <span aria-hidden="true">D</span>
        <div>
          <strong>Dastorkon</strong>
          <small>QR меню жана заказ системасы</small>
        </div>
      </div>
      <button type="button" onClick={onNotifications} aria-label="Активдүү чакырууларды ачуу">
        <AppIcon name="bell" />
        {notificationCount > 0 && <b>{notificationCount > 99 ? '99+' : notificationCount}</b>}
      </button>
    </header>
  )
}

function WaiterProfileCard({ shift, pending, error, onStart, onOpenProfile }) {
  return (
    <section className={`waiter-profile-card ${shift ? 'is-online' : ''}`}>
      <div className="waiter-profile-main">
        <span className="waiter-avatar" aria-hidden="true">О</span>
        <div>
          <strong>Официант</strong>
          <small>Официант</small>
          <span><i aria-hidden="true" />{shift ? 'Онлайн' : 'Офлайн'}</span>
        </div>
      </div>

      {shift ? (
        <button className="waiter-profile-shift" type="button" onClick={onOpenProfile}>
          <span>Смена абалы</span>
          <strong>Активдүү</strong>
          <small>{formatDateTime(shift.started_at)}</small>
          <i><AppIcon name="chevron" /></i>
        </button>
      ) : (
        <button className="waiter-start-shift" type="button" onClick={onStart} disabled={pending}>
          {pending ? <span className="waiter-action-spinner" /> : 'Сменаны баштоо'}
        </button>
      )}
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </section>
  )
}

function WaiterBottomNav({ activeView, counts, onChange }) {
  const selectedNav = activeView === 'new' ? 'overview' : activeView
  return (
    <nav className="waiter-bottom-nav" aria-label="Негизги навигация">
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
  return (
    <section className={`waiter-overview-section waiter-overview-section--${tone}`}>
      <header>
        <span className="waiter-overview-icon" aria-hidden="true"><AppIcon name={icon} /></span>
        <div>
          <h2>{title}</h2>
          <small>{count} активдүү</small>
        </div>
        <b>{count}</b>
        <button type="button" onClick={onViewAll} aria-label={`${title}: баарын көрүү`}>
          <AppIcon name="chevron" />
        </button>
      </header>
      <div className="waiter-overview-list">
        {count === 0 ? <p className="waiter-compact-empty">{emptyText}</p> : children}
      </div>
      {count > 0 && <button className="waiter-view-all" type="button" onClick={onViewAll}>Баарын көрүү</button>}
    </section>
  )
}

function SessionFacts({ session }) {
  return (
    <div className="waiter-session-facts">
      <span>Ачылган<strong>{timeAgo(session.created_at)}</strong></span>
      <span>Заказ<strong>{session.orders_count}</strong></span>
      <span>Жалпы<strong>{formatMoney(session.total_amount)}</strong></span>
    </div>
  )
}

function NewOrderCard({ session, compact = false, pending, error, onAccept, referenceTime }) {
  const ageMinutes = (referenceTime - new Date(session.created_at).getTime()) / 60000
  const highPriority = ageMinutes >= 5
  return (
    <article className={`waiter-new-card ${compact ? 'is-compact' : ''}`}>
      <div className="waiter-priority-row">
        <span className={highPriority ? 'is-high' : ''}>
          {highPriority ? 'Жогорку приоритет' : 'Орточо приоритет'}
        </span>
        <time>{timeAgo(session.created_at)}</time>
      </div>
      <div className="waiter-new-card__main">
        <div>
          <small>Жаңы заказ</small>
          <h3>Стол №{session.table.number}</h3>
        </div>
        <strong>{session.orders_count} заказ</strong>
      </div>
      {!compact && <SessionFacts session={session} />}
      {compact && <p className="waiter-order-summary">Жалпы: {formatMoney(session.total_amount)}</p>}
      <button type="button" onClick={() => onAccept(session)} disabled={pending}>
        {pending ? <span className="waiter-action-spinner" /> : 'Кабыл алуу'}
      </button>
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </article>
  )
}

function MyTableCard({ session, unfinishedCounts, pending, error, onClose }) {
  const hasUnfinishedOrders = Object.values(unfinishedCounts).some((count) => count > 0)

  return (
    <article className="waiter-my-table-card">
      <div className="waiter-list-card-heading">
        <div><small>Менин столум</small><h3>Стол №{session.table.number}</h3></div>
        <span>ACTIVE</span>
      </div>
      <SessionFacts session={session} />
      {hasUnfinishedOrders && (
        <div className="waiter-table-warning" id={`table-warning-${session.id}`}>
          <strong>Столду азыр жабууга болбойт.</strong>
          <p>Бүтө элек заказдар бар:</p>
          <ul>
            {unfinishedCounts.NEW > 0 && <li className="is-new"><span aria-hidden="true">●</span> Жаңы: <b>{unfinishedCounts.NEW}</b></li>}
            {unfinishedCounts.PREPARING > 0 && <li className="is-preparing"><span aria-hidden="true">◷</span> Даярдалууда: <b>{unfinishedCounts.PREPARING}</b></li>}
            {unfinishedCounts.READY > 0 && <li className="is-ready"><span aria-hidden="true">✓</span> Даяр, жеткириле элек: <b>{unfinishedCounts.READY}</b></li>}
          </ul>
          <small>Адегенде даяр заказдарды жеткирип, калган заказдардын бүтүшүн күтүңүз.</small>
        </div>
      )}
      <button
        className={hasUnfinishedOrders ? 'is-blocked' : ''}
        type="button"
        onClick={() => onClose(session)}
        disabled={pending}
        aria-describedby={hasUnfinishedOrders ? `table-warning-${session.id}` : undefined}
      >
        {pending ? <span className="waiter-dark-spinner" /> : 'Столду жабуу'}
      </button>
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </article>
  )
}

function WaiterCallCard({ waiterCall, compact = false, pending, error, onAction }) {
  return (
    <article className={`waiter-call-row waiter-call-row--${waiterCall.status.toLowerCase()} ${compact ? 'is-compact' : ''}`}>
      <span className="waiter-call-row__icon" aria-hidden="true"><AppIcon name="bell" /></span>
      <div>
        <strong>Стол №{waiterCall.table_number}</strong>
        <p>{callReasons[waiterCall.reason] || waiterCall.reason}</p>
        <small>{timeAgo(waiterCall.created_at)}</small>
      </div>
      <span className={`waiter-call-status waiter-call-status--${waiterCall.status.toLowerCase()}`}>
        {callStatuses[waiterCall.status] || waiterCall.status}
      </span>
      {waiterCall.status !== 'DONE' && (
        <button type="button" onClick={() => onAction(waiterCall)} disabled={pending}>
          {pending
            ? <span className="waiter-orange-spinner" />
            : waiterCall.status === 'NEW' ? 'Баруу' : 'Бүттү'}
        </button>
      )}
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </article>
  )
}

function itemSummary(order) {
  return order.items.slice(0, 2).map((item) => `${item.quantity}× ${item.name_ky_at_order}`).join(', ')
}

function ReadyOrderCard({ order, compact = false, pending, error, onDeliver }) {
  return (
    <article className={`waiter-ready-row ${compact ? 'is-compact' : ''}`}>
      <span className="waiter-ready-row__icon" aria-hidden="true"><AppIcon name="ready" /></span>
      <div className="waiter-ready-row__copy">
        <div><strong>Стол №{order.table_number}</strong><small>{order.order_number}</small></div>
        <p>{itemSummary(order)}</p>
        <div className="waiter-ready-row__meta">
          <time>{timeAgo(order.created_at)}</time>
          <span>✓ Даяр</span>
          <strong>{formatMoney(order.total_amount)}</strong>
        </div>
      </div>
      {!compact && (
        <ul>
          {order.items.map((item) => (
            <li key={item.id}>
              <span><b>{item.quantity}×</b> {item.name_ky_at_order}</span>
              {item.comment && <small>Эскертүү: {item.comment}</small>}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => onDeliver(order)} disabled={pending}>
        {pending ? <span className="waiter-action-spinner" /> : 'Жеткирүү'}
      </button>
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </article>
  )
}

function FullListView({ title, count, emptyText, children }) {
  return (
    <section className="waiter-full-view">
      <header><div><small>Официант панели</small><h1>{title}</h1></div><span>{count}</span></header>
      {count === 0
        ? <div className="waiter-full-empty"><span aria-hidden="true">✓</span><p>{emptyText}</p></div>
        : <div className="waiter-full-list">{children}</div>}
    </section>
  )
}

function ProfilePanel({ shift, refreshing, pending, error, onRefresh, onStart, onEnd, onLogout }) {
  return (
    <section className="waiter-profile-panel">
      <header><span className="waiter-profile-avatar">О</span><div><h1>Официант</h1><p>Официант панели</p></div></header>
      <div className={`waiter-profile-status ${shift ? 'is-active' : ''}`}>
        <span aria-hidden="true">{shift ? '✓' : '!'}</span>
        <div>
          <strong>{shift ? 'Смена активдүү' : 'Смена баштала элек'}</strong>
          <small>{shift ? `Башталды: ${formatDateTime(shift.started_at)}` : 'Иштөө үчүн сменаны баштаңыз'}</small>
        </div>
      </div>
      <div className="waiter-profile-actions">
        <button className={shift ? 'is-end-shift' : 'is-primary'} type="button" onClick={shift ? onEnd : onStart} disabled={pending}>
          {pending ? <span className="waiter-action-spinner" /> : shift ? 'Сменаны бүтүрүү' : 'Сменаны баштоо'}
        </button>
        <button type="button" onClick={onRefresh} disabled={refreshing}><AppIcon name="refresh" />Маалыматты жаңыртуу</button>
        <button className="is-danger" type="button" onClick={onLogout}><AppIcon name="logout" />Системадан чыгуу</button>
      </div>
      {error && <p className="waiter-card-error" role="alert">{error}</p>}
    </section>
  )
}

function WaiterDashboardPage() {
  const navigate = useNavigate()
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

  const logout = useCallback(() => {
    localStorage.removeItem(WAITER_TOKEN_KEY)
    navigate('/waiter/login', { replace: true })
  }, [navigate])

  const handleUnauthorized = useCallback((requestError) => {
    if (requestError.response?.status !== 401) return false
    logout()
    return true
  }, [logout])

  const loadDashboard = useCallback(async () => {
    try {
      const shiftResponse = await waiterApiClient.get('/api/waiter/shifts/current/')
      const currentShift = shiftResponse.data
      setLastUpdatedAt(Date.now())
      setShift(currentShift)
      if (!currentShift) {
        setAvailableSessions([])
        setMySessions([])
        setWaiterCalls([])
        setOrders([])
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
      setError('')
    } catch (requestError) {
      if (handleUnauthorized(requestError)) return
      setError(extractApiError(requestError, 'Маалымат жүктөлгөн жок. Кайра жаңыртыңыз.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(loadDashboard, 0)
    const pollTimer = window.setInterval(loadDashboard, 8000)
    return () => {
      window.clearTimeout(initialLoadTimer)
      window.clearInterval(pollTimer)
    }
  }, [loadDashboard])

  const readyOrders = useMemo(() => orders.filter((order) => order.status === 'READY'), [orders])
  const unfinishedCountsBySession = useMemo(() => {
    const countsBySession = new Map()

    orders.forEach((order) => {
      if (!unfinishedOrderStatuses.has(order.status)) return
      const sessionId = Number(order.table_session)
      const counts = countsBySession.get(sessionId) || { NEW: 0, PREPARING: 0, READY: 0 }
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

  async function runAction(key, request, fallbackError) {
    setPendingAction(key)
    setActionError(null)
    try {
      await request()
      await loadDashboard()
    } catch (requestError) {
      if (handleUnauthorized(requestError)) return
      setActionError({ key, message: extractApiError(requestError, fallbackError) })
    } finally {
      setPendingAction('')
    }
  }

  function startShift() {
    return runAction('shift', () => waiterApiClient.post('/api/waiter/shifts/start/'), 'Сменаны баштоо мүмкүн болгон жок.')
  }

  function endShift() {
    return runAction('shift', () => waiterApiClient.post('/api/waiter/shifts/end/'), 'Сменаны бүтүрүү мүмкүн болгон жок.')
  }

  function acceptSession(session) {
    return runAction(`session-${session.id}`, () => waiterApiClient.post(`/api/waiter/table-sessions/${session.id}/accept/`), 'Столду кабыл алуу мүмкүн болгон жок.')
  }

  function closeSession(session) {
    return runAction(`session-${session.id}`, () => waiterApiClient.post(`/api/waiter/table-sessions/${session.id}/close/`), 'Столду жабуу мүмкүн болгон жок.')
  }

  function actOnCall(waiterCall) {
    const action = waiterCall.status === 'NEW' ? 'accept' : 'complete'
    return runAction(`call-${waiterCall.id}`, () => waiterApiClient.post(`/api/waiter/calls/${waiterCall.id}/${action}/`), 'Чакыруунун статусу өзгөргөн жок.')
  }

  function deliverOrder(order) {
    return runAction(`order-${order.id}`, () => waiterApiClient.post(`/api/waiter/orders/${order.id}/delivered/`), 'Заказды жеткирилди деп белгилөө мүмкүн болгон жок.')
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
    return <main className="waiter-loading"><span className="waiter-screen-spinner" /><strong>Официант панели жүктөлүүдө...</strong></main>
  }

  const newCards = (compact = false, limit) => availableSessions.slice(0, limit).map((session) => (
    <NewOrderCard session={session} compact={compact} pending={pendingAction === `session-${session.id}`} error={cardError(`session-${session.id}`)} onAccept={acceptSession} referenceTime={lastUpdatedAt} key={session.id} />
  ))
  const callCards = (compact = false, limit) => waiterCalls.slice(0, limit).map((waiterCall) => (
    <WaiterCallCard waiterCall={waiterCall} compact={compact} pending={pendingAction === `call-${waiterCall.id}`} error={cardError(`call-${waiterCall.id}`)} onAction={actOnCall} key={waiterCall.id} />
  ))
  const readyCards = (compact = false, limit) => readyOrders.slice(0, limit).map((order) => (
    <ReadyOrderCard order={order} compact={compact} pending={pendingAction === `order-${order.id}`} error={cardError(`order-${order.id}`)} onDeliver={deliverOrder} key={order.id} />
  ))

  return (
    <main className="waiter-mobile-app">
      <WaiterHeader notificationCount={counts.calls + counts.ready} onNotifications={() => navigateView('calls')} />
      <div className="waiter-app-content">
        {error && <div className="waiter-error-banner" role="alert">{error}</div>}
        {activeView !== 'profile' && (
          <WaiterProfileCard shift={shift} pending={pendingAction === 'shift'} error={cardError('shift')} onStart={startShift} onOpenProfile={() => navigateView('profile')} />
        )}
        {!shift && activeView !== 'profile' && <p className="waiter-shift-warning">Заказдарды кабыл алуу үчүн сменаны баштаңыз.</p>}

        {activeView === 'overview' && (
          <div className="waiter-overview-grid">
            <OverviewSection icon="orders" tone="info" title="Жаңы заказдар" count={counts.available} onViewAll={() => navigateView('new')} emptyText="Азырынча маалымат жок">
              {newCards(true, 3)}
            </OverviewSection>
            <OverviewSection icon="bell" tone="orange" title="Чакыруулар" count={counts.calls} onViewAll={() => navigateView('calls')} emptyText="Жаңы чакыруу жок">
              {callCards(true, 2)}
            </OverviewSection>
            <OverviewSection icon="ready" tone="success" title="Даяр заказдар" count={counts.ready} onViewAll={() => navigateView('ready')} emptyText="Даяр заказ жок">
              {readyCards(true, 2)}
            </OverviewSection>
          </div>
        )}

        {activeView === 'new' && <FullListView title="Жаңы заказдар" count={counts.available} emptyText="Азырынча маалымат жок">{newCards()}</FullListView>}
        {activeView === 'tables' && (
          <FullListView title="Менин столдорум" count={counts.tables} emptyText="Азырынча маалымат жок">
            {mySessions.map((session) => (
              <MyTableCard
                session={session}
                unfinishedCounts={unfinishedCountsBySession.get(Number(session.id)) || { NEW: 0, PREPARING: 0, READY: 0 }}
                pending={pendingAction === `session-${session.id}`}
                error={cardError(`session-${session.id}`)}
                onClose={closeSession}
                key={session.id}
              />
            ))}
          </FullListView>
        )}
        {activeView === 'calls' && <FullListView title="Чакыруулар" count={counts.calls} emptyText="Жаңы чакыруу жок">{callCards()}</FullListView>}
        {activeView === 'ready' && <FullListView title="Даяр заказдар" count={counts.ready} emptyText="Даяр заказ жок">{readyCards()}</FullListView>}
        {activeView === 'profile' && <ProfilePanel shift={shift} refreshing={refreshing} pending={pendingAction === 'shift'} error={cardError('shift')} onRefresh={refreshManually} onStart={startShift} onEnd={endShift} onLogout={logout} />}
      </div>
      <WaiterBottomNav activeView={activeView} counts={counts} onChange={navigateView} />
    </main>
  )
}

export default WaiterDashboardPage
