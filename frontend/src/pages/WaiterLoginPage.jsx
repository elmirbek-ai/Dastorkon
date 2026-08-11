import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import apiClient, { WAITER_TOKEN_KEY } from '../api/client.js'

function WaiterLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('waiter')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (localStorage.getItem(WAITER_TOKEN_KEY)) {
    return <Navigate to="/waiter/dashboard" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await apiClient.post('/api/auth/token/', { username, password })
      localStorage.setItem(WAITER_TOKEN_KEY, response.data.access)
      navigate('/waiter/dashboard', { replace: true })
    } catch {
      setError('Логин же сырсөз туура эмес. Кайра аракет кылыңыз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="waiter-login-page">
      <section className="waiter-login-card" aria-labelledby="waiter-login-title">
        <div className="waiter-login-brand">
          <span aria-hidden="true">D</span>
          <div>
            <strong>Dastorkon</strong>
            <small>Официант панели</small>
          </div>
        </div>

        <div className="waiter-login-heading">
          <p>Кызматкерлер үчүн</p>
          <h1 id="waiter-login-title">Кирүү</h1>
          <span>Столдорду жана заказдарды башкаруу үчүн кириңиз.</span>
        </div>

        {error && <div className="waiter-auth-error" role="alert">{error}</div>}

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
            {submitting ? <span className="waiter-login-spinner" /> : 'Кирүү'}
          </button>
        </form>

        <p className="waiter-demo-hint">Demo: waiter / waiter12345</p>
      </section>
    </main>
  )
}

export default WaiterLoginPage
