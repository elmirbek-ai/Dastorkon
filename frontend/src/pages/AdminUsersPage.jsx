import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { formatAdminDate, roleLabels } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'

const emptyUser = { username: '', password: '', first_name: '', last_name: '', email: '', phone: '', role: 'WAITER', is_active: true }

export default function AdminUsersPage() {
  const { loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const [searchParams] = useSearchParams()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(searchParams.get('create') === '1' ? { ...emptyUser } : null)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    adminApiClient.get('/api/admin/users/').then((response) => {
      if (!active) return
      setUsers(response.data)
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, 'Кызматкерлер жүктөлгөн жок.')))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [refreshKey, revision, handleApiError])

  function openEdit(user) {
    setFormError('')
    setEditing({ ...emptyUser, ...user, password: '', avatar: undefined })
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    const payload = {
      username: editing.username, first_name: editing.first_name, last_name: editing.last_name, email: editing.email,
      phone: editing.phone, role: editing.role, is_active: editing.is_active,
      ...(!editing.id ? { password: editing.password } : {}),
    }
    try {
      if (editing.id) await adminApiClient.patch(`/api/admin/users/${editing.id}/`, payload)
      else await adminApiClient.post('/api/admin/users/', payload)
      setEditing(null)
      setRevision((value) => value + 1)
    } catch (requestError) {
      setFormError(handleApiError(requestError, 'Кызматкер сакталган жок.'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(user) {
    if (!window.confirm(`${user.username} аккаунту өчүрүлсүнбү?`)) return
    try {
      await adminApiClient.delete(`/api/admin/users/${user.id}/`)
      setUsers((current) => current.filter((item) => item.id !== user.id))
    } catch (requestError) {
      setError(handleApiError(requestError, 'Кызматкер өчүрүлгөн жок.'))
    }
  }

  if (loadingRestaurant || loading) return <LoadingState />
  return <><PageIntro eyebrow="КОМАНДА" title="Кызматкерлер" description="Админ, официант жана ашкана аккаунттары." action={<button className="admin-primary-action" type="button" onClick={() => setEditing({ ...emptyUser })}><AdminIcon name="plus" />Кызматкер кошуу</button>} /><ErrorBanner message={layoutError || error} />{users.length ? <div className="admin-user-grid">{users.map((user) => <article className="admin-user-card" key={user.id}><header><span>{(user.first_name || user.username).slice(0, 1).toUpperCase()}</span><div><h2>{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}</h2><p>@{user.username}</p></div><b className={`admin-role-badge admin-role-badge--${user.role.toLowerCase()}`}>{roleLabels[user.role]}</b></header><dl><div><dt>Телефон</dt><dd>{user.phone || '—'}</dd></div><div><dt>Email</dt><dd>{user.email || '—'}</dd></div><div><dt>Кошулган</dt><dd>{formatAdminDate(user.date_joined, false)}</dd></div><div><dt>Акыркы кирүү</dt><dd>{formatAdminDate(user.last_login)}</dd></div></dl><footer><span className={user.is_active ? 'is-active' : ''}><i />{user.is_active ? 'Активдүү' : 'Өчүрүлгөн'}</span><div className="admin-row-actions"><button type="button" onClick={() => openEdit(user)}><AdminIcon name="edit" />Өзгөртүү</button><button className="is-danger" type="button" onClick={() => remove(user)} aria-label="Өчүрүү"><AdminIcon name="trash" /></button></div></footer></article>)}</div> : <EmptyState title="Кызматкерлер жок" />}{editing && <AdminModal title={editing.id ? 'Кызматкерди өзгөртүү' : 'Жаңы кызматкер'} onClose={() => setEditing(null)}><form className="admin-form admin-form--two" onSubmit={save}><ErrorBanner message={formError} /><label>Колдонуучу аты<input value={editing.username} onChange={(event) => setEditing((value) => ({ ...value, username: event.target.value }))} required /></label>{!editing.id && <label>Убактылуу сырсөз<input type="password" value={editing.password} onChange={(event) => setEditing((value) => ({ ...value, password: event.target.value }))} minLength="8" required /></label>}<label>Аты<input value={editing.first_name} onChange={(event) => setEditing((value) => ({ ...value, first_name: event.target.value }))} /></label><label>Фамилиясы<input value={editing.last_name} onChange={(event) => setEditing((value) => ({ ...value, last_name: event.target.value }))} /></label><label>Телефон<input value={editing.phone} onChange={(event) => setEditing((value) => ({ ...value, phone: event.target.value }))} /></label><label>Email<input type="email" value={editing.email} onChange={(event) => setEditing((value) => ({ ...value, email: event.target.value }))} /></label><label>Ролу<select value={editing.role} onChange={(event) => setEditing((value) => ({ ...value, role: event.target.value }))}><option value="WAITER">Официант</option><option value="KITCHEN">Ашкана</option><option value="ADMIN">Администратор</option></select></label><div className="admin-form-toggle-pair"><Toggle checked={editing.is_active} onChange={(checked) => setEditing((value) => ({ ...value, is_active: checked }))} label="Аккаунт активдүү" /></div><div className="admin-form-actions admin-form-wide"><button type="button" onClick={() => setEditing(null)}>Жокко чыгаруу</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <span className="admin-button-spinner" /> : 'Сактоо'}</button></div></form></AdminModal>}</>
}
