import { Component } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ADMIN_TOKEN_KEY, KITCHEN_TOKEN_KEY, WAITER_TOKEN_KEY } from './api/client.js'
import { ProtectedRoleRoute, StaffLoginRoute } from './auth/RoleRoutes.jsx'
import AdminLayout from './components/admin/AdminLayout.jsx'
import AdminCategoriesPage from './pages/AdminCategoriesPage.jsx'
import AdminDashboardPage from './pages/AdminDashboardPage.jsx'
import AdminMenuPage from './pages/AdminMenuPage.jsx'
import AdminOrdersPage from './pages/AdminOrdersPage.jsx'
import AdminSettingsPage from './pages/AdminSettingsPage.jsx'
import AdminStatisticsPage from './pages/AdminStatisticsPage.jsx'
import AdminTablesPage from './pages/AdminTablesPage.jsx'
import AdminUsersPage from './pages/AdminUsersPage.jsx'
import CustomerMenuPage from './pages/CustomerMenuPage.jsx'
import CustomerOrdersPage from './pages/CustomerOrdersPage.jsx'
import KitchenDisplayPage from './pages/KitchenDisplayPage.jsx'
import LoginHubPage from './pages/LoginHubPage.jsx'
import WaiterDashboardPage from './pages/WaiterDashboardPage.jsx'
import WaiterMenuAvailabilityPage from './pages/WaiterMenuAvailabilityPage.jsx'
import WaiterManualOrderPage from './pages/WaiterManualOrderPage.jsx'
import WaiterProfileEditPage from './pages/WaiterProfileEditPage.jsx'
import WaiterProfilePage from './pages/WaiterProfilePage.jsx'
import { useLanguage } from './i18n/LanguageContext.jsx'
import './App.css'
import './Admin.css'

class CustomerRouteErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="page-state page-state--error customer-page-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          {this.props.message}
        </main>
      )
    }
    return this.props.children
  }
}

function CustomerRoute({ children }) {
  const { pathname } = useLocation()
  const { t } = useLanguage()
  return (
    <CustomerRouteErrorBoundary key={pathname} message={t('customer.menuLoadError')}>
      {children}
    </CustomerRouteErrorBoundary>
  )
}

function AdminUsersRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/admin/waiters${search}`} replace />
}

function LegacyLoginRedirect() {
  const location = useLocation()
  return <Navigate to="/login" replace state={location.state} />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<StaffLoginRoute><LoginHubPage /></StaffLoginRoute>} />
        <Route path="/menu/:qrToken" element={<CustomerRoute><CustomerMenuPage /></CustomerRoute>} />
        <Route path="/menu/:qrToken/orders" element={<CustomerRoute><CustomerOrdersPage /></CustomerRoute>} />
        <Route path="/kitchen/login" element={<LegacyLoginRedirect />} />
        <Route path="/kitchen/orders" element={<ProtectedRoleRoute tokenKey={KITCHEN_TOKEN_KEY} expectedRole="KITCHEN"><KitchenDisplayPage /></ProtectedRoleRoute>} />
        <Route path="/waiter/login" element={<LegacyLoginRedirect />} />
        <Route path="/waiter/dashboard" element={<ProtectedRoleRoute tokenKey={WAITER_TOKEN_KEY} expectedRole="WAITER"><WaiterDashboardPage /></ProtectedRoleRoute>} />
        <Route path="/waiter/menu-availability" element={<ProtectedRoleRoute tokenKey={WAITER_TOKEN_KEY} expectedRole="WAITER"><WaiterMenuAvailabilityPage /></ProtectedRoleRoute>} />
        <Route path="/waiter/manual-order" element={<ProtectedRoleRoute tokenKey={WAITER_TOKEN_KEY} expectedRole="WAITER"><WaiterManualOrderPage /></ProtectedRoleRoute>} />
        <Route path="/waiter/profile" element={<ProtectedRoleRoute tokenKey={WAITER_TOKEN_KEY} expectedRole="WAITER"><WaiterProfilePage /></ProtectedRoleRoute>} />
        <Route path="/waiter/profile/edit" element={<ProtectedRoleRoute tokenKey={WAITER_TOKEN_KEY} expectedRole="WAITER"><WaiterProfileEditPage /></ProtectedRoleRoute>} />
        <Route path="/admin/login" element={<LegacyLoginRedirect />} />
        <Route path="/admin" element={<ProtectedRoleRoute tokenKey={ADMIN_TOKEN_KEY} expectedRole="ADMIN"><AdminLayout /></ProtectedRoleRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="menu" element={<AdminMenuPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="tables" element={<AdminTablesPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="statistics" element={<AdminStatisticsPage />} />
          <Route path="waiters" element={<AdminUsersPage mode="waiters" />} />
          <Route path="profiles" element={<AdminUsersPage mode="profiles" />} />
          <Route path="users" element={<AdminUsersRedirect />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
