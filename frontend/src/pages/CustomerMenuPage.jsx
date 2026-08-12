import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../api/client.js'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage, getLocalizedField, getStatusLabel } from '../i18n/index.js'

const emptyCart = { items: [], total: '0.00' }
const emptyOrders = { orders: [], total_amount: '0.00' }
const CUSTOMER_REQUEST_CONFIG = { timeout: 15000 }

function normalizeMenu(data) {
  if (!data || typeof data !== 'object' || !data.table) return null
  return {
    ...data,
    categories: Array.isArray(data.categories)
      ? data.categories.map((category) => ({
          ...category,
          items: Array.isArray(category?.items) ? category.items : [],
        }))
      : [],
  }
}

function normalizeCart(data) {
  if (!data || typeof data !== 'object') return emptyCart
  return { ...data, items: Array.isArray(data.items) ? data.items : [] }
}

function normalizeOrders(data) {
  if (!data || typeof data !== 'object') return emptyOrders
  return { ...data, orders: Array.isArray(data.orders) ? data.orders : [] }
}

function money(value) {
  const amount = Number(value ?? 0)
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} сом`
}

function resolveImageUrl(image) {
  if (!image) return ''
  if (/^(https?:)?\/\//i.test(image) || image.startsWith('data:')) return image

  const configuredBase = apiClient.defaults.baseURL || window.location.origin
  try {
    return new URL(image, new URL(configuredBase, window.location.origin)).href
  } catch {
    return image
  }
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 4h2l2.1 9.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 8H6" />
      <circle cx="9" cy="19" r="1.3" />
      <circle cx="17" cy="19" r="1.3" />
    </svg>
  )
}

function CartAddIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 8.5h11l1 11h-13l1-11Z" />
      <path d="M9 9V6.5a3 3 0 0 1 6 0V9M12 12v4M10 14h4" />
    </svg>
  )
}

function OrdersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5h10a2 2 0 0 1 2 2v13l-3-2-4 2-4-2-3 2v-13a2 2 0 0 1 2-2Z" />
      <path d="M9 9h6M9 13h4" />
    </svg>
  )
}

export function CustomerHeader() {
  const { t } = useLanguage()
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">D</span>
        <div className="brand__copy">
          <p className="brand__name">Dastorkon</p>
          <p className="brand__subtitle">{t('customer.systemSubtitle')}</p>
        </div>
      </div>
      <LanguageSwitch />
    </header>
  )
}

function CustomerContextBar({ tableNumber, orderCount, onOrdersClick }) {
  const { t } = useLanguage()
  const ordersLabel = t('customer.myOrders')

  return (
    <section className="customer-context-bar" aria-label={t('customer.tableLabel', { number: tableNumber })}>
      <div className="customer-context-bar__table">
        <span className="customer-context-bar__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 9h14M7 9v10m10-10v10M4 19h16M8 5h8v4H8z" />
        </svg>
        </span>
        <div>
          <small>{t('customer.yourTable')}</small>
          <strong>{t('customer.tableLabel', { number: tableNumber })}</strong>
        </div>
      </div>
      <button
        className="customer-context-bar__orders"
        type="button"
        onClick={onOrdersClick}
        aria-label={`${ordersLabel}${orderCount > 0 ? `: ${orderCount}` : ''}`}
      >
        <span className="customer-context-bar__icon" aria-hidden="true"><OrdersIcon /></span>
        <span>{ordersLabel}</span>
        {orderCount > 0 && <b aria-label={`${orderCount} заказ`}>{orderCount}</b>}
        <i aria-hidden="true">›</i>
      </button>
    </section>
  )
}

function SearchBar({ search, onSearchChange, onClear }) {
  const { t } = useLanguage()
  return (
    <label className="search-box">
      <span className="search-box__icon"><SearchIcon /></span>
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={t('customer.searchPlaceholder')}
        aria-label={t('customer.searchPlaceholder')}
      />
      {search && (
        <button type="button" onClick={onClear} aria-label={t('customer.clearSearch')}>×</button>
      )}
    </label>
  )
}

function CategoryChips({ categories, activeCategory, onCategoryChange }) {
  const { language, t } = useLanguage()
  return (
    <div className="category-chips" aria-label="Категориялар">
      <button
        className={activeCategory === 'all' ? 'is-active' : ''}
        type="button"
        onClick={() => onCategoryChange('all')}
      >
        {t('customer.allCategories')}
      </button>
      {categories.map((category) => (
        <button
          className={activeCategory === category.id ? 'is-active' : ''}
          type="button"
          key={category.id}
          onClick={() => onCategoryChange(category.id)}
        >
          {getLocalizedField(category, 'name', language)}
        </button>
      ))}
    </div>
  )
}

function FoodPlaceholder({ itemName }) {
  return (
    <div className="food-placeholder" aria-hidden="true">
      <span>🍽</span>
      <strong>{itemName?.charAt(0) || 'D'}</strong>
    </div>
  )
}

function MenuItemCard({ item, cartItem, pendingItemId, onAdd, onIncrease, onDecrease }) {
  const { language, t } = useLanguage()
  const [imageFailed, setImageFailed] = useState(false)
  const itemName = getLocalizedField(item, 'name', language)
  const imageUrl = resolveImageUrl(item.image)
  const showImage = imageUrl && !imageFailed
  const actionPending = pendingItemId === item.id

  return (
    <article className="menu-card">
      <div className="menu-card__media">
        {showImage ? (
          <img
            src={imageUrl}
            alt={itemName}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <FoodPlaceholder itemName={itemName} />
        )}
        <span className="availability-badge">{t('common.available')}</span>
      </div>
      <div className="menu-card__body">
        <h4>{itemName}</h4>
        {(item.description_ky || item.description_ru) && (
          <p className="menu-card__description">
            {getLocalizedField(item, 'description', language)}
          </p>
        )}
        <div className="menu-card__footer">
          <div className="menu-card__meta">
            <strong className="price">{money(item.price)}</strong>
            {item.cooking_time_min > 0 && (
              <span className="cooking-time">◷ {item.cooking_time_min} {t('common.minutes')}</span>
            )}
          </div>
          {cartItem ? (
            <div className="quantity-stepper" aria-label={`${itemName}: ${cartItem.quantity}`}>
              <button
                className="quantity-stepper__minus"
                type="button"
                onClick={() => onDecrease(item, cartItem)}
                disabled={actionPending}
                aria-label={t('customer.decreaseQuantity')}
              >
                −
              </button>
              <strong aria-live="polite">
                {actionPending ? <span className="stepper-loader" /> : cartItem.quantity}
              </strong>
              <button
                className="quantity-stepper__plus"
                type="button"
                onClick={() => onIncrease(item, cartItem)}
                disabled={actionPending}
                aria-label={t('customer.increaseQuantity')}
              >
                +
              </button>
            </div>
          ) : (
            <button
              className="add-button"
              type="button"
              onClick={() => onAdd(item)}
              disabled={actionPending}
              aria-label={t('customer.addToCart')}
            >
              {actionPending ? <span className="button-loader" /> : <CartAddIcon />}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function CartPanel({ cart, itemCount, submitting, onSubmit }) {
  const { language, t } = useLanguage()
  return (
    <aside className="cart-section" id="cart" aria-labelledby="cart-title">
      <div className="cart-section__heading">
        <div>
          <p>{t('customer.yourSelection')}</p>
          <h2 id="cart-title">{t('customer.cart')}</h2>
        </div>
        {itemCount > 0 && <span>{itemCount}</span>}
      </div>
      {cart.items.length === 0 ? (
        <div className="empty-cart">
          <span aria-hidden="true"><CartIcon /></span>
          <strong>{t('customer.cartEmpty')}</strong>
          <p>{t('customer.addFavoriteHelp')}</p>
        </div>
      ) : (
        <>
          <div className="cart-list">
            {cart.items.map((item) => (
              <article className="cart-item" key={item.id}>
                <div className="cart-item__quantity">{item.quantity}×</div>
                <div className="cart-item__details">
                  <h3>{getLocalizedField(item, 'menu_item_name', language)}</h3>
                  {item.comment && <small>{t('common.comments')}: {item.comment}</small>}
                </div>
                <strong>{money(item.line_total)}</strong>
              </article>
            ))}
          </div>
          <div className="cart-total">
            <span>{t('common.total')}</span>
            <strong>{money(cart.total)}</strong>
          </div>
          <button
            className="order-button"
            type="button"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? t('customer.placingOrder') : t('customer.placeOrder')}
            {!submitting && <span aria-hidden="true">→</span>}
          </button>
        </>
      )}
    </aside>
  )
}

export function OrderHistory({ orders }) {
  const { language, t } = useLanguage()
  return (
    <section
      className="orders-section"
      id="orders"
      aria-labelledby="orders-title"
      tabIndex="-1"
    >
      <div className="orders-heading">
        <div>
          <p>{t('customer.orderHistory')}</p>
          <h2 id="orders-title">{t('customer.myOrders')}</h2>
        </div>
        {orders.orders.length > 0 && <span>{orders.orders.length}</span>}
      </div>
      {orders.orders.length === 0 ? (
        <p className="empty-message">{t('customer.emptyOrders')}</p>
      ) : (
        <div className="orders-list">
          {orders.orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-card__heading">
                <div>
                  <p>{t('common.order')}</p>
                  <h3>№{order.order_number}</h3>
                </div>
                <span className={`status-badge status-badge--${order.status.toLowerCase()}`}>
                  {getStatusLabel(order.status, language)}
                </span>
              </div>
              <ul>
                {order.items.map((item) => (
                  <li key={item.id}>
                    <span>{getLocalizedField(item, 'name_at_order', language)} × {item.quantity}</span>
                    <strong>{money(item.total_price)}</strong>
                    {item.comment && <small>{t('common.comments')}: {item.comment}</small>}
                  </li>
                ))}
              </ul>
              <div className="order-card__total">
                <span>{t('common.total')}</span>
                <strong>{money(order.total_amount)}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function CartReviewItem({ cartItem, menuItem, pending, onIncrease, onDecrease, onRemove }) {
  const { language, t } = useLanguage()
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = resolveImageUrl(menuItem?.image)
  const itemName = getLocalizedField(menuItem, 'name', language) || getLocalizedField(cartItem, 'menu_item_name', language)
  const unitPrice = menuItem?.price ?? Number(cartItem.line_total) / cartItem.quantity

  return (
    <article className="cart-sheet-item">
      <div className="cart-sheet-item__media">
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span aria-hidden="true">🍽</span>
        )}
      </div>
      <div className="cart-sheet-item__content">
        <div className="cart-sheet-item__heading">
          <div>
            <h3>{itemName}</h3>
            <p>{money(unitPrice)}</p>
          </div>
          <button
            className="cart-sheet-item__remove"
            type="button"
            onClick={onRemove}
            disabled={pending}
            aria-label={`${itemName}: ${t('customer.removeItem')}`}
          >
            <span aria-hidden="true">×</span>
            <small>{t('customer.removeItem')}</small>
          </button>
        </div>
        <div className="cart-sheet-item__footer">
          <div className="cart-sheet-stepper" aria-label={`${itemName}: ${cartItem.quantity}`}>
            <button
              type="button"
              onClick={onDecrease}
              disabled={pending}
              aria-label={t('customer.decreaseQuantity')}
            >
              −
            </button>
            <strong aria-live="polite">
              {pending ? <span className="stepper-loader" /> : cartItem.quantity}
            </strong>
            <button
              type="button"
              onClick={onIncrease}
              disabled={pending}
              aria-label={t('customer.increaseQuantity')}
            >
              +
            </button>
          </div>
          <strong>{money(cartItem.line_total)}</strong>
        </div>
      </div>
    </article>
  )
}

function CartReviewSheet({
  open,
  cart,
  itemCount,
  menuItemsById,
  pendingItemId,
  submitting,
  error,
  onClose,
  onIncrease,
  onDecrease,
  onRequestRemoval,
  onSubmit,
}) {
  const { language, t } = useLanguage()
  if (!open) return null

  return (
    <div className="sheet-backdrop cart-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="cart-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-sheet-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="cart-sheet__heading">
          <div>
            <h2 id="cart-sheet-title">{t('customer.cart')}</h2>
            <p>{t('customer.itemCount', { count: itemCount })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('customer.closeCart')}>×</button>
        </header>

        {error && <div className="notice notice--error" role="alert">{error}</div>}

        {cart.items.length === 0 ? (
          <div className="cart-sheet-empty">
            <span aria-hidden="true"><CartIcon /></span>
            <strong>{t('customer.cartEmpty')}</strong>
            <button type="button" onClick={onClose}>{t('customer.goToMenu')}</button>
          </div>
        ) : (
          <>
            <div className="cart-sheet__list">
              {cart.items.map((cartItem) => {
                const menuItem = menuItemsById.get(cartItem.menu_item)
                const item = menuItem || { id: cartItem.menu_item }
                const itemName = getLocalizedField(menuItem, 'name', language) || getLocalizedField(cartItem, 'menu_item_name', language)
                const pending = pendingItemId === item.id

                return (
                  <CartReviewItem
                    key={cartItem.id}
                    cartItem={cartItem}
                    menuItem={menuItem}
                    pending={pending}
                    onIncrease={() => onIncrease(item, cartItem)}
                    onDecrease={() => (
                      cartItem.quantity === 1
                        ? onRequestRemoval(item, cartItem, itemName)
                        : onDecrease(item, cartItem)
                    )}
                    onRemove={() => onRequestRemoval(item, cartItem, itemName)}
                  />
                )
              })}
            </div>
            <footer className="cart-sheet__footer">
              <div className="cart-sheet__total">
                <span>{t('common.total')} · {t('customer.itemCount', { count: itemCount })}</span>
                <strong>{money(cart.total)}</strong>
              </div>
              <button
                className="order-button"
                type="button"
                onClick={onSubmit}
                disabled={submitting || pendingItemId !== null}
              >
                {submitting ? t('customer.placingOrder') : t('customer.placeOrder')}
                {!submitting && <span aria-hidden="true">→</span>}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

function DeleteConfirmation({ itemName, deleting, onCancel, onConfirm }) {
  const { t } = useLanguage()
  const message = t('customer.deleteCartItemConfirm', { itemName })

  return (
    <div
      className="delete-confirmation-backdrop"
      role="presentation"
      onMouseDown={deleting ? undefined : onCancel}
    >
      <section
        className="delete-confirmation"
        role="alertdialog"
        aria-modal="true"
        aria-describedby="delete-confirmation-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p id="delete-confirmation-message">{message}</p>
        <div className="delete-confirmation__actions">
          <button type="button" onClick={onCancel} disabled={deleting}>{t('customer.no')}</button>
          <button
            className="delete-confirmation__confirm"
            type="button"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? t('common.working') : t('customer.yesDelete')}
          </button>
        </div>
      </section>
    </div>
  )
}

function StickyCartBar({ itemCount, total, onOpen }) {
  const { t } = useLanguage()
  return (
    <button
      className="mobile-cart-bar"
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-controls="cart-sheet-title"
    >
      <span className="mobile-cart-bar__icon" aria-hidden="true">
        <CartIcon />
        <b>{itemCount}</b>
      </span>
      <strong className="mobile-cart-bar__summary">
        {t('customer.cartSummary', { count: itemCount, total: Number(total) })}
      </strong>
      <span className="mobile-cart-bar__review">
        {t('customer.viewCart')} <i aria-hidden="true">›</i>
      </span>
    </button>
  )
}

function WaiterCallButton({ raised, onOpen }) {
  const { t } = useLanguage()
  return (
    <button
      className={`waiter-fab ${raised ? 'waiter-fab--raised' : ''}`}
      type="button"
      onClick={onOpen}
      aria-label={t('customer.callWaiter')}
    >
      <span aria-hidden="true">♧</span>
      <small>{t('common.waiter')}</small>
    </button>
  )
}

function WaiterCallSheet({ open, sending, onClose, onCall }) {
  const { t } = useLanguage()
  const waiterReasons = [
    { value: 'WAITER_NEEDED', label: t('customer.waiterNeeded'), subtitle: t('customer.waiterNeededHelp'), icon: '🙋' },
    { value: 'BILL_REQUEST', label: t('customer.billRequest'), subtitle: t('customer.billRequestHelp'), icon: '🧾' },
    { value: 'EXTRA_ORDER', label: t('customer.extraOrder'), subtitle: t('customer.extraOrderHelp'), icon: '＋' },
    { value: 'HELP_NEEDED', label: t('customer.helpNeeded'), subtitle: t('customer.helpNeededHelp'), icon: '💬' },
  ]
  if (!open) return null

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="waiter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waiter-sheet-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="waiter-sheet__heading">
          <div>
            <h2 id="waiter-sheet-title">{t('customer.callWaiter')}</h2>
            <p>{t('customer.chooseWaiterReason')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="waiter-reasons">
          {waiterReasons.map((reason) => (
            <button
              type="button"
              key={reason.value}
              onClick={() => onCall(reason.value)}
              disabled={sending}
            >
              <span className="waiter-reason__icon" aria-hidden="true">{reason.icon}</span>
              <span className="waiter-reason__copy">
                <strong>{reason.label}</strong>
                <small>{reason.subtitle}</small>
              </span>
              <b aria-hidden="true">›</b>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function CustomerMenuPage() {
  const { qrToken } = useParams()
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const sessionRequestRef = useRef({ basePath: '', promise: null })
  const [menu, setMenu] = useState(null)
  const [cart, setCart] = useState(emptyCart)
  const [orders, setOrders] = useState(emptyOrders)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pendingMenuItemId, setPendingMenuItemId] = useState(null)
  const [submittingOrder, setSubmittingOrder] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState(null)
  const [waiterSheetOpen, setWaiterSheetOpen] = useState(false)
  const [sendingWaiterCall, setSendingWaiterCall] = useState(false)

  const basePath = `/api/public/qr/${encodeURIComponent(qrToken)}`
  const cartItemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0)
  const cartItemsByMenuItem = useMemo(
    () => new Map(cart.items.map((cartItem) => [cartItem.menu_item, cartItem])),
    [cart.items],
  )
  const menuItemsById = useMemo(
    () => new Map(
      (menu?.categories || []).flatMap((category) => category.items)
        .map((item) => [item.id, item]),
    ),
    [menu],
  )

  const visibleCategories = useMemo(() => {
    if (!menu) return []

    const query = search.trim().toLocaleLowerCase()
    return menu.categories
      .filter((category) => activeCategory === 'all' || category.id === activeCategory)
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          if (!query) return true
          return [
            item.name_ky,
            item.name_ru,
            item.description_ky,
            item.description_ru,
          ].some((value) => value?.toLocaleLowerCase().includes(query))
        }),
      }))
      .filter((category) => category.items.length > 0)
  }, [activeCategory, menu, search])

  useEffect(() => {
    let active = true

    async function loadPage() {
      setLoading(true)
      setLoadFailed(false)
      setError('')

      try {
        if (sessionRequestRef.current.basePath !== basePath) {
          sessionRequestRef.current = { basePath, promise: null }
        }

        if (!sessionRequestRef.current.promise) {
          sessionRequestRef.current.promise = apiClient.post(`${basePath}/session/`, undefined, CUSTOMER_REQUEST_CONFIG)
            .catch((requestError) => {
              sessionRequestRef.current.promise = null
              throw requestError
            })
        }

        await sessionRequestRef.current.promise

        const [menuResponse, cartResponse, ordersResponse] = await Promise.all([
          apiClient.get(`${basePath}/menu/`, CUSTOMER_REQUEST_CONFIG),
          apiClient.get(`${basePath}/cart/`, CUSTOMER_REQUEST_CONFIG),
          apiClient.get(`${basePath}/orders/`, CUSTOMER_REQUEST_CONFIG),
        ])

        if (active) {
          const nextMenu = normalizeMenu(menuResponse.data)
          if (!nextMenu) throw new Error('Invalid customer menu response')
          setMenu(nextMenu)
          setCart(normalizeCart(cartResponse.data))
          setOrders(normalizeOrders(ordersResponse.data))
        }
      } catch {
        if (active) setLoadFailed(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadPage()
    return () => {
      active = false
    }
  }, [basePath])

  useEffect(() => {
    if (!waiterSheetOpen) return undefined

    function closeOnEscape(event) {
      if (event.key === 'Escape') setWaiterSheetOpen(false)
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [waiterSheetOpen])

  useEffect(() => {
    if (!cartSheetOpen) return undefined

    function closeOnEscape(event) {
      if (event.key !== 'Escape') return
      if (deleteConfirmation) {
        if (pendingMenuItemId === null) setDeleteConfirmation(null)
      } else {
        setCartSheetOpen(false)
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [cartSheetOpen, deleteConfirmation, pendingMenuItemId])

  async function refreshCart() {
    const response = await apiClient.get(`${basePath}/cart/`)
    setCart(response.data)
  }

  async function refreshOrders() {
    const response = await apiClient.get(`${basePath}/orders/`)
    setOrders(response.data)
  }

  async function addToCart(item) {
    setPendingMenuItemId(item.id)
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
      setError(getBackendErrorMessage(requestError, language))
    } finally {
      setPendingMenuItemId(null)
    }
  }

  async function changeCartItemQuantity(item, cartItem, quantity) {
    setPendingMenuItemId(item.id)
    setError('')
    setSuccess('')

    try {
      const itemPath = `${basePath}/cart/items/${cartItem.id}/`
      if (quantity > 0) {
        await apiClient.patch(itemPath, { quantity })
      } else {
        await apiClient.delete(itemPath)
      }
      await refreshCart()
      return true
    } catch (requestError) {
      setError(getBackendErrorMessage(requestError, language))
      return false
    } finally {
      setPendingMenuItemId(null)
    }
  }

  function increaseCartItem(item, cartItem) {
    return changeCartItemQuantity(item, cartItem, cartItem.quantity + 1)
  }

  function decreaseCartItem(item, cartItem) {
    return changeCartItemQuantity(item, cartItem, cartItem.quantity - 1)
  }

  function removeCartItem(item, cartItem) {
    return changeCartItemQuantity(item, cartItem, 0)
  }

  function requestCartItemRemoval(item, cartItem, itemName) {
    setDeleteConfirmation({ item, cartItem, itemName })
  }

  async function confirmCartItemRemoval() {
    if (!deleteConfirmation) return

    const removed = await removeCartItem(
      deleteConfirmation.item,
      deleteConfirmation.cartItem,
    )
    if (removed) setDeleteConfirmation(null)
  }

  async function submitOrder() {
    setSubmittingOrder(true)
    setError('')
    setSuccess('')

    try {
      await apiClient.post(`${basePath}/orders/`)
      await Promise.all([refreshCart(), refreshOrders()])
      setCartSheetOpen(false)
      setSuccess(t('customer.orderAccepted'))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (requestError) {
      setError(getBackendErrorMessage(requestError, language))
    } finally {
      setSubmittingOrder(false)
    }
  }

  async function callWaiter(reason) {
    setSendingWaiterCall(true)
    setError('')
    setSuccess('')

    try {
      await apiClient.post(`${basePath}/waiter-calls/`, { reason })
      setWaiterSheetOpen(false)
      setSuccess(t('customer.waiterCalled'))
    } catch (requestError) {
      setError(getBackendErrorMessage(requestError, language))
      setWaiterSheetOpen(false)
    } finally {
      setSendingWaiterCall(false)
    }
  }

  if (loading) {
    return (
      <main className="page-state">
        <span className="loader" aria-hidden="true" />
        <span>{t('customer.menuLoading')}</span>
      </main>
    )
  }

  if (!menu) {
    return (
      <main className="page-state page-state--error" role="alert">
        <span className="state-icon" aria-hidden="true">!</span>
        {loadFailed ? t('customer.menuLoadError') : t('customer.menuEmpty')}
      </main>
    )
  }

  const visibleItemCount = visibleCategories.reduce(
    (sum, category) => sum + category.items.length,
    0,
  )

  return (
    <main className={`customer-menu ${cartItemCount > 0 ? 'has-mobile-cart' : ''}`}>
      <CustomerHeader />

      <CustomerContextBar
        tableNumber={menu.table.number}
        orderCount={orders.orders.length}
        onOrdersClick={() => navigate(`/menu/${encodeURIComponent(qrToken)}/orders`)}
      />

      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {success && <div className="notice notice--success" role="status">{success}</div>}

      <section className="menu-tools" aria-label={t('customer.searchAndCategories')}>
        <SearchBar search={search} onSearchChange={setSearch} onClear={() => setSearch('')} />
        <CategoryChips
          categories={menu.categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
      </section>

      <div className="menu-layout">
        <section className="menu-section" aria-labelledby="menu-title">
          <div className="section-heading">
            <div>
              <h2 id="menu-title">{t('customer.menu')}</h2>
            </div>
            <span>{t('customer.itemCount', { count: visibleItemCount })}</span>
          </div>

          {visibleCategories.length === 0 ? (
            <div className="empty-message empty-message--large">
              <span aria-hidden="true"><SearchIcon /></span>
              <strong>{t('customer.noSearchResults')}</strong>
            </div>
          ) : (
            visibleCategories.map((category) => (
              <section className="category" key={category.id}>
                <div className="category__heading">
                  <h3>{getLocalizedField(category, 'name', language)}</h3>
                </div>
                <div className="menu-items">
                  {category.items.map((item) => (
                    <MenuItemCard
                      item={item}
                      cartItem={cartItemsByMenuItem.get(item.id)}
                      pendingItemId={pendingMenuItemId}
                      onAdd={addToCart}
                      onIncrease={increaseCartItem}
                      onDecrease={decreaseCartItem}
                      key={item.id}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </section>

        <CartPanel
          cart={cart}
          itemCount={cartItemCount}
          submitting={submittingOrder}
          onSubmit={submitOrder}
        />
      </div>

      {cartItemCount > 0 && (
        <StickyCartBar
          itemCount={cartItemCount}
          total={cart.total}
          onOpen={() => setCartSheetOpen(true)}
        />
      )}

      <CartReviewSheet
        open={cartSheetOpen}
        cart={cart}
        itemCount={cartItemCount}
        menuItemsById={menuItemsById}
        pendingItemId={pendingMenuItemId}
        submitting={submittingOrder}
        error={error}
        onClose={() => {
          setDeleteConfirmation(null)
          setCartSheetOpen(false)
        }}
        onIncrease={increaseCartItem}
        onDecrease={decreaseCartItem}
        onRequestRemoval={requestCartItemRemoval}
        onSubmit={submitOrder}
      />

      {deleteConfirmation && (
        <DeleteConfirmation
          itemName={deleteConfirmation.itemName}
          deleting={pendingMenuItemId === deleteConfirmation.item.id}
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={confirmCartItemRemoval}
        />
      )}

      <WaiterCallButton
        raised={cartItemCount > 0}
        onOpen={() => setWaiterSheetOpen(true)}
      />
      <WaiterCallSheet
        open={waiterSheetOpen}
        sending={sendingWaiterCall}
        onClose={() => setWaiterSheetOpen(false)}
        onCall={callWaiter}
      />
    </main>
  )
}

export default CustomerMenuPage
