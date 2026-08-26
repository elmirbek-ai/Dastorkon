import { useState } from 'react'
import LanguageSwitch from './LanguageSwitch.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

function PasswordVisibilityIcon({ visible }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {visible && <path d="m4 4 16 16" />}
    </svg>
  )
}

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
}) {
  const { t } = useLanguage()
  const [passwordVisible, setPasswordVisible] = useState(false)
  const titleId = `${pageClass}-title`
  const errorId = `${pageClass}-error`
  const passwordVisibilityLabel = passwordVisible ? t('auth.hidePassword') : t('auth.showPassword')

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
                aria-label={passwordVisibilityLabel}
                title={passwordVisibilityLabel}
              >
                <PasswordVisibilityIcon visible={passwordVisible} />
              </button>
            </span>
          </label>
          <button type="submit" disabled={submitting}>
            {submitting && <span className="staff-login-spinner" aria-hidden="true" />}
            <span>{submitting ? t('auth.loggingIn') : t('auth.login')}</span>
          </button>
        </form>

      </section>
    </main>
  )
}
