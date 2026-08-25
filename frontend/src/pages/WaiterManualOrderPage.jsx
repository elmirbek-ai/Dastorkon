import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { waiterApiClient, WAITER_TOKEN_KEY } from '../api/client.js'
import MenuItemBadges from '../components/MenuItemBadges.jsx'
import {
  DraftItemModifiers,
  ModifierGroupsPicker,
} from '../components/ItemModifiers.jsx'
import {
  modifierSelectionPayload,
  modifierSelectionTotal,
  selectedModifierDetails,
  validateModifierSelection,
} from '../components/modifierUtils.js'
import { useConfirm } from '../components/confirmation/useConfirm.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage, getLocalizedField } from '../i18n/index.js'

const steps = ['table', 'menu', 'confirm']

function formatMoney(value) {
  const amount = Number(value ?? 0)
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} сом`
}

function responseList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  return null
}

function TableStatus({ table, t }) {
  const isFree = table.status === 'FREE' && !table.active_session_id
  let assignmentLabel = t('waiter.availableToTake')
  if (table.is_assigned_to_current_waiter) assignmentLabel = t('waiter.assignedToYou')
  if (!table.can_use) assignmentLabel = t('waiter.assignedToAnother')

  return (
    <span className={`waiter-manual-table-status ${table.can_use ? 'is-usable' : 'is-blocked'}`}>
      <b>{isFree ? t('waiter.freeTable') : t('waiter.occupiedTable')}</b>
      <small>{assignmentLabel}</small>
    </span>
  )
}

function WaiterModifierDialog({ item, onClose, onAdd }) {
  const { language, t } = useLanguage()
  const [selections, setSelections] = useState({})
  const [validationError, setValidationError] = useState(null)
  const itemName = getLocalizedField(item, 'name', language)
  const unitPrice = Number(item.price) + modifierSelectionTotal(item, selections)

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function submit() {
    const error = validateModifierSelection(item, selections, t)
    setValidationError(error)
    if (error) return
    onAdd(item, selections)
    onClose()
  }

  function changeSelections(value) {
    setSelections(value)
    setValidationError(null)
  }

  return (
    <div className="waiter-modifier-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="waiter-modifier-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waiter-modifier-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>{t('modifiers.customizeItem')}</small>
            <h2 id="waiter-modifier-title">{itemName}</h2>
            <MenuItemBadges item={item} className="waiter-manual-item-badges" />
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
        </header>
        {validationError && (
          <p className="modifier-picker__error" role="alert">{validationError.message}</p>
        )}
        <ModifierGroupsPicker
          item={item}
          selections={selections}
          onChange={changeSelections}
          invalidGroupId={validationError?.groupId}
        />
        <footer>
          <button type="button" onClick={onClose}>{t('common.cancel')}</button>
          <button className="is-primary" type="button" onClick={submit}>
            <span>{t('waiter.addItem')}</span>
            <strong>{formatMoney(unitPrice)}</strong>
          </button>
        </footer>
      </section>
    </div>
  )
}

export default function WaiterManualOrderPage() {
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const confirm = useConfirm()
  const submitInFlightRef = useRef(false)
  const [step, setStep] = useState('table')
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState({})
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [loadingTables, setLoadingTables] = useState(true)
  const [loadingMenu, setLoadingMenu] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdOrder, setCreatedOrder] = useState(null)
  const [customizingItem, setCustomizingItem] = useState(null)

  const logoutExpired = useCallback(() => {
    localStorage.removeItem(WAITER_TOKEN_KEY)
    navigate('/waiter/login', {
      replace: true,
      state: { authError: t('auth.sessionExpired') },
    })
  }, [navigate, t])

  const handleRequestError = useCallback((requestError) => {
    if (requestError.response?.status === 401) {
      logoutExpired()
      return
    }
    setError(getBackendErrorMessage(requestError, language))
  }, [language, logoutExpired])

  const loadTables = useCallback(async () => {
    setLoadingTables(true)
    setError('')
    try {
      const response = await waiterApiClient.get('/api/waiter/manual-order/tables/')
      const responseTables = responseList(response.data)
      if (!responseTables) throw new Error('Unexpected manual-order table response.')
      setTables(responseTables)
      setSelectedTable((current) => (
        current
          ? responseTables.find((table) => table.id === current.id) || current
          : null
      ))
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setLoadingTables(false)
    }
  }, [handleRequestError])

  const loadMenu = useCallback(async (tableId) => {
    setLoadingMenu(true)
    setError('')
    try {
      const response = await waiterApiClient.get(
        '/api/waiter/manual-order/menu-items/',
        { params: { table_id: tableId } },
      )
      const responseItems = responseList(response.data)
      if (!responseItems) throw new Error('Unexpected manual-order menu response.')
      setMenuItems(responseItems)
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setLoadingMenu(false)
    }
  }, [handleRequestError])

  useEffect(() => {
    const timer = window.setTimeout(loadTables, 0)
    return () => window.clearTimeout(timer)
  }, [loadTables])

  const categories = useMemo(() => {
    const seen = new Map()
    menuItems.forEach((item) => {
      if (!seen.has(item.category)) {
        seen.set(item.category, {
          id: item.category,
          name_ky: item.category_name_ky,
          name_ru: item.category_name_ru,
        })
      }
    })
    return [...seen.values()]
  }, [menuItems])

  const filteredMenuItems = useMemo(() => {
    const locale = language === 'ru' ? 'ru' : 'ky'
    const normalizedQuery = query.trim().toLocaleLowerCase(locale)
    return menuItems.filter((item) => {
      if (categoryFilter && item.category !== Number(categoryFilter)) return false
      if (!normalizedQuery) return true
      return `${item.name_ky} ${item.name_ru}`
        .toLocaleLowerCase(locale)
        .includes(normalizedQuery)
    })
  }, [categoryFilter, language, menuItems, query])

  const cartItems = useMemo(() => Object.values(cart), [cart])
  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0)
  const cartTotal = cartItems.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0,
  )

  function lineKeyFor(menuItem, selectedModifiers = []) {
    const optionIds = selectedModifiers
      .flatMap((selection) => selection.option_ids)
      .sort((first, second) => first - second)
    return `${menuItem.id}:${optionIds.join('-')}`
  }

  function selectTable(table) {
    if (!table.can_use) {
      setError(t('errors.tableAssignedToAnotherWaiter'))
      return
    }
    setSelectedTable(table)
    setCart({})
    setMenuItems([])
    setCustomizingItem(null)
    setQuery('')
    setCategoryFilter('')
    setError('')
    setStep('menu')
    loadMenu(table.id)
  }

  function changeTable() {
    setSelectedTable(null)
    setCart({})
    setMenuItems([])
    setError('')
    setStep('table')
    loadTables()
  }

  function addItem(menuItem, selections = {}) {
    if (!menuItem.is_available) return
    const selectedModifiers = modifierSelectionPayload(menuItem, selections)
    const lineKey = lineKeyFor(menuItem, selectedModifiers)
    const unitPrice = Number(menuItem.price) + modifierSelectionTotal(menuItem, selections)
    setCart((current) => {
      const existing = current[lineKey]
      return {
        ...current,
        [lineKey]: {
          lineKey,
          menuItem,
          quantity: (existing?.quantity || 0) + 1,
          comment: existing?.comment || '',
          selectedModifiers,
          modifierDetails: selectedModifierDetails(menuItem, selections),
          unitPrice,
        },
      }
    })
  }

  function requestAddItem(menuItem) {
    if ((menuItem.modifier_groups || []).length > 0) {
      setCustomizingItem(menuItem)
      return
    }
    addItem(menuItem)
  }

  function setQuantity(lineKey, quantity) {
    setCart((current) => {
      if (quantity <= 0) {
        const next = { ...current }
        delete next[lineKey]
        return next
      }
      return {
        ...current,
        [lineKey]: { ...current[lineKey], quantity },
      }
    })
  }

  async function removeDraftItem(line) {
    const confirmed = await confirm({
      message: t('confirmation.orderItemMessage', {
        name: getLocalizedField(line.menuItem, 'name', language),
      }),
    })
    if (confirmed) setQuantity(line.lineKey, 0)
  }

  function decreaseDraftItem(line) {
    if (line.quantity === 1) {
      removeDraftItem(line)
      return
    }
    setQuantity(line.lineKey, line.quantity - 1)
  }

  function setComment(lineKey, comment) {
    setCart((current) => ({
      ...current,
      [lineKey]: { ...current[lineKey], comment },
    }))
  }

  async function submitOrder() {
    if (!selectedTable || cartItems.length === 0 || submitInFlightRef.current) return
    submitInFlightRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const response = await waiterApiClient.post(
        '/api/waiter/manual-order/orders/',
        {
          table_id: selectedTable.id,
          items: cartItems.map((item) => ({
            menu_item_id: item.menuItem.id,
            quantity: item.quantity,
            comment: item.comment,
            selected_modifiers: item.selectedModifiers,
          })),
        },
      )
      setCreatedOrder(response.data)
      setCart({})
      setStep('success')
      loadTables()
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      submitInFlightRef.current = false
      setSubmitting(false)
    }
  }

  function addAnotherOrder() {
    setCreatedOrder(null)
    setError('')
    setStep('menu')
    if (selectedTable) loadMenu(selectedTable.id)
  }

  const currentStepIndex = steps.indexOf(step)

  return (
    <main className="waiter-manual-order-page">
      <header className="waiter-manual-order-header">
        <button type="button" onClick={() => navigate('/waiter/dashboard')}>{t('common.back')}</button>
        <div><strong>{t('waiter.manualOrder')}</strong><small>{t('waiter.manualOrderShortHelp')}</small></div>
      </header>

      <div className="waiter-manual-order-content">
        {step !== 'success' && (
          <ol className="waiter-manual-order-steps" aria-label={t('waiter.manualOrder')}>
            {steps.map((item, index) => (
              <li className={index <= currentStepIndex ? 'is-active' : ''} key={item}>
                <span>{index + 1}</span>
                <small>{t(`waiter.step${item[0].toUpperCase()}${item.slice(1)}`)}</small>
              </li>
            ))}
          </ol>
        )}

        {error && <div className="waiter-manual-order-message is-error" role="alert">{error}</div>}

        {step === 'table' && (
          <section className="waiter-manual-order-section">
            <header><small>Dastorkon</small><h1>{t('waiter.selectTable')}</h1><p>{t('waiter.selectTableHelp')}</p></header>
            {loadingTables ? (
              <div className="waiter-manual-order-state"><span className="waiter-screen-spinner" /><strong>{t('common.loading')}</strong></div>
            ) : tables.length ? (
              <div className="waiter-manual-table-grid">
                {tables.map((table) => (
                  <button
                    className={`${table.can_use ? 'is-usable' : 'is-blocked'} ${table.is_assigned_to_current_waiter ? 'is-own' : ''}`}
                    type="button"
                    onClick={() => selectTable(table)}
                    disabled={!table.can_use}
                    key={table.id}
                  >
                    <span><small>{table.restaurant_name}</small><strong>№{table.number}</strong></span>
                    <TableStatus table={table} t={t} />
                  </button>
                ))}
              </div>
            ) : !error ? (
              <div className="waiter-manual-order-state"><strong>{t('waiter.noManualOrderTables')}</strong><p>{t('waiter.noManualOrderTablesHelp')}</p></div>
            ) : null}
          </section>
        )}

        {step === 'menu' && selectedTable && (
          <section className="waiter-manual-order-section">
            <header className="waiter-manual-menu-heading">
              <div><small>{t('customer.tableLabel', { number: selectedTable.number })}</small><h1>{t('waiter.selectMenuItems')}</h1><p>{t('waiter.manualOrderHelp')}</p></div>
              <button type="button" onClick={changeTable}>{t('waiter.changeTable')}</button>
            </header>

            <div className="waiter-manual-menu-toolbar">
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('waiter.searchManualMenu')} aria-label={t('waiter.searchManualMenu')} />
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label={t('waiter.allMenuCategories')}>
                <option value="">{t('waiter.allMenuCategories')}</option>
                {categories.map((category) => <option value={category.id} key={category.id}>{getLocalizedField(category, 'name', language)}</option>)}
              </select>
            </div>

            {loadingMenu ? (
              <div className="waiter-manual-order-state"><span className="waiter-screen-spinner" /><strong>{t('common.loading')}</strong></div>
            ) : filteredMenuItems.length ? (
              <div className="waiter-manual-menu-grid">
                {filteredMenuItems.map((item) => {
                  const itemName = getLocalizedField(item, 'name', language)
                  const hasModifiers = (item.modifier_groups || []).length > 0
                  const simpleLine = cart[lineKeyFor(item)]
                  const quantity = hasModifiers
                    ? cartItems
                        .filter((line) => line.menuItem.id === item.id)
                        .reduce((total, line) => total + line.quantity, 0)
                    : (simpleLine?.quantity || 0)
                  return (
                    <article className={!item.is_available ? 'is-unavailable' : ''} key={item.id}>
                      <span className="waiter-manual-item-mark" aria-hidden="true">{itemName.slice(0, 1)}</span>
                      <div><small>{getLocalizedField(item, 'category_name', language)}</small><h2>{itemName}</h2><MenuItemBadges item={item} className="waiter-manual-item-badges" /><strong>{formatMoney(item.price)}</strong></div>
                      {item.is_available ? (
                        quantity && !hasModifiers ? (
                          <span className="waiter-manual-menu-stepper">
                            <button type="button" onClick={() => decreaseDraftItem(simpleLine)} aria-label={t('customer.decreaseQuantity')}>−</button>
                            <b aria-live="polite">{quantity}</b>
                            <button type="button" onClick={() => setQuantity(simpleLine.lineKey, quantity + 1)} aria-label={t('customer.increaseQuantity')}>+</button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => requestAddItem(item)}>
                            {t('waiter.addItem')}{quantity > 0 ? ` · ${quantity}` : ''}
                          </button>
                        )
                      ) : <span className="waiter-manual-unavailable">{t('customer.temporarilyUnavailable')}</span>}
                    </article>
                  )
                })}
              </div>
            ) : !error ? (
              <div className="waiter-manual-order-state">
                <strong>{menuItems.length ? t('waiter.noMenuMatches') : t('waiter.noManualMenuItems')}</strong>
                <p>{menuItems.length ? t('waiter.noMenuMatchesHelp') : t('waiter.noManualMenuItemsHelp')}</p>
              </div>
            ) : null}

            <div className="waiter-manual-cart-bar">
              <span><small>{t('waiter.selectedItems')}</small><strong>{t('waiter.manualOrderItemCount', { count: cartCount })} · {formatMoney(cartTotal)}</strong></span>
              <button type="button" onClick={() => setStep('confirm')} disabled={!cartItems.length}>{t('waiter.reviewOrder')}</button>
            </div>
          </section>
        )}

        {step === 'confirm' && selectedTable && (
          <section className="waiter-manual-order-section waiter-manual-confirm">
            <header><small>{t('waiter.selectedTable')}</small><h1>{t('customer.tableLabel', { number: selectedTable.number })}</h1><p>{t('waiter.reviewOrder')}</p></header>
            {cartItems.length ? (
              <div className="waiter-manual-cart-list">
                {cartItems.map((line) => (
                  <article key={line.lineKey}>
                    <div className="waiter-manual-cart-item-info">
                      <strong>{getLocalizedField(line.menuItem, 'name', language)}</strong>
                      <DraftItemModifiers modifiers={line.modifierDetails} />
                      <small>{formatMoney(line.unitPrice)} × {line.quantity}</small>
                    </div>
                    <div className="waiter-manual-line-controls">
                      <button className="waiter-manual-remove-item" type="button" onClick={() => removeDraftItem(line)}>{t('common.delete')}</button>
                      <span className="waiter-manual-quantity">
                        <button type="button" onClick={() => decreaseDraftItem(line)} aria-label={t('customer.decreaseQuantity')}>−</button>
                        <b>{line.quantity}</b>
                        <button type="button" onClick={() => setQuantity(line.lineKey, line.quantity + 1)} aria-label={t('customer.increaseQuantity')}>+</button>
                      </span>
                      <strong>{formatMoney(line.unitPrice * line.quantity)}</strong>
                    </div>
                    <label className="waiter-manual-item-comment">
                      <span>{t('waiter.itemNote')}</span>
                      <textarea rows="2" maxLength={300} value={line.comment} onChange={(event) => setComment(line.lineKey, event.target.value)} placeholder={t('waiter.itemNotePlaceholder')} />
                    </label>
                  </article>
                ))}
              </div>
            ) : (
              <div className="waiter-manual-order-state"><strong>{t('waiter.cartEmpty')}</strong><p>{t('waiter.cartEmptyHelp')}</p></div>
            )}
            <div className="waiter-manual-confirm-total"><span>{t('waiter.manualOrderTotal')}</span><strong>{formatMoney(cartTotal)}</strong></div>
            <div className="waiter-manual-confirm-actions">
              <button type="button" onClick={() => setStep('menu')} disabled={submitting}>{t('common.back')}</button>
              <button className="is-primary" type="button" onClick={submitOrder} disabled={!cartItems.length || submitting}>{submitting ? t('waiter.sendingManualOrder') : t('waiter.confirmManualOrder')}</button>
            </div>
          </section>
        )}

        {step === 'success' && createdOrder && selectedTable && (
          <section className="waiter-manual-success" role="status">
            <span aria-hidden="true">✓</span>
            <small>Dastorkon</small>
            <h1>{t('waiter.manualOrderCreated')}</h1>
            <p>{t('waiter.manualOrderCreatedHelp', { number: createdOrder.order_number, table: selectedTable.number })}</p>
            <div><small>{t('common.total')}</small><strong>{formatMoney(createdOrder.total_amount)}</strong></div>
            <button className="is-primary" type="button" onClick={addAnotherOrder}>{t('waiter.addAnotherOrder')}</button>
            <button type="button" onClick={() => navigate('/waiter/dashboard')}>{t('waiter.backToDashboard')}</button>
          </section>
        )}
      </div>
      {customizingItem && (
        <WaiterModifierDialog
          item={customizingItem}
          onClose={() => setCustomizingItem(null)}
          onAdd={addItem}
        />
      )}
    </main>
  )
}
