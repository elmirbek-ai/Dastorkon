import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, RequestErrorState, StatusBadge } from '../components/admin/AdminComponents.jsx'
import { formatAdminDate, formatAdminMoney } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getLocalizedField, getOrderSourceLabel, getStatusLabel } from '../i18n/index.js'

const statuses = ['NEW', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED']
const businessTimeZone = 'Asia/Bishkek'
const businessDateFormatter = new Intl.DateTimeFormat('en', {
  timeZone: businessTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toBusinessDateValue(date) {
  const parts = Object.fromEntries(
    businessDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  )
  const { year, month, day } = parts
  return `${year}-${month}-${day}`
}

function shiftDateValue(value, days) {
  const [year, month, day] = value.split('-').map(Number)
  const shiftedDate = new Date(Date.UTC(year, month - 1, day + days))
  return shiftedDate.toISOString().slice(0, 10)
}

function getDefaultDateRange() {
  const today = toBusinessDateValue(new Date())
  return {
    dateFrom: shiftDateValue(today, -2),
    dateTo: today,
  }
}

function formatDateFilterLabel(value) {
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

export default function AdminOrdersPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { language, t } = useLanguage()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [listRefreshing, setListRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailId, setDetailId] = useState(searchParams.get('open'))
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(Boolean(searchParams.get('open')))
  const [detailError, setDetailError] = useState('')
  const [detailRevision, setDetailRevision] = useState(0)
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)

  useEffect(() => {
    if (!restaurantId || invalidDateRange) return
    let active = true
    const defaultDateRange = getDefaultDateRange()
    const dateParams = selectedDate
      ? { date: selectedDate }
      : {
          date_from: dateFrom || defaultDateRange.dateFrom,
          date_to: dateTo || defaultDateRange.dateTo,
        }
    adminApiClient.get('/api/admin/orders/', { params: { restaurant: restaurantId, ...dateParams } }).then((response) => {
      if (!active) return
      setOrders(Array.isArray(response.data) ? response.data : [])
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => {
        if (!active) return
        setLoading(false)
        setListRefreshing(false)
      })
    return () => { active = false }
  }, [restaurantId, selectedDate, dateFrom, dateTo, invalidDateRange, refreshKey, handleApiError, t])

  useEffect(() => {
    if (!detailId) return
    let active = true
    adminApiClient.get(`/api/admin/orders/${detailId}/`).then((response) => {
      if (!active) return
      setDetail(response.data)
    }).catch((requestError) => active && setDetailError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setDetailLoading(false))
    return () => { active = false }
  }, [detailId, detailRevision, handleApiError, t])

  function closeDetail() {
    setDetailId(null)
    setDetail(null)
    setDetailError('')
    setDetailLoading(false)
  }

  function openDetail(orderId) {
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    setDetailId(orderId)
  }

  function retryDetail() {
    setDetailError('')
    setDetailLoading(true)
    setDetailRevision((value) => value + 1)
  }

  function selectStatus(nextStatus) {
    if (nextStatus === status) return
    setStatus(nextStatus)
  }

  function changeSelectedDate(nextDate) {
    if (nextDate === selectedDate) return
    setListRefreshing(true)
    setSelectedDate(nextDate)
    setDateFrom('')
    setDateTo('')
  }

  function changeDateFrom(nextDate) {
    if (!nextDate) {
      resetDateFilter()
      return
    }
    if (!selectedDate && nextDate === dateFrom) return
    setListRefreshing(!(dateTo && nextDate > dateTo))
    setSelectedDate('')
    setDateFrom(nextDate)
    setDateTo(dateTo || nextDate)
  }

  function changeDateTo(nextDate) {
    if (!nextDate) {
      resetDateFilter()
      return
    }
    if (!selectedDate && nextDate === dateTo) return
    setListRefreshing(!(dateFrom && dateFrom > nextDate))
    setSelectedDate('')
    setDateFrom(dateFrom || nextDate)
    setDateTo(nextDate)
  }

  function resetDateFilter() {
    if (!selectedDate && !dateFrom && !dateTo) return
    setListRefreshing(true)
    setSelectedDate('')
    setDateFrom('')
    setDateTo('')
  }

  function handleOrderKeyDown(event, orderId) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openDetail(orderId)
  }

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(statuses.map((item) => [item, 0]))
    orders.forEach((order) => {
      if (Object.hasOwn(counts, order.status)) counts[order.status] += 1
    })
    return counts
  }, [orders])
  const visibleOrders = useMemo(
    () => (status ? orders.filter((order) => order.status === status) : orders),
    [orders, status],
  )

  if (loadingRestaurant || loading) return <LoadingState label={t('admin.loadingOrders')} />

  const emptyTitle = selectedDate
    ? status
      ? t('admin.noOrdersOnDateWithStatus', { date: formatDateFilterLabel(selectedDate), status: getStatusLabel(status, language) })
      : t('admin.noOrdersOnDate', { date: formatDateFilterLabel(selectedDate) })
    : status
      ? t('admin.noOrdersWithStatus', { status: getStatusLabel(status, language) })
      : t('admin.noOrders')
  const emptyDescription = selectedDate ? t('admin.chooseAnotherOrderDateHelp') : t('admin.noOrdersHelp')
  const todayDate = toBusinessDateValue(new Date())
  const hasCustomDateFilter = Boolean(selectedDate || dateFrom || dateTo)
  const dateFilterLabel = selectedDate
    ? formatDateFilterLabel(selectedDate)
    : dateFrom && dateTo
      ? `${formatDateFilterLabel(dateFrom)} – ${formatDateFilterLabel(dateTo)}`
      : t('admin.last3Days')

  return (
    <>
      <PageIntro title={t('admin.orderHistory')} description={t('admin.orderHistoryDescription')} />
      <ErrorBanner message={invalidDateRange ? t('admin.invalidDateRange') : layoutError || error} />

      <div className="admin-date-filter admin-orders-date-filter" aria-busy={listRefreshing}>
        <div className="admin-orders-date-context">
          <span>{t('admin.activeDateRange')}</span>
          <strong>{dateFilterLabel}</strong>
        </div>
        <label>
          <span>{t('admin.orderDate')}</span>
          <input
            type="date"
            value={selectedDate}
            max={todayDate}
            disabled={listRefreshing}
            onChange={(event) => changeSelectedDate(event.target.value)}
          />
        </label>
        <label>
          <span>{t('common.from')}</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || todayDate}
            aria-invalid={invalidDateRange}
            disabled={listRefreshing}
            onChange={(event) => changeDateFrom(event.target.value)}
          />
        </label>
        <label>
          <span>{t('common.to')}</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            max={todayDate}
            aria-invalid={invalidDateRange}
            disabled={listRefreshing}
            onChange={(event) => changeDateTo(event.target.value)}
          />
        </label>
        <button type="button" onClick={resetDateFilter} disabled={!hasCustomDateFilter || listRefreshing}>
          {t('admin.resetDate')}
        </button>
      </div>

      <div className="admin-toolbar" aria-busy={listRefreshing}>
        <div className="admin-filter-tabs" aria-label={t('admin.filterOrdersByStatus')}>
          <button className={!status ? 'is-active' : ''} type="button" onClick={() => selectStatus('')} disabled={listRefreshing}>
            {t('common.all')} <b>{orders.length}</b>
          </button>
          {statuses.map((item) => (
            <button className={status === item ? 'is-active' : ''} type="button" onClick={() => selectStatus(item)} disabled={listRefreshing} key={item}>
              {getStatusLabel(item, language)} <b>{statusCounts[item]}</b>
            </button>
          ))}
        </div>
        <span>{listRefreshing ? t('common.loading') : t('admin.orderCount', { count: visibleOrders.length })}</span>
      </div>

      {listRefreshing && !visibleOrders.length ? (
        <LoadingState label={t('admin.loadingOrders')} />
      ) : visibleOrders.length ? (
        <div className="admin-data-card" aria-busy={listRefreshing}>
          <div className="admin-table-wrap">
            <table className="admin-table admin-orders-table">
              <thead>
                <tr><th>{t('common.order')}</th><th>{t('common.table')}</th><th>{t('common.status')}</th><th>{t('admin.orderSource')}</th><th>{t('common.waiter')}</th><th>{t('common.items')}</th><th>{t('common.time')}</th><th>{t('common.amount')}</th></tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr
                    role="button"
                    tabIndex="0"
                    aria-label={t('admin.openOrderDetails', { number: order.order_number })}
                    onClick={() => openDetail(order.id)}
                    onKeyDown={(event) => handleOrderKeyDown(event, order.id)}
                    key={order.id}
                  >
                    <td><strong className="admin-order-number">{order.order_number}</strong></td>
                    <td>{t('customer.tableLabel', { number: order.table_number })}</td>
                    <td><StatusBadge status={order.status} /></td>
                    <td><span className={`admin-order-source is-${String(order.source).toLowerCase()}`}>{getOrderSourceLabel(order.source, language)}</span></td>
                    <td>{order.responsible_waiter_username || t('common.notAssigned')}</td>
                    <td>{order.items_count}</td>
                    <td>{formatAdminDate(order.created_at)}</td>
                    <td><strong>{formatAdminMoney(order.total_amount)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}

      {detailId && (
        <AdminModal title={detail?.order_number || t('admin.orderDetails')} onClose={closeDetail} wide>
          {detailLoading ? (
            <LoadingState label={t('admin.loadingOrderDetails')} />
          ) : detailError ? (
            <RequestErrorState message={detailError} onRetry={retryDetail} />
          ) : detail ? (
            <div className="admin-order-detail">
              <div className="admin-order-detail-head">
                <div><small>{t('common.table')}</small><strong>№{detail.table_number}</strong></div>
                <div><small>{t('common.status')}</small><StatusBadge status={detail.status} /></div>
                <div><small>{t('admin.orderSource')}</small><strong>{getOrderSourceLabel(detail.source, language)}</strong></div>
                <div><small>{t('common.waiter')}</small><strong>{detail.responsible_waiter_username || '—'}</strong></div>
                <div><small>{t('common.total')}</small><strong>{formatAdminMoney(detail.total_amount)}</strong></div>
              </div>
              <section>
                <h3>{t('admin.orderComposition')}</h3>
                {detail.items?.length ? (
                  <div className="admin-order-items">
                    {detail.items.map((item) => (
                      <div key={item.id}>
                        <span><b>{item.quantity}×</b><strong>{getLocalizedField(item, 'name_at_order', language)}</strong>{item.comment && <small>{t('common.comments')}: {item.comment}</small>}</span>
                        <b>{formatAdminMoney(item.total_price)}</b>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState title={t('admin.noOrderItems')} />}
              </section>
              <section>
                <h3>{t('admin.statusHistory')}</h3>
                {detail.status_history?.length ? (
                  <div className="admin-status-timeline">
                    {detail.status_history.map((entry) => (
                      <div key={entry.id}><i /><span><strong>{getStatusLabel(entry.to_status, language)}</strong><small>{entry.changed_by_username || t('common.system')} · {formatAdminDate(entry.created_at)}</small></span></div>
                    ))}
                  </div>
                ) : <p className="admin-muted-copy">{t('admin.noStatusHistory')}</p>}
              </section>
            </div>
          ) : null}
        </AdminModal>
      )}
    </>
  )
}
