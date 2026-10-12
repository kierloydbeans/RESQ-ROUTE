import { useCallback, useEffect, useRef, useState } from 'react'

const createCallId = () => (
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
)

export const useVoiceConference = ({ wsUrl, authToken }) => {
  const socketRef = useRef(null)
  const localStreamRef = useRef(null)
  const callStartingRef = useRef(false)
  const peersRef = useRef(new Map())
  const pendingCandidatesRef = useRef(new Map())
  const callIdRef = useRef(null)
  const [isSocketReady, setIsSocketReady] = useState(false)
  const [callId, setCallId] = useState(null)
  const [participants, setParticipants] = useState([])
  const [remoteStreams, setRemoteStreams] = useState({})
  const [callError, setCallError] = useState('')

  const closePeer = useCallback((userId) => {
    const peer = peersRef.current.get(String(userId))
    if (peer) {
      peer.close()
      peersRef.current.delete(String(userId))
    }
    pendingCandidatesRef.current.delete(String(userId))
    setRemoteStreams((current) => {
      const next = { ...current }
      delete next[String(userId)]
      return next
    })
    setParticipants((current) => current.filter((item) => String(item.user_id) !== String(userId)))
  }, [])

  const sendSignal = useCallback((userId, payload) => {
    const socket = socketRef.current
    if (!callIdRef.current || socket?.readyState !== WebSocket.OPEN) {
      setCallError('Voice signaling is disconnected. Reconnect before starting a call.')
      return
    }
    socket.send(JSON.stringify({
      type: 'voice_signal',
      call_id: callIdRef.current,
      target_user_id: Number(userId),
      payload,
    }))
  }, [])

  const connectParticipant = useCallback(async (userId, displayName) => {
    const localStream = localStreamRef.current
    if (!localStream || peersRef.current.has(String(userId))) return

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    peersRef.current.set(String(userId), peer)
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream))
    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal(userId, { type: 'candidate', candidate: event.candidate })
    }
    peer.ontrack = (event) => {
      const [stream] = event.streams
      if (stream) setRemoteStreams((current) => ({ ...current, [String(userId)]: stream }))
    }
    pendingCandidatesRef.current.set(String(userId), [])
    peer.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(peer.connectionState)) closePeer(userId)
      if (peer.connectionState === 'connected') {
        setParticipants((current) => current.map((item) => (
          String(item.user_id) === String(userId) ? { ...item, status: 'connected' } : item
        )))
      }
    }
    setParticipants((current) => [
      ...current.filter((item) => String(item.user_id) !== String(userId)),
      { user_id: userId, display_name: displayName, status: 'connecting' },
    ])

    try {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      sendSignal(userId, { type: 'offer', sdp: offer.sdp })
    } catch (error) {
      closePeer(userId)
      setCallError(`Unable to connect to ${displayName}: ${error.message}`)
    }
  }, [closePeer, sendSignal])

  const startCall = useCallback(async (targetUserIds) => {
    if (callStartingRef.current || callIdRef.current) return
    if (!isSocketReady) {
      setCallError('The secure voice connection is not ready.')
      return
    }
    if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      setCallError('Select at least one rescuer to call.')
      return
    }
    try {
      callStartingRef.current = true
      setCallError('')
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      const nextCallId = createCallId()
      callIdRef.current = nextCallId
      setCallId(nextCallId)
      setParticipants(targetUserIds.map((userId) => ({
        user_id: userId,
        display_name: 'Waiting for rescuer',
        status: 'ringing',
      })))
      socketRef.current.send(JSON.stringify({
        type: 'voice_invite',
        call_id: nextCallId,
        target_user_ids: targetUserIds.map(Number),
      }))
    } catch (error) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
      setCallError(error.name === 'NotAllowedError'
        ? 'Allow microphone access to start the call.'
        : `Unable to start the call: ${error.message}`)
    } finally {
      callStartingRef.current = false
    }
  }, [isSocketReady])

  const resetCall = useCallback(() => {
    peersRef.current.forEach((peer) => peer.close())
    peersRef.current.clear()
    pendingCandidatesRef.current.clear()
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    callIdRef.current = null
    callStartingRef.current = false
    setCallId(null)
    setParticipants([])
    setRemoteStreams({})
    setCallError('')
  }, [])

  const endCall = useCallback(() => {
    const socket = socketRef.current
    if (callIdRef.current && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'voice_leave', call_id: callIdRef.current }))
    }
    resetCall()
  }, [resetCall])

  useEffect(() => {
    if (!wsUrl || !authToken) return undefined
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'authenticate', token: authToken }))
    }
    socket.onmessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (message.type === 'authenticated') {
        setIsSocketReady(true)
        setCallError('')
      } else if (message.type === 'authentication_failed') {
        setCallError('Voice connection authentication failed. Sign in again.')
      } else if (message.type === 'voice_invite_sent' && message.online_count === 0) {
        setCallError('No invited rescuers are currently connected to receive the call.')
      } else if (message.type === 'voice_participant_joined' && message.call_id === callIdRef.current) {
        connectParticipant(message.user_id, message.display_name)
      } else if (message.type === 'voice_signal' && message.call_id === callIdRef.current) {
        const peer = peersRef.current.get(String(message.user_id))
        if (!peer) return
        const payload = message.payload || {}
        if (payload.type === 'answer') {
          peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }))
            .then(async () => {
              const candidates = pendingCandidatesRef.current.get(String(message.user_id)) || []
              pendingCandidatesRef.current.set(String(message.user_id), [])
              for (const candidate of candidates) await peer.addIceCandidate(candidate)
            })
            .catch((error) => setCallError(`Unable to complete call connection: ${error.message}`))
        } else if (payload.type === 'candidate' && payload.candidate) {
          const candidate = new RTCIceCandidate(payload.candidate)
          if (peer.remoteDescription) {
            peer.addIceCandidate(candidate)
              .catch((error) => setCallError(`Unable to establish call media: ${error.message}`))
          } else {
            const candidates = pendingCandidatesRef.current.get(String(message.user_id)) || []
            candidates.push(candidate)
            pendingCandidatesRef.current.set(String(message.user_id), candidates)
          }
        }
      } else if (message.type === 'voice_participant_left' && message.call_id === callIdRef.current) {
        closePeer(message.user_id)
      } else if (message.type === 'voice_participant_declined' && message.call_id === callIdRef.current) {
        setParticipants((current) => current.map((item) => (
          String(item.user_id) === String(message.user_id) ? { ...item, status: 'declined' } : item
        )))
      } else if (message.type === 'voice_call_ended' && message.call_id === callIdRef.current) {
        resetCall()
      } else if (message.type === 'voice_error') {
        setCallError(message.message || 'Voice call failed.')
      }
    }
    socket.onclose = () => {
      setIsSocketReady(false)
      if (socketRef.current === socket) socketRef.current = null
    }
    socket.onerror = () => {
      if (callIdRef.current) setCallError('Voice signaling connection failed.')
    }

    return () => {
      socket.close()
      socketRef.current = null
      peersRef.current.forEach((peer) => peer.close())
      peersRef.current.clear()
      pendingCandidatesRef.current.clear()
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
      callIdRef.current = null
    }
  }, [authToken, closePeer, connectParticipant, resetCall, wsUrl])

  return {
    callId,
    callError,
    isSocketReady,
    participants,
    remoteStreams,
    startCall,
    endCall,
  }
}
