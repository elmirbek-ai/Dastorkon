import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { loginForStaff, roleDestinations, staffLoginError } from '../auth/roleAuth.js'
import StaffLoginCard from '../components/StaffLoginCard.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

export default function LoginHubPage({ guardError = '' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { language, t } = useLanguage()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(location.state?.authError || guardError)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const user = await loginForStaff({ username, password })
      navigate(roleDestinations[user.role], { replace: true })
    } catch (requestError) {
      setError(staffLoginError(requestError, language))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StaffLoginCard
      pageClass="unified-login-page"
      heroTitle={t('auth.unifiedWelcome')}
      heroDescription={t('auth.unifiedWelcomeDescription')}
      username={username}
      password={password}
      onUsernameChange={(event) => setUsername(event.target.value)}
      onPasswordChange={(event) => setPassword(event.target.value)}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  )
}
