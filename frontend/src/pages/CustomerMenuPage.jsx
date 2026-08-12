import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../api/client.js'

const emptyCart = { items: [], total: '0.00' }
const emptyOrders = { orders: [], total_amount: '0.00' }
const CUSTOMER_LANGUAGE_KEY = 'dastorkon_customer_language'

function getStoredLanguage() {
  const storedLanguage = localStorage.getItem(CUSTOMER_LANGUAGE_KEY)
  return storedLanguage === 'RU' ? 'RU' : 'KG'
}

const orderStatuses = {
  NEW: 'Жаңы',
  PREPARING: 'Даярдалууда',
  READY: 'Даяр',
  DELIVERED: 'Жеткирилди',
  COMPLETED: 'Жабылды',
  CANCELLED: 'Жокко чыгарылды',
}

const waiterReasons = [
  {
    value: 'WAITER_NEEDED',
    label: 'Официант керек',
    subtitle: 'Столго официант чакыруу',
    icon: '🙋',
  },
  {
    value: 'BILL_REQUEST',
    label: 'Эсеп сурайм',
    subtitle: 'Эсепти алып келүүнү сураңыз',
    icon: '🧾',
  },
  {
    value: 'EXTRA_ORDER',
    label: 'Кошумча заказ',
    subtitle: 'Дагы заказ берүүгө жардам',
    icon: '＋',
  },
  {
    value: 'HELP_NEEDED',
    label: 'Жардам керек',
    subtitle: 'Башка суроо боюнча жардам',
    icon: '💬',
  },
]

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

export function CustomerHeader({ language, onLanguageChange }) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">D</span>
        <div className="brand__copy">
          <p className="brand__name">Dastorkon</p>
          <p className="brand__subtitle">QR меню жана заказ системасы</p>
        </div>
      </div>
      <div className="language-toggle" aria-label="Тил тандоо">
        {['KG', 'RU'].map((option) => (
          <button
            className={language === option ? 'is-active' : ''}
            type="button"
            key={option}
            onClick={() => onLanguageChange(option)}
            aria-pressed={language === option}
          >
            {option}
          </button>
        ))}
      </div>
    </header>
  )
}

function CustomerContextBar({ tableNumber, language, orderCount, onOrdersClick }) {
  const ordersLabel = language === 'RU' ? 'Мои заказы' : 'Менин заказдарым'

  return (
    <section className="customer-context-bar" aria-label={`Стол №${tableNumber}`}>
      <div className="customer-context-bar__table">
        <span className="customer-context-bar__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 9h14M7 9v10m10-10v10M4 19h16M8 5h8v4H8z" />
        </svg>
        </span>
        <div>
          <small>{language === 'RU' ? 'Ваш стол' : 'Сиздин стол'}</small>
          <strong>Стол №{tableNumber}</strong>
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
  return (
    <label className="search-box">
      <span className="search-box__icon"><SearchIcon /></span>
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Тамак издөө..."
        aria-label="Тамак издөө"
      />
      {search && (
        <button type="button" onClick={onClear} aria-label="Издөөнү тазалоо">×</button>
      )}
    </label>
  )
}

function CategoryChips({ categories, activeCategory, onCategoryChange }) {
  return (
    <div className="category-chips" aria-label="Категориялар">
      <button
        className={activeCategory === 'all' ? 'is-active' : ''}
        type="button"
        onClick={() => onCategoryChange('all')}
      >
        Баары
      </button>
      {categories.map((category) => (
        <button
          className={activeCategory === category.id ? 'is-active' : ''}
          type="button"
          key={category.id}
          onClick={() => onCategoryChange(category.id)}
        >
          {category.name_ky}
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
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = resolveImageUrl(item.image)
  const showImage = imageUrl && !imageFailed
  const actionPending = pendingItemId === item.id

  return (
    <article className="menu-card">
      <div className="menu-card__media">
        {showImage ? (
          <img
            src={imageUrl}
            alt={item.name_ky}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <FoodPlaceholder itemName={item.name_ky} />
        )}
        <span className="availability-badge">Бар</span>
      </div>
      <div className="menu-card__body">
        <h4>{item.name_ky}</h4>
        {(item.description_ky || item.description_ru) && (
          <p className="menu-card__description">
            {item.description_ky || item.description_ru}
          </p>
        )}
        <div className="menu-card__footer">
          <div className="menu-card__meta">
            <strong className="price">{money(item.price)}</strong>
            {item.cooking_time_min > 0 && (
              <span className="cooking-time">◷ {item.cooking_time_min} мүн.</span>
            )}
          </div>
          {cartItem ? (
            <div className="quantity-stepper" aria-label={`${item.name_ky}: ${cartItem.quantity}`}>
              <button
                className="quantity-stepper__minus"
                type="button"
                onClick={() => onDecrease(item, cartItem)}
                disabled={actionPending}
                aria-label="Санын азайтуу"
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
                aria-label="Санын көбөйтүү"
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
              aria-label="Себетке кошуу"
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
  return (
    <aside className="cart-section" id="cart" aria-labelledby="cart-title">
      <div className="cart-section__heading">
        <div>
          <p>Сиздин тандооңуз</p>
          <h2 id="cart-title">Себет</h2>
        </div>
        {itemCount > 0 && <span>{itemCount}</span>}
      </div>
      {cart.items.length === 0 ? (
        <div className="empty-cart">
          <span aria-hidden="true"><CartIcon /></span>
          <strong>Себет бош</strong>
          <p>Жаккан тамактарды менюдан кошуңуз.</p>
        </div>
      ) : (
        <>
          <div className="cart-list">
            {cart.items.map((item) => (
              <article className="cart-item" key={item.id}>
                <div className="cart-item__quantity">{item.quantity}×</div>
                <div className="cart-item__details">
                  <h3>{item.menu_item_name_ky}</h3>
                  {item.menu_item_name_ru && <p>{item.menu_item_name_ru}</p>}
                  {item.comment && <small>Комментарий: {item.comment}</small>}
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
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? 'Заказ берилүүдө...' : 'Заказ берүү'}
            {!submitting && <span aria-hidden="true">→</span>}
          </button>
        </>
      )}
    </aside>
  )
}

export function OrderHistory({ orders, language = 'KG' }) {
  const copy = language === 'RU'
    ? { eyebrow: 'История заказов', title: 'Мои заказы', empty: 'Заказов пока нет.', order: 'Заказ', total: 'Итого', comment: 'Комментарий' }
    : { eyebrow: 'Заказ тарыхы', title: 'Менин заказдарым', empty: 'Азырынча заказдар жок.', order: 'Заказ', total: 'Жалпы', comment: 'Комментарий' }

  return (
    <section
      className="orders-section"
      id="orders"
      aria-labelledby="orders-title"
      tabIndex="-1"
    >
      <div className="orders-heading">
        <div>
          <p>{copy.eyebrow}</p>
          <h2 id="orders-title">{copy.title}</h2>
        </div>
        {orders.orders.length > 0 && <span>{orders.orders.length}</span>}
      </div>
      {orders.orders.length === 0 ? (
        <p className="empty-message">{copy.empty}</p>
      ) : (
        <div className="orders-list">
          {orders.orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-card__heading">
                <div>
                  <p>{copy.order}</p>
                  <h3>№{order.order_number}</h3>
                </div>
                <span className={`status-badge status-badge--${order.status.toLowerCase()}`}>
                  {orderStatuses[order.status] || order.status}
                </span>
              </div>
              <ul>
                {order.items.map((item) => (
                  <li key={item.id}>
                    <span>{item.name_ky_at_order} × {item.quantity}</span>
                    <strong>{money(item.total_price)}</strong>
                    {item.comment && <small>{copy.comment}: {item.comment}</small>}
                  </li>
                ))}
              </ul>
              <div className="order-card__total">
                <span>{copy.total}</span>
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
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = resolveImageUrl(menuItem?.image)
  const itemName = menuItem?.name_ky || cartItem.menu_item_name_ky
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
            aria-label={`${itemName}: себеттен өчүрүү`}
          >
            <span aria-hidden="true">×</span>
            <small>Өчүрүү</small>
          </button>
        </div>
        <div className="cart-sheet-item__footer">
          <div className="cart-sheet-stepper" aria-label={`${itemName}: ${cartItem.quantity}`}>
            <button
              type="button"
              onClick={onDecrease}
              disabled={pending}
              aria-label="Санын азайтуу"
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
              aria-label="Санын көбөйтүү"
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
            <h2 id="cart-sheet-title">Себет</h2>
            <p>{itemCount} тамак</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Себетти жабуу">×</button>
        </header>

        {error && <div className="notice notice--error" role="alert">{error}</div>}

        {cart.items.length === 0 ? (
          <div className="cart-sheet-empty">
            <span aria-hidden="true"><CartIcon /></span>
            <strong>Себетиңиз бош</strong>
            <button type="button" onClick={onClose}>Менюга кайтуу</button>
          </div>
        ) : (
          <>
            <div className="cart-sheet__list">
              {cart.items.map((cartItem) => {
                const menuItem = menuItemsById.get(cartItem.menu_item)
                const item = menuItem || { id: cartItem.menu_item }
                const itemName = menuItem?.name_ky || cartItem.menu_item_name_ky
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
                <span>Жалпы · {itemCount} тамак</span>
                <strong>{money(cart.total)}</strong>
              </div>
              <button
                className="order-button"
                type="button"
                onClick={onSubmit}
                disabled={submitting || pendingItemId !== null}
              >
                {submitting ? 'Заказ берилүүдө...' : 'Заказ берүү'}
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
  const message = itemName
    ? `«${itemName}» себеттен өчүрүлсүнбү?`
    : 'Бул тамакты себеттен өчүрөсүзбү?'

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
        aria-labelledby="delete-confirmation-title"
        aria-describedby="delete-confirmation-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="delete-confirmation__icon" aria-hidden="true">×</span>
        <h2 id="delete-confirmation-title">Себеттен өчүрүү</h2>
        <p id="delete-confirmation-message">{message}</p>
        <div className="delete-confirmation__actions">
          <button type="button" onClick={onCancel} disabled={deleting}>Жок</button>
          <button
            className="delete-confirmation__confirm"
            type="button"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Өчүрүлүүдө...' : 'Ооба, өчүрүү'}
          </button>
        </div>
      </section>
    </div>
  )
}

function StickyCartBar({ itemCount, total, onOpen }) {
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
        {itemCount} тамак <i>•</i> {money(total)}
      </strong>
      <span className="mobile-cart-bar__review">
        Себетти көрүү <i aria-hidden="true">›</i>
      </span>
    </button>
  )
}

function WaiterCallButton({ raised, onOpen }) {
  return (
    <button
      className={`waiter-fab ${raised ? 'waiter-fab--raised' : ''}`}
      type="button"
      onClick={onOpen}
      aria-label="Официант чакыруу"
    >
      <span aria-hidden="true">♧</span>
      <small>Официант</small>
    </button>
  )
}

function WaiterCallSheet({ open, sending, onClose, onCall }) {
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
            <h2 id="waiter-sheet-title">Официант чакыруу</h2>
            <p>Сураныч, себебин тандаңыз</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Жабуу">×</button>
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
  const sessionRequestRef = useRef({ basePath: '', promise: null })
  const [menu, setMenu] = useState(null)
  const [cart, setCart] = useState(emptyCart)
  const [orders, setOrders] = useState(emptyOrders)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pendingMenuItemId, setPendingMenuItemId] = useState(null)
  const [submittingOrder, setSubmittingOrder] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [language, setLanguage] = useState(getStoredLanguage)
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
      setError('')

      try {
        if (sessionRequestRef.current.basePath !== basePath) {
          sessionRequestRef.current = { basePath, promise: null }
        }

        if (!sessionRequestRef.current.promise) {
          sessionRequestRef.current.promise = apiClient.post(`${basePath}/session/`)
            .catch((requestError) => {
              sessionRequestRef.current.promise = null
              throw requestError
            })
        }

        try {
          await sessionRequestRef.current.promise
        } catch {
          if (active) setError('Стол сессиясын ачуу мүмкүн болгон жок.')
          return
        }

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

  function changeLanguage(nextLanguage) {
    localStorage.setItem(CUSTOMER_LANGUAGE_KEY, nextLanguage)
    setLanguage(nextLanguage)
  }

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
      setError(getErrorMessage(requestError))
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
      setError(getErrorMessage(requestError))
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
      setSuccess('Заказ ийгиликтүү берилди.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
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
      setSuccess('Өтүнүч официантка жөнөтүлдү.')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
      setWaiterSheetOpen(false)
    } finally {
      setSendingWaiterCall(false)
    }
  }

  if (loading) {
    return (
      <main className="page-state">
        <span className="loader" aria-hidden="true" />
        <span>Меню жүктөлүүдө...</span>
      </main>
    )
  }

  if (!menu) {
    return (
      <main className="page-state page-state--error" role="alert">
        <span className="state-icon" aria-hidden="true">!</span>
        {error || 'Меню табылган жок.'}
      </main>
    )
  }

  const visibleItemCount = visibleCategories.reduce(
    (sum, category) => sum + category.items.length,
    0,
  )

  return (
    <main className={`customer-menu ${cartItemCount > 0 ? 'has-mobile-cart' : ''}`}>
      <CustomerHeader language={language} onLanguageChange={changeLanguage} />

      <CustomerContextBar
        tableNumber={menu.table.number}
        language={language}
        orderCount={orders.orders.length}
        onOrdersClick={() => navigate(`/menu/${encodeURIComponent(qrToken)}/orders`)}
      />

      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {success && <div className="notice notice--success" role="status">{success}</div>}

      <section className="menu-tools" aria-label="Меню издөө жана категориялар">
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
              <h2 id="menu-title">Меню</h2>
            </div>
            <span>{visibleItemCount} тамак</span>
          </div>

          {visibleCategories.length === 0 ? (
            <div className="empty-message empty-message--large">
              <span aria-hidden="true"><SearchIcon /></span>
              <strong>Тамак табылган жок</strong>
              <p>Башка аталыш менен издеп көрүңүз.</p>
            </div>
          ) : (
            visibleCategories.map((category) => (
              <section className="category" key={category.id}>
                <div className="category__heading">
                  <h3>{category.name_ky}</h3>
                  {category.name_ru && category.name_ru !== category.name_ky && (
                    <span>{category.name_ru}</span>
                  )}
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
