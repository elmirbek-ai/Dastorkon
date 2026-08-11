import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { adminImageUrl, formatAdminMoney } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'

const emptyMenuItem = {
  name_ky: '',
  name_ru: '',
  description_ky: '',
  description_ru: '',
  category: '',
  price: '',
  cooking_time_min: 0,
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
  'allergens_ky', 'allergens_ru', 'is_available', 'is_visible',
]

function MenuForm({ value, categories, imagePreview, saving, error, onChange, onImageChange, onClearImage, onSubmit, onCancel }) {
  const shownInMenu = value.is_available && value.is_visible

  return (
    <form className="admin-menu-form" onSubmit={onSubmit}>
      <ErrorBanner message={error} />

      <section className="admin-menu-form-section">
        <header>
          <div><small>НЕГИЗГИ МААЛЫМАТ</small><h3>Жалпы параметрлер</h3></div>
          <p>Категория, баа жана кардар менюсундагы абал.</p>
        </header>
        <div className="admin-menu-general-grid">
          <label>
            Категория
            <select value={value.category} onChange={(event) => onChange('category', event.target.value)} required>
              <option value="">Тандаңыз</option>
              {categories.map((category) => <option value={category.id} key={category.id}>{category.name_ky}</option>)}
            </select>
          </label>
          <label>
            Баасы
            <input type="number" min="0" step="0.01" value={value.price} onChange={(event) => onChange('price', event.target.value)} required />
          </label>
          <label>
            Даярдоо убактысы (мүнөт)
            <input type="number" min="0" value={value.cooking_time_min} onChange={(event) => onChange('cooking_time_min', event.target.value)} />
          </label>
          <label className="admin-menu-image-field">
            Сүрөт
            <span className="admin-file-input"><AdminIcon name="plus" /><b>{imagePreview ? 'Сүрөттү алмаштыруу' : 'Сүрөт тандоо'}</b><input type="file" accept="image/*" onChange={(event) => onImageChange(event.target.files?.[0] || null)} /></span>
          </label>
        </div>

        <div className="admin-menu-image-status">
          {imagePreview ? (
            <div className="admin-menu-image-preview">
              <img src={imagePreview} alt="Тамактын сүрөтү" />
              <div><strong>Сүрөт даяр</strong><small>Жаңы файл тандалбаса учурдагы сүрөт сакталат.</small></div>
              {imagePreview.startsWith('blob:') && <button type="button" onClick={onClearImage}>Тандоону тазалоо</button>}
            </div>
          ) : <p className="admin-menu-no-image">Сүрөт тандалган эмес. JPG, PNG же башка сүрөт файлын кошсоңуз болот.</p>}
          <Toggle
            checked={shownInMenu}
            onChange={(checked) => {
              onChange('is_available', checked)
              onChange('is_visible', checked)
            }}
            label="Менюда көрсөтүү"
          />
        </div>
      </section>

      <section className="admin-menu-form-section">
        <header>
          <div><small>ЭКИ ТИЛДЕГИ МАЗМУН</small><h3>Аталышы жана сүрөттөмөсү</h3></div>
          <p>Кыргызча жана орусча маалыматты тиешелүү тил тилкесине жазыңыз.</p>
        </header>
        <div className="admin-bilingual-grid">
          <div className="admin-language-column">
            <div className="admin-language-heading"><span>KG</span><strong>Кыргызча</strong></div>
            <label>Кыргызча аталышы<input value={value.name_ky} onChange={(event) => onChange('name_ky', event.target.value)} required /></label>
            <label>Кыргызча сүрөттөмө<textarea value={value.description_ky} onChange={(event) => onChange('description_ky', event.target.value)} rows="3" /></label>
            <label>Курамы (KG)<textarea value={value.ingredients_ky} onChange={(event) => onChange('ingredients_ky', event.target.value)} rows="2" /></label>
            <label>Аллергендер (KG)<textarea value={value.allergens_ky} onChange={(event) => onChange('allergens_ky', event.target.value)} rows="2" /></label>
          </div>
          <div className="admin-language-column">
            <div className="admin-language-heading"><span>RU</span><strong>Русский</strong></div>
            <label>Орусча аталышы<input value={value.name_ru} onChange={(event) => onChange('name_ru', event.target.value)} required /></label>
            <label>Орусча сүрөттөмө<textarea value={value.description_ru} onChange={(event) => onChange('description_ru', event.target.value)} rows="3" /></label>
            <label>Курамы (RU)<textarea value={value.ingredients_ru} onChange={(event) => onChange('ingredients_ru', event.target.value)} rows="2" /></label>
            <label>Аллергендер (RU)<textarea value={value.allergens_ru} onChange={(event) => onChange('allergens_ru', event.target.value)} rows="2" /></label>
          </div>
        </div>
      </section>

      <div className="admin-form-actions admin-menu-form-actions">
        <button type="button" onClick={onCancel}>Жокко чыгаруу</button>
        <button className="is-primary" type="submit" disabled={saving}>{saving ? <span className="admin-button-spinner" /> : 'Сактоо'}</button>
      </div>
    </form>
  )
}

export default function AdminMenuPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(searchParams.get('create') === '1' ? { ...emptyMenuItem } : null)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    Promise.all([adminApiClient.get('/api/admin/menu-items/'), adminApiClient.get('/api/admin/categories/')])
      .then(([itemsResponse, categoryResponse]) => {
        if (!active) return
        setItems(itemsResponse.data.filter((item) => item.restaurant === restaurantId))
        setCategories(categoryResponse.data.filter((item) => item.restaurant === restaurantId))
        setError('')
      }).catch((requestError) => active && setError(handleApiError(requestError, 'Меню жүктөлгөн жок.')))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, refreshKey, revision, handleApiError])

  useEffect(() => () => {
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  const categoryMap = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, category])), [categories])
  const filteredItems = items.filter((item) => (!categoryFilter || item.category === Number(categoryFilter)) && (!query || `${item.name_ky} ${item.name_ru}`.toLowerCase().includes(query.toLowerCase())))

  function resetImageSelection() {
    setImageFile(null)
    setImagePreview('')
  }

  function openCreate() {
    setFormError('')
    resetImageSelection()
    setEditing({ ...emptyMenuItem, category: categoryFilter || '' })
  }

  function openEdit(item) {
    setFormError('')
    setImageFile(null)
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
      setFormError('Сүрөт форматындагы файлды тандаңыз.')
      return
    }
    setFormError('')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function buildJsonPayload() {
    const payload = {
      restaurant: restaurantId,
      category: Number(editing.category),
      price: Number(editing.price),
      cooking_time_min: Number(editing.cooking_time_min || 0),
    }
    editableFields.forEach((field) => { payload[field] = editing[field] })
    return payload
  }

  function buildMultipartPayload() {
    const formData = new FormData()
    const payload = buildJsonPayload()
    Object.entries(payload).forEach(([field, value]) => formData.append(field, String(value)))
    formData.append('image', imageFile)
    return formData
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    const payload = imageFile ? buildMultipartPayload() : buildJsonPayload()
    try {
      if (editing.id) await adminApiClient.patch(`/api/admin/menu-items/${editing.id}/`, payload)
      else await adminApiClient.post('/api/admin/menu-items/', payload)
      closeForm()
      setRevision((value) => value + 1)
    } catch (requestError) {
      setFormError(handleApiError(requestError, imageFile ? 'Сүрөт же тамак маалыматы сакталган жок.' : 'Тамак сакталган жок.'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleMenuStatus(item) {
    const nextStatus = !(item.is_available && item.is_visible)
    setBusyId(item.id)
    try {
      await adminApiClient.patch(`/api/admin/menu-items/${item.id}/`, { is_available: nextStatus, is_visible: nextStatus })
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_available: nextStatus, is_visible: nextStatus } : entry))
    } catch (requestError) {
      setError(handleApiError(requestError, 'Меню статусу өзгөргөн жок.'))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item) {
    if (!window.confirm(`“${item.name_ky}” өчүрүлсүнбү?`)) return
    setBusyId(item.id)
    try {
      await adminApiClient.delete(`/api/admin/menu-items/${item.id}/`)
      setItems((current) => current.filter((entry) => entry.id !== item.id))
    } catch (requestError) {
      setError(handleApiError(requestError, 'Тамак өчүрүлгөн жок.'))
    } finally {
      setBusyId(null)
    }
  }

  if (loadingRestaurant || loading) return <LoadingState />

  return (
    <>
      <PageIntro title="Тамактар" description={`${items.length} меню позициясы`} action={<button className="admin-primary-action" type="button" onClick={openCreate}><AdminIcon name="plus" />Тамак кошуу</button>} />
      <ErrorBanner message={layoutError || error} />
      <div className="admin-toolbar">
        <label className="admin-search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Тамак издөө..." /></label>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Бардык категориялар</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name_ky}</option>)}</select>
        <span>{filteredItems.length} позиция</span>
      </div>
      {filteredItems.length ? (
        <div className="admin-data-card">
          <div className="admin-table-wrap">
            <table className="admin-table admin-menu-table">
              <thead><tr><th>Тамак</th><th>Категория</th><th>Баасы</th><th>Статус</th><th>Аракет</th></tr></thead>
              <tbody>{filteredItems.map((item) => (
                <tr key={item.id}>
                  <td><div className="admin-menu-cell">{item.image ? <img src={adminImageUrl(item.image)} alt="" /> : <span>{item.name_ky.slice(0, 1)}</span>}<div><strong>{item.name_ky}</strong><small>{item.name_ru}</small></div></div></td>
                  <td>{categoryMap[item.category]?.name_ky || '—'}</td>
                  <td><strong>{formatAdminMoney(item.price)}</strong></td>
                  <td><Toggle checked={item.is_available && item.is_visible} onChange={() => toggleMenuStatus(item)} label={item.is_available && item.is_visible ? 'Менюда' : 'Жашырылган'} disabled={busyId === item.id} /></td>
                  <td><div className="admin-row-actions"><button type="button" onClick={() => openEdit(item)} aria-label="Өзгөртүү"><AdminIcon name="edit" /></button><button className="is-danger" type="button" onClick={() => remove(item)} disabled={busyId === item.id} aria-label="Өчүрүү"><AdminIcon name="trash" /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <EmptyState title="Тамак табылган жок" description="Издөө же категория чыпкасын өзгөртүңүз." />}
      {editing && (
        <AdminModal title={editing.id ? 'Тамакты өзгөртүү' : 'Жаңы тамак'} onClose={closeForm} wide>
          <MenuForm value={editing} categories={categories} imagePreview={imagePreview} saving={saving} error={formError} onChange={(field, value) => setEditing((current) => ({ ...current, [field]: value }))} onImageChange={selectImage} onClearImage={() => { setImageFile(null); setImagePreview(editing.image ? adminImageUrl(editing.image) : '') }} onSubmit={save} onCancel={closeForm} />
        </AdminModal>
      )}
    </>
  )
}
