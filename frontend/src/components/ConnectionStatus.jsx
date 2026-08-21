import { useLanguage } from '../i18n/LanguageContext.jsx'

function connectionStatusDisplay(status, t) {
  if (status === 'connected') {
    return {
      label: t('common.realtimeConnected'),
      help: t('common.realtimeConnectedHelp'),
      tone: 'connected',
    }
  }
  if (status === 'connecting') {
    return {
      label: t('common.realtimeConnecting'),
      help: t('common.realtimeConnectingHelp'),
      tone: 'reconnecting',
    }
  }
  if (status === 'reconnecting') {
    return {
      label: t('common.realtimeReconnecting'),
      help: t('common.realtimeReconnectingHelp'),
      tone: 'reconnecting',
    }
  }
  return {
    label: t('common.realtimePolling'),
    help: t('common.realtimePollingHelp'),
    tone: 'disconnected',
  }
}

export default function ConnectionStatus({ status }) {
  const { t } = useLanguage()
  const connection = connectionStatusDisplay(status, t)

  return (
    <span
      className={`notifications-connection-status is-${connection.tone}`}
      role="status"
      aria-live="polite"
      title={connection.help}
    >
      {connection.label}
    </span>
  )
}
