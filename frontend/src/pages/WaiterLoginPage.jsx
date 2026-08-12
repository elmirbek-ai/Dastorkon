import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { WAITER_TOKEN_KEY } from '../api/client.js'
import { loginForRole, roleLoginError } from '../auth/roleAuth.js'
import StaffLoginCard from '../components/StaffLoginCard.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

function WaiterLoginPage({ guardError = '' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { language, t } = useLanguage()
  const [username, setUsername] = useState('waiter')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(location.state?.authError || guardError)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      await loginForRole({ username, password, expectedRole: 'WAITER', tokenKey: WAITER_TOKEN_KEY })
      navigate('/waiter/dashboard', { replace: true })
    } catch (requestError) {
      setError(roleLoginError(requestError, 'WAITER', language))
    } finally {
      setSubmitting(false)
    }
  }

  return <StaffLoginCard pageClass="waiter-login-page" title={t('waiter.waiterLogin')} description={t('waiter.loginDescription')} username={username} password={password} onUsernameChange={(event) => setUsername(event.target.value)} onPasswordChange={(event) => setPassword(event.target.value)} onSubmit={handleSubmit} submitting={submitting} error={error} demoUsername="waiter" demoPassword="waiter12345" />
}

export default WaiterLoginPage
