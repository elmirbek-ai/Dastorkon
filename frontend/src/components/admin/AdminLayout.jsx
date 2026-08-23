import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ADMIN_TOKEN_KEY, adminApiClient } from '../../api/client.js'
import { extractAdminError } from './adminUtils.js'
import { AdminIcon, LoadingState, RequestErrorState } from './AdminComponents.jsx'
import { AdminContext } from './AdminContext.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

function AdminSidebar({ restaurant, open, onClose, onLogout }) {
  const location = useLocation()
  const { t } = useLanguage()
  const navigation = [
    { to: '/admin/dashboard', label: t('admin.dashboard'), icon: 'dashboard' },
    { to: '/admin/menu', label: t('admin.menu'), icon: 'menu' },
    { to: '/admin/categories', label: t('admin.categories'), icon: 'category' },
    { to: '/admin/tables', label: t('admin.tables'), icon: 'tables' },
    { to: '/admin/orders', label: t('admin.orders'), icon: 'orders' },
    { to: '/admin/waiters', label: t('admin.waiters'), icon: 'users' },
    { to: '/admin/profiles', label: t('admin.profiles'), icon: 'profile' },
    { to: '/admin/statistics', label: t('admin.statistics'), icon: 'stats' },
    { to: '/admin/settings', label: t('admin.settings'), icon: 'settings' },
  ]
  return (
    <>
      <button className={`admin-sidebar-overlay ${open ? 'is-open' : ''}`} type="button" onClick={onClose} aria-label={t('common.close')} />
      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`}>
        <div className="admin-sidebar-brand"><span>D</span><div><strong>Dastorkon</strong><small>{t('auth.restaurantOS')}</small></div></div>
        <nav>
          {navigation.map((item) => {
            const [pathname, search = ''] = item.to.split('?')
            const active = location.pathname === pathname && (item.exactQuery ? !location.search : search ? location.search === `?${search}` : true)
            return <NavLink className={active ? 'is-active' : ''} to={item.to} onClick={onClose} key={item.label}><AdminIcon name={item.icon} /><span>{item.label}</span></NavLink>
          })}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-restaurant-mini"><span>{restaurant?.name?.slice(0, 1) || 'D'}</span><div><strong>{restaurant?.name || t('common.restaurant')}</strong><small><i />{t('admin.systemWorking')}</small></div></div>
          <button type="button" onClick={onLogout}><AdminIcon name="logout" />{t('common.logout')}</button>
        </div>
      </aside>
    </>
  )
}

function AdminHeader({ title, refreshing, onRefresh, onMenu, onLogout }) {
  const { t } = useLanguage()
  return <header className="admin-topbar"><button className="admin-menu-toggle" type="button" onClick={onMenu} aria-label={t('common.menu')}><span /><span /><span /></button><div><small>Dastorkon · {t('admin.adminLogin')}</small><h1>{title}</h1></div><div className="admin-topbar-actions"><button type="button" onClick={onRefresh} disabled={refreshing} aria-label={t('common.refresh')}>{refreshing ? <span className="admin-refresh-spinner" aria-hidden="true" /> : <AdminIcon name="refresh" />} <span>{refreshing ? t('common.working') : t('common.refresh')}</span></button><div className="admin-profile"><b>А</b><span><strong>{t('role.ADMIN')}</strong><small>{t('role.ADMIN')}</small></span></div><button className="admin-logout-button" type="button" onClick={onLogout} aria-label={t('common.logout')}><AdminIcon name="logout" /></button></div></header>
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { language, t } = useLanguage()
  const pageTitles = {
    '/admin/dashboard': t('admin.dashboard'), '/admin/menu': t('admin.menuManagement'), '/admin/categories': t('admin.categories'), '/admin/tables': t('admin.tablesAndQr'), '/admin/orders': t('admin.orders'), '/admin/waiters': t('admin.waiters'), '/admin/profiles': t('admin.profiles'), '/admin/users': t('admin.waiters'), '/admin/statistics': t('admin.statistics'), '/admin/settings': t('admin.settings'),
  }
  const [restaurants, setRestaurants] = useState([])
  const [restaurantId, setRestaurantId] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)
  const [layoutError, setLayoutError] = useState('')
  const [restaurantRevision, setRestaurantRevision] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const logout = useCallback((authError = '') => {
    const message = typeof authError === 'string' ? authError : ''
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    navigate('/admin/login', {
      replace: true,
      ...(message ? { state: { authError: message } } : {}),
    })
  }, [navigate])

  const handleApiError = useCallback((error, fallback) => {
    if (error.response?.status === 401) {
      logout(t('auth.sessionExpired'))
      return ''
    }
    return extractAdminError(error, fallback, language)
  }, [language, logout, t])

  useEffect(() => {
    let active = true
    adminApiClient.get('/api/admin/restaurants/')
      .then((response) => {
        if (!active) return
        setRestaurants(response.data)
        setRestaurantId((current) => current || response.data[0]?.id || null)
        setLayoutError(response.data.length ? '' : t('common.noData'))
      })
      .catch((error) => active && setLayoutError(handleApiError(error, t('errors.generic'))))
      .finally(() => active && setLoadingRestaurant(false))
    return () => { active = false }
  }, [handleApiError, restaurantRevision, t])

  function refresh() {
    setRefreshing(true)
    setRefreshKey((value) => value + 1)
    window.setTimeout(() => setRefreshing(false), 650)
  }

  const restaurant = restaurants.find((item) => item.id === restaurantId) || restaurants[0] || null
  const context = { restaurant, restaurants, restaurantId, setRestaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError }

  function retryRestaurants() {
    setLoadingRestaurant(true)
    setLayoutError('')
    setRestaurantRevision((value) => value + 1)
  }

  return <AdminContext.Provider value={context}><main className="admin-app"><AdminSidebar restaurant={restaurant} open={sidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={logout} /><div className="admin-main"><AdminHeader title={pageTitles[location.pathname] || t('admin.adminLogin')} refreshing={refreshing} onRefresh={refresh} onMenu={() => setSidebarOpen(true)} onLogout={logout} /><div className="admin-content">{loadingRestaurant ? <LoadingState /> : restaurantId ? <Outlet /> : <RequestErrorState message={layoutError || t('errors.generic')} onRetry={retryRestaurants} />}</div></div></main></AdminContext.Provider>
}
