/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getStoredLanguage, normalizeLanguage, setStoredLanguage, t } from './index.js'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getStoredLanguage)

  const setLanguage = (nextLanguage) => {
    const normalized = setStoredLanguage(nextLanguage)
    setLanguageState(normalized)
  }

  useEffect(() => {
    const syncLanguage = (event) => {
      if (event.key === null || event.key === 'dastorkon_language') setLanguageState(getStoredLanguage())
    }
    window.addEventListener('storage', syncLanguage)
    return () => window.removeEventListener('storage', syncLanguage)
  }, [])

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (key, params) => t(language, key, params),
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider')
  return context
}

export function useNormalizedLanguage(language) {
  return normalizeLanguage(language)
}
