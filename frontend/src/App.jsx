import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ADMIN_TOKEN_KEY, KITCHEN_TOKEN_KEY, WAITER_TOKEN_KEY } from './api/client.js'
import { ProtectedRoleRoute, RoleLoginRoute } from './auth/RoleRoutes.jsx'
import AdminLayout from './components/admin/AdminLayout.jsx'
import AdminCategoriesPage from './pages/AdminCategoriesPage.jsx'
import AdminDashboardPage from './pages/AdminDashboardPage.jsx'
import AdminLoginPage from './pages/AdminLoginPage.jsx'
import AdminMenuPage from './pages/AdminMenuPage.jsx'
import AdminOrdersPage from './pages/AdminOrdersPage.jsx'
import AdminSettingsPage from './pages/AdminSettingsPage.jsx'
import AdminStatisticsPage from './pages/AdminStatisticsPage.jsx'
import AdminTablesPage from './pages/AdminTablesPage.jsx'
import AdminUsersPage from './pages/AdminUsersPage.jsx'
import CustomerMenuPage from './pages/CustomerMenuPage.jsx'
import CustomerOrdersPage from './pages/CustomerOrdersPage.jsx'
import KitchenDisplayPage from './pages/KitchenDisplayPage.jsx'
import KitchenLoginPage from './pages/KitchenLoginPage.jsx'
import LoginHubPage from './pages/LoginHubPage.jsx'
import WaiterDashboardPage from './pages/WaiterDashboardPage.jsx'
import WaiterLoginPage from './pages/WaiterLoginPage.jsx'
import './App.css'
import './Admin.css'

function HomePage() {
  return (
    <main className="home-page">
      <h1>Dastorkon</h1>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginHubPage />} />
        <Route path="/menu/:qrToken" element={<CustomerMenuPage />} />
        <Route path="/menu/:qrToken/orders" element={<CustomerOrdersPage />} />
        <Route path="/kitchen/login" element={<RoleLoginRoute tokenKey={KITCHEN_TOKEN_KEY} expectedRole="KITCHEN"><KitchenLoginPage /></RoleLoginRoute>} />
        <Route path="/kitchen/orders" element={<ProtectedRoleRoute tokenKey={KITCHEN_TOKEN_KEY} expectedRole="KITCHEN"><KitchenDisplayPage /></ProtectedRoleRoute>} />
        <Route path="/waiter/login" element={<RoleLoginRoute tokenKey={WAITER_TOKEN_KEY} expectedRole="WAITER"><WaiterLoginPage /></RoleLoginRoute>} />
        <Route path="/waiter/dashboard" element={<ProtectedRoleRoute tokenKey={WAITER_TOKEN_KEY} expectedRole="WAITER"><WaiterDashboardPage /></ProtectedRoleRoute>} />
        <Route path="/admin/login" element={<RoleLoginRoute tokenKey={ADMIN_TOKEN_KEY} expectedRole="ADMIN"><AdminLoginPage /></RoleLoginRoute>} />
        <Route path="/admin" element={<ProtectedRoleRoute tokenKey={ADMIN_TOKEN_KEY} expectedRole="ADMIN"><AdminLayout /></ProtectedRoleRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="menu" element={<AdminMenuPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="tables" element={<AdminTablesPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="statistics" element={<AdminStatisticsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
