import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isValidPhoneNumber } from 'react-phone-number-input'
import { waiterApiClient, WAITER_TOKEN_KEY } from '../api/client.js'
import PhoneNumberField from '../components/common/PhoneNumberField.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage } from '../i18n/index.js'

const emptyForm = {
  first_name: '',
  last_name: '',
  primary_phone: '',
  secondary_phone: '',
}

function firstBackendError(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return firstBackendError(value[0])
  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      const message = firstBackendError(nestedValue)
      if (message) return message
    }
  }
  return ''
}

export default function WaiterProfileEditPage() {
  const navigate = useNavigate()
  const { language, t } = useLanguage()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const logoutExpired = useCallback(() => {
    localStorage.removeItem(WAITER_TOKEN_KEY)
    navigate('/waiter/login', {
      replace: true,
      state: { authError: t('auth.sessionExpired') },
    })
  }, [navigate, t])

  const loadProfile = useCallback(async () => {
    setLoading(true)
    try {
      const response = await waiterApiClient.get('/api/waiter/profile/', {
        params: { lang: language },
      })
      const loadedProfile = response.data.profile
      setProfile(loadedProfile)
      setForm({
        first_name: loadedProfile.first_name || '',
        last_name: loadedProfile.last_name || '',
        primary_phone: loadedProfile.primary_phone || loadedProfile.phone || '',
        secondary_phone: loadedProfile.secondary_phone || '',
      })
      setError('')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logoutExpired()
        return
      }
      setError(getBackendErrorMessage(requestError, language))
    } finally {
      setLoading(false)
    }
  }, [language, logoutExpired])

  useEffect(() => {
    const timer = window.setTimeout(loadProfile, 0)
    return () => window.clearTimeout(timer)
  }, [loadProfile])

  function showProfileError(requestError) {
    const responseData = requestError.response?.data || {}
    if (responseData.primary_phone || responseData.phone) {
      setError(t('waiterProfile.invalidPrimaryPhone'))
      return
    }
    if (responseData.secondary_phone) {
      setError(t('waiterProfile.invalidSecondaryPhone'))
      return
    }
    setError(firstBackendError(responseData) || t('waiterProfile.updateError'))
  }

  async function saveProfile(event) {
    event.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim() || !form.primary_phone) {
      setError(t('waiterProfile.requiredFields'))
      return
    }
    if (!isValidPhoneNumber(form.primary_phone)) {
      setError(t('waiterProfile.invalidPrimaryPhone'))
      return
    }
    if (form.secondary_phone && !isValidPhoneNumber(form.secondary_phone)) {
      setError(t('waiterProfile.invalidSecondaryPhone'))
      return
    }

    setSaving(true)
    setError('')
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      primary_phone: form.primary_phone,
      secondary_phone: form.secondary_phone || '',
    }

    try {
      await waiterApiClient.patch('/api/waiter/profile/', payload, {
        params: { lang: language },
      })
      navigate('/waiter/profile', { replace: true, state: { profileUpdated: true } })
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logoutExpired()
        return
      }
      showProfileError(requestError)
    } finally {
      setSaving(false)
    }
  }

  const formIsValid = Boolean(
    form.first_name.trim()
    && form.last_name.trim()
    && form.primary_phone
    && isValidPhoneNumber(form.primary_phone)
    && (!form.secondary_phone || isValidPhoneNumber(form.secondary_phone)),
  )

  return (
    <main className="waiter-profile-page waiter-profile-edit-page">
      <header className="waiter-profile-page-header">
        <button className="waiter-back-icon-button" type="button" onClick={() => navigate('/waiter/profile')} aria-label={t('common.back')} title={t('common.back')}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
        </button>
        <div><strong>{t('waiterProfile.editProfile')}</strong>{profile && <small>@{profile.username}</small>}</div>
      </header>

      <div className="waiter-profile-page-content waiter-profile-edit-content">
        {error && <div className="waiter-profile-message is-error" role="alert">{error}</div>}
        {loading ? (
          <div className="waiter-profile-edit-state"><span className="waiter-screen-spinner" /><strong>{t('common.loading')}</strong></div>
        ) : profile ? (
          <section className="waiter-profile-section waiter-profile-edit-card">
            <header><div><small>{t('waiterProfile.profile')}</small><h1>{t('waiterProfile.personalInformation')}</h1></div></header>
            <form className="waiter-profile-form" onSubmit={saveProfile}>
              <label><span>{t('waiterProfile.firstName')} *</span><input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} required /></label>
              <label><span>{t('waiterProfile.lastName')} *</span><input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} required /></label>
              <PhoneNumberField
                label={t('waiterProfile.primaryPhone')}
                value={form.primary_phone}
                onChange={(value) => setForm((current) => ({ ...current, primary_phone: value }))}
                error={form.primary_phone && !isValidPhoneNumber(form.primary_phone) ? t('waiterProfile.invalidPrimaryPhone') : ''}
                required
              />
              <PhoneNumberField
                label={t('waiterProfile.secondaryPhone')}
                value={form.secondary_phone}
                onChange={(value) => setForm((current) => ({ ...current, secondary_phone: value }))}
                error={form.secondary_phone && !isValidPhoneNumber(form.secondary_phone) ? t('waiterProfile.invalidSecondaryPhone') : ''}
                helperText={t('common.optional')}
              />
              <div className="waiter-profile-form-actions">
                <button type="button" onClick={() => navigate('/waiter/profile')} disabled={saving}>{t('common.cancel')}</button>
                <button className="is-primary" type="submit" disabled={saving || !formIsValid}>{saving ? t('common.saving') : t('common.save')}</button>
              </div>
            </form>
          </section>
        ) : (
          <div className="waiter-profile-edit-state"><p>{t('waiterProfile.noData')}</p><button type="button" onClick={loadProfile}>{t('common.tryAgain')}</button></div>
        )}
      </div>
    </main>
  )
}
