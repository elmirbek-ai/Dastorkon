import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../api/client.js'
import { CustomerHeader, OrderHistory } from './CustomerMenuPage.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage } from '../i18n/index.js'

const emptyOrders = { orders: [], total_amount: '0.00' }

function CustomerOrdersPage() {
  const { qrToken } = useParams()
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const [orders, setOrders] = useState(emptyOrders)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const basePath = `/api/public/qr/${encodeURIComponent(qrToken)}`

  useEffect(() => {
    let active = true

    async function loadOrders() {
      setLoading(true)
      setError('')

      try {
        await apiClient.post(`${basePath}/session/`)
        const response = await apiClient.get(`${basePath}/orders/`)
        if (active) setOrders(response.data)
      } catch (requestError) {
        if (active) setError(getBackendErrorMessage(requestError, language))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadOrders()
    return () => {
      active = false
    }
  }, [basePath, language])

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
      ) : error ? (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      ) : (
        <OrderHistory orders={orders} />
      )}
    </main>
  )
}

export default CustomerOrdersPage
