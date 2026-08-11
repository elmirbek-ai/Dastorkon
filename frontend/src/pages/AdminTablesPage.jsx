import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { useAdminContext } from '../components/admin/AdminContext.js'

const emptyTable = { number: '', is_active: true }

export default function AdminTablesPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const [searchParams] = useSearchParams()
  const qrView = searchParams.get('view') === 'qr'
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(searchParams.get('create') === '1' ? { ...emptyTable } : null)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    adminApiClient.get('/api/admin/tables/').then((response) => {
      if (!active) return
      setTables(response.data.filter((item) => item.restaurant === restaurantId))
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, 'Столдор жүктөлгөн жок.')))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, refreshKey, revision, handleApiError])

  function qrLink(table) {
    return `${window.location.origin}/menu/${table.qr_token}`
  }

  async function copyQr(table) {
    try {
      await navigator.clipboard.writeText(qrLink(table))
      setNotice(`Стол №${table.number} QR шилтемеси көчүрүлдү.`)
      window.setTimeout(() => setNotice(''), 2500)
    } catch {
      setError('Шилтемени көчүрүү мүмкүн болгон жок.')
    }
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    const payload = { restaurant: restaurantId, number: Number(editing.number), is_active: editing.is_active }
    try {
      if (editing.id) await adminApiClient.patch(`/api/admin/tables/${editing.id}/`, payload)
      else await adminApiClient.post('/api/admin/tables/', payload)
      setEditing(null)
      setRevision((value) => value + 1)
    } catch (requestError) {
      setFormError(handleApiError(requestError, 'Стол сакталган жок.'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(table) {
    if (!window.confirm(`Стол №${table.number} өчүрүлсүнбү?`)) return
    try {
      await adminApiClient.delete(`/api/admin/tables/${table.id}/`)
      setTables((current) => current.filter((item) => item.id !== table.id))
    } catch (requestError) {
      setError(handleApiError(requestError, 'Стол өчүрүлгөн жок.'))
    }
  }

  if (loadingRestaurant || loading) return <LoadingState />
  return <><PageIntro eyebrow={qrView ? 'QR МЕНЮ' : 'ЗАЛ БАШКАРУУ'} title={qrView ? 'QR коддор' : 'Столдор'} description={qrView ? 'Кардар менюсуна алып баруучу шилтемелер.' : `${tables.length} активдүү стол`} action={<button className="admin-primary-action" type="button" onClick={() => setEditing({ ...emptyTable })}><AdminIcon name="plus" />Стол кошуу</button>} /><ErrorBanner message={layoutError || error} />{notice && <div className="admin-success-banner">{notice}</div>}{tables.length ? <div className={`admin-table-grid ${qrView ? 'is-qr-view' : ''}`}>{tables.map((table) => <article className="admin-table-card" key={table.id}><header><span><AdminIcon name={qrView ? 'qr' : 'tables'} /></span><div><small>РЕСТОРАН СТОЛУ</small><h2>Стол №{table.number}</h2></div><b className={table.status === 'OCCUPIED' ? 'is-occupied' : ''}>{table.status === 'OCCUPIED' ? 'Бош эмес' : 'Бош'}</b></header><div className="admin-table-card-meta"><span>Статус<strong>{table.is_active ? 'Активдүү' : 'Өчүрүлгөн'}</strong></span><span>QR токен<strong title={table.qr_token}>{table.qr_token.slice(0, 8)}…</strong></span></div><div className="admin-qr-link"><AdminIcon name="qr" /><span>{qrLink(table)}</span></div><footer><button type="button" onClick={() => copyQr(table)}><AdminIcon name="copy" />QR көчүрүү</button><a href={qrLink(table)} target="_blank" rel="noreferrer"><AdminIcon name="eye" />Ачуу</a><button type="button" onClick={() => setEditing({ ...table })} aria-label="Өзгөртүү"><AdminIcon name="edit" /></button><button className="is-danger" type="button" onClick={() => remove(table)} aria-label="Өчүрүү"><AdminIcon name="trash" /></button></footer></article>)}</div> : <EmptyState title="Столдор жок" description="Биринчи столду кошуңуз." />}{editing && <AdminModal title={editing.id ? `Стол №${editing.number}` : 'Жаңы стол'} onClose={() => setEditing(null)}><form className="admin-form" onSubmit={save}><ErrorBanner message={formError} /><label>Стол номери<input type="number" min="1" value={editing.number} onChange={(event) => setEditing((value) => ({ ...value, number: event.target.value }))} required /></label>{editing.id && <Toggle checked={editing.is_active} onChange={(checked) => setEditing((value) => ({ ...value, is_active: checked }))} label="Стол активдүү" />}<div className="admin-form-actions"><button type="button" onClick={() => setEditing(null)}>Жокко чыгаруу</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <span className="admin-button-spinner" /> : 'Сактоо'}</button></div></form></AdminModal>}</>
}
