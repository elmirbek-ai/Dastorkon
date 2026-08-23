import { useEffect, useRef, useState } from 'react'
import { adminApiClient } from '../api/client.js'
import { ErrorBanner, LoadingState, PageIntro, RequestErrorState, Toggle } from '../components/admin/AdminComponents.jsx'
import { useAdminContext } from '../components/admin/AdminContext.js'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

export default function AdminSettingsPage() {
  const { restaurant, restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { t } = useLanguage()
  const saveInFlightRef = useRef(false)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    adminApiClient.get(`/api/admin/restaurants/${restaurantId}/settings/`).then((response) => {
      if (!active) return
      setSettings(response.data)
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, refreshKey, retryKey, handleApiError, t])

  async function save(event) {
    event.preventDefault()
    if (saveInFlightRef.current || !settings) return
    saveInFlightRef.current = true
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await adminApiClient.patch(`/api/admin/restaurants/${restaurantId}/settings/`, {
        comments_enabled: settings.comments_enabled,
        default_language: settings.default_language,
        currency: settings.currency,
      })
      setSettings(response.data)
      setNotice(t('admin.settingsSaved'))
    } catch (requestError) {
      setError(handleApiError(requestError, t('admin.settingsSaveError')))
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  function retryLoad() {
    setLoading(true)
    setError('')
    setRetryKey((value) => value + 1)
  }

  if (loadingRestaurant || loading) return <LoadingState label={t('admin.loadingSettings')} />

  if (!settings) {
    return (
      <>
        <PageIntro eyebrow={t('admin.system')} title={t('admin.settings')} description={t('admin.settingsDescription')} />
        <RequestErrorState message={layoutError || error || t('admin.settingsLoadError')} onRetry={retryLoad} />
      </>
    )
  }

  return (
    <>
      <PageIntro eyebrow={t('admin.system')} title={t('admin.settings')} description={t('admin.settingsDescription')} />
      <ErrorBanner message={layoutError || error} />
      {notice && <div className="admin-success-banner" role="status">{notice}</div>}
      <div className="admin-settings-grid">
        <section className="admin-panel admin-interface-language">
          <header><div><h2>{t('admin.interfaceLanguage')}</h2><p>{t('admin.interfaceLanguageDescription')}</p></div></header>
          <div className="admin-interface-language__control"><LanguageSwitch /></div>
        </section>

        <section className="admin-panel admin-restaurant-profile">
          <header><span>{restaurant?.name?.slice(0, 1) || 'D'}</span><div><h2>{restaurant?.name}</h2><p>{t('admin.activeRestaurant')}</p></div></header>
          <dl>
            <div><dt>{t('common.address')}</dt><dd>{restaurant?.address || t('admin.notSpecified')}</dd></div>
            <div><dt>{t('common.phone')}</dt><dd>{restaurant?.phone || t('admin.notSpecified')}</dd></div>
            <div><dt>{t('common.status')}</dt><dd><b>{t('admin.systemWorking')}</b></dd></div>
          </dl>
        </section>

        <section className="admin-panel">
          <header><div><h2>{t('admin.menuSettings')}</h2><p>{t('admin.customerInterfaceUse')}</p></div></header>
          <form className="admin-settings-form" onSubmit={save} aria-busy={saving}>
            <Toggle checked={settings.comments_enabled} onChange={(checked) => setSettings((value) => ({ ...value, comments_enabled: checked }))} label={t('admin.allowOrderComments')} disabled={saving} />
            <label>{t('admin.defaultLanguage')}<select value={settings.default_language} onChange={(event) => setSettings((value) => ({ ...value, default_language: event.target.value }))} disabled={saving}><option value="KY">{t('common.kyrgyz')}</option><option value="RU">{t('common.russian')}</option></select></label>
            <label>{t('common.currency')}<input value={settings.currency} onChange={(event) => setSettings((value) => ({ ...value, currency: event.target.value }))} maxLength="10" required disabled={saving} /></label>
            <button className="admin-primary-action" type="submit" disabled={saving}>{saving ? <><span className="admin-button-spinner" />{t('common.saving')}</> : t('admin.saveSettings')}</button>
          </form>
        </section>
      </div>
    </>
  )
}
