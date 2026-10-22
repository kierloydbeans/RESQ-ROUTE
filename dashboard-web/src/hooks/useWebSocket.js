import { useEffect, useRef, useState } from 'react'

export const useWebSocket = (url) => {
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!url) return undefined

    const normalizedUrl = url.startsWith('http') ? url.replace(/^http/, 'ws') : url
    let disposed = false
    let reconnectTimer
    let heartbeatTimer
    let connectionTimeoutTimer
    let reconnectAttempt = 0

    setSocket(null)
    setIsConnected(false)

    const clearReconnectTimer = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
    }

    const clearConnectionTimers = () => {
      if (heartbeatTimer !== undefined) {
        window.clearInterval(heartbeatTimer)
        heartbeatTimer = undefined
      }
      if (connectionTimeoutTimer !== undefined) {
        window.clearTimeout(connectionTimeoutTimer)
        connectionTimeoutTimer = undefined
      }
    }

    const connect = () => {
      if (disposed || !navigator.onLine) return
      const activeSocket = socketRef.current
      if (activeSocket?.readyState === WebSocket.OPEN || activeSocket?.readyState === WebSocket.CONNECTING) return

      const nextSocket = new WebSocket(normalizedUrl)
      socketRef.current = nextSocket
      setSocket(nextSocket)
      connectionTimeoutTimer = window.setTimeout(() => {
        if (nextSocket.readyState === WebSocket.CONNECTING) nextSocket.close()
      }, 15000)

      nextSocket.addEventListener('open', () => {
        if (disposed || socketRef.current !== nextSocket) return
        if (connectionTimeoutTimer !== undefined) {
          window.clearTimeout(connectionTimeoutTimer)
          connectionTimeoutTimer = undefined
        }
        reconnectAttempt = 0
        setIsConnected(true)
        heartbeatTimer = window.setInterval(() => {
          if (nextSocket.readyState === WebSocket.OPEN) {
            nextSocket.send(JSON.stringify({ type: 'heartbeat' }))
          }
        }, 25000)
      })

      nextSocket.addEventListener('close', () => {
        if (socketRef.current !== nextSocket) return
        clearConnectionTimers()
        socketRef.current = null
        setSocket(null)
        setIsConnected(false)
        if (disposed || !navigator.onLine) return

        const delay = Math.min(1000 * (2 ** reconnectAttempt), 30000)
        reconnectAttempt += 1
        reconnectTimer = window.setTimeout(connect, delay)
      })

      nextSocket.addEventListener('error', () => {
        setIsConnected(false)
        nextSocket.close()
      })

      nextSocket.addEventListener('message', (event) => {
        if (socketRef.current !== nextSocket) return
        try {
          setLastMessage(JSON.parse(event.data))
        } catch {
          setLastMessage(event.data)
        }
      })
    }

    const reconnectWhenOnline = () => {
      clearReconnectTimer()
      connect()
    }
    const closeWhenOffline = () => {
      clearReconnectTimer()
      socketRef.current?.close()
    }
    const reconnectWhenVisible = () => {
      if (document.visibilityState === 'visible' && socketRef.current?.readyState !== WebSocket.OPEN) {
        clearReconnectTimer()
        connect()
      }
    }

    connect()
    window.addEventListener('online', reconnectWhenOnline)
    window.addEventListener('offline', closeWhenOffline)
    document.addEventListener('visibilitychange', reconnectWhenVisible)

    return () => {
      disposed = true
      clearReconnectTimer()
      clearConnectionTimers()
      window.removeEventListener('online', reconnectWhenOnline)
      window.removeEventListener('offline', closeWhenOffline)
      document.removeEventListener('visibilitychange', reconnectWhenVisible)
      const activeSocket = socketRef.current
      socketRef.current = null
      activeSocket?.close()
    }
  }, [url])

  return { socket, isConnected, lastMessage }
}
