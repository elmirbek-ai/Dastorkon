import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, EmptyState, ErrorBanner, LoadingState, PageIntro, StatusBadge } from '../components/admin/AdminComponents.jsx'
import { formatAdminDate, formatAdminMoney, localDateString } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getLocalizedField, getRoleLabel } from '../i18n/index.js'

function StatCard({ icon, tone, label, value, note }) {
  return <article className={`admin-stat-card admin-stat-card--${tone}`}><span><AdminIcon name={icon} /></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>
}

export default function AdminDashboardPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { language, t } = useLanguage()
  const quickActions = [
    ['/admin/menu?create=1', 'menu', t('admin.addMenuItem')], ['/admin/categories?create=1', 'category', t('admin.addCategory')], ['/admin/tables?create=1', 'tables', t('admin.addTable')], ['/admin/orders', 'orders', t('admin.viewOrders')], ['/admin/users?create=1', 'users', t('admin.addUser')],
  ]
  const [data, setData] = useState({ today: null, overall: null, orders: [], menu: [], users: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    const today = localDateString()
    Promise.all([
      adminApiClient.get('/api/admin/statistics/summary/', { params: { restaurant: restaurantId, date_from: today, date_to: today } }),
      adminApiClient.get('/api/admin/statistics/summary/', { params: { restaurant: restaurantId } }),
      adminApiClient.get('/api/admin/orders/', { params: { restaurant: restaurantId } }),
      adminApiClient.get('/api/admin/menu-items/'),
      adminApiClient.get('/api/admin/users/'),
    ]).then(([todayResponse, overallResponse, ordersResponse, menuResponse, usersResponse]) => {
      if (!active) return
      setData({
        today: todayResponse.data,
        overall: overallResponse.data,
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

  return <><PageIntro title={t('admin.dashboardTitle')} description={t('admin.dashboardDescription')} /><ErrorBanner message={layoutError || error} /><section className="admin-stat-grid"><StatCard icon="orders" tone="green" label={t('admin.todayOrders')} value={data.today?.total_orders ?? 0} note={t('common.today')} /><StatCard icon="dashboard" tone="blue" label={t('admin.completedOrders')} value={data.today?.completed_orders ?? 0} note={t('common.today')} /><StatCard icon="tables" tone="orange" label={t('admin.activeTables')} value={data.overall?.active_table_sessions ?? 0} note={t('common.current')} /><StatCard icon="stats" tone="purple" label={t('admin.todayRevenue')} value={formatAdminMoney(data.today?.completed_amount)} note={t('admin.closedOrders')} /></section><div className="admin-dashboard-grid"><section className="admin-panel admin-panel--orders"><header><div><h2>{t('admin.recentOrders')}</h2><p>{t('admin.orders')}</p></div><Link to="/admin/orders">{t('common.viewAll')} <AdminIcon name="chevron" /></Link></header>{data.orders.length ? <div className="admin-compact-orders">{data.orders.map((order) => <Link to={`/admin/orders?open=${order.id}`} key={order.id}><span className="admin-order-number">{order.order_number}</span><strong>{t('customer.tableLabel', { number: order.table_number })}</strong><StatusBadge status={order.status} /><small>{formatAdminDate(order.created_at)}</small><b>{formatAdminMoney(order.total_amount)}</b></Link>)}</div> : <EmptyState title={t('admin.noOrders')} />}</section><section className="admin-panel"><header><div><h2>{t('admin.quickActions')}</h2></div></header><div className="admin-quick-actions">{quickActions.map(([to, icon, label]) => <Link to={to} key={label}><span><AdminIcon name={icon} /></span><strong>{label}</strong><AdminIcon name="chevron" /></Link>)}</div></section><section className="admin-panel"><header><div><h2>{t('admin.menuOverview')}</h2></div><Link to="/admin/menu">{t('common.menu')}</Link></header>{data.menu.length ? <div className="admin-menu-preview">{data.menu.map((item) => { const name = getLocalizedField(item, 'name', language); return <div key={item.id}><span>{name.slice(0, 1)}</span><div><strong>{name}</strong><small>{item.is_available ? t('admin.available') : t('admin.unavailable')}</small></div><b>{formatAdminMoney(item.price)}</b></div> })}</div> : <EmptyState />}</section><section className="admin-panel"><header><div><h2>{t('admin.team')}</h2></div><Link to="/admin/users">{t('common.manage')}</Link></header><div className="admin-team-summary">{['WAITER', 'KITCHEN', 'ADMIN'].map((role) => <strong key={role}>{data.users.filter((user) => user.role === role).length}<small>{getRoleLabel(role, language)}</small></strong>)}</div></section></div></>
}
