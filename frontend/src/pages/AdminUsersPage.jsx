import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { formatAdminDate, roleLabels } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'

const emptyUser = { username: '', password: '', confirm_password: '', phone: '', role: 'WAITER', is_active: true }
const emptyPassword = { password: '', confirm_password: '' }

function RoleHelper({ role }) {
  const messages = {
    WAITER: 'Официант бул аккаунт менен сменага кирет.',
    KITCHEN: 'Ашкана бул аккаунт менен заказдарды көрөт.',
    ADMIN: 'Админ аккаунту системаны башкаруу укугуна ээ.',
  }
  return <p className={`admin-role-helper is-${role.toLowerCase()}`}>{messages[role]}</p>
}

function UserForm({ value, saving, error, onChange, onSubmit, onCancel }) {
  const creating = !value.id
  return (
    <form className="admin-form admin-user-form" onSubmit={onSubmit}>
      <ErrorBanner message={error} />
      <label>Username<input value={value.username} onChange={(event) => onChange('username', event.target.value)} autoComplete="off" required /></label>
      <label>Ролу<select value={value.role} onChange={(event) => onChange('role', event.target.value)} required><option value="ADMIN">Админ</option><option value="WAITER">Официант</option><option value="KITCHEN">Ашкана</option></select></label>
      <RoleHelper role={value.role} />
      <label>Телефон<input value={value.phone} onChange={(event) => onChange('phone', event.target.value)} placeholder="+996..." /></label>
      {creating && <><label>Пароль<input type="password" minLength="8" value={value.password} onChange={(event) => onChange('password', event.target.value)} autoComplete="new-password" required /></label><label>Паролду кайталаңыз<input type="password" minLength="8" value={value.confirm_password} onChange={(event) => onChange('confirm_password', event.target.value)} autoComplete="new-password" required /></label></>}
      <div className="admin-user-active-field"><Toggle checked={value.is_active} onChange={(checked) => onChange('is_active', checked)} label="Аккаунт активдүү" /></div>
      <div className="admin-form-actions"><button type="button" onClick={onCancel}>Жокко чыгаруу</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <span className="admin-button-spinner" /> : 'Сактоо'}</button></div>
    </form>
  )
}

export default function AdminUsersPage() {
  const { loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const [searchParams] = useSearchParams()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(searchParams.get('create') === '1' ? { ...emptyUser } : null)
  const [passwordUser, setPasswordUser] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ ...emptyPassword })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    adminApiClient.get('/api/admin/users/', { params: { include_inactive: 'true' } }).then((response) => {
      if (!active) return
      setUsers(response.data)
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, 'Кызматкерлер жүктөлгөн жок.')))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [refreshKey, revision, handleApiError])

  function openEdit(user) {
    setFormError('')
    setEditing({ id: user.id, username: user.username, role: user.role, phone: user.phone || '', is_active: user.is_active })
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    if (!editing.id && editing.password !== editing.confirm_password) {
      setFormError('Паролдор дал келген жок.')
      setSaving(false)
      return
    }
    const payload = {
      username: editing.username.trim(),
      role: editing.role,
      phone: editing.phone,
      is_active: editing.is_active,
      ...(!editing.id ? { password: editing.password } : {}),
    }
    try {
      if (editing.id) await adminApiClient.patch(`/api/admin/users/${editing.id}/`, payload)
      else await adminApiClient.post('/api/admin/users/', payload)
      setEditing(null)
      setNotice(editing.id ? 'Аккаунт жаңыртылды.' : 'Жаңы аккаунт түзүлдү.')
      setRevision((value) => value + 1)
    } catch (requestError) {
      setFormError(handleApiError(requestError, 'Аккаунт сакталган жок.'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(user) {
    setBusyId(user.id)
    setError('')
    try {
      await adminApiClient.patch(`/api/admin/users/${user.id}/`, { is_active: !user.is_active })
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, is_active: !item.is_active } : item))
    } catch (requestError) {
      setError(handleApiError(requestError, 'Аккаунттун статусу өзгөргөн жок.'))
    } finally {
      setBusyId(null)
    }
  }

  function openPassword(user) {
    setPasswordUser(user)
    setPasswordForm({ ...emptyPassword })
    setFormError('')
  }

  async function changePassword(event) {
    event.preventDefault()
    if (passwordForm.password !== passwordForm.confirm_password) {
      setFormError('Паролдор дал келген жок.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await adminApiClient.patch(`/api/admin/users/${passwordUser.id}/`, { password: passwordForm.password })
      setPasswordUser(null)
      setNotice('Пароль жаңыртылды.')
    } catch (requestError) {
      setFormError(handleApiError(requestError, 'Пароль жаңыртылган жок.'))
    } finally {
      setSaving(false)
    }
  }

  if (loadingRestaurant || loading) return <LoadingState />

  return (
    <>
      <PageIntro eyebrow="КОМАНДА" title="Кызматкерлер" description="Админ, официант жана ашкана аккаунттарын башкарыңыз." action={<button className="admin-primary-action" type="button" onClick={() => { setEditing({ ...emptyUser }); setFormError('') }}><AdminIcon name="plus" />Кызматкер кошуу</button>} />
      <ErrorBanner message={layoutError || error} />
      {notice && <div className="admin-success-banner">{notice}</div>}
      {users.length ? (
        <div className="admin-data-card">
          <div className="admin-table-wrap">
            <table className="admin-table admin-users-table">
              <thead><tr><th>Username</th><th>Ролу</th><th>Телефон</th><th>Статус</th><th>Түзүлгөн</th><th>Аракет</th></tr></thead>
              <tbody>{users.map((user) => (
                <tr key={user.id}>
                  <td><div className="admin-user-name-cell"><span>{user.username.slice(0, 1).toUpperCase()}</span><strong>{user.username}</strong></div></td>
                  <td><b className={`admin-role-badge admin-role-badge--${user.role.toLowerCase()}`}>{roleLabels[user.role]}</b></td>
                  <td>{user.phone || '—'}</td>
                  <td><Toggle checked={user.is_active} onChange={() => toggleActive(user)} label={user.is_active ? 'Активдүү' : 'Өчүрүлгөн'} disabled={busyId === user.id} /></td>
                  <td>{formatAdminDate(user.date_joined, false)}</td>
                  <td><div className="admin-row-actions admin-user-actions"><button type="button" onClick={() => openEdit(user)}><AdminIcon name="edit" />Өзгөртүү</button><button type="button" onClick={() => openPassword(user)}>••• <span>Пароль</span></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <EmptyState title="Кызматкерлер жок" />}

      {editing && <AdminModal title={editing.id ? 'Аккаунтту өзгөртүү' : 'Жаңы аккаунт'} onClose={() => setEditing(null)}><UserForm value={editing} saving={saving} error={formError} onChange={(field, value) => setEditing((current) => ({ ...current, [field]: value }))} onSubmit={save} onCancel={() => setEditing(null)} /></AdminModal>}
      {passwordUser && <AdminModal title={`${passwordUser.username}: паролду өзгөртүү`} onClose={() => setPasswordUser(null)}><form className="admin-form" onSubmit={changePassword}><ErrorBanner message={formError} /><label>Жаңы пароль<input type="password" minLength="8" value={passwordForm.password} onChange={(event) => setPasswordForm((value) => ({ ...value, password: event.target.value }))} autoComplete="new-password" required /></label><label>Паролду кайталаңыз<input type="password" minLength="8" value={passwordForm.confirm_password} onChange={(event) => setPasswordForm((value) => ({ ...value, confirm_password: event.target.value }))} autoComplete="new-password" required /></label><div className="admin-form-actions"><button type="button" onClick={() => setPasswordUser(null)}>Жокко чыгаруу</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <span className="admin-button-spinner" /> : 'Паролду сактоо'}</button></div></form></AdminModal>}
    </>
  )
}
