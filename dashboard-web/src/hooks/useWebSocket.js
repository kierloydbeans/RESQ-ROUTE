import { useEffect, useState } from 'react'
import io from 'socket.io-client'

export const useWebSocket = (url) => {
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)

  useEffect(() => {
    const newSocket = io(url)
    setSocket(newSocket)

    newSocket.on('connect', () => {
      setIsConnected(true)
    })

    newSocket.on('disconnect', () => {
      setIsConnected(false)
    })

    newSocket.on('telemetry', (data) => {
      setLastMessage(data)
    })

    return () => {
      newSocket.close()
    }
  }, [url])

  return { socket, isConnected, lastMessage }
}
