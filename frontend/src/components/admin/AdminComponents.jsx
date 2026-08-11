import { useEffect } from 'react'
import { orderStatusLabels } from './adminUtils.js'

export function AdminIcon({ name }) {
  const icons = {
    dashboard: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    menu: <><path d="M5 6h14M5 12h14M5 18h14" /><circle cx="8" cy="6" r="1" /><circle cx="16" cy="12" r="1" /><circle cx="10" cy="18" r="1" /></>,
    category: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></>,
    tables: <><path d="M4 9h16M7 9v11m10-11v11M6 20h12" /><path d="M8 4h8v5H8z" /></>,
    qr: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-4v-2h-2" /></>,
    orders: <><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 7a3 3 0 0 1 0 6M17 15a4 4 0 0 1 3.5 4" /></>,
    stats: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a7 7 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.4-1.1a7 7 0 0 0 1.7 1l.4 3.1h5l.4-3.1a7 7 0 0 0 1.7-1L19 18l2-3.5-2.1-1.5a7 7 0 0 0 .1-1Z" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 8a7 7 0 0 1 11.5-1.5L20 9M4 15l2.5 2.5A7 7 0 0 0 18 16" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" /><path d="m13.5 7 3.5 3.5" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    chevron: <path d="m9 6 6 6-6 6" />,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{icons[name]}</svg>
}

export function ErrorBanner({ message }) {
  if (!message) return null
  return <div className="admin-error-banner" role="alert">{message}</div>
}

export function LoadingState({ label = 'Маалымат жүктөлүүдө...' }) {
  return <div className="admin-loading-state"><span />{label}</div>
}

export function EmptyState({ title = 'Азырынча маалымат жок', description }) {
  return <div className="admin-empty-state"><span>—</span><strong>{title}</strong>{description && <p>{description}</p>}</div>
}

export function StatusBadge({ status }) {
  return <span className={`admin-status-badge admin-status-badge--${String(status).toLowerCase()}`}>{orderStatusLabels[status] || status}</span>
}

export function AdminModal({ title, children, onClose, wide = false }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`admin-modal ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
        <header><h2 id="admin-modal-title">{title}</h2><button type="button" onClick={onClose} aria-label="Жабуу"><AdminIcon name="close" /></button></header>
        <div className="admin-modal-body">{children}</div>
      </section>
    </div>
  )
}

export function PageIntro({ eyebrow, title, description, action }) {
  return <div className="admin-page-intro"><div>{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}

export function Toggle({ checked, onChange, label, disabled = false }) {
  return <label className="admin-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} /><span aria-hidden="true" /><b>{label}</b></label>
}
