import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import apiClient from '../api/client.js'

const emptyCart = { items: [], total: '0.00' }
const emptyOrders = { orders: [], total_amount: '0.00' }

function getErrorMessage(error) {
  if (!error.response) {
    return 'Серверге туташуу мүмкүн болгон жок. Кийинчерээк кайра аракет кылыңыз.'
  }

  if (error.response.status === 404) {
    return 'QR-код жараксыз же стол табылган жок.'
  }

  const detail = error.response.data?.detail
  return typeof detail === 'string'
    ? detail
    : 'Маалымат жүктөлгөн жок. Кайра аракет кылыңыз.'
}

function money(value) {
  return `${value ?? '0.00'} сом`
}

function CustomerMenuPage() {
  const { qrToken } = useParams()
  const [menu, setMenu] = useState(null)
  const [cart, setCart] = useState(emptyCart)
  const [orders, setOrders] = useState(emptyOrders)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [addingItemId, setAddingItemId] = useState(null)
  const [submittingOrder, setSubmittingOrder] = useState(false)

  const basePath = `/api/public/qr/${encodeURIComponent(qrToken)}`

  useEffect(() => {
    let active = true

    async function loadPage() {
      setLoading(true)
      setError('')

      try {
        await apiClient.post(`${basePath}/session/`)
        const [menuResponse, cartResponse, ordersResponse] = await Promise.all([
          apiClient.get(`${basePath}/menu/`),
          apiClient.get(`${basePath}/cart/`),
          apiClient.get(`${basePath}/orders/`),
        ])

        if (active) {
          setMenu(menuResponse.data)
          setCart(cartResponse.data)
          setOrders(ordersResponse.data)
        }
      } catch (requestError) {
        if (active) setError(getErrorMessage(requestError))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadPage()
    return () => {
      active = false
    }
  }, [basePath])

  async function refreshCart() {
    const response = await apiClient.get(`${basePath}/cart/`)
    setCart(response.data)
  }

  async function refreshOrders() {
    const response = await apiClient.get(`${basePath}/orders/`)
    setOrders(response.data)
  }

  async function addToCart(item) {
    setAddingItemId(item.id)
    setError('')
    setSuccess('')

    try {
      await apiClient.post(`${basePath}/cart/items/`, {
        menu_item: item.id,
        quantity: 1,
        comment: '',
      })
      await refreshCart()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setAddingItemId(null)
    }
  }

  async function submitOrder() {
    setSubmittingOrder(true)
    setError('')
    setSuccess('')

    try {
      await apiClient.post(`${basePath}/orders/`)
      await Promise.all([refreshCart(), refreshOrders()])
      setSuccess('Заказ ийгиликтүү берилди.')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmittingOrder(false)
    }
  }

  if (loading) {
    return <main className="page-state">Меню жүктөлүүдө...</main>
  }

  if (!menu) {
    return (
      <main className="page-state page-state--error" role="alert">
        {error || 'Меню табылган жок.'}
      </main>
    )
  }

  return (
    <main className="customer-menu">
      <header className="menu-header">
        <p className="eyebrow">Dastorkon</p>
        <h1>{menu.restaurant.name}</h1>
        <p className="table-number">Стол №{menu.table.number}</p>
      </header>

      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {success && <div className="notice notice--success" role="status">{success}</div>}

      <div className="menu-layout">
        <section className="menu-section" aria-labelledby="menu-title">
          <h2 id="menu-title">Меню</h2>

          {menu.categories.length === 0 ? (
            <p className="empty-message">Азырынча меню бош.</p>
          ) : (
            menu.categories.map((category) => (
              <section className="category" key={category.id}>
                <h3>{category.name_ky}</h3>
                {category.name_ru && category.name_ru !== category.name_ky && (
                  <p className="secondary-name">{category.name_ru}</p>
                )}

                <div className="menu-items">
                  {category.items.map((item) => (
                    <article className="menu-card" key={item.id}>
                      {item.image && (
                        <img className="menu-card__image" src={item.image} alt="" />
                      )}
                      <div className="menu-card__body">
                        <div className="menu-card__heading">
                          <div>
                            <h4>{item.name_ky}</h4>
                            {item.name_ru && item.name_ru !== item.name_ky && (
                              <p className="secondary-name">{item.name_ru}</p>
                            )}
                          </div>
                          <strong>{money(item.price)}</strong>
                        </div>
                        {item.description_ky && <p>{item.description_ky}</p>}
                        {item.description_ru && item.description_ru !== item.description_ky && (
                          <p className="description-secondary">{item.description_ru}</p>
                        )}
                        {item.cooking_time_min && (
                          <p className="cooking-time">Даярдоо убактысы: {item.cooking_time_min} мүн.</p>
                        )}
                        <button
                          type="button"
                          onClick={() => addToCart(item)}
                          disabled={addingItemId !== null}
                        >
                          {addingItemId === item.id ? 'Кошулууда...' : 'Себетке кошуу'}
                        </button>
                      </div>
                    </article>
                  ))}
                  {category.items.length === 0 && (
                    <p className="empty-message">Бул категорияда тамактар жок.</p>
                  )}
                </div>
              </section>
            ))
          )}
        </section>

        <aside className="cart-section" aria-labelledby="cart-title">
          <h2 id="cart-title">Себет</h2>
          {cart.items.length === 0 ? (
            <p className="empty-message">Себет бош.</p>
          ) : (
            <>
              <div className="cart-list">
                {cart.items.map((item) => (
                  <article className="cart-item" key={item.id}>
                    <div>
                      <h3>{item.menu_item_name_ky}</h3>
                      <p className="secondary-name">{item.menu_item_name_ru}</p>
                      <p>Саны: {item.quantity}</p>
                      <p>Комментарий: {item.comment || '—'}</p>
                    </div>
                    <strong>{money(item.line_total)}</strong>
                  </article>
                ))}
              </div>
              <div className="cart-total">
                <span>Жалпы</span>
                <strong>{money(cart.total)}</strong>
              </div>
              <button
                className="order-button"
                type="button"
                onClick={submitOrder}
                disabled={submittingOrder}
              >
                {submittingOrder ? 'Заказ берилүүдө...' : 'Заказ берүү'}
              </button>
            </>
          )}
        </aside>
      </div>

      <section className="orders-section" aria-labelledby="orders-title">
        <h2 id="orders-title">Менин заказдарым</h2>
        {orders.orders.length === 0 ? (
          <p className="empty-message">Азырынча заказдар жок.</p>
        ) : (
          <div className="orders-list">
            {orders.orders.map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-card__heading">
                  <div>
                    <h3>Заказ №{order.order_number}</h3>
                    <span className="status-badge">{order.status}</span>
                  </div>
                  <strong>{money(order.total_amount)}</strong>
                </div>
                <ul>
                  {order.items.map((item) => (
                    <li key={item.id}>
                      <span>{item.name_ky_at_order} × {item.quantity}</span>
                      <strong>{money(item.total_price)}</strong>
                      {item.comment && <small>Комментарий: {item.comment}</small>}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default CustomerMenuPage
