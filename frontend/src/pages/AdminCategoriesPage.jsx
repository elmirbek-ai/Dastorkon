import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getLocalizedField } from '../i18n/index.js'

const emptyCategory = { name_ky: '', name_ru: '', is_visible: true }

export default function AdminCategoriesPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { language, t } = useLanguage()
  const [searchParams] = useSearchParams()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(searchParams.get('create') === '1' ? { ...emptyCategory } : null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [revision, setRevision] = useState(0)
  const mutationInFlightRef = useRef(false)

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    adminApiClient.get('/api/admin/categories/').then((response) => {
      if (!active) return
      setCategories(response.data.filter((item) => item.restaurant === restaurantId))
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, refreshKey, revision, handleApiError, t])

  async function save(event) {
    event.preventDefault()
    if (mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setSaving(true)
    setFormError('')
    const payload = {
      name_ky: editing.name_ky,
      name_ru: editing.name_ru,
      is_visible: editing.is_visible,
      restaurant: restaurantId,
    }
    try {
      if (editing.id) await adminApiClient.patch(`/api/admin/categories/${editing.id}/`, payload)
      else await adminApiClient.post('/api/admin/categories/', payload)
      setEditing(null)
      setRevision((value) => value + 1)
    } catch (requestError) {
      setFormError(handleApiError(requestError, t('errors.generic')))
    } finally {
      mutationInFlightRef.current = false
      setSaving(false)
    }
  }

  async function toggleVisibility(category) {
    if (mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    const nextVisibility = !category.is_visible
    setBusyId(category.id)
    try {
      await adminApiClient.patch(`/api/admin/categories/${category.id}/`, { is_visible: nextVisibility })
      setCategories((current) => current.map((item) => item.id === category.id ? { ...item, is_visible: nextVisibility } : item))
      setRevision((value) => value + 1)
    } catch (requestError) {
      setError(handleApiError(requestError, t('errors.generic')))
    } finally {
      mutationInFlightRef.current = false
      setBusyId(null)
    }
  }

  async function remove(category) {
    if (mutationInFlightRef.current) return
    if (!window.confirm(t('admin.categoryDeleteConfirm', { name: getLocalizedField(category, 'name', language) }))) return
    mutationInFlightRef.current = true
    setBusyId(category.id)
    try {
      await adminApiClient.delete(`/api/admin/categories/${category.id}/`)
      setCategories((current) => current.filter((item) => item.id !== category.id))
    } catch (requestError) {
      const relationError = t('admin.categoryHasItems')
      setError([400, 409].includes(requestError.response?.status) ? relationError : handleApiError(requestError, relationError))
    } finally {
      mutationInFlightRef.current = false
      setBusyId(null)
    }
  }

  if (loadingRestaurant || loading) return <LoadingState />

  return (
    <>
      <PageIntro title={t('admin.categories')} description={t('admin.categoryManagement')} action={<button className="admin-primary-action" type="button" onClick={() => setEditing({ ...emptyCategory })} disabled={busyId !== null}><AdminIcon name="plus" />{t('admin.addCategory')}</button>} />
      <ErrorBanner message={layoutError || error} />
      {categories.length ? (
        <div className="admin-data-card">
          <div className="admin-table-wrap">
            <table className="admin-table admin-categories-table">
              <thead><tr><th>№</th><th>{t('common.kyrgyz')}</th><th>{t('common.russian')}</th><th>{t('common.status')}</th><th>{t('common.action')}</th></tr></thead>
              <tbody>{categories.map((category, index) => (
                <tr key={category.id}>
                  <td><span className="admin-index-badge">{index + 1}</span></td>
                  <td><strong>{category.name_ky}</strong></td>
                  <td>{category.name_ru}</td>
                  <td><Toggle checked={category.is_visible} onChange={() => toggleVisibility(category)} label={category.is_visible ? t('admin.visible') : t('admin.hidden')} disabled={busyId !== null} /></td>
                  <td><div className="admin-row-actions"><button type="button" onClick={() => setEditing({ ...category })} disabled={busyId !== null} aria-label={t('common.edit')}><AdminIcon name="edit" /></button><button className="is-danger" type="button" onClick={() => remove(category)} disabled={busyId !== null} aria-label={t('common.delete')}><AdminIcon name="trash" /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <EmptyState title={t('admin.noCategories')} description={t('admin.noCategoriesHelp')} />}

      {editing && (
        <AdminModal title={editing.id ? t('common.edit') : t('admin.addCategory')} onClose={() => setEditing(null)} busy={saving}>
          <form className="admin-form admin-form--two admin-category-form" onSubmit={save} aria-busy={saving}>
            <ErrorBanner message={formError} />
            <label>{t('admin.kyrgyzName')}<input value={editing.name_ky} onChange={(event) => setEditing((value) => ({ ...value, name_ky: event.target.value }))} required /></label>
            <label>{t('admin.russianName')}<input value={editing.name_ru} onChange={(event) => setEditing((value) => ({ ...value, name_ru: event.target.value }))} required /></label>
            <div className="admin-category-form-options admin-form-wide">
              <Toggle checked={editing.is_visible} onChange={(checked) => setEditing((value) => ({ ...value, is_visible: checked }))} label={t('admin.visible')} disabled={saving} />
            </div>
            <div className="admin-form-actions admin-form-wide"><button type="button" onClick={() => setEditing(null)} disabled={saving}>{t('common.cancel')}</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <><span className="admin-button-spinner" />{t('common.saving')}</> : t('common.save')}</button></div>
          </form>
        </AdminModal>
      )}
    </>
  )
}
