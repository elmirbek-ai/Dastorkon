import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ADMIN_TOKEN_KEY } from '../api/client.js'
import { loginForRole, roleLoginError } from '../auth/roleAuth.js'
import StaffLoginCard from '../components/StaffLoginCard.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

export default function AdminLoginPage({ guardError = '' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { language, t } = useLanguage()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin12345')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(location.state?.authError || guardError)

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await loginForRole({ username, password, expectedRole: 'ADMIN', tokenKey: ADMIN_TOKEN_KEY })
      navigate('/admin/dashboard', { replace: true })
    } catch (requestError) {
      setError(roleLoginError(requestError, 'ADMIN', language))
    } finally {
      setSubmitting(false)
    }
  }

  return <StaffLoginCard pageClass="admin-login-page" title={t('admin.adminLogin')} description={t('admin.loginDescription')} username={username} password={password} onUsernameChange={(event) => setUsername(event.target.value)} onPasswordChange={(event) => setPassword(event.target.value)} onSubmit={submit} submitting={submitting} error={error} demoUsername="admin" demoPassword="admin12345" />
}
