import { cloneElement, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { roleDestinations, roleLoginPaths, verifyRoleToken } from './roleAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

function RoleCheckLoading() {
  const { t } = useLanguage()
  return <main className="role-check-loading"><span /><strong>{t('common.checkingAccount')}</strong></main>
}

export function ProtectedRoleRoute({ tokenKey, expectedRole, children }) {
  const location = useLocation()
  const [result, setResult] = useState(() => localStorage.getItem(tokenKey) ? null : { status: 'missing' })

  useEffect(() => {
    if (!localStorage.getItem(tokenKey)) return
    let active = true
    verifyRoleToken({ tokenKey, expectedRole }).then((value) => active && setResult(value))
    return () => { active = false }
  }, [tokenKey, expectedRole])

  if (!result) return <RoleCheckLoading />
  if (result.status === 'valid') return children
  return <Navigate to={roleLoginPaths[expectedRole]} replace state={{ authError: result.message, from: location.pathname }} />
}

export function RoleLoginRoute({ tokenKey, expectedRole, children }) {
  const [result, setResult] = useState(() => localStorage.getItem(tokenKey) ? null : { status: 'missing' })

  useEffect(() => {
    if (!localStorage.getItem(tokenKey)) return
    let active = true
    verifyRoleToken({ tokenKey, expectedRole }).then((value) => active && setResult(value))
    return () => { active = false }
  }, [tokenKey, expectedRole])

  if (!result) return <RoleCheckLoading />
  if (result.status === 'valid') return <Navigate to={roleDestinations[expectedRole]} replace />
  return result.status === 'denied' ? cloneElement(children, { guardError: result.message }) : children
}
