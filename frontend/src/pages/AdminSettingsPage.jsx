import { useEffect, useState } from 'react'
import { adminApiClient } from '../api/client.js'
import { ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { useAdminContext } from '../components/admin/AdminContext.js'

export default function AdminSettingsPage() {
  const { restaurant, restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    adminApiClient.get(`/api/admin/restaurants/${restaurantId}/settings/`).then((response) => {
      if (!active) return
      setSettings(response.data)
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, 'Жөндөөлөр жүктөлгөн жок.')))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, refreshKey, handleApiError])

  async function save(event) {
    event.preventDefault()
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
      setNotice('Жөндөөлөр сакталды.')
    } catch (requestError) {
      setError(handleApiError(requestError, 'Жөндөөлөр сакталган жок.'))
    } finally {
      setSaving(false)
    }
  }

  if (loadingRestaurant || loading || !settings) return <LoadingState />
  return <><PageIntro eyebrow="СИСТЕМА" title="Жөндөөлөр" description="Кардар менюсунун негизги параметрлери." /><ErrorBanner message={layoutError || error} />{notice && <div className="admin-success-banner">{notice}</div>}<div className="admin-settings-grid"><section className="admin-panel admin-restaurant-profile"><header><span>{restaurant?.name?.slice(0, 1) || 'D'}</span><div><h2>{restaurant?.name}</h2><p>Активдүү ресторан</p></div></header><dl><div><dt>Дарек</dt><dd>{restaurant?.address || 'Көрсөтүлгөн эмес'}</dd></div><div><dt>Телефон</dt><dd>{restaurant?.phone || 'Көрсөтүлгөн эмес'}</dd></div><div><dt>Статус</dt><dd><b>Система иштеп жатат</b></dd></div></dl></section><section className="admin-panel"><header><div><h2>Меню жөндөөлөрү</h2><p>Кардар интерфейсинде колдонулат</p></div></header><form className="admin-settings-form" onSubmit={save}><Toggle checked={settings.comments_enabled} onChange={(checked) => setSettings((value) => ({ ...value, comments_enabled: checked }))} label="Заказга комментарий жазууга уруксат" /><label>Негизги тил<select value={settings.default_language} onChange={(event) => setSettings((value) => ({ ...value, default_language: event.target.value }))}><option value="KY">Кыргызча</option><option value="RU">Русский</option></select></label><label>Валюта<input value={settings.currency} onChange={(event) => setSettings((value) => ({ ...value, currency: event.target.value }))} maxLength="10" required /></label><button className="admin-primary-action" type="submit" disabled={saving}>{saving ? <span className="admin-button-spinner" /> : 'Жөндөөлөрдү сактоо'}</button></form></section></div></>
}
