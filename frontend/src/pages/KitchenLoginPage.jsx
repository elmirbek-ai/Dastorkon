import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KITCHEN_TOKEN_KEY } from '../api/client.js'
import { loginForRole, roleLoginError } from '../auth/roleAuth.js'
import StaffLoginCard from '../components/StaffLoginCard.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

function KitchenLoginPage({ guardError = '' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { language, t } = useLanguage()
  const [username, setUsername] = useState('')
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
      setError(roleLoginError(requestError, 'KITCHEN', language))
    } finally {
      setSubmitting(false)
    }
  }

  return <StaffLoginCard pageClass="kitchen-login-page" title={t('kitchen.kitchenLogin')} description={t('kitchen.loginDescription')} username={username} password={password} onUsernameChange={(event) => setUsername(event.target.value)} onPasswordChange={(event) => setPassword(event.target.value)} onSubmit={handleSubmit} submitting={submitting} error={error} />
}

export default KitchenLoginPage
