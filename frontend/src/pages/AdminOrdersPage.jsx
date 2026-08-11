import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, StatusBadge } from '../components/admin/AdminComponents.jsx'
import { formatAdminDate, formatAdminMoney, orderStatusLabels } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'

const statuses = ['NEW', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED']

export default function AdminOrdersPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
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
    }).catch((requestError) => active && setError(handleApiError(requestError, 'Заказдар жүктөлгөн жок.')))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, status, refreshKey, handleApiError])

  useEffect(() => {
    if (!detailId) return
    let active = true
    adminApiClient.get(`/api/admin/orders/${detailId}/`).then((response) => active && setDetail(response.data))
      .catch((requestError) => active && setError(handleApiError(requestError, 'Заказдын маалыматы жүктөлгөн жок.')))
      .finally(() => active && setDetailLoading(false))
    return () => { active = false }
  }, [detailId, handleApiError])

  function closeDetail() {
    setDetailId(null)
    setDetail(null)
  }

  if (loadingRestaurant || loading) return <LoadingState />
  return <><PageIntro eyebrow="ЗАКАЗДАР" title="Заказдар тарыхы" description="Ресторандагы бардык заказдар жана алардын учурдагы абалы." /><ErrorBanner message={layoutError || error} /><div className="admin-toolbar"><div className="admin-filter-tabs"><button className={!status ? 'is-active' : ''} type="button" onClick={() => setStatus('')}>Баары <b>{!status ? orders.length : ''}</b></button>{statuses.map((item) => <button className={status === item ? 'is-active' : ''} type="button" onClick={() => setStatus(item)} key={item}>{orderStatusLabels[item]}</button>)}</div><span>{orders.length} заказ</span></div>{orders.length ? <div className="admin-data-card"><div className="admin-table-wrap"><table className="admin-table admin-orders-table"><thead><tr><th>Заказ</th><th>Стол</th><th>Статус</th><th>Официант</th><th>Позиция</th><th>Убакыт</th><th>Сумма</th></tr></thead><tbody>{orders.map((order) => <tr role="button" tabIndex="0" onClick={() => setDetailId(order.id)} onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && setDetailId(order.id)} key={order.id}><td><strong className="admin-order-number">{order.order_number}</strong></td><td>Стол №{order.table_number}</td><td><StatusBadge status={order.status} /></td><td>{order.responsible_waiter_username || 'Дайындалган эмес'}</td><td>{order.items_count}</td><td>{formatAdminDate(order.created_at)}</td><td><strong>{formatAdminMoney(order.total_amount)}</strong></td></tr>)}</tbody></table></div></div> : <EmptyState title="Бул чыпкада заказ жок" />}{detailId && <AdminModal title={detail?.order_number || 'Заказ маалыматы'} onClose={closeDetail} wide>{detailLoading || !detail ? <LoadingState /> : <div className="admin-order-detail"><div className="admin-order-detail-head"><div><small>СТОЛ</small><strong>№{detail.table_number}</strong></div><div><small>СТАТУС</small><StatusBadge status={detail.status} /></div><div><small>ОФИЦИАНТ</small><strong>{detail.responsible_waiter_username || '—'}</strong></div><div><small>ЖАЛПЫ</small><strong>{formatAdminMoney(detail.total_amount)}</strong></div></div><section><h3>Заказдын курамы</h3><div className="admin-order-items">{detail.items.map((item) => <div key={item.id}><span><b>{item.quantity}×</b><strong>{item.name_ky_at_order}</strong>{item.comment && <small>Эскертүү: {item.comment}</small>}</span><b>{formatAdminMoney(item.total_price)}</b></div>)}</div></section><section><h3>Статус тарыхы</h3>{detail.status_history.length ? <div className="admin-status-timeline">{detail.status_history.map((entry) => <div key={entry.id}><i /><span><strong>{orderStatusLabels[entry.to_status] || entry.to_status}</strong><small>{entry.changed_by_username || 'Система'} · {formatAdminDate(entry.created_at)}</small></span></div>)}</div> : <p className="admin-muted-copy">Статус тарыхы азырынча жок.</p>}</section></div>}</AdminModal>}</>
}
