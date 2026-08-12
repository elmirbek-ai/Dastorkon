import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getLocalizedField } from '../i18n/index.js'

const emptyCategory = { name_ky: '', name_ru: '', sort_order: 0, is_visible: true }

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
    setSaving(true)
    setFormError('')
    const payload = {
      name_ky: editing.name_ky,
      name_ru: editing.name_ru,
      sort_order: Number(editing.sort_order || 0),
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
      setSaving(false)
    }
  }

  async function toggleVisibility(category) {
    const nextVisibility = !category.is_visible
    setBusyId(category.id)
    try {
      await adminApiClient.patch(`/api/admin/categories/${category.id}/`, { is_visible: nextVisibility })
      setCategories((current) => current.map((item) => item.id === category.id ? { ...item, is_visible: nextVisibility } : item))
      setRevision((value) => value + 1)
    } catch (requestError) {
      setError(handleApiError(requestError, t('errors.generic')))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(category) {
    if (!window.confirm(t('admin.categoryDeleteConfirm', { name: getLocalizedField(category, 'name', language) }))) return
    setBusyId(category.id)
    try {
      await adminApiClient.delete(`/api/admin/categories/${category.id}/`)
      setCategories((current) => current.filter((item) => item.id !== category.id))
    } catch (requestError) {
      const relationError = t('admin.categoryHasItems')
      setError([400, 409].includes(requestError.response?.status) ? relationError : handleApiError(requestError, relationError))
    } finally {
      setBusyId(null)
    }
  }

  if (loadingRestaurant || loading) return <LoadingState />

  return (
    <>
      <PageIntro title={t('admin.categories')} description={t('admin.categoryManagement')} action={<button className="admin-primary-action" type="button" onClick={() => setEditing({ ...emptyCategory })}><AdminIcon name="plus" />{t('admin.addCategory')}</button>} />
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
                  <td><Toggle checked={category.is_visible} onChange={() => toggleVisibility(category)} label={category.is_visible ? t('admin.visible') : t('admin.hidden')} disabled={busyId === category.id} /></td>
                  <td><div className="admin-row-actions"><button type="button" onClick={() => setEditing({ ...category })} aria-label={t('common.edit')}><AdminIcon name="edit" /></button><button className="is-danger" type="button" onClick={() => remove(category)} disabled={busyId === category.id} aria-label={t('common.delete')}><AdminIcon name="trash" /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <EmptyState title={t('admin.noCategories')} />}

      {editing && (
        <AdminModal title={editing.id ? t('common.edit') : t('admin.addCategory')} onClose={() => setEditing(null)}>
          <form className="admin-form admin-form--two admin-category-form" onSubmit={save}>
            <ErrorBanner message={formError} />
            <label>{t('admin.kyrgyzName')}<input value={editing.name_ky} onChange={(event) => setEditing((value) => ({ ...value, name_ky: event.target.value }))} required /></label>
            <label>{t('admin.russianName')}<input value={editing.name_ru} onChange={(event) => setEditing((value) => ({ ...value, name_ru: event.target.value }))} required /></label>
            <div className="admin-category-form-options admin-form-wide">
              <label>{t('common.sortOrder')}<input type="number" min="0" value={editing.sort_order} onChange={(event) => setEditing((value) => ({ ...value, sort_order: event.target.value }))} /></label>
              <Toggle checked={editing.is_visible} onChange={(checked) => setEditing((value) => ({ ...value, is_visible: checked }))} label={t('admin.visible')} />
            </div>
            <div className="admin-form-actions admin-form-wide"><button type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <span className="admin-button-spinner" /> : t('common.save')}</button></div>
          </form>
        </AdminModal>
      )}
    </>
  )
}
