import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, RequestErrorState, StatusBadge } from '../components/admin/AdminComponents.jsx'
import { formatAdminDate, formatAdminMoney } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getLocalizedField, getStatusLabel } from '../i18n/index.js'

const statuses = ['NEW', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED']

export default function AdminOrdersPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { language, t } = useLanguage()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [listRefreshing, setListRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [detailId, setDetailId] = useState(searchParams.get('open'))
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(Boolean(searchParams.get('open')))
  const [detailError, setDetailError] = useState('')
  const [detailRevision, setDetailRevision] = useState(0)

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    adminApiClient.get('/api/admin/orders/', { params: { restaurant: restaurantId, ...(status ? { status } : {}) } }).then((response) => {
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
  }, [restaurantId, status, refreshKey, handleApiError, t])

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
    setListRefreshing(true)
    setStatus(nextStatus)
  }

  function handleOrderKeyDown(event, orderId) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openDetail(orderId)
  }

  if (loadingRestaurant || loading) return <LoadingState label={t('admin.loadingOrders')} />

  const emptyTitle = status
    ? t('admin.noOrdersWithStatus', { status: getStatusLabel(status, language) })
    : t('admin.noOrders')

  return (
    <>
      <PageIntro title={t('admin.orderHistory')} description={t('admin.orderHistoryDescription')} />
      <ErrorBanner message={layoutError || error} />

      <div className="admin-toolbar" aria-busy={listRefreshing}>
        <div className="admin-filter-tabs" aria-label={t('admin.filterOrdersByStatus')}>
          <button className={!status ? 'is-active' : ''} type="button" onClick={() => selectStatus('')} disabled={listRefreshing}>
            {t('common.all')} {!status && <b>{orders.length}</b>}
          </button>
          {statuses.map((item) => (
            <button className={status === item ? 'is-active' : ''} type="button" onClick={() => selectStatus(item)} disabled={listRefreshing} key={item}>
              {getStatusLabel(item, language)}
            </button>
          ))}
        </div>
        <span>{listRefreshing ? t('common.loading') : t('admin.orderCount', { count: orders.length })}</span>
      </div>

      {listRefreshing && !orders.length ? (
        <LoadingState label={t('admin.loadingOrders')} />
      ) : orders.length ? (
        <div className="admin-data-card" aria-busy={listRefreshing}>
          <div className="admin-table-wrap">
            <table className="admin-table admin-orders-table">
              <thead>
                <tr><th>{t('common.order')}</th><th>{t('common.table')}</th><th>{t('common.status')}</th><th>{t('common.waiter')}</th><th>{t('common.items')}</th><th>{t('common.time')}</th><th>{t('common.amount')}</th></tr>
              </thead>
              <tbody>
                {orders.map((order) => (
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
        <EmptyState title={emptyTitle} description={t('admin.noOrdersHelp')} />
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
