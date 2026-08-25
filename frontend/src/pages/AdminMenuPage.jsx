import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { adminImageUrl, formatAdminMoney } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useConfirm } from '../components/confirmation/useConfirm.js'
import MenuItemBadges from '../components/MenuItemBadges.jsx'
import { MENU_SALES_LABELS } from '../components/menuItemLabels.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getLocalizedField } from '../i18n/index.js'

const emptyMenuItem = {
  name_ky: '',
  name_ru: '',
  description_ky: '',
  description_ru: '',
  category: '',
  price: '',
  cooking_time_min: '',
  is_hit: false,
  is_new: false,
  is_spicy: false,
  is_vegetarian: false,
  is_recommended: false,
  ingredients_ky: '',
  ingredients_ru: '',
  allergens_ky: '',
  allergens_ru: '',
  is_available: true,
  is_visible: true,
  image: '',
}

const editableFields = [
  'name_ky', 'name_ru', 'description_ky', 'description_ru', 'ingredients_ky', 'ingredients_ru',
  'allergens_ky', 'allergens_ru', 'is_hit', 'is_new', 'is_spicy', 'is_vegetarian',
  'is_recommended', 'is_available', 'is_visible',
]

function MenuForm({ value, categories, imagePreview, saving, error, onChange, onImageChange, onClearImage, onRemoveImage, onSubmit, onCancel }) {
  const { language, t } = useLanguage()
  const confirm = useConfirm()
  const fileInputRef = useRef(null)
  const [imageActionsOpen, setImageActionsOpen] = useState(false)

  function chooseImage() {
    setImageActionsOpen(false)
    fileInputRef.current?.click()
  }

  function handleImageSelection(event) {
    onImageChange(event.target.files?.[0] || null)
    event.target.value = ''
  }

  async function removeImage() {
    setImageActionsOpen(false)
    const confirmed = await confirm({ message: t('confirmation.imageMessage') })
    if (!confirmed) return
    onRemoveImage()
  }

  return (
    <form className="admin-menu-form" onSubmit={onSubmit} aria-busy={saving}>
      <ErrorBanner message={error} />

      <section className="admin-menu-form-section">
        <header>
          <div><small>{t('admin.basicInformation')}</small><h3>{t('admin.generalParameters')}</h3></div>
          <p>{t('admin.generalParametersHelp')}</p>
        </header>
        <div className="admin-menu-general-grid">
          <label>
            {t('admin.category')}
            <select value={value.category} onChange={(event) => onChange('category', event.target.value)} required>
              <option value="">{t('admin.selectCategory')}</option>
              {categories.map((category) => <option value={category.id} key={category.id}>{getLocalizedField(category, 'name', language)}</option>)}
            </select>
          </label>
          <label>
            {t('common.price')}
            <input type="number" min="0" step="0.01" value={value.price} onChange={(event) => onChange('price', event.target.value)} required />
          </label>
          <label>
            {t('admin.preparationTime')}
            <input
              type="number"
              min="1"
              max="300"
              value={value.cooking_time_min ?? ''}
              placeholder={t('admin.preparationTimePlaceholder')}
              onChange={(event) => onChange('cooking_time_min', event.target.value)}
            />
          </label>
          <div className="admin-menu-image-field">
            <span>{t('common.image')}</span>
            <div className="admin-image-control">
              <button
                className="admin-file-input"
                type="button"
                onClick={imagePreview ? () => setImageActionsOpen((open) => !open) : chooseImage}
                aria-expanded={imagePreview ? imageActionsOpen : undefined}
                disabled={saving}
              >
                <AdminIcon name="plus" />
                <b>{imagePreview ? t('admin.changeImage') : t('admin.chooseImage')}</b>
              </button>
              {imagePreview && imageActionsOpen && (
                <div className="admin-image-actions">
                  <button type="button" onClick={chooseImage}>{t('admin.changeImage')}</button>
                  <button className="is-danger" type="button" onClick={removeImage}>{t('admin.removeImage')}</button>
                </div>
              )}
              <input ref={fileInputRef} className="admin-image-file-input" type="file" accept="image/*" onChange={handleImageSelection} tabIndex="-1" />
            </div>
          </div>
        </div>

        <div className="admin-menu-sales-labels">
          <div><strong>{t('admin.salesLabels')}</strong><small>{t('admin.salesLabelsHelp')}</small></div>
          <div className="admin-menu-label-options">
            {MENU_SALES_LABELS.map(({ field, key }) => (
              <button
                className={value[field] ? 'is-active' : ''}
                type="button"
                aria-pressed={Boolean(value[field])}
                onClick={() => onChange(field, !value[field])}
                disabled={saving}
                key={field}
              >
                {t(`menuLabels.${key}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-menu-image-status">
          {imagePreview ? (
            <div className="admin-menu-image-preview">
              <img src={imagePreview} alt={t('admin.foodImageAlt')} />
              <div><strong>{t('admin.imageReady')}</strong><small>{t('admin.currentImagePreserved')}</small></div>
              {imagePreview.startsWith('blob:') && <button type="button" onClick={onClearImage} disabled={saving}>{t('admin.clearSelection')}</button>}
            </div>
          ) : <p className="admin-menu-no-image">{t('admin.noImageSelected')}</p>}
          <div className="admin-menu-status-controls">
            <Toggle
              checked={value.is_available}
              onChange={(checked) => onChange('is_available', checked)}
              label={t('admin.available')}
              disabled={saving}
            />
            <Toggle
              checked={value.is_visible}
              onChange={(checked) => onChange('is_visible', checked)}
              label={t('admin.showInMenu')}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      <section className="admin-menu-form-section">
        <header>
          <div><small>{t('admin.bilingualContent')}</small><h3>{t('admin.nameAndDescription')}</h3></div>
          <p>{t('admin.bilingualFormHelp')}</p>
        </header>
        <div className="admin-bilingual-grid">
          <div className="admin-language-column">
            <div className="admin-language-heading"><span>KY</span><strong>{t('common.kyrgyz')}</strong></div>
            <label>{t('admin.kyrgyzName')}<input value={value.name_ky} onChange={(event) => onChange('name_ky', event.target.value)} required /></label>
            <label>{t('admin.kyrgyzDescription')}<textarea value={value.description_ky} onChange={(event) => onChange('description_ky', event.target.value)} rows="3" /></label>
            <label>{t('admin.ingredientsKy')}<textarea value={value.ingredients_ky} onChange={(event) => onChange('ingredients_ky', event.target.value)} rows="2" /></label>
            <label>{t('admin.allergensKy')}<textarea value={value.allergens_ky} onChange={(event) => onChange('allergens_ky', event.target.value)} rows="2" /></label>
          </div>
          <div className="admin-language-column">
            <div className="admin-language-heading"><span>RU</span><strong>{t('common.russian')}</strong></div>
            <label>{t('admin.russianName')}<input value={value.name_ru} onChange={(event) => onChange('name_ru', event.target.value)} required /></label>
            <label>{t('admin.russianDescription')}<textarea value={value.description_ru} onChange={(event) => onChange('description_ru', event.target.value)} rows="3" /></label>
            <label>{t('admin.ingredientsRu')}<textarea value={value.ingredients_ru} onChange={(event) => onChange('ingredients_ru', event.target.value)} rows="2" /></label>
            <label>{t('admin.allergensRu')}<textarea value={value.allergens_ru} onChange={(event) => onChange('allergens_ru', event.target.value)} rows="2" /></label>
          </div>
        </div>
      </section>

      <div className="admin-form-actions admin-menu-form-actions">
        <button type="button" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>
        <button className="is-primary" type="submit" disabled={saving}>{saving ? <><span className="admin-button-spinner" />{t('common.saving')}</> : t('common.save')}</button>
      </div>
    </form>
  )
}

export default function AdminMenuPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { language, t } = useLanguage()
  const confirm = useConfirm()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(searchParams.get('create') === '1' ? { ...emptyMenuItem } : null)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [imageRemoved, setImageRemoved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const mutationInFlightRef = useRef(false)

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    Promise.all([adminApiClient.get('/api/admin/menu-items/'), adminApiClient.get('/api/admin/categories/')])
      .then(([itemsResponse, categoryResponse]) => {
        if (!active) return
        setItems(itemsResponse.data.filter((item) => item.restaurant === restaurantId))
        setCategories(categoryResponse.data.filter((item) => item.restaurant === restaurantId))
        setError('')
      }).catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, refreshKey, revision, handleApiError, t])

  useEffect(() => () => {
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  const categoryMap = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, category])), [categories])
  const filteredItems = items.filter((item) => (!categoryFilter || item.category === Number(categoryFilter)) && (!query || `${item.name_ky} ${item.name_ru}`.toLowerCase().includes(query.toLowerCase())))

  function resetImageSelection() {
    setImageFile(null)
    setImagePreview('')
    setImageRemoved(false)
  }

  function openCreate() {
    setFormError('')
    resetImageSelection()
    setEditing({ ...emptyMenuItem, category: categoryFilter || '' })
  }

  function openEdit(item) {
    setFormError('')
    setImageFile(null)
    setImageRemoved(false)
    setImagePreview(item.image ? adminImageUrl(item.image) : '')
    setEditing({ ...emptyMenuItem, ...item, category: String(item.category) })
  }

  function closeForm() {
    setEditing(null)
    resetImageSelection()
  }

  function selectImage(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setFormError(t('admin.selectImageFile'))
      return
    }
    setFormError('')
    setImageFile(file)
    setImageRemoved(false)
    setImagePreview(URL.createObjectURL(file))
  }

  function buildJsonPayload() {
    const payload = {
      restaurant: restaurantId,
      category: Number(editing.category),
      price: Number(editing.price),
      cooking_time_min: editing.cooking_time_min ? Number(editing.cooking_time_min) : null,
    }
    editableFields.forEach((field) => { payload[field] = editing[field] })
    if (imageRemoved) payload.image = null
    return payload
  }

  function buildMultipartPayload() {
    const formData = new FormData()
    const payload = buildJsonPayload()
    Object.entries(payload).forEach(([field, value]) => formData.append(field, value === null ? '' : String(value)))
    formData.append('image', imageFile)
    return formData
  }

  async function save(event) {
    event.preventDefault()
    if (mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setSaving(true)
    setFormError('')
    const payload = imageFile ? buildMultipartPayload() : buildJsonPayload()
    try {
      if (editing.id) await adminApiClient.patch(`/api/admin/menu-items/${editing.id}/`, payload)
      else await adminApiClient.post('/api/admin/menu-items/', payload)
      closeForm()
      setRevision((value) => value + 1)
    } catch (requestError) {
      setFormError(handleApiError(requestError, t('errors.generic')))
    } finally {
      mutationInFlightRef.current = false
      setSaving(false)
    }
  }

  async function toggleMenuStatus(item) {
    if (mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    const nextStatus = !item.is_available
    setBusyId(item.id)
    try {
      await adminApiClient.patch(`/api/admin/menu-items/${item.id}/`, { is_available: nextStatus })
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_available: nextStatus } : entry))
    } catch (requestError) {
      setError(handleApiError(requestError, t('errors.generic')))
    } finally {
      mutationInFlightRef.current = false
      setBusyId(null)
    }
  }

  async function remove(item) {
    if (mutationInFlightRef.current) return
    const confirmed = await confirm({
      message: t('confirmation.menuItemMessage', {
        name: getLocalizedField(item, 'name', language),
      }),
    })
    if (!confirmed || mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setBusyId(item.id)
    try {
      await adminApiClient.delete(`/api/admin/menu-items/${item.id}/`)
      setItems((current) => current.filter((entry) => entry.id !== item.id))
    } catch (requestError) {
      setError(handleApiError(requestError, t('errors.generic')))
    } finally {
      mutationInFlightRef.current = false
      setBusyId(null)
    }
  }

  if (loadingRestaurant || loading) return <LoadingState />

  return (
    <>
      <PageIntro title={t('admin.menuManagement')} description={t('admin.menuManagementDescription', { count: items.length })} action={<button className="admin-primary-action" type="button" onClick={openCreate} disabled={busyId !== null}><AdminIcon name="plus" />{t('admin.addMenuItem')}</button>} />
      <ErrorBanner message={layoutError || error} />
      <div className="admin-toolbar">
        <label className="admin-search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.searchFood')} /></label>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">{t('admin.allCategories')}</option>{categories.map((category) => <option value={category.id} key={category.id}>{getLocalizedField(category, 'name', language)}</option>)}</select>
        <span>{t('admin.menuItemCount', { count: filteredItems.length })}</span>
      </div>
      {filteredItems.length ? (
        <div className="admin-data-card">
          <div className="admin-table-wrap">
            <table className="admin-table admin-menu-table">
              <thead><tr><th>{t('admin.food')}</th><th>{t('admin.category')}</th><th>{t('common.price')}</th><th>{t('common.status')}</th><th>{t('common.action')}</th></tr></thead>
              <tbody>{filteredItems.map((item) => (
                <tr className={!item.is_available ? 'is-unavailable' : ''} key={item.id}>
                  <td><div className="admin-menu-cell">{item.image ? <img src={adminImageUrl(item.image)} alt="" /> : <span>{getLocalizedField(item, 'name', language).slice(0, 1)}</span>}<div><strong>{getLocalizedField(item, 'name', language)}</strong>{!item.is_visible && <small>{t('admin.hidden')}</small>}<MenuItemBadges item={item} className="admin-menu-badges" /></div></div></td>
                  <td>{getLocalizedField(categoryMap[item.category], 'name', language) || '—'}</td>
                  <td><strong>{formatAdminMoney(item.price)}</strong></td>
                  <td><Toggle checked={item.is_available} onChange={() => toggleMenuStatus(item)} label={item.is_available ? t('admin.available') : t('admin.unavailable')} disabled={busyId !== null} /></td>
                  <td><div className="admin-row-actions"><button type="button" onClick={() => openEdit(item)} disabled={busyId !== null} aria-label={t('common.edit')}><AdminIcon name="edit" /></button><button className="is-danger" type="button" onClick={() => remove(item)} disabled={busyId !== null} aria-label={t('common.delete')}><AdminIcon name="trash" /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          title={(query || categoryFilter) ? t('admin.noMenuMatches') : t('admin.noMenuItems')}
          description={(query || categoryFilter) ? t('admin.noMenuMatchesHelp') : t('admin.noMenuItemsHelp')}
          action={(query || categoryFilter) && <button className="admin-empty-action" type="button" onClick={() => { setQuery(''); setCategoryFilter('') }}>{t('admin.clearFilters')}</button>}
        />
      )}
      {editing && (
        <AdminModal title={editing.id ? t('common.edit') : t('admin.addMenuItem')} onClose={closeForm} wide busy={saving}>
          <MenuForm value={editing} categories={categories} imagePreview={imagePreview} saving={saving} error={formError} onChange={(field, value) => setEditing((current) => ({ ...current, [field]: value }))} onImageChange={selectImage} onClearImage={() => { setImageFile(null); setImageRemoved(false); setImagePreview(editing.image ? adminImageUrl(editing.image) : '') }} onRemoveImage={() => { setImageFile(null); setImagePreview(''); setImageRemoved(Boolean(editing.id && editing.image)) }} onSubmit={save} onCancel={closeForm} />
        </AdminModal>
      )}
    </>
  )
}
