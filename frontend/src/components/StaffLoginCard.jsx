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
  heroTitle,
  heroDescription,
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
  const welcomeId = `${pageClass}-welcome-title`
  const errorId = `${pageClass}-error`
  const passwordVisibilityLabel = passwordVisible ? t('auth.hidePassword') : t('auth.showPassword')

  return (
    <main className={`staff-login-page ${pageClass}`} aria-labelledby={welcomeId}>
      <div className="staff-login-shell">
        <section className="staff-login-hero" aria-labelledby={welcomeId}>
          <h1 id={welcomeId}>
            {heroTitle || (
              <>
                <span>{t('auth.welcome')}</span>
                <strong>Dastorkon</strong>
              </>
            )}
          </h1>
          {heroDescription && <p>{heroDescription}</p>}
        </section>

        <section className="staff-login-card" aria-label={t('auth.staffLogin')}>
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

          <p className="staff-login-form-context">{t('auth.staffAccount')}</p>

          {error && <div className="staff-login-error" id={errorId} role="alert">{error}</div>}

          <form onSubmit={onSubmit} aria-busy={submitting}>
            <label>
              <span>{t('auth.username')}</span>
              <input
                type="text"
                value={username}
                onChange={onUsernameChange}
                placeholder={t('auth.usernamePlaceholder')}
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
                  placeholder={t('auth.passwordPlaceholder')}
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
      </div>
    </main>
  )
}
