import { useEffect, useRef, useState } from 'react'

const INITIAL_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30000

function buildNotificationsSocketUrl(token) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL('/ws/notifications/', `${protocol}//${window.location.host}`)
  url.searchParams.set('token', token)
  return url.toString()
}

function reconnectDelay(attempt) {
  return Math.min(
    INITIAL_RECONNECT_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
    MAX_RECONNECT_DELAY_MS,
  )
}

export default function useNotificationsSocket({ token, enabled = true, onMessage }) {
  const socketEnabled = Boolean(
    enabled && token && typeof window.WebSocket === 'function',
  )
  const [status, setStatus] = useState(
    socketEnabled ? 'connecting' : 'disconnected',
  )
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!socketEnabled) return undefined

    let disposed = false
    let reconnectAttempt = 0
    let reconnectTimer = null
    let initialConnectTimer = null
    let socket = null

    const scheduleReconnect = () => {
      if (disposed) return
      reconnectAttempt += 1
      setStatus('reconnecting')
      reconnectTimer = window.setTimeout(connect, reconnectDelay(reconnectAttempt))
    }

    const connect = () => {
      if (disposed) return
      setStatus(reconnectAttempt === 0 ? 'connecting' : 'reconnecting')

      try {
        socket = new window.WebSocket(buildNotificationsSocketUrl(token))
      } catch {
        scheduleReconnect()
        return
      }

      socket.onopen = () => {
        if (disposed) return
        reconnectAttempt = 0
        setStatus('connected')
      }

      socket.onmessage = (message) => {
        try {
          onMessageRef.current?.(JSON.parse(message.data))
        } catch {
          // Ignore malformed notification frames and keep the socket alive.
        }
      }

      socket.onerror = () => {
        socket?.close()
      }

      socket.onclose = () => {
        socket = null
        scheduleReconnect()
      }
    }

    initialConnectTimer = window.setTimeout(connect, 0)

    return () => {
      disposed = true
      if (initialConnectTimer !== null) window.clearTimeout(initialConnectTimer)
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        socket.close(1000, 'Notifications socket disposed')
      }
    }
  }, [socketEnabled, token])

  return socketEnabled ? status : 'disconnected'
}
