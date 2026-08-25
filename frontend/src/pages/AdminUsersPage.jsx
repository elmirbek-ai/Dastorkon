import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isValidPhoneNumber } from 'react-phone-number-input'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { formatAdminDate } from '../components/admin/adminUtils.js'
import { useAdminContext } from '../components/admin/AdminContext.js'
import PhoneNumberField from '../components/common/PhoneNumberField.jsx'
import { useConfirm } from '../components/confirmation/useConfirm.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getRoleLabel } from '../i18n/index.js'

const emptyUser = { username: '', password: '', confirm_password: '', phone: '', role: 'WAITER', is_active: true }
const emptyPassword = { password: '', confirm_password: '' }
const pageConfigs = {
  waiters: {
    roles: ['WAITER'],
    defaultRole: 'WAITER',
    apiParams: { role: 'WAITER' },
    titleKey: 'admin.waiters',
    descriptionKey: 'admin.waiterManagement',
    addKey: 'admin.addWaiter',
    createKey: 'admin.addWaiter',
    emptyKey: 'admin.noWaiters',
    showRole: false,
  },
  profiles: {
    roles: ['ADMIN', 'KITCHEN'],
    defaultRole: 'KITCHEN',
    apiParams: { roles: 'ADMIN,KITCHEN' },
    titleKey: 'admin.profiles',
    eyebrowKey: 'admin.profileManagement',
    descriptionKey: 'admin.profilesDescription',
    addKey: 'admin.addProfile',
    createKey: 'admin.addProfile',
    emptyKey: 'admin.noProfiles',
    showRole: true,
  },
}

function RoleHelper({ role }) {
  const { t } = useLanguage()
  const messages = {
    WAITER: t('admin.roleWaiterHelp'), KITCHEN: t('admin.roleKitchenHelp'), ADMIN: t('admin.roleAdminHelp'),
  }
  return <p className={`admin-role-helper is-${role.toLowerCase()}`}>{messages[role]}</p>
}

function UserForm({ value, allowedRoles, showRole, saving, error, onChange, onSubmit, onCancel }) {
  const { language, t } = useLanguage()
  const creating = !value.id
  const phoneError = value.phone && !isValidPhoneNumber(value.phone) ? t('common.invalidPhone') : ''
  return (
    <form className="admin-form admin-user-form" onSubmit={onSubmit} aria-busy={saving}>
      <ErrorBanner message={error} />
      <label>{t('common.username')}<input value={value.username} onChange={(event) => onChange('username', event.target.value)} autoComplete="off" required /></label>
      {showRole && <label>{t('admin.role')}<select value={value.role} onChange={(event) => onChange('role', event.target.value)} required>{allowedRoles.map((role) => <option value={role} key={role}>{getRoleLabel(role, language)}</option>)}</select></label>}
      <RoleHelper role={value.role} />
      <PhoneNumberField
        label={t('common.phone')}
        value={value.phone}
        onChange={(phone) => onChange('phone', phone)}
        error={phoneError}
        helperText={t('common.optional')}
      />
      {creating && <><label>{t('common.password')}<input type="password" minLength="8" value={value.password} onChange={(event) => onChange('password', event.target.value)} autoComplete="new-password" required /></label><label>{t('common.confirmPassword')}<input type="password" minLength="8" value={value.confirm_password} onChange={(event) => onChange('confirm_password', event.target.value)} autoComplete="new-password" required /></label></>}
      <div className="admin-user-active-field"><Toggle checked={value.is_active} onChange={(checked) => onChange('is_active', checked)} label={t('admin.isActive')} disabled={saving} /></div>
      <div className="admin-form-actions"><button type="button" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <><span className="admin-button-spinner" />{t('common.saving')}</> : creating ? t('admin.createAccount') : t('common.save')}</button></div>
    </form>
  )
}

export default function AdminUsersPage({ mode = 'waiters' }) {
  const { loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { language, t } = useLanguage()
  const confirm = useConfirm()
  const [searchParams] = useSearchParams()
  const pageConfig = pageConfigs[mode] || pageConfigs.waiters
  const newUser = { ...emptyUser, role: pageConfig.defaultRole }
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(searchParams.get('create') === '1' ? { ...newUser } : null)
  const [passwordUser, setPasswordUser] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ ...emptyPassword })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [revision, setRevision] = useState(0)
  const mutationInFlightRef = useRef(false)

  useEffect(() => {
    let active = true
    adminApiClient.get('/api/admin/users/', { params: { include_inactive: 'true', ...pageConfig.apiParams } }).then((response) => {
      if (!active) return
      setUsers(response.data.filter((user) => pageConfig.roles.includes(user.role)))
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [refreshKey, revision, handleApiError, t, pageConfig])

  function openEdit(user) {
    setFormError('')
    setEditing({ id: user.id, username: user.username, role: user.role, phone: user.phone || '', is_active: user.is_active, was_active: user.is_active })
  }

  async function save(event) {
    event.preventDefault()
    if (mutationInFlightRef.current) return
    if (editing.id && editing.was_active && !editing.is_active) {
      const confirmed = await confirm({
        title: t('confirmation.deactivateTitle'),
        message: t('confirmation.deactivateMessage', { name: editing.username }),
        confirmLabel: t('confirmation.deactivateConfirm'),
      })
      if (!confirmed || mutationInFlightRef.current) return
    }
    mutationInFlightRef.current = true
    setSaving(true)
    setFormError('')
    if (editing.phone && !isValidPhoneNumber(editing.phone)) {
      setFormError(t('common.invalidPhone'))
      mutationInFlightRef.current = false
      setSaving(false)
      return
    }
    if (!editing.id && editing.password !== editing.confirm_password) {
      setFormError(t('admin.passwordMismatch'))
      mutationInFlightRef.current = false
      setSaving(false)
      return
    }
    const payload = {
      username: editing.username.trim(),
      role: pageConfig.roles.includes(editing.role) ? editing.role : pageConfig.defaultRole,
      phone: editing.phone,
      is_active: editing.is_active,
      ...(!editing.id ? { password: editing.password } : {}),
    }
    try {
      if (editing.id) await adminApiClient.patch(`/api/admin/users/${editing.id}/`, payload)
      else await adminApiClient.post('/api/admin/users/', payload)
      setEditing(null)
      setNotice(editing.id ? t('admin.accountUpdated') : t('admin.accountCreated'))
      setRevision((value) => value + 1)
    } catch (requestError) {
      setFormError(handleApiError(requestError, t('errors.generic')))
    } finally {
      mutationInFlightRef.current = false
      setSaving(false)
    }
  }

  async function toggleActive(user) {
    if (mutationInFlightRef.current) return
    if (user.is_active) {
      const confirmed = await confirm({
        title: t('confirmation.deactivateTitle'),
        message: t('confirmation.deactivateMessage', { name: user.username }),
        confirmLabel: t('confirmation.deactivateConfirm'),
      })
      if (!confirmed || mutationInFlightRef.current) return
    }
    mutationInFlightRef.current = true
    setBusyId(user.id)
    setError('')
    try {
      await adminApiClient.patch(`/api/admin/users/${user.id}/`, { is_active: !user.is_active })
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, is_active: !item.is_active } : item))
    } catch (requestError) {
      setError(handleApiError(requestError, t('errors.generic')))
    } finally {
      mutationInFlightRef.current = false
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
    if (mutationInFlightRef.current) return
    if (passwordForm.password !== passwordForm.confirm_password) {
      setFormError(t('admin.passwordMismatch'))
      return
    }
    mutationInFlightRef.current = true
    setSaving(true)
    setFormError('')
    try {
      await adminApiClient.patch(`/api/admin/users/${passwordUser.id}/`, { password: passwordForm.password })
      setPasswordUser(null)
      setNotice(t('admin.passwordUpdated'))
    } catch (requestError) {
      setFormError(handleApiError(requestError, t('errors.generic')))
    } finally {
      mutationInFlightRef.current = false
      setSaving(false)
    }
  }

  if (loadingRestaurant || loading) return <LoadingState />

  return (
    <>
      <PageIntro eyebrow={pageConfig.eyebrowKey ? t(pageConfig.eyebrowKey) : undefined} title={t(pageConfig.titleKey)} description={t(pageConfig.descriptionKey)} action={<button className="admin-primary-action" type="button" onClick={() => { setEditing({ ...newUser }); setFormError('') }} disabled={busyId !== null}><AdminIcon name="plus" />{t(pageConfig.addKey)}</button>} />
      <ErrorBanner message={layoutError || error} />
      {notice && <div className="admin-success-banner" role="status">{notice}</div>}
      {users.length ? (
        <div className="admin-data-card">
          <div className="admin-table-wrap">
            <table className="admin-table admin-users-table">
              <thead><tr><th>{t('common.username')}</th>{pageConfig.showRole && <th>{t('admin.role')}</th>}<th>{t('common.phone')}</th><th>{t('common.status')}</th><th>{t('common.createdAt')}</th><th>{t('common.action')}</th></tr></thead>
              <tbody>{users.map((user) => (
                <tr key={user.id}>
                  <td><div className="admin-user-name-cell"><span>{user.username.slice(0, 1).toUpperCase()}</span><strong>{user.username}</strong></div></td>
                  {pageConfig.showRole && <td><b className={`admin-role-badge admin-role-badge--${user.role.toLowerCase()}`}>{getRoleLabel(user.role, language)}</b></td>}
                  <td>{user.phone || '—'}</td>
                  <td><Toggle checked={user.is_active} onChange={() => toggleActive(user)} label={user.is_active ? t('admin.active') : t('admin.inactive')} disabled={busyId !== null} /></td>
                  <td>{formatAdminDate(user.date_joined, false)}</td>
                  <td><div className="admin-row-actions admin-user-actions"><button type="button" onClick={() => openEdit(user)} disabled={busyId !== null}><AdminIcon name="edit" />{t('common.edit')}</button><button type="button" onClick={() => openPassword(user)} disabled={busyId !== null}>••• <span>{t('common.password')}</span></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <EmptyState title={t(pageConfig.emptyKey)} description={t(mode === 'profiles' ? 'admin.noProfilesHelp' : 'admin.noWaitersHelp')} />}

      {editing && <AdminModal title={editing.id ? t('admin.editUser') : t(pageConfig.createKey)} onClose={() => setEditing(null)} busy={saving}><UserForm value={editing} allowedRoles={pageConfig.roles} showRole={pageConfig.showRole} saving={saving} error={formError} onChange={(field, value) => setEditing((current) => ({ ...current, [field]: value }))} onSubmit={save} onCancel={() => setEditing(null)} /></AdminModal>}
      {passwordUser && <AdminModal title={`${passwordUser.username}: ${t('admin.changePassword')}`} onClose={() => setPasswordUser(null)} busy={saving}><form className="admin-form" onSubmit={changePassword} aria-busy={saving}><ErrorBanner message={formError} /><label>{t('common.newPassword')}<input type="password" minLength="8" value={passwordForm.password} onChange={(event) => setPasswordForm((value) => ({ ...value, password: event.target.value }))} autoComplete="new-password" required /></label><label>{t('common.confirmPassword')}<input type="password" minLength="8" value={passwordForm.confirm_password} onChange={(event) => setPasswordForm((value) => ({ ...value, confirm_password: event.target.value }))} autoComplete="new-password" required /></label><div className="admin-form-actions"><button type="button" onClick={() => setPasswordUser(null)} disabled={saving}>{t('common.cancel')}</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <><span className="admin-button-spinner" />{t('common.saving')}</> : t('admin.changePassword')}</button></div></form></AdminModal>}
    </>
  )
}
