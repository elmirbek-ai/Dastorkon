import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient, { resolveApiAssetUrl } from '../api/client.js'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import MenuItemBadges from '../components/MenuItemBadges.jsx'
import { useConfirm } from '../components/confirmation/useConfirm.js'
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

function applyCartItemMutation(cart, cartItemId, updatedItem = null) {
  const currentItems = Array.isArray(cart?.items) ? cart.items : []
  const items = updatedItem
    ? currentItems.map((item) => item.id === cartItemId ? updatedItem : item)
    : currentItems.filter((item) => item.id !== cartItemId)
  const total = items.reduce((sum, item) => sum + Number(item.line_total ?? 0), 0)
  return { ...cart, items, total: total.toFixed(2) }
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
  return resolveApiAssetUrl(image)
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

function getCategoryLabel(category, language) {
  return getLocalizedField(category, 'name', language)
    || category?.name_ky
    || category?.name_ru
    || category?.name
    || 'Категория'
}

function CategoryChips({ categories, activeCategory, onCategoryChange }) {
  const { language, t } = useLanguage()
  return (
    <div className="category-chips" role="group" aria-label={t('customer.categories')}>
      <button
        className={activeCategory === 'all' ? 'is-active' : ''}
        type="button"
        onClick={() => onCategoryChange('all')}
        aria-pressed={activeCategory === 'all'}
      >
        {t('customer.allCategories')}
      </button>
      {categories.map((category) => (
        <button
          className={activeCategory === category.id ? 'is-active' : ''}
          type="button"
          key={category.id}
          onClick={() => onCategoryChange(category.id)}
          aria-pressed={activeCategory === category.id}
        >
          {getCategoryLabel(category, language)}
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

function MenuItemCard({ item, cartItem, pendingItemId, onAdd, onIncrease, onDecrease, onOpenDetail }) {
  const { language, t } = useLanguage()
  const [imageFailed, setImageFailed] = useState(false)
  const itemName = getLocalizedField(item, 'name', language)
  const imageUrl = resolveImageUrl(item.image)
  const showImage = imageUrl && !imageFailed
  const actionPending = pendingItemId === item.id
  const unavailable = item.is_available === false

  return (
    <article
      className={`menu-card ${unavailable ? 'menu-card--unavailable' : ''}`}
      aria-busy={actionPending}
    >
      <button
        className="menu-card__details-trigger"
        type="button"
        onClick={() => onOpenDetail(item)}
        aria-label={t('customer.viewDishDetails', { name: itemName })}
      />
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
        {unavailable && (
          <span className="availability-badge availability-badge--unavailable">
            {t('customer.temporarilyUnavailable')}
          </span>
        )}
      </div>
      <div className="menu-card__body">
        <h4>{itemName}</h4>
        <MenuItemBadges item={item} className="menu-card__badges" />
        {(item.description_ky || item.description_ru) && (
          <p className="menu-card__description">
            {getLocalizedField(item, 'description', language)}
          </p>
        )}
        <div className="menu-card__footer">
          <div className="menu-card__meta">
            <strong className="price">{money(item.price)}</strong>
          </div>
          {cartItem ? (
            <div className="quantity-stepper" aria-label={`${itemName}: ${cartItem.quantity}`}>
              <button
                className="quantity-stepper__minus"
                type="button"
                onClick={() => onDecrease(item, cartItem)}
                disabled={actionPending || unavailable}
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
                disabled={actionPending || unavailable}
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
              disabled={actionPending || unavailable}
              aria-label={t('customer.addToCart')}
              aria-busy={actionPending}
            >
              {actionPending ? <span className="button-loader" /> : <CartAddIcon />}
              <span>{t('common.add')}</span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function DishDetailDialog({ item, pending, onClose, onAdd }) {
  const { language, t } = useLanguage()
  const [quantity, setQuantity] = useState(1)
  const [comment, setComment] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const itemName = getLocalizedField(item, 'name', language)
  const description = getLocalizedField(item, 'description', language)
  const ingredients = getLocalizedField(item, 'ingredients', language)
  const allergens = getLocalizedField(item, 'allergens', language)
  const imageUrl = resolveImageUrl(item.image)
  const unavailable = item.is_available === false
  const unitPrice = Number(item.price)
  const finalPrice = unitPrice * quantity

  async function handleAdd() {
    const added = await onAdd(item, {
      quantity,
      comment: comment.trim(),
    })
    if (added) onClose()
  }

  return (
    <div
      className="dish-detail-backdrop"
      role="presentation"
      onMouseDown={pending ? undefined : onClose}
    >
      <section
        className="dish-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dish-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dish-detail__handle" aria-hidden="true" />
        <button
          className="dish-detail__close"
          type="button"
          onClick={onClose}
          disabled={pending}
          aria-label={t('common.close')}
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="dish-detail__media">
          {imageUrl && !imageFailed ? (
            <img
              src={imageUrl}
              alt={itemName}
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <FoodPlaceholder itemName={itemName} />
          )}
          {unavailable && (
            <span className="dish-detail__availability">{t('customer.temporarilyUnavailable')}</span>
          )}
        </div>

        <div className="dish-detail__content">
          <header className="dish-detail__heading">
            <p>{t('customer.dishDetails')}</p>
            <h2 id="dish-detail-title">{itemName}</h2>
            <MenuItemBadges item={item} className="dish-detail__badges" />
            <div className="dish-detail__summary">
              <span>
                <small>{t('common.price')}</small>
                <strong>{money(item.price)}</strong>
              </span>
            </div>
          </header>

          {description && <p className="dish-detail__description">{description}</p>}

          {(ingredients || allergens) && (
            <div className="dish-detail__facts">
              {ingredients && (
                <section>
                  <h3>{t('customer.ingredients')}</h3>
                  <p>{ingredients}</p>
                </section>
              )}
              {allergens && (
                <section className="dish-detail__allergens">
                  <h3>{t('customer.allergens')}</h3>
                  <p>{allergens}</p>
                </section>
              )}
            </div>
          )}

          <label className="dish-detail__comment">
            <span>
              <strong>{t('customer.specialInstructions')}</strong>
              <small>{t('common.optional')}</small>
            </span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t('customer.specialInstructionsPlaceholder')}
              maxLength={300}
              rows={3}
              disabled={pending || unavailable}
            />
          </label>

          <footer className="dish-detail__action">
            <div className="dish-detail__quantity" aria-label={t('common.quantity')}>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                disabled={pending || unavailable || quantity === 1}
                aria-label={t('customer.decreaseQuantity')}
              >
                −
              </button>
              <span>
                <small>{t('common.quantity')}</small>
                <strong aria-live="polite">{quantity}</strong>
              </span>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                disabled={pending || unavailable || quantity === 99}
                aria-label={t('customer.increaseQuantity')}
              >
                +
              </button>
            </div>
            <button
              className="dish-detail__add"
              type="button"
              onClick={handleAdd}
              disabled={pending || unavailable}
              aria-busy={pending}
            >
              <span className="dish-detail__add-copy">
                {pending && <span className="button-loader" aria-hidden="true" />}
                {unavailable
                  ? t('customer.temporarilyUnavailable')
                  : t('customer.addToCart')}
              </span>
              {!unavailable && (
                <span className="dish-detail__add-price">
                  <small>
                    {quantity > 1
                      ? `${money(unitPrice)} × ${quantity}`
                      : t('common.price')}
                  </small>
                  <strong>{money(finalPrice)}</strong>
                </span>
              )}
            </button>
          </footer>
        </div>
      </section>
    </div>
  )
}

function CartPanel({ cart, itemCount, onCheckout }) {
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
          <div className="cart-section__actions">
            <button className="order-button" type="button" onClick={onCheckout}>
              {t('customer.proceedToCheckout')}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </>
      )}
    </aside>
  )
}

const ORDER_PROGRESS_STAGES = ['NEW', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED']
const TERMINAL_ORDER_STATUSES = new Set(['COMPLETED', 'CANCELLED'])

function formatCustomerOrderTime(value, language) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'ky-KG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function OrderProgress({ status }) {
  const { t } = useLanguage()
  const normalizedStatus = String(status || '').toUpperCase()
  const cancelled = normalizedStatus === 'CANCELLED'
  const currentIndex = ORDER_PROGRESS_STAGES.indexOf(normalizedStatus)
  const progressPercent = currentIndex >= 0
    ? (currentIndex / (ORDER_PROGRESS_STAGES.length - 1)) * 100
    : 0
  const labels = {
    NEW: t('customer.orderStageNew'),
    PREPARING: t('customer.orderStagePreparing'),
    READY: t('customer.orderStageReady'),
    DELIVERED: t('customer.orderStageDelivered'),
    COMPLETED: t('customer.orderStageCompleted'),
  }

  if (cancelled) {
    return (
      <div className="customer-status-progress is-cancelled">
        <div className="customer-status-cancelled" role="status">
          <span aria-hidden="true">×</span>
          <div>
            <strong>{t('customer.orderStageCancelled')}</strong>
            <p>{t('customer.cancelledOrderHelp')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (currentIndex < 0) return null

  return (
    <div className="customer-status-progress">
      <div className="customer-status-visual">
        <div className="customer-status-track" aria-hidden="true">
          <span
            className="customer-status-track-fill"
            style={{ '--customer-order-progress': `${progressPercent}%` }}
          />
        </div>
        <ol
          className="customer-status-steps"
          aria-label={`${t('customer.orderProgress')}: ${labels[normalizedStatus]}`}
        >
          {ORDER_PROGRESS_STAGES.map((stage, index) => {
            const isDone = index < currentIndex
            const isCurrent = index === currentIndex
            return (
              <li
                className={`customer-status-step ${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`.trim()}
                aria-current={isCurrent ? 'step' : undefined}
                key={stage}
              >
                <span className="customer-status-marker" aria-hidden="true" />
                <small className="customer-status-label">{labels[stage]}</small>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

function CustomerOrderCard({ order, tableNumber }) {
  const { language, t } = useLanguage()
  const customerStatusLabels = {
    NEW: t('customer.orderStageNew'),
    PREPARING: t('customer.orderStagePreparing'),
    READY: t('customer.orderStageReady'),
    DELIVERED: t('customer.orderStageDelivered'),
    COMPLETED: t('customer.orderStageCompleted'),
    CANCELLED: t('customer.orderStageCancelled'),
  }
  const normalizedStatus = String(order.status || '').toUpperCase()
  const statusLabel = customerStatusLabels[normalizedStatus]
    || getStatusLabel(normalizedStatus, language)
  const statusClass = normalizedStatus.toLowerCase() || 'unknown'
  const createdAt = formatCustomerOrderTime(order.created_at, language)
  const items = Array.isArray(order.items) ? order.items : []

  return (
    <article className="order-card">
      <div className="order-card__heading">
        <div>
          <p>{t('customer.orderNumber')}</p>
          <h3>№{order.order_number}</h3>
          <div className="order-card__meta">
            {tableNumber !== null && tableNumber !== undefined && (
              <span>{t('customer.tableLabel', { number: tableNumber })}</span>
            )}
            {createdAt && <span>{t('customer.orderedAt', { time: createdAt })}</span>}
          </div>
        </div>
        <span
          className={`status-badge status-badge--${statusClass}`}
          role="status"
          aria-label={`${t('customer.orderStatus')}: ${statusLabel}`}
        >
          {statusLabel}
        </span>
      </div>

      <OrderProgress status={normalizedStatus} />

      <div className="order-card__content">
        <section className="order-card__items">
          <h4>{t('customer.orderComposition')}</h4>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <span>
                  <b>{item.quantity}×</b>
                  {getLocalizedField(item, 'name_at_order', language)}
                </span>
                <strong>{money(item.total_price)}</strong>
                {item.comment && (
                  <small>{t('customer.kitchenNote')}: {item.comment}</small>
                )}
              </li>
            ))}
          </ul>
        </section>
        <div className="order-card__total">
          <span>{t('common.total')}</span>
          <strong>{money(order.total_amount)}</strong>
        </div>
      </div>
    </article>
  )
}

export function OrderHistory({ orders, tableNumber, onBackToMenu }) {
  const { t } = useLanguage()
  const orderList = Array.isArray(orders?.orders) ? orders.orders : []
  const activeOrders = orderList.filter(
    (order) => !TERMINAL_ORDER_STATUSES.has(String(order.status || '').toUpperCase()),
  )
  const pastOrders = orderList.filter(
    (order) => TERMINAL_ORDER_STATUSES.has(String(order.status || '').toUpperCase()),
  )

  const renderOrders = (items) => (
    <div className="orders-list">
      {items.map((order) => (
        <CustomerOrderCard order={order} tableNumber={tableNumber} key={order.id} />
      ))}
    </div>
  )

  return (
    <section
      className="orders-section"
      id="orders"
      aria-labelledby="orders-title"
      tabIndex="-1"
    >
      <div className="orders-heading">
        <div>
          <p>{t('customer.orderTracking')}</p>
          <h2 id="orders-title">{t('customer.activeOrders')}</h2>
        </div>
        {activeOrders.length > 0 && <span>{activeOrders.length}</span>}
      </div>
      {activeOrders.length === 0 ? (
        <div className="orders-empty-state">
          <span aria-hidden="true"><OrdersIcon /></span>
          <strong>
            {orderList.length === 0 ? t('customer.emptyOrders') : t('customer.noActiveOrders')}
          </strong>
          <p>
            {orderList.length === 0
              ? t('customer.emptyOrdersHelp')
              : t('customer.noActiveOrdersHelp')}
          </p>
          {onBackToMenu && (
            <button type="button" onClick={onBackToMenu}>{t('customer.backToMenu')}</button>
          )}
        </div>
      ) : (
        renderOrders(activeOrders)
      )}

      {pastOrders.length > 0 && (
        <section className="customer-orders-past" aria-labelledby="past-orders-title">
          <div className="orders-heading">
            <div>
              <p>{t('customer.orderHistory')}</p>
              <h2 id="past-orders-title">{t('customer.pastOrders')}</h2>
            </div>
            <span>{pastOrders.length}</span>
          </div>
          {renderOrders(pastOrders)}
        </section>
      )}
    </section>
  )
}

function cartItemIsUnavailable(cartItem, menuItem) {
  return cartItem.is_available === false
    || !menuItem
    || menuItem.is_available === false
}

function CartReviewItem({ cartItem, menuItem, pending, onIncrease, onDecrease, onRemove }) {
  const { language, t } = useLanguage()
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = resolveImageUrl(menuItem?.image)
  const itemName = getLocalizedField(menuItem, 'name', language) || getLocalizedField(cartItem, 'menu_item_name', language)
  const unitPrice = cartItem.unit_price ?? Number(cartItem.line_total) / cartItem.quantity
  const unavailable = cartItemIsUnavailable(cartItem, menuItem)

  return (
    <article className={`cart-sheet-item ${unavailable ? 'is-unavailable' : ''}`}>
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
            {unavailable && <small className="cart-item-unavailable">{t('customer.temporarilyUnavailable')}</small>}
            {cartItem.comment && (
              <small className="cart-sheet-item__comment">
                {t('customer.kitchenNote')}: {cartItem.comment}
              </small>
            )}
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
              disabled={pending || unavailable}
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
              disabled={pending || unavailable}
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

function CheckoutReviewItem({
  cartItem,
  menuItem,
  pending,
  disabled,
  onIncrease,
  onDecrease,
  onRemove,
  onCommentChange,
}) {
  const { language, t } = useLanguage()
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = resolveImageUrl(menuItem?.image)
  const itemName = getLocalizedField(menuItem, 'name', language)
    || getLocalizedField(cartItem, 'menu_item_name', language)
  const unitPrice = cartItem.unit_price ?? Number(cartItem.line_total) / cartItem.quantity
  const unavailable = cartItemIsUnavailable(cartItem, menuItem)

  return (
    <article className={`checkout-item ${unavailable ? 'is-unavailable' : ''}`} aria-busy={pending}>
      <div className="checkout-item__media">
        {imageUrl && !imageFailed ? (
          <img src={imageUrl} alt="" onError={() => setImageFailed(true)} />
        ) : (
          <span aria-hidden="true">🍽</span>
        )}
      </div>
      <div className="checkout-item__body">
        <div className="checkout-item__top">
          <div className="checkout-item__copy">
            <h3>{itemName}</h3>
            <p>{money(unitPrice)}</p>
            {unavailable && <small className="cart-item-unavailable">{t('customer.temporarilyUnavailable')}</small>}
          </div>
          <strong className="checkout-item__subtotal">{money(cartItem.line_total)}</strong>
        </div>
        <div className="checkout-item__controls">
          <div className="cart-sheet-stepper" aria-label={`${itemName}: ${cartItem.quantity}`}>
            <button
              type="button"
              onClick={onDecrease}
              disabled={disabled || unavailable}
              title={t('customer.decreaseQuantity')}
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
              disabled={disabled || unavailable}
              title={t('customer.increaseQuantity')}
              aria-label={t('customer.increaseQuantity')}
            >
              +
            </button>
          </div>
          {pending && (
            <span className="checkout-item__updating" role="status">
              {t('customer.updatingCart')}
            </span>
          )}
          <button
            className="checkout-item__remove"
            type="button"
            onClick={onRemove}
            disabled={disabled}
            title={t('customer.removeItem')}
            aria-label={`${itemName}: ${t('customer.removeItem')}`}
          >
            <span aria-hidden="true">×</span>
            <small>{t('customer.removeItem')}</small>
          </button>
        </div>
        <label className="checkout-item__comment">
          <span>{t('customer.itemNote')}</span>
          <textarea
            rows="2"
            maxLength={300}
            value={cartItem.comment || ''}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder={t('customer.itemNotePlaceholder')}
            disabled={disabled}
          />
        </label>
      </div>
    </article>
  )
}

function CartReviewSheet({
  open,
  stage,
  cart,
  itemCount,
  tableNumber,
  menuItemsById,
  pendingItemId,
  submitting,
  error,
  onClose,
  onIncrease,
  onDecrease,
  onCommentChange,
  onRequestRemoval,
  onContinueOrdering,
  onCheckout,
  onBackToCart,
  onSubmit,
}) {
  const { language, t } = useLanguage()
  if (!open) return null
  const checkout = stage === 'checkout'
  const hasUnavailableItems = cart.items.some((cartItem) => (
    cartItemIsUnavailable(cartItem, menuItemsById.get(cartItem.menu_item))
  ))
  const unavailableMessage = t('errors.menuItemUnavailable')

  return (
    <div
      className="sheet-backdrop cart-sheet-backdrop"
      role="presentation"
      onMouseDown={submitting || pendingItemId !== null ? undefined : onClose}
    >
      <section
        className={`cart-sheet ${checkout ? 'cart-sheet--checkout' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-sheet-title"
        aria-busy={submitting || pendingItemId !== null}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="cart-sheet__heading">
          {checkout && (
            <button
              className="cart-sheet__back"
              type="button"
              onClick={onBackToCart}
              disabled={submitting || pendingItemId !== null}
              aria-label={t('customer.backToCart')}
            >
              <span aria-hidden="true">←</span>
            </button>
          )}
          <div>
            <h2 id="cart-sheet-title">
              {checkout ? t('customer.checkoutTitle') : t('customer.cart')}
            </h2>
            <p>
              {checkout
                ? t('customer.tableLabel', { number: tableNumber })
                : t('customer.itemCount', { count: itemCount })}
            </p>
          </div>
          <button
            className="cart-sheet__close"
            type="button"
            onClick={onClose}
            disabled={submitting || pendingItemId !== null}
            aria-label={t('customer.closeCart')}
          >
            ×
          </button>
        </header>

        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {hasUnavailableItems && error !== unavailableMessage && (
          <div className="notice notice--error" role="alert">{unavailableMessage}</div>
        )}

        {cart.items.length === 0 ? (
          <div className="cart-sheet-empty">
            <span aria-hidden="true"><CartIcon /></span>
            <strong>{t('customer.cartEmpty')}</strong>
            <button type="button" onClick={onClose}>{t('customer.goToMenu')}</button>
          </div>
        ) : checkout ? (
          <div className="checkout-review">
            <div className="checkout-review__order">
              <section className="checkout-table-card">
                <span aria-hidden="true">⌑</span>
                <div>
                  <small>{t('customer.yourTable')}</small>
                  <strong>{t('customer.tableLabel', { number: tableNumber })}</strong>
                </div>
              </section>

              <div className="checkout-kitchen-message">
                <span aria-hidden="true">✓</span>
                <p>{t('customer.sentToKitchenMessage')}</p>
              </div>

              <section className="checkout-review__items" aria-labelledby="checkout-items-title">
                <div className="checkout-review__section-heading">
                  <h3 id="checkout-items-title">{t('customer.orderComposition')}</h3>
                  <span>{t('customer.itemCount', { count: itemCount })}</span>
                </div>
                {cart.items.map((cartItem) => {
                  const menuItem = menuItemsById.get(cartItem.menu_item)
                  const item = menuItem || { id: cartItem.menu_item }
                  const itemName = getLocalizedField(menuItem, 'name', language)
                    || getLocalizedField(cartItem, 'menu_item_name', language)

                  return (
                    <CheckoutReviewItem
                      key={cartItem.id}
                      cartItem={cartItem}
                      menuItem={menuItem}
                      pending={pendingItemId === item.id}
                      disabled={submitting || pendingItemId !== null}
                      onIncrease={() => onIncrease(item, cartItem)}
                      onDecrease={() => (
                        cartItem.quantity === 1
                          ? onRequestRemoval(item, cartItem, itemName)
                          : onDecrease(item, cartItem)
                      )}
                      onRemove={() => onRequestRemoval(item, cartItem, itemName)}
                      onCommentChange={(comment) => onCommentChange(cartItem, comment)}
                    />
                  )
                })}
              </section>
            </div>

            <aside className="checkout-summary" aria-label={t('customer.orderSummary')}>
              <div>
                <p>{t('customer.yourOrder')}</p>
                <h3>{t('customer.orderSummary')}</h3>
              </div>
              <dl>
                <div>
                  <dt>{t('customer.dishes')}</dt>
                  <dd>{t('customer.itemCount', { count: itemCount })}</dd>
                </div>
                <div>
                  <dt>{t('customer.subtotal')}</dt>
                  <dd>{money(cart.total)}</dd>
                </div>
                <div className="checkout-summary__total">
                  <dt>{t('common.total')}</dt>
                  <dd>{money(cart.total)}</dd>
                </div>
              </dl>
              <button
                className="order-button"
                type="button"
                onClick={onSubmit}
                disabled={submitting || pendingItemId !== null || cart.items.length === 0 || hasUnavailableItems}
              >
                {submitting ? t('customer.placingOrder') : t('customer.sendOrderToKitchen')}
                {!submitting && <span aria-hidden="true">→</span>}
              </button>
              <small>{t('customer.submitOrderHelp')}</small>
            </aside>
          </div>
        ) : (
          <div className="cart-sheet__body">
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
              <div className="cart-sheet__total-breakdown">
                <div>
                  <span>{t('customer.subtotal')}</span>
                  <strong>{money(cart.total)}</strong>
                </div>
                <div>
                  <span>{t('common.total')}</span>
                  <strong>{money(cart.total)}</strong>
                </div>
              </div>
              <div className="cart-sheet__actions">
                <button type="button" onClick={onContinueOrdering}>
                  {t('customer.continueOrdering')}
                </button>
                <button
                  className="order-button"
                  type="button"
                  onClick={onCheckout}
                  disabled={pendingItemId !== null || hasUnavailableItems}
                >
                  {t('customer.proceedToCheckout')}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </footer>
          </div>
        )}
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
      <span className="mobile-cart-bar__summary">
        <small>{t('customer.itemCount', { count: itemCount })}</small>
        <strong>{money(total)}</strong>
      </span>
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

export function WaiterCallSheet({ open, sending, onClose, onCall }) {
  const { t } = useLanguage()
  const waiterReasons = [
    { value: 'WAITER_NEEDED', label: t('customer.waiterNeeded'), subtitle: t('customer.waiterNeededHelp'), icon: '🙋' },
    { value: 'BILL_REQUEST', label: t('customer.billRequest'), subtitle: t('customer.billRequestHelp'), icon: '🧾' },
    { value: 'EXTRA_ORDER', label: t('customer.extraOrder'), subtitle: t('customer.extraOrderHelp'), icon: '＋' },
    { value: 'HELP_NEEDED', label: t('customer.helpNeeded'), subtitle: t('customer.helpNeededHelp'), icon: '💬' },
  ]
  if (!open) return null

  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onMouseDown={sending ? undefined : onClose}
    >
      <section
        className="waiter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waiter-sheet-title"
        aria-busy={sending}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="waiter-sheet__heading">
          <div>
            <h2 id="waiter-sheet-title">{t('customer.callWaiter')}</h2>
            <p>{t('customer.chooseWaiterReason')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        {sending && (
          <p className="waiter-sheet__status" role="status" aria-live="polite">
            <span className="button-loader" aria-hidden="true" />
            {t('customer.callingWaiter')}
          </p>
        )}
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
  const confirm = useConfirm()
  const sessionRequestRef = useRef({ basePath: '', promise: null })
  const orderSubmitInFlightRef = useRef(false)
  const waiterCallInFlightRef = useRef(false)
  const cartUpdateInFlightRef = useRef(false)
  const [menu, setMenu] = useState(null)
  const [cart, setCart] = useState(emptyCart)
  const [orders, setOrders] = useState(emptyOrders)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadRevision, setLoadRevision] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showOrdersSuccessAction, setShowOrdersSuccessAction] = useState(false)
  const [pendingMenuItemId, setPendingMenuItemId] = useState(null)
  const [submittingOrder, setSubmittingOrder] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [selectedDish, setSelectedDish] = useState(null)
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [cartStage, setCartStage] = useState('cart')
  const [waiterSheetOpen, setWaiterSheetOpen] = useState(false)
  const [sendingWaiterCall, setSendingWaiterCall] = useState(false)

  const basePath = `/api/public/qr/${encodeURIComponent(qrToken)}`
  const customerOrdersPath = `/menu/${encodeURIComponent(qrToken)}/orders`
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
  }, [basePath, loadRevision])

  useEffect(() => {
    if (!waiterSheetOpen) return undefined

    function closeOnEscape(event) {
      if (event.key === 'Escape' && !sendingWaiterCall) setWaiterSheetOpen(false)
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [sendingWaiterCall, waiterSheetOpen])

  useEffect(() => {
    if (!cartSheetOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function closeOnEscape(event) {
      if (event.key !== 'Escape') return
      setCartSheetOpen(false)
      setCartStage('cart')
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [cartSheetOpen])

  useEffect(() => {
    if (!selectedDish) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function closeOnEscape(event) {
      if (event.key === 'Escape' && pendingMenuItemId === null) setSelectedDish(null)
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [pendingMenuItemId, selectedDish])

  async function refreshCart() {
    const response = await apiClient.get(`${basePath}/cart/`)
    setCart(normalizeCart(response.data))
  }

  async function refreshMenu() {
    const response = await apiClient.get(`${basePath}/menu/`)
    const nextMenu = normalizeMenu(response.data)
    if (!nextMenu) throw new Error('Invalid customer menu response')
    setMenu(nextMenu)
  }

  async function refreshOrders() {
    const response = await apiClient.get(`${basePath}/orders/`)
    setOrders(response.data)
  }

  function openCartSheet(stage = 'cart') {
    setCartStage(stage)
    setCartSheetOpen(true)
    Promise.allSettled([refreshMenu(), refreshCart()])
  }

  function closeCartSheet() {
    setCartSheetOpen(false)
    setCartStage('cart')
  }

  async function addToCart(item, options = {}) {
    const quantity = options.quantity ?? 1
    const comment = options.comment ?? ''
    setPendingMenuItemId(item.id)
    setError('')
    setSuccess('')
    setShowOrdersSuccessAction(false)

    try {
      await apiClient.post(`${basePath}/cart/items/`, {
        menu_item: item.id,
        quantity,
        comment,
      })
      await refreshCart()
      return true
    } catch (requestError) {
      setError(getBackendErrorMessage(requestError, language))
      return false
    } finally {
      setPendingMenuItemId(null)
    }
  }

  function addMenuItem(item) {
    addToCart(item)
  }

  async function changeCartItemQuantity(item, cartItem, quantity) {
    if (cartUpdateInFlightRef.current) return false

    cartUpdateInFlightRef.current = true
    setPendingMenuItemId(item.id)
    setError('')
    setSuccess('')
    setShowOrdersSuccessAction(false)

    try {
      const itemPath = `${basePath}/cart/items/${cartItem.id}/`
      let updatedItem = null
      if (quantity > 0) {
        const response = await apiClient.patch(itemPath, {
          quantity,
          comment: cartItem.comment || '',
        })
        updatedItem = response.data
      } else {
        await apiClient.delete(itemPath)
      }
      setCart((current) => applyCartItemMutation(current, cartItem.id, updatedItem))
      await refreshCart().catch(() => undefined)
      return true
    } catch (requestError) {
      setError(getBackendErrorMessage(requestError, language))
      return false
    } finally {
      cartUpdateInFlightRef.current = false
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

  function changeCartItemComment(cartItem, comment) {
    setCart((current) => {
      const currentItem = current.items.find((item) => item.id === cartItem.id)
      if (!currentItem) return current
      return applyCartItemMutation(current, cartItem.id, {
        ...currentItem,
        comment,
      })
    })
  }

  async function requestCartItemRemoval(item, cartItem, itemName = '') {
    if (cartUpdateInFlightRef.current) return false
    const resolvedName = itemName
      || getLocalizedField(item, 'name', language)
      || getLocalizedField(cartItem, 'menu_item_name', language)
    const confirmed = await confirm({
      message: t('confirmation.cartItemMessage', { name: resolvedName }),
    })
    if (!confirmed || cartUpdateInFlightRef.current) return false
    return removeCartItem(item, cartItem)
  }

  function decreaseCartItemSafely(item, cartItem) {
    if (cartItem.quantity === 1) {
      return requestCartItemRemoval(item, cartItem)
    }
    return decreaseCartItem(item, cartItem)
  }

  async function submitOrder() {
    if (orderSubmitInFlightRef.current || cart.items.length === 0) return
    if (cart.items.some((cartItem) => (
      cartItemIsUnavailable(cartItem, menuItemsById.get(cartItem.menu_item))
    ))) {
      setError(t('errors.menuItemUnavailable'))
      setCartSheetOpen(true)
      return
    }

    orderSubmitInFlightRef.current = true
    setSubmittingOrder(true)
    setError('')
    setSuccess('')
    setShowOrdersSuccessAction(false)

    try {
      await Promise.all(
        cart.items.map((cartItem) => (
          apiClient.patch(`${basePath}/cart/items/${cartItem.id}/`, {
            comment: cartItem.comment || '',
          })
        )),
      )
      const response = await apiClient.post(`${basePath}/orders/`)
      const createdOrder = response.data

      setCart(emptyCart)
      setOrders((current) => {
        const currentOrders = Array.isArray(current.orders) ? current.orders : []
        const alreadyPresent = currentOrders.some((order) => order.id === createdOrder?.id)
        if (alreadyPresent || !createdOrder) return current
        return {
          ...current,
          orders: [createdOrder, ...currentOrders],
          total_amount: (
            Number(current.total_amount ?? 0) + Number(createdOrder?.total_amount ?? 0)
          ).toFixed(2),
        }
      })
      setCartSheetOpen(false)
      setCartStage('cart')
      setSuccess(
        createdOrder?.order_number
          ? t('customer.orderAcceptedWithNumber', { number: createdOrder.order_number })
          : t('customer.orderAccepted'),
      )
      setShowOrdersSuccessAction(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      await Promise.allSettled([refreshCart(), refreshOrders()])
    } catch (requestError) {
      const message = getBackendErrorMessage(requestError, language)
      if (message === t('errors.menuItemUnavailable')) {
        await Promise.allSettled([refreshMenu(), refreshCart()])
      }
      setError(message)
    } finally {
      orderSubmitInFlightRef.current = false
      setSubmittingOrder(false)
    }
  }

  async function callWaiter(reason) {
    if (waiterCallInFlightRef.current) return

    waiterCallInFlightRef.current = true
    setSendingWaiterCall(true)
    setError('')
    setSuccess('')
    setShowOrdersSuccessAction(false)

    try {
      await apiClient.post(`${basePath}/waiter-calls/`, { reason })
      setWaiterSheetOpen(false)
      setSuccess(t('customer.waiterCalled'))
    } catch (requestError) {
      setError(getBackendErrorMessage(requestError, language))
      setWaiterSheetOpen(false)
    } finally {
      waiterCallInFlightRef.current = false
      setSendingWaiterCall(false)
    }
  }

  if (loading) {
    return (
      <main className="page-state customer-page-state">
        <span className="loader" aria-hidden="true" />
        <span className="customer-page-state__copy">
          <strong>{t('customer.menuLoading')}</strong>
          <small>{t('customer.menuLoadingHelp')}</small>
        </span>
      </main>
    )
  }

  if (!menu) {
    return (
      <main className="page-state page-state--error customer-page-state" role="alert">
        <span className="state-icon" aria-hidden="true">!</span>
        <span className="customer-page-state__copy">
          <strong>{loadFailed ? t('customer.menuLoadError') : t('customer.menuEmpty')}</strong>
          <small>{loadFailed ? t('customer.menuLoadErrorHelp') : t('customer.menuEmptyHelp')}</small>
        </span>
        {loadFailed && (
          <button
            className="page-state__action"
            type="button"
            onClick={() => setLoadRevision((value) => value + 1)}
          >
            {t('common.tryAgain')}
          </button>
        )}
      </main>
    )
  }

  const visibleItemCount = visibleCategories.reduce(
    (sum, category) => sum + category.items.length,
    0,
  )
  const menuItemCount = menu.categories.reduce(
    (sum, category) => sum + category.items.length,
    0,
  )
  const filtersActive = Boolean(search.trim()) || activeCategory !== 'all'

  return (
    <main className={`customer-menu ${cartItemCount > 0 ? 'has-mobile-cart' : ''}`}>
      <CustomerHeader />

      <section className="customer-menu-hero">
        <div className="customer-menu-hero__copy">
          <p>{t('customer.restaurantMenu')}</p>
          <h1>{menu.restaurant?.name || 'Dastorkon'}</h1>
          <span>{t('customer.chooseDishHelp')}</span>
        </div>
        <CustomerContextBar
          tableNumber={menu.table.number}
          orderCount={orders.orders.length}
          onOrdersClick={() => navigate(customerOrdersPath)}
        />
      </section>

      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {success && (
        <div className={`notice notice--success${showOrdersSuccessAction ? ' notice--order-success' : ''}`}>
          <span role="status">{success}</span>
          {showOrdersSuccessAction && (
            <button
              className="order-success__action"
              type="button"
              onClick={() => navigate(customerOrdersPath)}
            >
              {t('customer.viewMyOrders')}
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      )}

      <section className="menu-tools" aria-label={t('customer.searchAndCategories')}>
        <div className="menu-tools__search-row">
          <SearchBar search={search} onSearchChange={setSearch} onClear={() => setSearch('')} />
        </div>
        <div className="menu-tools__categories-row">
          <CategoryChips
            categories={menu.categories}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        </div>
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
              <strong>{menuItemCount === 0 ? t('customer.menuEmpty') : t('customer.noSearchResults')}</strong>
              <p>{menuItemCount === 0 ? t('customer.menuEmptyHelp') : t('customer.noSearchResultsHelp')}</p>
              {filtersActive && menuItemCount > 0 && (
                <button
                  className="empty-message__action"
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setActiveCategory('all')
                  }}
                >
                  {t('customer.clearFilters')}
                </button>
              )}
            </div>
          ) : (
            visibleCategories.map((category) => (
              <section className="category" key={category.id}>
                <div className="category__heading">
                  <h3>{getCategoryLabel(category, language)}</h3>
                </div>
                <div className="menu-items">
                  {category.items.map((item) => (
                    <MenuItemCard
                      item={item}
                      cartItem={cartItemsByMenuItem.get(item.id)}
                      pendingItemId={pendingMenuItemId}
                      onAdd={addMenuItem}
                      onIncrease={increaseCartItem}
                      onDecrease={decreaseCartItemSafely}
                      onOpenDetail={setSelectedDish}
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
          onCheckout={() => openCartSheet('checkout')}
        />
      </div>

      {selectedDish && (
        <DishDetailDialog
          item={selectedDish}
          pending={pendingMenuItemId === selectedDish.id}
          onClose={() => setSelectedDish(null)}
          onAdd={addToCart}
          key={selectedDish.id}
        />
      )}

      {cartItemCount > 0 && (
        <StickyCartBar
          itemCount={cartItemCount}
          total={cart.total}
          onOpen={() => openCartSheet('cart')}
        />
      )}

      <CartReviewSheet
        open={cartSheetOpen}
        stage={cartStage}
        cart={cart}
        itemCount={cartItemCount}
        tableNumber={menu.table.number}
        menuItemsById={menuItemsById}
        pendingItemId={pendingMenuItemId}
        submitting={submittingOrder}
        error={error}
        onClose={closeCartSheet}
        onIncrease={increaseCartItem}
        onDecrease={decreaseCartItem}
        onCommentChange={changeCartItemComment}
        onRequestRemoval={requestCartItemRemoval}
        onContinueOrdering={closeCartSheet}
        onCheckout={() => setCartStage('checkout')}
        onBackToCart={() => setCartStage('cart')}
        onSubmit={submitOrder}
      />

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
