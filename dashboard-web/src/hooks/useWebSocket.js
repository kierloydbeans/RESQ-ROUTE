import { useEffect, useState } from 'react'

export const useWebSocket = (url) => {
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)

  useEffect(() => {
    if (!url) return undefined

    const normalizedUrl = url.startsWith('http') ? url.replace(/^http/, 'ws') : url
    const newSocket = new WebSocket(normalizedUrl)
    setSocket(newSocket)

    newSocket.addEventListener('open', () => {
      setIsConnected(true)
    })

    newSocket.addEventListener('close', () => {
      setIsConnected(false)
    })

    newSocket.addEventListener('error', () => {
      setIsConnected(false)
    })

    newSocket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data)
        setLastMessage(payload)
      } catch (error) {
        setLastMessage(event.data)
      }
    })

    return () => {
      newSocket.close()
    }
  }, [url])

  return { socket, isConnected, lastMessage }
}
