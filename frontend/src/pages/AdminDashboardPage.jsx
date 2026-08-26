import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, EmptyState, ErrorBanner, LoadingState, PageIntro, StatusBadge } from '../components/admin/AdminComponents.jsx'
import TableIcon from '../components/TableIcon.jsx'
import { formatAdminDate, formatAdminMoney } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getLocalizedField, getRoleLabel } from '../i18n/index.js'

function DashboardKpiIcon({ name }) {
  if (name === 'tables') return <TableIcon />

  if (name === 'completed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8.5 12 2.25 2.25L15.75 9" />
      </svg>
    )
  }

  if (name === 'wallet') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h10A2.5 2.5 0 0 1 19 7.5V9" />
        <path d="M4 7.5v9A2.5 2.5 0 0 0 6.5 19H19a1 1 0 0 0 1-1v-4" />
        <path d="M16.5 9H20v5h-3.5a2.5 2.5 0 0 1 0-5Z" />
        <circle cx="16.75" cy="11.5" r="0.5" />
      </svg>
    )
  }

  return <AdminIcon name={name} />
}

function StatCard({ icon, tone, label, value, comparison, className = '', children }) {
  const { t } = useLanguage()
  const trend = comparison?.trend || 'unavailable'
  const trendSymbols = { up: '↑', down: '↓', neutral: '•', unavailable: '—' }
  const trendLabels = {
    up: t('admin.trendUp'),
    down: t('admin.trendDown'),
    neutral: t('admin.trendNeutral'),
    unavailable: t('admin.comparisonUnavailable'),
  }
  const hasDelta = Number.isFinite(comparison?.delta_percent)
  const comparisonLabel = trend === 'unavailable'
    ? t('admin.comparisonUnavailable')
    : t('admin.comparedToYesterday')
  const accessibleComparison = trend === 'unavailable'
    ? comparisonLabel
    : `${trendLabels[trend]}${hasDelta ? ` ${Math.abs(comparison.delta_percent)}%` : ''}. ${comparisonLabel}`

  return (
    <article className={`admin-stat-card admin-stat-card--${tone} ${className}`.trim()}>
      <span><DashboardKpiIcon name={icon} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {children || (
          <p className={`admin-stat-comparison is-${trend}`} aria-label={accessibleComparison}>
            <span aria-hidden="true">{trendSymbols[trend]}</span>
            {hasDelta && <b aria-hidden="true">{Math.abs(comparison.delta_percent)}%</b>}
            <span aria-hidden="true">{comparisonLabel}</span>
          </p>
        )}
      </div>
    </article>
  )
}

export default function AdminDashboardPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { language, t } = useLanguage()
  const quickActions = [
    ['/admin/menu?create=1', 'menu', t('admin.addMenuItem')], ['/admin/categories?create=1', 'category', t('admin.addCategory')], ['/admin/tables?create=1', 'tables', t('admin.addTable')], ['/admin/orders', 'orders', t('admin.viewOrders')], ['/admin/waiters?create=1', 'users', t('admin.addWaiter')],
  ]
  const [data, setData] = useState({ kpis: null, orders: [], menu: [], users: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const activeTables = Number(data.kpis?.active_tables?.value ?? 0)
  const totalTables = Number(data.kpis?.active_tables?.total ?? 0)
  const occupancyPercentage = totalTables > 0
    ? Math.round((activeTables / totalTables) * 100)
    : 0
  const occupancyProgress = Math.min(Math.max(occupancyPercentage, 0), 100)

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    Promise.all([
      adminApiClient.get('/api/admin/statistics/summary/', { params: { restaurant: restaurantId, include_dashboard_comparison: true } }),
      adminApiClient.get('/api/admin/orders/', { params: { restaurant: restaurantId } }),
      adminApiClient.get('/api/admin/menu-items/'),
      adminApiClient.get('/api/admin/users/'),
    ]).then(([statisticsResponse, ordersResponse, menuResponse, usersResponse]) => {
      if (!active) return
      setData({
        kpis: statisticsResponse.data.dashboard_kpis || null,
        orders: ordersResponse.data.slice(0, 6),
        menu: menuResponse.data.filter((item) => item.restaurant === restaurantId).slice(0, 5),
        users: usersResponse.data,
      })
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, refreshKey, handleApiError, t])

  if (loadingRestaurant || loading) return <LoadingState />

  return (
    <>
      <PageIntro title={t('admin.dashboardTitle')} description={t('admin.dashboardDescription')} />
      <ErrorBanner message={layoutError || error} />

      <section className="admin-stat-grid">
        <StatCard icon="orders" tone="green" label={t('admin.todayOrders')} value={data.kpis?.today_orders?.value ?? '—'} comparison={data.kpis?.today_orders} />
        <StatCard icon="completed" tone="green" label={t('admin.completedOrders')} value={data.kpis?.completed_orders?.value ?? '—'} comparison={data.kpis?.completed_orders} />
        <StatCard
          icon="tables"
          tone="orange"
          label={t('admin.activeTables')}
          value={data.kpis?.active_tables ? `${activeTables}/${totalTables}` : '—'}
          className="admin-stat-card--occupancy"
        >
          <div className="admin-stat-occupancy">
            <div className="admin-stat-occupancy__label">
              <span>{t('admin.occupancy')}</span>
              <strong>{occupancyPercentage}%</strong>
            </div>
            <div
              className="admin-stat-occupancy__track"
              role="progressbar"
              aria-label={t('admin.occupancy')}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={occupancyProgress}
            >
              <span style={{ width: `${occupancyProgress}%` }} />
            </div>
          </div>
        </StatCard>
        <StatCard icon="wallet" tone="green" label={t('admin.todayRevenue')} value={data.kpis?.today_revenue ? formatAdminMoney(data.kpis.today_revenue.value) : '—'} comparison={data.kpis?.today_revenue} />
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-panel--orders">
          <header>
            <div><h2>{t('admin.recentOrders')}</h2><p>{t('admin.orders')}</p></div>
            <Link to="/admin/orders">{t('common.viewAll')} <AdminIcon name="chevron" /></Link>
          </header>
          {data.orders.length ? (
            <div className="admin-compact-orders">
              <div className="admin-compact-orders__header">
                <span>{t('common.order')}</span>
                <span>{t('common.table')}</span>
                <span className="admin-compact-orders__status">{t('common.status')}</span>
                <span className="admin-compact-orders__date">{t('common.time')}</span>
                <span className="admin-compact-orders__amount">{t('common.amount')}</span>
              </div>
              {data.orders.map((order) => (
                <Link to={`/admin/orders?open=${order.id}`} key={order.id}>
                  <span className="admin-order-number">{order.order_number}</span>
                  <strong className="admin-compact-orders__table">{t('customer.tableLabel', { number: order.table_number })}</strong>
                  <span className="admin-compact-orders__status"><StatusBadge status={order.status} /></span>
                  <small className="admin-compact-orders__date">{formatAdminDate(order.created_at)}</small>
                  <b className="admin-compact-orders__amount">{formatAdminMoney(order.total_amount)}</b>
                </Link>
              ))}
            </div>
          ) : <EmptyState title={t('admin.noOrders')} />}
        </section>

        <section className="admin-panel">
          <header><div><h2>{t('admin.quickActions')}</h2></div></header>
          <div className="admin-quick-actions">
            {quickActions.map(([to, icon, label]) => <Link to={to} key={label}><span>{icon === 'tables' ? <TableIcon /> : <AdminIcon name={icon} />}</span><strong>{label}</strong><AdminIcon name="chevron" /></Link>)}
          </div>
        </section>

        <section className="admin-panel">
          <header><div><h2>{t('admin.menuOverview')}</h2></div><Link to="/admin/menu">{t('common.menu')}</Link></header>
          {data.menu.length ? (
            <div className="admin-menu-preview">
              {data.menu.map((item) => {
                const name = getLocalizedField(item, 'name', language)
                return <div key={item.id}><span>{name.slice(0, 1)}</span><div><strong>{name}</strong><small>{item.is_available ? t('admin.available') : t('admin.unavailable')}</small></div><b>{formatAdminMoney(item.price)}</b></div>
              })}
            </div>
          ) : <EmptyState />}
        </section>

        <section className="admin-panel">
          <header><div><h2>{t('admin.team')}</h2></div><Link to="/admin/waiters">{t('common.manage')}</Link></header>
          <div className="admin-team-summary">
            {['WAITER', 'KITCHEN', 'ADMIN'].map((role) => <strong key={role}>{data.users.filter((user) => user.role === role).length}<small>{getRoleLabel(role, language)}</small></strong>)}
          </div>
        </section>
      </div>
    </>
  )
}
