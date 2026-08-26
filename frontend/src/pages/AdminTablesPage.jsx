import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { adminApiClient } from '../api/client.js'
import { AdminIcon, AdminModal, EmptyState, ErrorBanner, LoadingState, PageIntro, Toggle } from '../components/admin/AdminComponents.jsx'
import TableIcon from '../components/TableIcon.jsx'
import { useAdminContext } from '../components/admin/AdminContext.js'
import { useConfirm } from '../components/confirmation/useConfirm.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const emptyTable = { number: '', is_active: true }
const CANVAS_FONT_STACK = '"Segoe UI", Arial, Tahoma, sans-serif'
let hasWarnedAboutLocalhost = false

function publicMenuUrl(table) {
  const configuredPublicOrigin = (import.meta.env.VITE_PUBLIC_APP_URL || '').trim()
  const publicOrigin = (configuredPublicOrigin || window.location.origin).replace(/\/+$/, '')
  const menuUrl = `${publicOrigin}/menu/${table.qr_token}`

  if (
    import.meta.env.DEV
    && !hasWarnedAboutLocalhost
    && /localhost/i.test(menuUrl)
    && window.location.hostname !== 'localhost'
  ) {
    hasWarnedAboutLocalhost = true
    console.warn('[Dastorkon] Customer menu URL contains localhost. Set VITE_PUBLIC_APP_URL to the public frontend origin.')
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

function brandName(restaurant) {
  return restaurant?.name?.trim() || 'Dastorkon'
}

function brandInitial(name) {
  return Array.from(name)[0]?.toLocaleUpperCase() || 'D'
}

function drawFittedText(context, text, x, y, maxWidth, maxFontSize, minFontSize, fontWeight) {
  let fontSize = maxFontSize
  do {
    context.font = `${fontWeight} ${fontSize}px ${CANVAS_FONT_STACK}`
    fontSize -= 1
  } while (fontSize >= minFontSize && context.measureText(text).width > maxWidth)
  context.fillText(text, x, y)
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not create a PNG image.'))
    }, 'image/png')
  })
}

async function copyToClipboard(value) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back for browsers that expose the API but deny clipboard access.
    }
  }

  const activeElement = document.activeElement
  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  let copied
  try {
    textArea.select()
    copied = document.execCommand('copy')
  } finally {
    textArea.remove()
    activeElement?.focus()
  }
  if (!copied) throw new Error('Could not copy the menu URL.')
}

async function createPrintableQrCard(table, restaurant, translate) {
  if (document.fonts?.ready) await document.fonts.ready

  const restaurantName = brandName(restaurant)
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
  context.fillText(brandInitial(restaurantName), 153, 155)

  context.textAlign = 'left'
  context.fillStyle = '#0f172a'
  drawFittedText(context, restaurantName, 230, 139, 745, 47, 28, 800)
  context.fillStyle = '#0f8a3a'
  context.font = `700 25px ${CANVAS_FONT_STACK}`
  context.fillText(`Dastorkon · ${translate('admin.qrMenu')}`, 232, 183)

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
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  })
  context.drawImage(qrCanvas, 190, 465, 700, 700)

  context.fillStyle = '#0f172a'
  drawFittedText(context, translate('admin.qrScanHelp'), 540, 1290, 870, 36, 25, 800)
  context.fillStyle = '#667085'
  context.font = `500 28px ${CANVAS_FONT_STACK}`
  context.fillText(translate('admin.qrOrderHere'), 540, 1342)

  return cardCanvas
}

function QrPreviewModal({ table, restaurant, onClose }) {
  const { t } = useLanguage()
  const canvasRef = useRef(null)
  const copyResetTimerRef = useRef(null)
  const [qrError, setQrError] = useState('')
  const [exporting, setExporting] = useState('')
  const [urlCopied, setUrlCopied] = useState(false)
  const menuUrl = publicMenuUrl(table)
  const restaurantName = brandName(restaurant)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, menuUrl, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
    }).then(() => setQrError(''))
      .catch(() => setQrError(t('admin.qrCreateError')))
  }, [menuUrl, t])

  useEffect(() => () => window.clearTimeout(copyResetTimerRef.current), [])

  async function copyMenuUrl() {
    setQrError('')
    try {
      await copyToClipboard(menuUrl)
      setUrlCopied(true)
      window.clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = window.setTimeout(() => setUrlCopied(false), 2400)
    } catch {
      setUrlCopied(false)
      setQrError(t('admin.qrCopyError'))
    }
  }

  async function downloadQr() {
    if (exporting) return
    setExporting('download')
    setQrError('')
    try {
      const cardCanvas = await createPrintableQrCard(table, restaurant, t)
      const imageBlob = await canvasToPngBlob(cardCanvas)
      const imageUrl = URL.createObjectURL(imageBlob)
      const link = document.createElement('a')
      link.download = `dastorkon-table-${table.number}-qr-card.png`
      link.href = imageUrl
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 0)
    } catch {
      setQrError(t('admin.qrDownloadError'))
    } finally {
      setExporting('')
    }
  }

  async function printQr() {
    if (exporting) return
    const printWindow = window.open('', '_blank', 'width=720,height=820')
    if (!printWindow) {
      setQrError(t('admin.qrPopupError'))
      return
    }
    setExporting('print')
    setQrError('')
    try {
      const cardCanvas = await createPrintableQrCard(table, restaurant, t)
      const image = cardCanvas.toDataURL('image/png')
      printWindow.document.write('<!doctype html><html><head><title></title><style>@page{margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;background:#fff}body{display:flex;justify-content:center}main{width:180mm;max-width:100%;break-inside:avoid;page-break-inside:avoid}img{display:block;width:100%;height:auto}</style></head><body><main><img></main></body></html>')
      printWindow.document.close()
      printWindow.document.title = `${t('admin.qrCardLabel', { number: table.number })} — ${restaurantName}`
      const printImage = printWindow.document.querySelector('img')
      printImage.alt = t('admin.qrCardLabel', { number: table.number })
      const imageReady = new Promise((resolve, reject) => {
        printImage.addEventListener('load', resolve, { once: true })
        printImage.addEventListener('error', reject, { once: true })
        printImage.src = image
        if (printImage.complete && printImage.naturalWidth) resolve()
      })
      await imageReady
      printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true })
      printWindow.focus()
      printWindow.print()
    } catch {
      printWindow.close()
      setQrError(t('admin.qrPrintError'))
    } finally {
      setExporting('')
    }
  }

  return (
    <AdminModal title={t('customer.tableLabel', { number: table.number })} onClose={onClose} busy={Boolean(exporting)}>
      <div className="admin-qr-preview">
        <div className="admin-qr-preview-brand"><span>{brandInitial(restaurantName)}</span><div><strong>{restaurantName}</strong><small>Dastorkon · {t('admin.qrMenu')}</small></div></div>
        <div className="admin-qr-frame"><canvas ref={canvasRef} aria-label={t('admin.qrCodeLabel', { number: table.number })} /></div>
        <p>{t('admin.qrScanHelp')}</p>
        <div className="admin-qr-url" title={menuUrl}>
          <AdminIcon name="qr" />
          <div><small>{t('admin.qrCustomerUrl')}</small><span>{menuUrl}</span></div>
        </div>
        {qrError && <div className="admin-error-banner" role="alert">{qrError}</div>}
        <div className="admin-qr-actions">
          <button className={urlCopied ? 'is-success' : ''} type="button" onClick={copyMenuUrl} disabled={Boolean(exporting)}><AdminIcon name="copy" />{urlCopied ? t('admin.qrCopied') : t('admin.qrCopyUrl')}</button>
          <button className="is-primary" type="button" onClick={downloadQr} disabled={Boolean(exporting)}><AdminIcon name="download" />{exporting === 'download' ? t('admin.preparingDownload') : t('admin.qrDownload')}</button>
          <button type="button" onClick={printQr} disabled={Boolean(exporting)}><AdminIcon name="print" />{exporting === 'print' ? t('admin.preparingDownload') : t('admin.qrPrint')}</button>
          <button type="button" onClick={onClose} disabled={Boolean(exporting)}>{t('common.close')}</button>
        </div>
        <p className="admin-qr-print-note">{t('admin.qrPrintCheck')}</p>
      </div>
    </AdminModal>
  )
}

export default function AdminTablesPage() {
  const { restaurant, restaurantId, loadingRestaurant, layoutError, refreshKey, handleApiError } = useAdminContext()
  const { t } = useLanguage()
  const confirm = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(searchParams.get('create') === '1' ? { ...emptyTable } : null)
  const [qrTable, setQrTable] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [revision, setRevision] = useState(0)
  const mutationInFlightRef = useRef(false)

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
    if (mutationInFlightRef.current) return
    mutationInFlightRef.current = true
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
      mutationInFlightRef.current = false
      setSaving(false)
    }
  }

  async function remove(table) {
    if (mutationInFlightRef.current) return
    const confirmed = await confirm({
      message: t('confirmation.tableMessage', { number: table.number }),
    })
    if (!confirmed || mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setBusyId(table.id)
    try {
      await adminApiClient.delete(`/api/admin/tables/${table.id}/`)
      setTables((current) => current.filter((item) => item.id !== table.id))
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
      <PageIntro eyebrow={t('admin.hallManagement')} title={t('admin.tablesAndQr')} description={t('admin.tablesHelper')} action={<button className="admin-primary-action" type="button" onClick={() => setEditing({ ...emptyTable })} disabled={busyId !== null}><AdminIcon name="plus" />{t('admin.addTable')}</button>} />
      <ErrorBanner message={layoutError || error} />
      {tables.length ? (
        <div className="admin-table-grid">
          {tables.map((table) => (
            <article className="admin-table-card admin-table-card--simple" key={table.id}>
              <header>
                <span><TableIcon /></span>
                <div><h2>{t('customer.tableLabel', { number: table.number })}</h2></div>
                <b className={!table.is_active ? 'is-inactive' : table.status === 'OCCUPIED' ? 'is-occupied' : ''}>{!table.is_active ? t('admin.inactive') : table.status === 'OCCUPIED' ? t('admin.occupied') : t('admin.free')}</b>
              </header>
              <footer>
                <button className="admin-qr-view-button" type="button" onClick={() => setQrTable(table)} disabled={busyId !== null}><AdminIcon name="qr" />{t('admin.qrView')}</button>
                <a href={publicMenuUrl(table)} target="_blank" rel="noreferrer" aria-disabled={busyId !== null} onClick={(event) => busyId !== null && event.preventDefault()}><AdminIcon name="eye" />{t('admin.openPublicMenu')}</a>
                <button type="button" onClick={() => setEditing({ ...table })} disabled={busyId !== null}><AdminIcon name="edit" />{t('common.edit')}</button>
                <button className="is-danger" type="button" onClick={() => remove(table)} disabled={busyId !== null}><AdminIcon name="trash" />{busyId === table.id ? t('common.working') : t('common.delete')}</button>
              </footer>
            </article>
          ))}
        </div>
      ) : <EmptyState title={t('waiter.noTables')} description={t('admin.noTablesHelp')} />}

      {editing && <AdminModal title={editing.id ? t('customer.tableLabel', { number: editing.number }) : t('admin.addTable')} onClose={() => setEditing(null)} busy={saving}><form className="admin-form" onSubmit={save} aria-busy={saving}><ErrorBanner message={formError} /><label>{t('common.tableNumber')}<input type="number" min="1" value={editing.number} onChange={(event) => setEditing((value) => ({ ...value, number: event.target.value }))} required /></label>{editing.id && <Toggle checked={editing.is_active} onChange={(checked) => setEditing((value) => ({ ...value, is_active: checked }))} label={t('admin.active')} disabled={saving} />}<div className="admin-form-actions"><button type="button" onClick={() => setEditing(null)} disabled={saving}>{t('common.cancel')}</button><button className="is-primary" type="submit" disabled={saving}>{saving ? <><span className="admin-button-spinner" />{t('common.saving')}</> : t('common.save')}</button></div></form></AdminModal>}
      {qrTable && <QrPreviewModal table={qrTable} restaurant={restaurant} onClose={() => setQrTable(null)} />}
    </>
  )
}
