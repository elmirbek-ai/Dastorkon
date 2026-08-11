import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { KITCHEN_TOKEN_KEY, WAITER_TOKEN_KEY } from './api/client.js'
import CustomerMenuPage from './pages/CustomerMenuPage.jsx'
import KitchenDisplayPage from './pages/KitchenDisplayPage.jsx'
import KitchenLoginPage from './pages/KitchenLoginPage.jsx'
import WaiterDashboardPage from './pages/WaiterDashboardPage.jsx'
import WaiterLoginPage from './pages/WaiterLoginPage.jsx'
import './App.css'

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
