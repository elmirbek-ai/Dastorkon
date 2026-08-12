import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../api/client.js'
import { CustomerHeader, OrderHistory } from './CustomerMenuPage.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const emptyOrders = { orders: [], total_amount: '0.00' }
const CUSTOMER_REQUEST_CONFIG = { timeout: 15000 }

function CustomerOrdersPage() {
  const { qrToken } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [orders, setOrders] = useState(emptyOrders)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const basePath = `/api/public/qr/${encodeURIComponent(qrToken)}`

  useEffect(() => {
    let active = true

    async function loadOrders() {
      setLoading(true)
      setLoadFailed(false)

      try {
        await apiClient.post(`${basePath}/session/`, undefined, CUSTOMER_REQUEST_CONFIG)
        const response = await apiClient.get(`${basePath}/orders/`, CUSTOMER_REQUEST_CONFIG)
        if (active) setOrders({ ...response.data, orders: Array.isArray(response.data?.orders) ? response.data.orders : [] })
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
  }, [basePath])

  return (
    <main className="customer-orders-page">
      <CustomerHeader />

      <button
        className="customer-orders-back"
        type="button"
        onClick={() => navigate(`/menu/${encodeURIComponent(qrToken)}`)}
      >
        ← {t('customer.backToMenu')}
      </button>

      {loading ? (
        <div className="customer-orders-state" role="status">
          <span className="loader" aria-hidden="true" />
          <span>{t('customer.ordersLoading')}</span>
        </div>
      ) : loadFailed ? (
        <div className="notice notice--error" role="alert">
          {t('customer.ordersLoadError')}
        </div>
      ) : (
        <OrderHistory orders={orders} />
      )}
    </main>
  )
}

export default CustomerOrdersPage
