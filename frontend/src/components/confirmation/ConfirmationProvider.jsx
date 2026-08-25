import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { ConfirmationContext } from './ConfirmationContext.js'

function ConfirmDialog({ options, onCancel, onConfirm }) {
  const { t } = useLanguage()
  const cancelButtonRef = useRef(null)
  const confirmButtonRef = useRef(null)
  const title = options.title || t('confirmation.title')
  const message = options.message || t('confirmation.message')
  const confirmLabel = options.confirmLabel || t('confirmation.confirm')
  const cancelLabel = options.cancelLabel || t('confirmation.cancel')

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        onCancel()
        return
      }
      if (event.key !== 'Tab') return

      const firstButton = cancelButtonRef.current
      const lastButton = confirmButtonRef.current
      if (event.shiftKey && document.activeElement === firstButton) {
        event.preventDefault()
        lastButton?.focus()
      } else if (!event.shiftKey && document.activeElement === lastButton) {
        event.preventDefault()
        firstButton?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown, true)
      previouslyFocused?.focus?.()
    }
  }, [onCancel])

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <span className="confirm-dialog__icon" aria-hidden="true">!</span>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog__actions">
          <button ref={cancelButtonRef} type="button" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmButtonRef} className="is-danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

export default function ConfirmationProvider({ children }) {
  const [options, setOptions] = useState(null)
  const activeRequestRef = useRef(null)

  const finishRequest = useCallback((confirmed) => {
    const activeRequest = activeRequestRef.current
    if (!activeRequest) return
    activeRequestRef.current = null
    setOptions(null)
    activeRequest.resolve(confirmed)
  }, [])

  const requestConfirmation = useCallback((nextOptions = {}) => {
    if (activeRequestRef.current) return Promise.resolve(false)
    return new Promise((resolve) => {
      activeRequestRef.current = { resolve }
      setOptions(nextOptions)
    })
  }, [])

  useEffect(() => () => {
    activeRequestRef.current?.resolve(false)
    activeRequestRef.current = null
  }, [])

  const contextValue = useMemo(() => requestConfirmation, [requestConfirmation])

  return (
    <ConfirmationContext.Provider value={contextValue}>
      {children}
      {options && (
        <ConfirmDialog
          options={options}
          onCancel={() => finishRequest(false)}
          onConfirm={() => finishRequest(true)}
        />
      )}
    </ConfirmationContext.Provider>
  )
}
