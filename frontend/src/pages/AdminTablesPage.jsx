import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const emptyTable = { number: '', is_active: true }
const CANVAS_FONT_STACK = '"Segoe UI", Arial, Tahoma, sans-serif'
let hasWarnedAboutLocalhost = false

function publicMenuUrl(table) {
  const publicOrigin = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '')
  const menuUrl = `${publicOrigin}/menu/${table.qr_token}`

  if (
    import.meta.env.DEV
    && !hasWarnedAboutLocalhost
    && /localhost/i.test(menuUrl)
    && window.location.hostname !== 'localhost'
  ) {
    hasWarnedAboutLocalhost = true
    console.warn('[Dastorkon] Customer menu URL contains localhost. Set VITE_PUBLIC_APP_URL to the LAN/public frontend origin.')
  }

  return menuUrl
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

async function createPrintableQrCard(table, translate) {
  if (document.fonts?.ready) await document.fonts.ready

  const cardCanvas = document.createElement('canvas')
  cardCanvas.width = 1080
  cardCanvas.height = 1500
  const context = cardCanvas.getContext('2d')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, cardCanvas.width, cardCanvas.height)

  roundedRect(context, 42, 42, 996, 1416, 46)
  context.fillStyle = '#ffffff'
  context.fill()
  context.lineWidth = 5
  context.strokeStyle = '#0f8a3a'
  context.stroke()

  roundedRect(context, 105, 105, 96, 96, 27)
  context.fillStyle = '#0f8a3a'
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = `900 54px ${CANVAS_FONT_STACK}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('D', 153, 155)

  context.textAlign = 'left'
  context.fillStyle = '#0f172a'
  context.font = `800 47px ${CANVAS_FONT_STACK}`
  context.fillText('Dastorkon', 230, 139)
  context.fillStyle = '#0f8a3a'
  context.font = `700 25px ${CANVAS_FONT_STACK}`
  context.fillText(translate('admin.qrMenu'), 232, 183)

  context.beginPath()
  context.moveTo(105, 245)
  context.lineTo(975, 245)
  context.lineWidth = 2
  context.strokeStyle = '#dce5df'
  context.stroke()

  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#0f172a'
  context.font = `800 76px ${CANVAS_FONT_STACK}`
  context.fillText(translate('customer.tableLabel', { number: table.number }), 540, 365)

  roundedRect(context, 150, 425, 780, 780, 35)
  context.fillStyle = '#f8fbf9'
  context.fill()
  context.lineWidth = 2
  context.strokeStyle = '#dce5df'
  context.stroke()

  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, publicMenuUrl(table), {
    width: 700,
    margin: 3,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  context.drawImage(qrCanvas, 190, 465, 700, 700)

  context.fillStyle = '#0f172a'
  context.font = `800 36px ${CANVAS_FONT_STACK}`
  context.fillText(translate('admin.qrScanHelp'), 540, 1290)
  context.fillStyle = '#667085'
  context.font = `500 28px ${CANVAS_FONT_STACK}`
  context.fillText(translate('admin.qrOrderHere'), 540, 1342)

  return cardCanvas.toDataURL('image/png')
}

function QrPreviewModal({ table, onClose }) {
  const { t } = useLanguage()
  const canvasRef = useRef(null)
  const [qrError, setQrError] = useState('')
  const [exporting, setExporting] = useState('')

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, publicMenuUrl(table), {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(() => setQrError(''))
      .catch(() => setQrError(t('admin.qrCreateError')))
  }, [table, t])

  async function downloadQr() {
    setExporting('download')
    setQrError('')
    try {
      const image = await createPrintableQrCard(table, t)
      const link = document.createElement('a')
      link.download = `dastorkon-table-${table.number}-qr.png`
      link.href = image
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      setQrError(t('admin.qrDownloadError'))
    } finally {
      setExporting('')
    }
  }

  async function printQr() {
    const printWindow = window.open('', '_blank', 'width=720,height=820')
    if (!printWindow) {
      setQrError(t('admin.qrPopupError'))
      return
    }
    setExporting('print')
    setQrError('')
    try {
      const image = await createPrintableQrCard(table, t)
      printWindow.document.write(`<!doctype html><html><head><title>${t('admin.qrCardLabel', { number: table.number })} — Dastorkon</title><style>@page{margin:8mm}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff}img{display:block;width:auto;max-width:180mm;max-height:270mm;object-fit:contain}</style></head><body><img src="${image}" alt="${t('admin.qrCardLabel', { number: table.number })}"><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`)
      printWindow.document.close()
    } catch {
      printWindow.close()
      setQrError(t('admin.qrPrintError'))
    } finally {
      setExporting('')
    }
  }

  return (
    <AdminModal title={t('customer.tableLabel', { number: table.number })} onClose={onClose}>
      <div className="admin-qr-preview">
        <div className="admin-qr-preview-brand"><span>D</span><div><strong>Dastorkon</strong><small>{t('admin.qrMenu')}</small></div></div>
        <div className="admin-qr-frame"><canvas ref={canvasRef} aria-label={t('admin.qrCodeLabel', { number: table.number })} /></div>
        <p>{t('admin.qrScanHelp')}</p>
        {qrError && <div className="admin-error-banner" role="alert">{qrError}</div>}
        <div className="admin-qr-actions">
          <button className="is-primary" type="button" onClick={downloadQr} disabled={Boolean(exporting)}><AdminIcon name="download" />{exporting === 'download' ? t('admin.preparingDownload') : t('admin.qrDownload')}</button>
          <button type="button" onClick={printQr} disabled={Boolean(exporting)}><AdminIcon name="print" />{exporting === 'print' ? t('admin.preparingDownload') : t('admin.qrPrint')}</button>
          <button type="button" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </AdminModal>
  )
}

export default function AdminTablesPage() {
  const { restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(searchParams.get('create') === '1' ? { ...emptyTable } : null)
  const [qrTable, setQrTable] = useState(null)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (searchParams.get('view') !== 'qr') return
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('view')
    setSearchParams(nextSearchParams, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!restaurantId) return
    let active = true
    adminApiClient.get('/api/admin/tables/').then((response) => {
      if (!active) return
      setTables(response.data.filter((item) => item.restaurant === restaurantId))
      setError('')
    }).catch((requestError) => active && setError(handleApiError(requestError, t('errors.generic'))))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [restaurantId, refreshKey, revision, handleApiError, t])

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
      setFormError(handleApiError(requestError, t('errors.generic')))
    } finally {
      setSaving(false)
    }
  }

  async function remove(table) {
    if (!window.confirm(t('admin.tableDeleteConfirm', { number: table.number }))) return
    try {
      await adminApiClient.delete(`/api/admin/tables/${table.id}/`)
      setTables((current) => current.filter((item) => item.id !== table.id))
    } catch (requestError) {
      setError(handleApiError(requestError, t('errors.generic')))
    }
  }

  if (loadingRestaurant || loading) return <LoadingState />

  return (
    <>
      <PageIntro eyebrow={t('admin.hallManagement')} title={t('admin.tablesAndQr')} description={t('admin.tablesHelper')} action={<button className="admin-primary-action" type="button" onClick={() => setEditing({ ...emptyTable })}><AdminIcon name="plus" />{t('admin.addTable')}</button>} />
      <ErrorBanner message={layoutError || error} />
      {tables.length ? (
        <div className="admin-table-grid">
          {tables.map((table) => (
            <article className="admin-table-card admin-table-card--simple" key={table.id}>
              <header>
                <span><AdminIcon name="tables" /></span>
                <div><h2>{t('customer.tableLabel', { number: table.number })}</h2></div>
                <b className={table.status === 'OCCUPIED' ? 'is-occupied' : ''}>{table.status === 'OCCUPIED' ? t('admin.occupied') : t('admin.free')}</b>
              </header>
              <footer>
                <button className="admin-qr-view-button" type="button" onClick={() => setQrTable(table)}><AdminIcon name="qr" />{t('admin.qrView')}</button>
                <a href={publicMenuUrl(table)} target="_blank" rel="noreferrer"><AdminIcon name="eye" />{t('admin.openPublicMenu')}</a>
                <button type="button" onClick={() => setEditing({ ...table })}><AdminIcon name="edit" />{t('common.edit')}</button>
                <button className="is-danger" type="button" onClick={() => remove(table)}><AdminIcon name="trash" />{t('common.delete')}</button>
              </footer>
            </article>
          ))}
        </div>
      ) : <EmptyState title={t('waiter.noTables')} />}

      {editing && <AdminModal title={editing.id ? t('customer.tableLabel', { number: editing.number }) : t('admin.addTable')} onClose={() => setEditing(null)}><form className="admin-form" onSubmit={save}><ErrorBanner message={formError} /><label>{t('common.tableNumber')}<input type="number" min="1" value={editing.number} onChange={(event) => setEditing((value) => ({ ...value, number: event.target.value }))} required /></label>{editing.id && <Toggle checked={editing.is_active} onChange={(checked) => setEditing((value) => ({ ...value, is_active: checked }))} label={t('admin.active')} />}<div className="admin-form-actions"><button type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <span className="admin-button-spinner" /> : t('common.save')}</button></div></form></AdminModal>}
      {qrTable && <QrPreviewModal table={qrTable} onClose={() => setQrTable(null)} />}
    </>
  )
}
