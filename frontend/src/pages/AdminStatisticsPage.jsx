import { useEffect, useMemo, useState } from 'react'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, EmptyState, ErrorBanner, LoadingState, PageIntro } from '../components/admin/AdminComponents.jsx'
import { formatAdminMoney, orderStatusLabels } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'

export default function AdminStatisticsPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    adminApiClient.get('/api/admin/statistics/summary/', { params: { restaurant: restaurantId, ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}) } })
      .then((response) => { if (active) { setSummary(response.data); setError('') } })
      .catch((requestError) => active && setError(handleApiError(requestError, 'Статистика жүктөлгөн жок.')))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, dateFrom, dateTo, refreshKey, handleApiError])

  const maxPopular = useMemo(() => Math.max(...(summary?.popular_items || []).map((item) => item.total_quantity), 1), [summary])
  const maxWaiter = useMemo(() => Math.max(...(summary?.waiter_stats || []).map((item) => Number(item.total_amount)), 1), [summary])

  if (loadingRestaurant || (loading && !summary)) return <LoadingState />
  return <><PageIntro eyebrow="АНАЛИТИКА" title="Статистика" description="Ресторандун сатуу жана операциялык көрсөткүчтөрү." /><ErrorBanner message={layoutError || error} /><div className="admin-date-filter"><label>Башталган күн<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>Аяктаган күн<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>{(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(''); setDateTo('') }}>Тазалоо</button>}</div><section className="admin-stat-grid"><article className="admin-stat-card admin-stat-card--green"><span><AdminIcon name="orders" /></span><div><small>Бардык заказдар</small><strong>{summary?.total_orders || 0}</strong><p>Тандалган аралыкта</p></div></article><article className="admin-stat-card admin-stat-card--blue"><span><AdminIcon name="dashboard" /></span><div><small>Жабылган заказдар</small><strong>{summary?.completed_orders || 0}</strong><p>Толук аткарылган</p></div></article><article className="admin-stat-card admin-stat-card--purple"><span><AdminIcon name="stats" /></span><div><small>Түшүм</small><strong>{formatAdminMoney(summary?.completed_amount)}</strong><p>Жабылган заказдар</p></div></article><article className="admin-stat-card admin-stat-card--orange"><span><AdminIcon name="tables" /></span><div><small>Орточо чек</small><strong>{formatAdminMoney(summary?.average_order_amount)}</strong><p>{summary?.active_table_sessions || 0} активдүү стол</p></div></article></section><div className="admin-statistics-grid"><section className="admin-panel"><header><div><h2>Популярдуу тамактар</h2><p>Сатылган саны боюнча</p></div></header>{summary?.popular_items.length ? <div className="admin-bar-list">{summary.popular_items.map((item, index) => <div key={`${item.name_ky_at_order}-${index}`}><header><span><b>{index + 1}</b><strong>{item.name_ky_at_order}</strong></span><small>{item.total_quantity} даана · {formatAdminMoney(item.total_amount)}</small></header><i><span style={{ width: `${(item.total_quantity / maxPopular) * 100}%` }} /></i></div>)}</div> : <EmptyState title="Сатуу маалыматы жок" />}</section><section className="admin-panel"><header><div><h2>Заказдардын абалы</h2><p>Статустар боюнча бөлүнүшү</p></div></header><div className="admin-status-summary">{Object.entries(summary?.orders_by_status || {}).map(([status, count]) => <div key={status}><span className={`admin-status-dot is-${status.toLowerCase()}`} /><strong>{orderStatusLabels[status] || status}</strong><b>{count}</b></div>)}</div></section><section className="admin-panel"><header><div><h2>Официанттар статистикасы</h2><p>Жабылган заказдар боюнча</p></div></header>{summary?.waiter_stats.length ? <div className="admin-bar-list">{summary.waiter_stats.map((item) => <div key={item.waiter ?? 'none'}><header><span><strong>{item.waiter_username || 'Дайындалган эмес'}</strong></span><small>{item.orders_count} заказ · {formatAdminMoney(item.total_amount)}</small></header><i><span style={{ width: `${(Number(item.total_amount) / maxWaiter) * 100}%` }} /></i></div>)}</div> : <EmptyState title="Официант статистикасы жок" />}</section><section className="admin-panel"><header><div><h2>Столдор статистикасы</h2><p>Заказ жана түшүм</p></div></header>{summary?.table_stats.length ? <div className="admin-table-stats">{summary.table_stats.map((item) => <div key={item.table}><span>№{item.table_number}</span><strong>{item.orders_count} заказ</strong><b>{formatAdminMoney(item.total_amount)}</b></div>)}</div> : <EmptyState title="Стол статистикасы жок" />}</section></div></>
}
