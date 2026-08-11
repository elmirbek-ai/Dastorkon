import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { kitchenApiClient, KITCHEN_TOKEN_KEY } from '../api/client.js'

const ACTIVE_STATUSES = ['NEW', 'PREPARING', 'READY']
const READY_RETENTION_MS = 15 * 60 * 1000

const columns = [
  { status: 'NEW', title: 'Жаңы заказдар', subtitle: 'Күтүп жаткан заказдар' },
  { status: 'PREPARING', title: 'Даярдалууда', subtitle: 'Азыр жасалып жатат' },
  { status: 'READY', title: 'Даяр', subtitle: 'Берүүгө даяр заказдар' },
]

const statusLabels = {
  NEW: 'Жаңы',
  PREPARING: 'Даярдалууда',
  READY: 'Даяр',
}

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

function KitchenHeader({ lastUpdated, refreshing, onRefresh, onLogout }) {
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
        <p>
          <span>Акыркы жаңыртуу</span>
          <strong>{lastUpdated ? formatTime(lastUpdated) : '—'}</strong>
        </p>
        <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Заказдарды жаңыртуу">
          <RefreshIcon />
          <span>{refreshing ? 'Жаңыртылууда' : 'Жаңыртуу'}</span>
        </button>
        <button className="kitchen-logout" type="button" onClick={onLogout} aria-label="Системадан чыгуу">
          <LogoutIcon />
          <span>Чыгуу</span>
        </button>
      </div>
    </header>
  )
}

function KitchenOrderCard({ order, pending, onAdvance }) {
  const actionLabel = order.status === 'NEW' ? 'Даярдай баштоо' : 'Даяр болду'
  const canAdvance = order.status === 'NEW' || order.status === 'PREPARING'

  return (
    <article className={`kitchen-order-card kitchen-order-card--${order.status.toLowerCase()}`}>
      <div className="kitchen-order-card__top">
        <div>
          <strong>Стол №{order.table_number}</strong>
          <span>{order.order_number}</span>
        </div>
        <span className={`kitchen-status kitchen-status--${order.status.toLowerCase()}`}>
          {statusLabels[order.status] || order.status}
        </span>
      </div>

      <div className="kitchen-order-meta">
        <span>Кабыл алынды <strong>{formatTime(order.created_at)}</strong></span>
        <span>Жалпы <strong>{formatMoney(order.total_amount)}</strong></span>
      </div>

      {order.comment && <p className="kitchen-order-comment">{order.comment}</p>}

      <ul className="kitchen-order-items">
        {order.items.map((item) => (
          <li key={item.id}>
            <div>
              <b>{item.quantity}×</b>
              <strong>{item.name_ky_at_order}</strong>
            </div>
            {item.comment && <p>Эскертүү: {item.comment}</p>}
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
        <div className="kitchen-ready-confirmation" aria-label="Заказ даяр">✓ Даяр</div>
      )}
    </article>
  )
}

function KitchenColumn({ column, orders, pendingOrderId, onAdvance }) {
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
            <p>Азырынча заказ жок</p>
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
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [pendingOrderId, setPendingOrderId] = useState(null)

  const logout = useCallback(() => {
    localStorage.removeItem(KITCHEN_TOKEN_KEY)
    navigate('/kitchen/login', { replace: true })
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
        logout()
        return
      }
      setError(
        requestError.response?.status === 403
          ? 'Бул аккаунтка ашкана панелин колдонууга уруксат жок.'
          : 'Заказдар жүктөлгөн жок. Байланышты текшерип, кайра жаңыртыңыз.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [logout])

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(loadOrders, 0)
    const pollTimer = window.setInterval(loadOrders, 7000)
    return () => {
      window.clearTimeout(initialLoadTimer)
      window.clearInterval(pollTimer)
    }
  }, [loadOrders])

  const groupedOrders = useMemo(
    () => Object.fromEntries(
      columns.map((column) => [
        column.status,
        orders.filter((order) => order.status === column.status),
      ]),
    ),
    [orders],
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
        logout()
        return
      }
      setError('Заказдын статусу өзгөргөн жок. Кайра аракет кылыңыз.')
    } finally {
      setPendingOrderId(null)
    }
  }

  if (loading) {
    return (
      <main className="kitchen-loading">
        <span className="kitchen-screen-spinner" aria-hidden="true" />
        <strong>Ашкана заказдары жүктөлүүдө...</strong>
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
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        onRefresh={refreshManually}
        onLogout={logout}
      />

      {error && <div className="kitchen-error-banner" role="alert">{error}</div>}

      <section className="kitchen-board" aria-label="Ашкана заказдары">
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
