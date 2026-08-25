import { useContext } from 'react'
import { ConfirmationContext } from './ConfirmationContext.js'

export function useConfirm() {
  const requestConfirmation = useContext(ConfirmationContext)
  if (!requestConfirmation) {
    throw new Error('useConfirm must be used inside ConfirmationProvider')
  }
  return requestConfirmation
}
