import { cloneElement, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getTokenExpiryMs, roleDestinations, roleLoginPaths, roleTokenKeys, verifyRoleToken, verifyStaffSession } from './roleAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

function RoleCheckLoading() {
  const { t } = useLanguage()
  return <main className="role-check-loading"><span /><strong>{t('common.checkingAccount')}</strong></main>
}

export function ProtectedRoleRoute({ tokenKey, expectedRole, children }) {
  const location = useLocation()
  const { t } = useLanguage()
  const [result, setResult] = useState(() => localStorage.getItem(tokenKey) ? null : { status: 'missing' })

  useEffect(() => {
    const token = localStorage.getItem(tokenKey)
    if (!token) return
    let active = true
    let expiryTimer
    verifyRoleToken({ tokenKey, expectedRole }).then((value) => {
      if (!active) return
      setResult(value)
      if (value.status !== 'valid') return
      const expiresAt = value.expiresAt || getTokenExpiryMs(token)
      const delay = Math.max(0, expiresAt - Date.now())
      expiryTimer = window.setTimeout(() => {
        localStorage.removeItem(tokenKey)
        setResult({ status: 'denied', message: t('auth.sessionExpired') })
      }, delay)
    })
    return () => {
      active = false
      window.clearTimeout(expiryTimer)
    }
  }, [tokenKey, expectedRole, t])

  if (!result) return <RoleCheckLoading />
  if (result.status === 'valid') return children
  return <Navigate to={roleLoginPaths[expectedRole]} replace state={{ authError: result.message, from: location.pathname }} />
}

export function StaffLoginRoute({ children }) {
  const hasStoredToken = Object.values(roleTokenKeys).some((tokenKey) => localStorage.getItem(tokenKey))
  const [result, setResult] = useState(() => hasStoredToken ? null : { status: 'missing' })

  useEffect(() => {
    if (!hasStoredToken) return
    let active = true
    verifyStaffSession().then((value) => active && setResult(value))
    return () => { active = false }
  }, [hasStoredToken])

  if (!result) return <RoleCheckLoading />
  if (result.status === 'valid') return <Navigate to={roleDestinations[result.role]} replace />
  return result.status === 'denied' ? cloneElement(children, { guardError: result.message }) : children
}
