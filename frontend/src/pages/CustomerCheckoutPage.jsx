import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient, { resolveApiAssetUrl } from '../api/client.js'
import FoodIcon from '../components/FoodIcon.jsx'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import TableIcon from '../components/TableIcon.jsx'
import {
  customerCartItemIsUnavailable,
  EMPTY_CART,
  formatCustomerMoney,
  getCustomerApiBasePath,
  getCustomerMenuItemsById,
  getCustomerMenuPath,
  loadCustomerData,
} from '../customer/customerData.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage, getLocalizedField } from '../i18n/index.js'

function CheckoutItem({ cartItem, menuItem }) {
  const { language, t } = useLanguage()
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = resolveApiAssetUrl(menuItem?.image)
  const itemName = getLocalizedField(menuItem, 'name', language)
    || getLocalizedField(cartItem, 'menu_item_name', language)
  const unitPrice = cartItem.unit_price ?? cartItem.price
  const hasUnitPrice = unitPrice !== null
    && unitPrice !== undefined
    && String(unitPrice).trim() !== ''
  const unavailable = customerCartItemIsUnavailable(cartItem, menuItem)

  return (
    <article className={`customer-checkout-item ${unavailable ? 'is-unavailable' : ''}`}>
      <div className="customer-checkout-item__media">
        {imageUrl && !imageFailed ? (
          <img src={imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        ) : (
          <span aria-hidden="true"><FoodIcon /></span>
        )}
      </div>
      <div className="customer-checkout-item__body">
        <div className="customer-checkout-item__heading">
          <div>
            <h3>{itemName}</h3>
            <p>
              <span>{cartItem.quantity}×</span>
              {hasUnitPrice && <span>{formatCustomerMoney(unitPrice)}</span>}
            </p>
          </div>
          <strong>{formatCustomerMoney(cartItem.line_total)}</strong>
        </div>
        {unavailable && (
          <small className="customer-checkout-item__unavailable">
            {t('customer.temporarilyUnavailable')}
          </small>
        )}
        {cartItem.comment && (
          <div className="customer-checkout-item__comment">
            <span>{t('customer.kitchenNote')}</span>
            <p>{cartItem.comment}</p>
          </div>
        )}
      </div>
    </article>
  )
}

function CustomerCheckoutPage() {
  const { qrToken } = useParams()
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const submitInFlightRef = useRef(false)
  const [menu, setMenu] = useState(null)
  const [cart, setCart] = useState(EMPTY_CART)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadRevision, setLoadRevision] = useState(0)

  const basePath = getCustomerApiBasePath(qrToken)
  const customerMenuPath = getCustomerMenuPath(qrToken)
  const customerOrdersPath = `${customerMenuPath}/orders`
  const menuItemsById = useMemo(() => getCustomerMenuItemsById(menu), [menu])
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0)
  const hasUnavailableItems = cart.items.some((cartItem) => (
    customerCartItemIsUnavailable(cartItem, menuItemsById.get(cartItem.menu_item))
  ))

  useEffect(() => {
    let active = true

    async function loadCheckout() {
      setLoading(true)
      setLoadError('')
      setSubmitError('')

      try {
        const pageData = await loadCustomerData(basePath)
        if (!active) return
        if (pageData.cart.items.length === 0) {
          navigate(customerMenuPath, { replace: true })
          return
        }
        setMenu(pageData.menu)
        setCart(pageData.cart)
      } catch (requestError) {
        if (active) setLoadError(getBackendErrorMessage(requestError, language))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCheckout()
    return () => {
      active = false
    }
  }, [basePath, customerMenuPath, language, loadRevision, navigate])

  async function refreshCheckout() {
    const pageData = await loadCustomerData(basePath)
    if (pageData.cart.items.length === 0) {
      navigate(customerMenuPath, { replace: true })
      return false
    }
    setMenu(pageData.menu)
    setCart(pageData.cart)
    return true
  }

  async function submitOrder() {
    if (submitInFlightRef.current || cart.items.length === 0 || hasUnavailableItems) return
    submitInFlightRef.current = true
    setSubmitting(true)
    setSubmitError('')

    try {
      await apiClient.post(`${basePath}/orders/`)
      navigate(customerOrdersPath, { replace: true })
    } catch (requestError) {
      const message = getBackendErrorMessage(requestError, language)
      setSubmitError(message)
      if (message === t('errors.menuItemUnavailable')) {
        await refreshCheckout().catch(() => undefined)
      }
    } finally {
      submitInFlightRef.current = false
      setSubmitting(false)
    }
  }

  const tableNumber = menu?.table?.number

  return (
    <main className="customer-checkout-page">
      <header className="customer-checkout-header">
        <div className="customer-checkout-header__inner">
          <button
            className="customer-checkout-back"
            type="button"
            onClick={() => navigate(customerMenuPath)}
            aria-label={t('customer.backToCart')}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div className="customer-checkout-header__copy">
            <h1>{t('customer.checkoutTitle')}</h1>
            {tableNumber !== null && tableNumber !== undefined && (
              <span>{t('customer.tableLabel', { number: tableNumber })}</span>
            )}
          </div>
          <LanguageSwitch compact />
        </div>
      </header>

      {loading ? (
        <section className="customer-checkout-state" role="status">
          <span className="loader" aria-hidden="true" />
          <div>
            <strong>{t('customer.checkoutLoading')}</strong>
            <small>{t('customer.checkoutLoadingHelp')}</small>
          </div>
        </section>
      ) : loadError || !menu ? (
        <section className="customer-checkout-state customer-checkout-state--error" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <div>
            <strong>{t('customer.checkoutLoadError')}</strong>
            <small>{loadError || t('customer.checkoutLoadErrorHelp')}</small>
          </div>
          <button
            className="page-state__action"
            type="button"
            onClick={() => setLoadRevision((value) => value + 1)}
          >
            {t('common.tryAgain')}
          </button>
        </section>
      ) : (
        <div className="customer-checkout-layout">
          <div className="customer-checkout-content">
            <section className="customer-checkout-table-card">
              <span aria-hidden="true"><TableIcon /></span>
              <div>
                <small>{t('customer.yourTable')}</small>
                <strong>{t('customer.tableLabel', { number: tableNumber })}</strong>
              </div>
            </section>

            <div className="customer-checkout-kitchen-message">
              <span aria-hidden="true">✓</span>
              <p>{t('customer.sentToKitchenMessage')}</p>
            </div>

            {submitError && <div className="notice notice--error" role="alert">{submitError}</div>}
            {hasUnavailableItems && submitError !== t('errors.menuItemUnavailable') && (
              <div className="notice notice--error" role="alert">{t('errors.menuItemUnavailable')}</div>
            )}

            <section className="customer-checkout-items" aria-labelledby="customer-checkout-items-title">
              <div className="customer-checkout-section-heading">
                <h2 id="customer-checkout-items-title">{t('customer.orderComposition')}</h2>
                <span>{t('customer.itemCount', { count: itemCount })}</span>
              </div>
              <div className="customer-checkout-items__list">
                {cart.items.map((cartItem) => (
                  <CheckoutItem
                    key={cartItem.id}
                    cartItem={cartItem}
                    menuItem={menuItemsById.get(cartItem.menu_item)}
                  />
                ))}
              </div>
            </section>
          </div>

          <aside className="customer-checkout-summary" aria-label={t('customer.orderSummary')}>
            <div className="customer-checkout-summary__heading">
              <p>{t('customer.yourOrder')}</p>
              <h2>{t('customer.orderSummary')}</h2>
            </div>
            <dl>
              <div>
                <dt>{t('customer.dishes')}</dt>
                <dd>{t('customer.itemCount', { count: itemCount })}</dd>
              </div>
              <div>
                <dt>{t('customer.subtotal')}</dt>
                <dd>{formatCustomerMoney(cart.total)}</dd>
              </div>
              <div className="customer-checkout-summary__total">
                <dt>{t('common.total')}</dt>
                <dd>{formatCustomerMoney(cart.total)}</dd>
              </div>
            </dl>
            <button
              className="customer-checkout-submit"
              type="button"
              onClick={submitOrder}
              disabled={submitting || cart.items.length === 0 || hasUnavailableItems}
              aria-busy={submitting}
            >
              {submitting && <span className="button-loader" aria-hidden="true" />}
              <span>{submitting ? t('customer.placingOrder') : t('customer.sendOrderToKitchen')}</span>
              {!submitting && <b aria-hidden="true">→</b>}
            </button>
            <small>{t('customer.submitOrderHelp')}</small>
          </aside>
        </div>
      )}
    </main>
  )
}

export default CustomerCheckoutPage
