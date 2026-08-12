import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, StatusBadge } from '../components/admin/AdminComponents.jsx'
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
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [detailId, setDetailId] = useState(searchParams.get('open'))
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    adminApiClient.get('/api/admin/orders/', { params: { restaurant: restaurantId, ...(status ? { status } : {}) } }).then((response) => {
      if (!active) return
      setOrders(response.data)
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, status, refreshKey, handleApiError, t])

  useEffect(() => {
    if (!detailId) return
    let active = true
    adminApiClient.get(`/api/admin/orders/${detailId}/`).then((response) => active && setDetail(response.data))
      .catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setDetailLoading(false))
    return () => { active = false }
  }, [detailId, handleApiError, t])

  function closeDetail() {
    setDetailId(null)
    setDetail(null)
  }

  if (loadingRestaurant || loading) return <LoadingState />
  return <><PageIntro title={t('admin.orderHistory')} description={t('admin.restaurantPerformance')} /><ErrorBanner message={layoutError || error} /><div className="admin-toolbar"><div className="admin-filter-tabs"><button className={!status ? 'is-active' : ''} type="button" onClick={() => setStatus('')}>{t('common.all')} <b>{!status ? orders.length : ''}</b></button>{statuses.map((item) => <button className={status === item ? 'is-active' : ''} type="button" onClick={() => setStatus(item)} key={item}>{getStatusLabel(item, language)}</button>)}</div><span>{orders.length} {t('common.orders')}</span></div>{orders.length ? <div className="admin-data-card"><div className="admin-table-wrap"><table className="admin-table admin-orders-table"><thead><tr><th>{t('common.order')}</th><th>{t('common.table')}</th><th>{t('common.status')}</th><th>{t('common.waiter')}</th><th>{t('common.items')}</th><th>{t('common.time')}</th><th>{t('common.amount')}</th></tr></thead><tbody>{orders.map((order) => <tr role="button" tabIndex="0" onClick={() => setDetailId(order.id)} onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && setDetailId(order.id)} key={order.id}><td><strong className="admin-order-number">{order.order_number}</strong></td><td>{t('customer.tableLabel', { number: order.table_number })}</td><td><StatusBadge status={order.status} /></td><td>{order.responsible_waiter_username || t('common.notAssigned')}</td><td>{order.items_count}</td><td>{formatAdminDate(order.created_at)}</td><td><strong>{formatAdminMoney(order.total_amount)}</strong></td></tr>)}</tbody></table></div></div> : <EmptyState title={t('admin.noOrders')} />}{detailId && <AdminModal title={detail?.order_number || t('admin.orderDetails')} onClose={closeDetail} wide>{detailLoading || !detail ? <LoadingState /> : <div className="admin-order-detail"><div className="admin-order-detail-head"><div><small>{t('common.table')}</small><strong>№{detail.table_number}</strong></div><div><small>{t('common.status')}</small><StatusBadge status={detail.status} /></div><div><small>{t('common.waiter')}</small><strong>{detail.responsible_waiter_username || '—'}</strong></div><div><small>{t('common.total')}</small><strong>{formatAdminMoney(detail.total_amount)}</strong></div></div><section><h3>{t('admin.orderComposition')}</h3><div className="admin-order-items">{detail.items.map((item) => <div key={item.id}><span><b>{item.quantity}×</b><strong>{getLocalizedField(item, 'name_at_order', language)}</strong>{item.comment && <small>{t('common.comments')}: {item.comment}</small>}</span><b>{formatAdminMoney(item.total_price)}</b></div>)}</div></section><section><h3>{t('admin.statusHistory')}</h3>{detail.status_history.length ? <div className="admin-status-timeline">{detail.status_history.map((entry) => <div key={entry.id}><i /><span><strong>{getStatusLabel(entry.to_status, language)}</strong><small>{entry.changed_by_username || t('common.system')} · {formatAdminDate(entry.created_at)}</small></span></div>)}</div> : <p className="admin-muted-copy">{t('admin.noStatusHistory')}</p>}</section></div>}</AdminModal>}</>
}
