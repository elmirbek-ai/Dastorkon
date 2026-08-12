import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ADMIN_TOKEN_KEY, adminApiClient } from '../../api/client.js'
import { extractAdminError } from './adminUtils.js'
import { AdminIcon } from './AdminComponents.jsx'
import { AdminContext } from './AdminContext.js'

const navigation = [
  { to: '/admin/dashboard', label: 'Башкы бет', icon: 'dashboard' },
  { to: '/admin/menu', label: 'Меню', icon: 'menu' },
  { to: '/admin/categories', label: 'Категориялар', icon: 'category' },
  { to: '/admin/tables', label: 'Столдор', icon: 'tables' },
  { to: '/admin/orders', label: 'Заказдар', icon: 'orders' },
  { to: '/admin/users', label: 'Официанттар', icon: 'users' },
  { to: '/admin/statistics', label: 'Статистика', icon: 'stats' },
  { to: '/admin/settings', label: 'Жөндөөлөр', icon: 'settings' },
]

const pageTitles = {
  '/admin/dashboard': 'Башкы бет',
  '/admin/menu': 'Меню башкаруу',
  '/admin/categories': 'Категориялар',
  '/admin/tables': 'Столдор жана QR коддор',
  '/admin/orders': 'Заказдар',
  '/admin/users': 'Кызматкерлер',
  '/admin/statistics': 'Статистика',
  '/admin/settings': 'Жөндөөлөр',
}

function AdminSidebar({ restaurant, open, onClose, onLogout }) {
  const location = useLocation()
  return (
    <>
      <button className={`admin-sidebar-overlay ${open ? 'is-open' : ''}`} type="button" onClick={onClose} aria-label="Менюну жабуу" />
      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`}>
        <div className="admin-sidebar-brand"><span>D</span><div><strong>Dastorkon</strong><small>Restaurant OS</small></div></div>
        <nav>
          {navigation.map((item) => {
            const [pathname, search = ''] = item.to.split('?')
            const active = location.pathname === pathname && (item.exactQuery ? !location.search : search ? location.search === `?${search}` : true)
            return <NavLink className={active ? 'is-active' : ''} to={item.to} onClick={onClose} key={item.label}><AdminIcon name={item.icon} /><span>{item.label}</span></NavLink>
          })}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-restaurant-mini"><span>{restaurant?.name?.slice(0, 1) || 'D'}</span><div><strong>{restaurant?.name || 'Ресторан'}</strong><small><i />Система иштеп жатат</small></div></div>
          <button type="button" onClick={onLogout}><AdminIcon name="logout" />Чыгуу</button>
        </div>
      </aside>
    </>
  )
}

function AdminHeader({ title, refreshing, onRefresh, onMenu, onLogout }) {
  return <header className="admin-topbar"><button className="admin-menu-toggle" type="button" onClick={onMenu} aria-label="Менюну ачуу"><span /><span /><span /></button><div><small>Dastorkon башкаруу панели</small><h1>{title}</h1></div><div className="admin-topbar-actions"><button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Маалыматты жаңыртуу"><AdminIcon name="refresh" /> <span>Жаңыртуу</span></button><div className="admin-profile"><b>А</b><span><strong>Админ</strong><small>Администратор</small></span></div><button className="admin-logout-button" type="button" onClick={onLogout} aria-label="Системадан чыгуу"><AdminIcon name="logout" /></button></div></header>
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [restaurants, setRestaurants] = useState([])
  const [restaurantId, setRestaurantId] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)
  const [layoutError, setLayoutError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const logout = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    navigate('/admin/login', { replace: true })
  }, [navigate])

  const handleApiError = useCallback((error, fallback) => {
    if (error.response?.status === 401) {
      logout()
      return ''
    }
    return extractAdminError(error, fallback)
  }, [logout])

  useEffect(() => {
    let active = true
    adminApiClient.get('/api/admin/restaurants/')
      .then((response) => {
        if (!active) return
        setRestaurants(response.data)
        setRestaurantId((current) => current || response.data[0]?.id || null)
        setLayoutError(response.data.length ? '' : 'Активдүү ресторан табылган жок.')
      })
      .catch((error) => active && setLayoutError(handleApiError(error, 'Ресторан жүктөлгөн жок.')))
      .finally(() => active && setLoadingRestaurant(false))
    return () => { active = false }
  }, [handleApiError])

  function refresh() {
    setRefreshing(true)
    setRefreshKey((value) => value + 1)
    window.setTimeout(() => setRefreshing(false), 650)
  }

  const restaurant = restaurants.find((item) => item.id === restaurantId) || restaurants[0] || null
  const context = { restaurant, restaurants, restaurantId, setRestaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError }

  return <AdminContext.Provider value={context}><main className="admin-app"><AdminSidebar restaurant={restaurant} open={sidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={logout} /><div className="admin-main"><AdminHeader title={pageTitles[location.pathname] || 'Админ панели'} refreshing={refreshing} onRefresh={refresh} onMenu={() => setSidebarOpen(true)} onLogout={logout} /><div className="admin-content"><Outlet /></div></div></main></AdminContext.Provider>
}
