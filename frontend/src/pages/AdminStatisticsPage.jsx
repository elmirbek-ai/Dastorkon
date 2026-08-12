import { useEffect, useMemo, useState } from 'react'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, EmptyState, ErrorBanner, LoadingState, PageIntro } from '../components/admin/AdminComponents.jsx'
import { formatAdminMoney } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getLocalizedField, getStatusLabel } from '../i18n/index.js'

export default function AdminStatisticsPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { language, t } = useLanguage()
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
      .catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, dateFrom, dateTo, refreshKey, handleApiError, t])

  const maxPopular = useMemo(() => Math.max(...(summary?.popular_items || []).map((item) => item.total_quantity), 1), [summary])
  const maxWaiter = useMemo(() => Math.max(...(summary?.waiter_stats || []).map((item) => Number(item.total_amount)), 1), [summary])

  if (loadingRestaurant || (loading && !summary)) return <LoadingState />
  return <><PageIntro eyebrow={t('admin.analytics')} title={t('admin.statistics')} description={t('admin.restaurantPerformance')} /><ErrorBanner message={layoutError || error} /><div className="admin-date-filter"><label>{t('common.from')}<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>{t('common.to')}<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>{(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(''); setDateTo('') }}>{t('common.clear')}</button>}</div><section className="admin-stat-grid"><article className="admin-stat-card admin-stat-card--green"><span><AdminIcon name="orders" /></span><div><small>{t('admin.totalOrders')}</small><strong>{summary?.total_orders || 0}</strong><p>{t('common.selectedRange')}</p></div></article><article className="admin-stat-card admin-stat-card--blue"><span><AdminIcon name="dashboard" /></span><div><small>{t('admin.closedOrders')}</small><strong>{summary?.completed_orders || 0}</strong></div></article><article className="admin-stat-card admin-stat-card--purple"><span><AdminIcon name="stats" /></span><div><small>{t('admin.revenue')}</small><strong>{formatAdminMoney(summary?.completed_amount)}</strong></div></article><article className="admin-stat-card admin-stat-card--orange"><span><AdminIcon name="tables" /></span><div><small>{t('admin.averageCheck')}</small><strong>{formatAdminMoney(summary?.average_order_amount)}</strong><p>{summary?.active_table_sessions || 0} {t('admin.activeTables')}</p></div></article></section><div className="admin-statistics-grid"><section className="admin-panel"><header><div><h2>{t('admin.popularItems')}</h2><p>{t('admin.soldByQuantity')}</p></div></header>{summary?.popular_items.length ? <div className="admin-bar-list">{summary.popular_items.map((item, index) => <div key={`${item.name_ky_at_order}-${index}`}><header><span><b>{index + 1}</b><strong>{getLocalizedField(item, 'name_at_order', language)}</strong></span><small>{item.total_quantity} {t('common.pieces')} · {formatAdminMoney(item.total_amount)}</small></header><i><span style={{ width: `${(item.total_quantity / maxPopular) * 100}%` }} /></i></div>)}</div> : <EmptyState title={t('admin.salesNoData')} />}</section><section className="admin-panel"><header><div><h2>{t('admin.orderStates')}</h2><p>{t('admin.byStatus')}</p></div></header><div className="admin-status-summary">{Object.entries(summary?.orders_by_status || {}).map(([status, count]) => <div key={status}><span className={`admin-status-dot is-${status.toLowerCase()}`} /><strong>{getStatusLabel(status, language)}</strong><b>{count}</b></div>)}</div></section><section className="admin-panel"><header><div><h2>{t('admin.waiterStatistics')}</h2></div></header>{summary?.waiter_stats.length ? <div className="admin-bar-list">{summary.waiter_stats.map((item) => <div key={item.waiter ?? 'none'}><header><span><strong>{item.waiter_username || t('common.notAssigned')}</strong></span><small>{item.orders_count} {t('common.orders')} · {formatAdminMoney(item.total_amount)}</small></header><i><span style={{ width: `${(Number(item.total_amount) / maxWaiter) * 100}%` }} /></i></div>)}</div> : <EmptyState />}</section><section className="admin-panel"><header><div><h2>{t('admin.tableStatistics')}</h2></div></header>{summary?.table_stats.length ? <div className="admin-table-stats">{summary.table_stats.map((item) => <div key={item.table}><span>№{item.table_number}</span><strong>{item.orders_count} {t('common.orders')}</strong><b>{formatAdminMoney(item.total_amount)}</b></div>)}</div> : <EmptyState />}</section></div></>
}
