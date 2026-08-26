import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { waiterApiClient, WAITER_TOKEN_KEY } from '../api/client.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage, getLocalizedField } from '../i18n/index.js'

function formatMoney(value) {
  const amount = Number(value ?? 0)
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} сом`
}

function menuItemsFromResponse(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  return null
}

export default function WaiterMenuAvailabilityPage() {
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const noticeTimerRef = useRef(null)
  const mutationInFlightRef = useRef(false)
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const logoutExpired = useCallback(() => {
    localStorage.removeItem(WAITER_TOKEN_KEY)
    navigate('/waiter/login', {
      replace: true,
      state: { authError: t('auth.sessionExpired') },
    })
  }, [navigate, t])

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await waiterApiClient.get('/api/waiter/menu-items/')
      const responseItems = menuItemsFromResponse(response.data)
      if (!responseItems) {
        setItems([])
        setError(t('errors.generic'))
        return
      }
      setItems(responseItems)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logoutExpired()
        return
      }
      setError(getBackendErrorMessage(requestError, language))
    } finally {
      setLoading(false)
    }
  }, [language, logoutExpired, t])

  useEffect(() => {
    const timer = window.setTimeout(loadItems, 0)
    return () => window.clearTimeout(timer)
  }, [loadItems])

  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), [])

  const categories = useMemo(() => {
    const seen = new Map()
    items.forEach((item) => {
      if (!seen.has(item.category)) {
        seen.set(item.category, {
          id: item.category,
          name_ky: item.category_name_ky,
          name_ru: item.category_name_ru,
        })
      }
    })
    return [...seen.values()]
  }, [items])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(language === 'ru' ? 'ru' : 'ky')
    return items.filter((item) => {
      if (categoryFilter && item.category !== Number(categoryFilter)) return false
      if (!normalizedQuery) return true
      return `${item.name_ky} ${item.name_ru}`.toLocaleLowerCase(language === 'ru' ? 'ru' : 'ky').includes(normalizedQuery)
    })
  }, [categoryFilter, items, language, query])

  async function toggleAvailability(item) {
    if (mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    const nextAvailability = !item.is_available
    setPendingId(item.id)
    setError('')
    setNotice('')
    try {
      const response = await waiterApiClient.patch(
        `/api/waiter/menu-items/${item.id}/availability/`,
        { is_available: nextAvailability },
      )
      setItems((current) => current.map((entry) => (
        entry.id === item.id ? response.data : entry
      )))
      setNotice(t('waiter.availabilityUpdated', {
        name: getLocalizedField(response.data, 'name', language),
      }))
      window.clearTimeout(noticeTimerRef.current)
      noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2600)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logoutExpired()
        return
      }
      setError(getBackendErrorMessage(requestError, language))
    } finally {
      mutationInFlightRef.current = false
      setPendingId(null)
    }
  }

  return (
    <main className="waiter-availability-page">
      <header className="waiter-availability-header">
        <button className="waiter-back-icon-button" type="button" onClick={() => navigate('/waiter/dashboard')} aria-label={t('common.back')} title={t('common.back')}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
        </button>
        <div><strong>{t('waiter.menuAvailability')}</strong><small>{t('waiter.menuAvailabilityShortHelp')}</small></div>
      </header>

      <div className="waiter-availability-content">
        <section className="waiter-availability-intro">
          <div><small>Dastorkon</small><h1>{t('waiter.menuAvailability')}</h1></div>
          <p>{t('waiter.menuAvailabilityHelp')}</p>
          <dl>
            <div><dt>{t('common.total')}</dt><dd>{items.length}</dd></div>
            <div><dt>{t('admin.available')}</dt><dd>{items.filter((item) => item.is_available).length}</dd></div>
            <div><dt>{t('admin.unavailable')}</dt><dd>{items.filter((item) => !item.is_available).length}</dd></div>
          </dl>
        </section>

        <div className="waiter-availability-toolbar">
          <label>
            <span aria-hidden="true">⌕</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('waiter.searchMenu')} aria-label={t('waiter.searchMenu')} />
          </label>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label={t('waiter.filterByCategory')}>
            <option value="">{t('waiter.allCategories')}</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{getLocalizedField(category, 'name', language)}</option>)}
          </select>
        </div>

        {error && <div className="waiter-availability-message is-error" role="alert">{error}<button type="button" onClick={loadItems}>{t('common.tryAgain')}</button></div>}
        {notice && <div className="waiter-availability-message is-success" role="status" aria-live="polite">{notice}</div>}

        {loading ? (
          <div className="waiter-availability-state"><span className="waiter-screen-spinner" /><strong>{t('common.loading')}</strong></div>
        ) : error ? null : filteredItems.length ? (
          <div className="waiter-availability-list">
            {filteredItems.map((item) => {
              const itemName = getLocalizedField(item, 'name', language)
              const categoryName = getLocalizedField(item, 'category_name', language)
              const pending = pendingId === item.id
              return (
                <article className={!item.is_available ? 'is-unavailable' : ''} aria-busy={pending} key={item.id}>
                  <div className="waiter-availability-item-copy">
                    <small>{categoryName || '—'}</small>
                    <h2>{itemName}</h2>
                    <p>{formatMoney(item.price)}{!item.is_visible && <span>{t('admin.hidden')}</span>}</p>
                  </div>
                  <div className="waiter-availability-control">
                    <span className={item.is_available ? 'is-available' : 'is-unavailable'}>{item.is_available ? t('admin.available') : t('common.unavailable')}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.is_available}
                      aria-label={`${itemName}: ${item.is_available ? t('admin.available') : t('common.unavailable')}`}
                      onClick={() => toggleAvailability(item)}
                      disabled={pendingId !== null}
                    >
                      <i aria-hidden="true" />
                      {pending && <b className="waiter-action-spinner" aria-hidden="true" />}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : items.length === 0 ? (
          <div className="waiter-availability-state"><strong>{t('waiter.noMenuItems')}</strong><p>{t('waiter.noMenuItemsHelp')}</p></div>
        ) : (
          <div className="waiter-availability-state"><strong>{t('waiter.noMenuMatches')}</strong><p>{t('waiter.noMenuMatchesHelp')}</p></div>
        )}
      </div>
    </main>
  )
}
