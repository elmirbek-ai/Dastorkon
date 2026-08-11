import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import apiClient, { ADMIN_TOKEN_KEY } from '../api/client.js'
import { extractAdminError } from '../components/admin/adminUtils.js'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin12345')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (localStorage.getItem(ADMIN_TOKEN_KEY)) return <Navigate to="/admin/dashboard" replace />

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await apiClient.post('/api/auth/token/', { username, password })
      localStorage.setItem(ADMIN_TOKEN_KEY, response.data.access)
      navigate('/admin/dashboard', { replace: true })
    } catch (requestError) {
      setError(extractAdminError(requestError, 'Логин же сырсөз туура эмес.'))
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="admin-login-page"><section className="admin-login-card"><div className="admin-login-brand"><span>D</span><div><strong>Dastorkon</strong><small>Restaurant OS</small></div></div><div className="admin-login-copy"><small>КОШ КЕЛИҢИЗ</small><h1>Админ панели</h1><p>Ресторанды башкаруу үчүн аккаунтуңузга кириңиз.</p></div>{error && <div className="admin-error-banner" role="alert">{error}</div>}<form onSubmit={submit}><label>Колдонуучу аты<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Сырсөз<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button type="submit" disabled={submitting}>{submitting ? <span className="admin-button-spinner" /> : 'Кирүү'}</button></form><p className="admin-login-demo">Demo: admin / admin12345</p></section></main>
}
