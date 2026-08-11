import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, EmptyState, ErrorBanner, LoadingState, PageIntro, StatusBadge } from '../components/admin/AdminComponents.jsx'
import { formatAdminDate, formatAdminMoney, localDateString } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'

function StatCard({ icon, tone, label, value, note }) {
  return <article className={`admin-stat-card admin-stat-card--${tone}`}><span><AdminIcon name={icon} /></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>
}

const quickActions = [
  ['/admin/menu?create=1', 'menu', 'Тамак кошуу'],
  ['/admin/categories?create=1', 'category', 'Категория кошуу'],
  ['/admin/tables?create=1', 'tables', 'Стол кошуу'],
  ['/admin/tables?view=qr', 'qr', 'QR коддор'],
  ['/admin/orders', 'orders', 'Заказдарды көрүү'],
  ['/admin/users?create=1', 'users', 'Кызматкер кошуу'],
]

export default function AdminDashboardPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
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
    }).catch((requestError) => active && setError(handleApiError(requestError, 'Башкы бет жүктөлгөн жок.')))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, refreshKey, handleApiError])

  if (loadingRestaurant || loading) return <LoadingState />

  return <><PageIntro eyebrow="БАШКАРУУ БОРБОРУ" title="Ресторандун көрсөткүчтөрү" description="Бүгүнкү иштин абалы жана тез аракеттер." /><ErrorBanner message={layoutError || error} /><section className="admin-stat-grid"><StatCard icon="orders" tone="green" label="Бүгүнкү заказдар" value={data.today?.total_orders ?? 0} note="Бүгүн түзүлгөн" /><StatCard icon="dashboard" tone="blue" label="Аткарылган заказдар" value={data.today?.completed_orders ?? 0} note="Бүгүн жабылган" /><StatCard icon="tables" tone="orange" label="Активдүү столдор" value={data.overall?.active_table_sessions ?? 0} note="Учурда тейленүүдө" /><StatCard icon="stats" tone="purple" label="Бүгүнкү түшүм" value={formatAdminMoney(data.today?.completed_amount)} note="Жабылган заказдар" /></section><div className="admin-dashboard-grid"><section className="admin-panel admin-panel--orders"><header><div><h2>Акыркы заказдар</h2><p>Жаңы жана акыркы заказдар</p></div><Link to="/admin/orders">Баарын көрүү <AdminIcon name="chevron" /></Link></header>{data.orders.length ? <div className="admin-compact-orders">{data.orders.map((order) => <Link to={`/admin/orders?open=${order.id}`} key={order.id}><span className="admin-order-number">{order.order_number}</span><strong>Стол №{order.table_number}</strong><StatusBadge status={order.status} /><small>{formatAdminDate(order.created_at)}</small><b>{formatAdminMoney(order.total_amount)}</b></Link>)}</div> : <EmptyState title="Заказдар жок" />}</section><section className="admin-panel"><header><div><h2>Тез аракеттер</h2><p>Көп колдонулган бөлүмдөр</p></div></header><div className="admin-quick-actions">{quickActions.map(([to, icon, label]) => <Link to={to} key={label}><span><AdminIcon name={icon} /></span><strong>{label}</strong><AdminIcon name="chevron" /></Link>)}</div></section><section className="admin-panel"><header><div><h2>Меню башкаруу</h2><p>{data.menu.length} тамактан кыскача көрүнүш</p></div><Link to="/admin/menu">Менюга өтүү</Link></header>{data.menu.length ? <div className="admin-menu-preview">{data.menu.map((item) => <div key={item.id}><span>{item.name_ky.slice(0, 1)}</span><div><strong>{item.name_ky}</strong><small>{item.is_available ? 'Сатууда бар' : 'Убактылуу жок'}</small></div><b>{formatAdminMoney(item.price)}</b></div>)}</div> : <EmptyState />}</section><section className="admin-panel"><header><div><h2>Кызматкерлер</h2><p>Активдүү системалык аккаунттар</p></div><Link to="/admin/users">Башкаруу</Link></header><div className="admin-team-summary"><strong>{data.users.filter((user) => user.role === 'WAITER').length}<small>Официант</small></strong><strong>{data.users.filter((user) => user.role === 'KITCHEN').length}<small>Ашкана</small></strong><strong>{data.users.filter((user) => user.role === 'ADMIN').length}<small>Админ</small></strong></div></section></div></>
}
