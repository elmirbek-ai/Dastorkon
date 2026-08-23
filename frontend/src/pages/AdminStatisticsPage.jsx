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
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)

  useEffect(() => {
    if (!restaurantId || invalidDateRange) return
    let active = true
    adminApiClient.get('/api/admin/statistics/summary/', { params: { restaurant: restaurantId, ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}) } })
      .then((response) => {
        if (!active) return
        setSummary(response.data)
        setError('')
      })
      .catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => {
        if (!active) return
        setLoading(false)
        setRefreshing(false)
      })
    return () => { active = false }
  }, [restaurantId, dateFrom, dateTo, invalidDateRange, refreshKey, handleApiError, t])

  const popularItems = useMemo(() => summary?.popular_items || [], [summary])
  const waiterStats = useMemo(() => summary?.waiter_stats || [], [summary])
  const tableStats = summary?.table_stats || []
  const statusEntries = Object.entries(summary?.orders_by_status || {})
  const maxPopular = useMemo(() => Math.max(...popularItems.map((item) => item.total_quantity), 1), [popularItems])
  const maxWaiter = useMemo(() => Math.max(...waiterStats.map((item) => Number(item.total_amount)), 1), [waiterStats])

  function changeDateFrom(value) {
    setDateFrom(value)
    setRefreshing(!(value && dateTo && value > dateTo))
  }

  function changeDateTo(value) {
    setDateTo(value)
    setRefreshing(!(dateFrom && value && dateFrom > value))
  }

  function clearDates() {
    setRefreshing(Boolean(dateFrom || dateTo))
    setDateFrom('')
    setDateTo('')
  }

  if (loadingRestaurant || (loading && !summary)) return <LoadingState label={t('admin.loadingStatistics')} />

  return (
    <>
      <PageIntro eyebrow={t('admin.analytics')} title={t('admin.statistics')} description={t('admin.restaurantPerformance')} />
      <ErrorBanner message={invalidDateRange ? t('admin.invalidDateRange') : layoutError || error} />

      <div className="admin-date-filter" aria-busy={refreshing}>
        <label>{t('common.from')}<input type="date" value={dateFrom} max={dateTo || undefined} aria-invalid={invalidDateRange} onChange={(event) => changeDateFrom(event.target.value)} /></label>
        <label>{t('common.to')}<input type="date" value={dateTo} min={dateFrom || undefined} aria-invalid={invalidDateRange} onChange={(event) => changeDateTo(event.target.value)} /></label>
        {(dateFrom || dateTo) && <button type="button" onClick={clearDates}>{t('common.clear')}</button>}
        {refreshing && <span className="admin-filter-status" role="status">{t('common.loading')}</span>}
      </div>

      <section className="admin-stat-grid" aria-busy={refreshing}>
        <article className="admin-stat-card admin-stat-card--green"><span><AdminIcon name="orders" /></span><div><small>{t('admin.totalOrders')}</small><strong>{summary?.total_orders || 0}</strong><p>{t('common.selectedRange')}</p></div></article>
        <article className="admin-stat-card admin-stat-card--blue"><span><AdminIcon name="dashboard" /></span><div><small>{t('admin.closedOrders')}</small><strong>{summary?.completed_orders || 0}</strong></div></article>
        <article className="admin-stat-card admin-stat-card--purple"><span><AdminIcon name="stats" /></span><div><small>{t('admin.revenue')}</small><strong>{formatAdminMoney(summary?.completed_amount)}</strong></div></article>
        <article className="admin-stat-card admin-stat-card--orange"><span><AdminIcon name="tables" /></span><div><small>{t('admin.averageCheck')}</small><strong>{formatAdminMoney(summary?.average_order_amount)}</strong><p>{summary?.active_table_sessions || 0} {t('admin.activeTables')}</p></div></article>
      </section>

      <div className="admin-statistics-grid" aria-busy={refreshing}>
        <section className="admin-panel">
          <header><div><h2>{t('admin.popularItems')}</h2><p>{t('admin.soldByQuantity')}</p></div></header>
          {popularItems.length ? (
            <div className="admin-bar-list">
              {popularItems.map((item, index) => (
                <div key={`${item.name_ky_at_order}-${index}`}>
                  <header><span><b>{index + 1}</b><strong>{getLocalizedField(item, 'name_at_order', language)}</strong></span><small>{item.total_quantity} {t('common.pieces')} · {formatAdminMoney(item.total_amount)}</small></header>
                  <i><span style={{ width: `${(item.total_quantity / maxPopular) * 100}%` }} /></i>
                </div>
              ))}
            </div>
          ) : <EmptyState title={t('admin.salesNoData')} description={t('admin.adjustDateRangeHelp')} />}
        </section>

        <section className="admin-panel">
          <header><div><h2>{t('admin.orderStates')}</h2><p>{t('admin.byStatus')}</p></div></header>
          {statusEntries.length ? (
            <div className="admin-status-summary">
              {statusEntries.map(([status, count]) => <div key={status}><span className={`admin-status-dot is-${status.toLowerCase()}`} /><strong>{getStatusLabel(status, language)}</strong><b>{count}</b></div>)}
            </div>
          ) : <EmptyState title={t('admin.statusDataUnavailable')} description={t('admin.adjustDateRangeHelp')} />}
        </section>

        <section className="admin-panel">
          <header><div><h2>{t('admin.waiterStatistics')}</h2><p>{t('admin.waiterStatisticsHelp')}</p></div></header>
          {waiterStats.length ? (
            <div className="admin-bar-list">
              {waiterStats.map((item) => (
                <div key={item.waiter ?? 'none'}>
                  <header><span><strong>{item.waiter_username || t('common.notAssigned')}</strong></span><small>{item.orders_count} {t('common.orders')} · {formatAdminMoney(item.total_amount)}</small></header>
                  <i><span style={{ width: `${(Number(item.total_amount) / maxWaiter) * 100}%` }} /></i>
                </div>
              ))}
            </div>
          ) : <EmptyState title={t('admin.salesNoData')} description={t('admin.adjustDateRangeHelp')} />}
        </section>

        <section className="admin-panel">
          <header><div><h2>{t('admin.tableStatistics')}</h2><p>{t('admin.tableStatisticsHelp')}</p></div></header>
          {tableStats.length ? (
            <div className="admin-table-stats">
              {tableStats.map((item) => <div key={item.table}><span>№{item.table_number}</span><strong>{item.orders_count} {t('common.orders')}</strong><b>{formatAdminMoney(item.total_amount)}</b></div>)}
            </div>
          ) : <EmptyState title={t('admin.salesNoData')} description={t('admin.adjustDateRangeHelp')} />}
        </section>
      </div>
    </>
  )
}
