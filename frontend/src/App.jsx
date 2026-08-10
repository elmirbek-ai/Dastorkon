import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import CustomerMenuPage from './pages/CustomerMenuPage.jsx'
import './App.css'

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
        <Route path="/menu/:qrToken" element={<CustomerMenuPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
