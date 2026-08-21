import { useState } from 'react'
import LanguageSwitch from './LanguageSwitch.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

export default function StaffLoginCard({
  pageClass,
  title,
  description,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  submitting,
  error,
  demoUsername,
  demoPassword,
}) {
  const { t } = useLanguage()
  const [passwordVisible, setPasswordVisible] = useState(false)
  const titleId = `${pageClass}-title`
  const errorId = `${pageClass}-error`

  return (
    <main className={`staff-login-page ${pageClass}`}>
      <section className="staff-login-card" aria-labelledby={titleId}>
        <header className="staff-login-header">
          <div className="staff-login-brand">
            <span aria-hidden="true">D</span>
            <div>
              <strong>Dastorkon</strong>
              <small>{t('auth.restaurantOS')}</small>
            </div>
          </div>
          <LanguageSwitch />
        </header>

        <div className="staff-login-copy">
          <small>{t('auth.staffOnly')}</small>
          <h1 id={titleId}>{title}</h1>
          <p>{description}</p>
        </div>

        {error && <div className="staff-login-error" id={errorId} role="alert">{error}</div>}

        <form onSubmit={onSubmit} aria-busy={submitting}>
          <label>
            <span>{t('auth.username')}</span>
            <input
              type="text"
              value={username}
              onChange={onUsernameChange}
              autoComplete="username"
              disabled={submitting}
              aria-describedby={error ? errorId : undefined}
              required
            />
          </label>
          <label>
            <span>{t('auth.password')}</span>
            <span className="staff-login-password-field">
              <input
                type={passwordVisible ? 'text' : 'password'}
                value={password}
                onChange={onPasswordChange}
                autoComplete="current-password"
                disabled={submitting}
                aria-describedby={error ? errorId : undefined}
                required
              />
              <button
                type="button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                disabled={submitting}
                aria-pressed={passwordVisible}
              >
                {passwordVisible ? t('auth.hidePassword') : t('auth.showPassword')}
              </button>
            </span>
          </label>
          <button type="submit" disabled={submitting}>
            {submitting && <span className="staff-login-spinner" aria-hidden="true" />}
            <span>{submitting ? t('auth.loggingIn') : t('auth.login')}</span>
          </button>
        </form>

        <p className="staff-login-demo">
          {t('auth.demoCredentials', { username: demoUsername, password: demoPassword })}
        </p>
      </section>
    </main>
  )
}
