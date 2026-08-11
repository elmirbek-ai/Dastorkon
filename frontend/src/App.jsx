import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ADMIN_TOKEN_KEY, KITCHEN_TOKEN_KEY, WAITER_TOKEN_KEY } from './api/client.js'
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
import KitchenDisplayPage from './pages/KitchenDisplayPage.jsx'
import KitchenLoginPage from './pages/KitchenLoginPage.jsx'
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

function KitchenRoute() {
  return localStorage.getItem(KITCHEN_TOKEN_KEY)
    ? <KitchenDisplayPage />
    : <Navigate to="/kitchen/login" replace />
}

function WaiterRoute() {
  return localStorage.getItem(WAITER_TOKEN_KEY)
    ? <WaiterDashboardPage />
    : <Navigate to="/waiter/login" replace />
}

function AdminRoute() {
  return localStorage.getItem(ADMIN_TOKEN_KEY)
    ? <AdminLayout />
    : <Navigate to="/admin/login" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/menu/:qrToken" element={<CustomerMenuPage />} />
        <Route path="/kitchen/login" element={<KitchenLoginPage />} />
        <Route path="/kitchen/orders" element={<KitchenRoute />} />
        <Route path="/waiter/login" element={<WaiterLoginPage />} />
        <Route path="/waiter/dashboard" element={<WaiterRoute />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminRoute />}>
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
