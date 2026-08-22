import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../api/client.js'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import { CustomerHeader, OrderHistory, WaiterCallSheet } from './CustomerMenuPage.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage } from '../i18n/index.js'

const emptyOrders = { orders: [], total_amount: '0.00' }
const CUSTOMER_REQUEST_CONFIG = { timeout: 15000 }
const CUSTOMER_ORDERS_POLL_INTERVAL_MS = 8000

function CustomerOrdersPage() {
  const { qrToken } = useParams()
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const waiterCallInFlightRef = useRef(false)
  const [orders, setOrders] = useState(emptyOrders)
  const [tableNumber, setTableNumber] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadRevision, setLoadRevision] = useState(0)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [waiterSheetOpen, setWaiterSheetOpen] = useState(false)
  const [sendingWaiterCall, setSendingWaiterCall] = useState(false)

  const basePath = `/api/public/qr/${encodeURIComponent(qrToken)}`

  useEffect(() => {
    let active = true

    async function loadOrders() {
      setLoading(true)
      setLoadFailed(false)

      try {
        const sessionResponse = await apiClient.post(
          `${basePath}/session/`,
          undefined,
          CUSTOMER_REQUEST_CONFIG,
        )
        const response = await apiClient.get(`${basePath}/orders/`, CUSTOMER_REQUEST_CONFIG)
        if (active) {
          setTableNumber(sessionResponse.data?.table?.number ?? null)
          setOrders({
            ...response.data,
            orders: Array.isArray(response.data?.orders) ? response.data.orders : [],
          })
        }
      } catch {
        if (active) setLoadFailed(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadOrders()
    return () => {
      active = false
    }
  }, [basePath, loadRevision])

  useEffect(() => {
    if (loading || loadFailed) return undefined

    let active = true
    let requestInFlight = false

    async function refreshOrders() {
      if (requestInFlight) return
      requestInFlight = true

      try {
        const response = await apiClient.get(`${basePath}/orders/`, CUSTOMER_REQUEST_CONFIG)
        if (active) {
          setOrders({
            ...response.data,
            orders: Array.isArray(response.data?.orders) ? response.data.orders : [],
          })
        }
      } catch {
        // Preserve the last successful result; the next poll will retry quietly.
      } finally {
        requestInFlight = false
      }
    }

    const pollTimer = window.setInterval(refreshOrders, CUSTOMER_ORDERS_POLL_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(pollTimer)
    }
  }, [basePath, loadFailed, loading])

  useEffect(() => {
    if (!waiterSheetOpen) return undefined

    function closeOnEscape(event) {
      if (event.key === 'Escape' && !sendingWaiterCall) setWaiterSheetOpen(false)
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [sendingWaiterCall, waiterSheetOpen])

  async function callWaiter(reason) {
    if (waiterCallInFlightRef.current) return

    waiterCallInFlightRef.current = true
    setSendingWaiterCall(true)
    setMessage({ type: '', text: '' })

    try {
      await apiClient.post(`${basePath}/waiter-calls/`, { reason })
      setWaiterSheetOpen(false)
      setMessage({ type: 'success', text: t('customer.waiterCalled') })
    } catch (requestError) {
      setWaiterSheetOpen(false)
      setMessage({ type: 'error', text: getBackendErrorMessage(requestError, language) })
    } finally {
      waiterCallInFlightRef.current = false
      setSendingWaiterCall(false)
    }
  }

  const goToMenu = () => navigate(`/menu/${encodeURIComponent(qrToken)}`)

  return (
    <main className="customer-orders-page">
      <CustomerHeader />

      <section className="customer-orders-intro">
        <div>
          <p>{t('customer.orderTracking')}</p>
          <h1>{t('customer.myOrders')}</h1>
          <span>{t('customer.orderTrackingHelp')}</span>
        </div>
        {tableNumber !== null && (
          <div className="customer-orders-table">
            <small>{t('customer.yourTable')}</small>
            <strong>{t('customer.tableLabel', { number: tableNumber })}</strong>
          </div>
        )}
      </section>

      <div className="customer-orders-actions">
        <button className="customer-orders-back" type="button" onClick={goToMenu}>
          <span aria-hidden="true">←</span> {t('customer.backToMenu')}
        </button>
        <button
          className="customer-orders-waiter"
          type="button"
          onClick={() => setWaiterSheetOpen(true)}
        >
          <span aria-hidden="true">♧</span> {t('customer.callWaiter')}
        </button>
      </div>

      {!loading && !loadFailed && (
        <div className="customer-orders-update-status">
          <ConnectionStatus status="disconnected" />
        </div>
      )}

      {message.text && (
        <div className={`notice notice--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="customer-orders-state" role="status">
          <span className="loader" aria-hidden="true" />
          <span>{t('customer.ordersLoading')}</span>
        </div>
      ) : loadFailed ? (
        <div className="customer-orders-state customer-orders-state--error" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <strong>{t('customer.ordersLoadError')}</strong>
          <button
            className="page-state__action"
            type="button"
            onClick={() => setLoadRevision((value) => value + 1)}
          >
            {t('common.tryAgain')}
          </button>
        </div>
      ) : (
        <OrderHistory orders={orders} tableNumber={tableNumber} onBackToMenu={goToMenu} />
      )}

      <WaiterCallSheet
        open={waiterSheetOpen}
        sending={sendingWaiterCall}
        onClose={() => setWaiterSheetOpen(false)}
        onCall={callWaiter}
      />
    </main>
  )
}

export default CustomerOrdersPage
