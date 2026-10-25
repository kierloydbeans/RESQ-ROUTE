import { useCallback, useEffect, useRef, useState } from 'react'

export const useVoiceCommunication = ({ wsUrl, authToken, onIncomingCall }) => {
  const socketRef = useRef(null)
  const peerRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const pendingCandidatesRef = useRef([])
  const callRef = useRef(null)
  const onIncomingCallRef = useRef(onIncomingCall)
  const [status, setStatus] = useState('idle')
  const [incomingCall, setIncomingCall] = useState(null)

  onIncomingCallRef.current = onIncomingCall

  const send = useCallback((message) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  const closeMedia = useCallback(() => {
    peerRef.current?.close()
    peerRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    pendingCandidatesRef.current = []
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    callRef.current = null
    setStatus('idle')
  }, [])

  const acceptCall = useCallback(async (invitation) => {
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = localStream
      callRef.current = invitation
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      peerRef.current = peer
      localStream.getTracks().forEach((track) => peer.addTrack(track, localStream))
      peer.ontrack = (event) => {
        const [stream] = event.streams
        if (stream && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream
          remoteAudioRef.current.play().catch((error) => {
            console.warn('Unable to autoplay incoming call audio.', error)
          })
        }
      }
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          send({
            type: 'voice_signal',
            call_id: invitation.call_id,
            target_user_id: invitation.dispatcher_id,
            payload: { type: 'candidate', candidate: event.candidate },
          })
        }
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') setStatus('connected')
        if (['failed', 'disconnected'].includes(peer.connectionState)) setStatus('connecting')
      }
      send({ type: 'voice_accept', call_id: invitation.call_id })
      setIncomingCall(null)
      setStatus('connecting')
    } catch (error) {
      closeMedia()
      console.error('Unable to accept voice call.', error)
      throw error
    }
  }, [closeMedia, send])

  useEffect(() => {
    if (!wsUrl || !authToken) return undefined
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket
    socket.onopen = () => socket.send(JSON.stringify({ type: 'authenticate', token: authToken }))
    socket.onmessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (message.type === 'voice_invite') {
        if (!callRef.current) {
          setIncomingCall(message)
          onIncomingCallRef.current?.(message)
        }
        return
      }
      if (message.type === 'voice_call_ended') {
        if (message.call_id === callRef.current?.call_id) closeMedia()
        setIncomingCall((current) => current?.call_id === message.call_id ? null : current)
        return
      }
      if (message.type !== 'voice_signal' || message.call_id !== callRef.current?.call_id) return

      const peer = peerRef.current
      const payload = message.payload || {}
      if (!peer) return
      if (payload.type === 'offer') {
        peer.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }))
          .then(async () => {
            const candidates = pendingCandidatesRef.current
            pendingCandidatesRef.current = []
            for (const candidate of candidates) await peer.addIceCandidate(candidate)
          })
          .then(() => peer.createAnswer())
          .then((answer) => peer.setLocalDescription(answer))
          .then(() => send({
            type: 'voice_signal',
            call_id: message.call_id,
            target_user_id: message.user_id,
            payload: { type: 'answer', sdp: peer.localDescription.sdp },
          }))
          .catch((error) => console.error('Unable to answer voice call offer.', error))
      } else if (payload.type === 'candidate' && payload.candidate) {
        const candidate = new RTCIceCandidate(payload.candidate)
        if (peer.remoteDescription) {
          peer.addIceCandidate(candidate)
            .catch((error) => console.error('Unable to add voice call ICE candidate.', error))
        } else {
          pendingCandidatesRef.current.push(candidate)
        }
      }
    }
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null
      closeMedia()
    }
    socket.onerror = () => console.error('Voice signaling WebSocket failed.')

    return () => {
      socket.close()
      if (socketRef.current === socket) socketRef.current = null
      closeMedia()
    }
  }, [authToken, closeMedia, send, wsUrl])

  const endCall = useCallback(() => {
    if (callRef.current) send({ type: 'voice_leave', call_id: callRef.current.call_id })
    closeMedia()
    setIncomingCall(null)
  }, [closeMedia, send])

  const declineCall = useCallback((invitation) => {
    send({ type: 'voice_decline', call_id: invitation.call_id })
    setIncomingCall(null)
  }, [send])

  return {
    status,
    incomingCall,
    audioRef: remoteAudioRef,
    acceptCall,
    endCall,
    declineCall,
    dismissInvitation: () => setIncomingCall(null),
  }
}

export default useVoiceCommunication
