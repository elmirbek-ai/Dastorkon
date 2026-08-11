import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KITCHEN_TOKEN_KEY } from '../api/client.js'
import { loginForRole, roleLoginError } from '../auth/roleAuth.js'

function KitchenLoginPage({ guardError = '' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('kitchen')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(location.state?.authError || guardError)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      await loginForRole({ username, password, expectedRole: 'KITCHEN', tokenKey: KITCHEN_TOKEN_KEY })
      navigate('/kitchen/orders', { replace: true })
    } catch (requestError) {
      setError(roleLoginError(requestError, 'KITCHEN'))
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
