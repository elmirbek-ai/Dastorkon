import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import apiClient, { KITCHEN_TOKEN_KEY } from '../api/client.js'

function KitchenLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('kitchen')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (localStorage.getItem(KITCHEN_TOKEN_KEY)) {
    return <Navigate to="/kitchen/orders" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await apiClient.post('/api/auth/token/', { username, password })
      localStorage.setItem(KITCHEN_TOKEN_KEY, response.data.access)
      navigate('/kitchen/orders', { replace: true })
    } catch {
      setError('Логин же сырсөз туура эмес. Кайра аракет кылыңыз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="kitchen-login-page">
      <section className="kitchen-login-card" aria-labelledby="kitchen-login-title">
        <div className="kitchen-login-brand">
          <span aria-hidden="true">D</span>
          <div>
            <strong>Dastorkon</strong>
            <small>Ашкана панели</small>
          </div>
        </div>

        <div className="kitchen-login-heading">
          <p>Кызматкерлер үчүн</p>
          <h1 id="kitchen-login-title">Кирүү</h1>
          <span>Заказдарды башкаруу үчүн аккаунтуңузга кириңиз.</span>
        </div>

        {error && <div className="kitchen-auth-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>
            <span>Колдонуучунун аты</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span>Сырсөз</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? <span className="kitchen-login-spinner" /> : 'Кирүү'}
          </button>
        </form>

        <p className="kitchen-demo-hint">Demo: kitchen / kitchen12345</p>
      </section>
    </main>
  )
}

export default KitchenLoginPage
