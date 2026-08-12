import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../api/client.js'
import { CustomerHeader, OrderHistory } from './CustomerMenuPage.jsx'

const CUSTOMER_LANGUAGE_KEY = 'dastorkon_customer_language'
const emptyOrders = { orders: [], total_amount: '0.00' }

function getStoredLanguage() {
  return localStorage.getItem(CUSTOMER_LANGUAGE_KEY) === 'RU' ? 'RU' : 'KG'
}

function getErrorMessage(error) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  return ''
}

function CustomerOrdersPage() {
  const { qrToken } = useParams()
  const navigate = useNavigate()
  const [language, setLanguage] = useState(getStoredLanguage)
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
        if (active) setError(getErrorMessage(requestError) || 'LOAD_ERROR')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadOrders()
    return () => {
      active = false
    }
  }, [basePath])

  function changeLanguage(nextLanguage) {
    localStorage.setItem(CUSTOMER_LANGUAGE_KEY, nextLanguage)
    setLanguage(nextLanguage)
  }

  return (
    <main className="customer-orders-page">
      <CustomerHeader language={language} onLanguageChange={changeLanguage} />

      <button
        className="customer-orders-back"
        type="button"
        onClick={() => navigate(`/menu/${encodeURIComponent(qrToken)}`)}
      >
        ← {language === 'RU' ? 'Вернуться в меню' : 'Менюга кайтуу'}
      </button>

      {loading ? (
        <div className="customer-orders-state" role="status">
          <span className="loader" aria-hidden="true" />
          <span>{language === 'RU' ? 'Заказы загружаются...' : 'Заказдар жүктөлүүдө...'}</span>
        </div>
      ) : error ? (
        <div className="notice notice--error" role="alert">
          {error === 'LOAD_ERROR'
            ? (language === 'RU'
              ? 'Не удалось загрузить заказы. Попробуйте еще раз.'
              : 'Заказдар жүктөлгөн жок. Кайра аракет кылыңыз.')
            : error}
        </div>
      ) : (
        <OrderHistory orders={orders} language={language} />
      )}
    </main>
  )
}

export default CustomerOrdersPage
