import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Construction, Mic, MicOff, Route, X } from 'lucide-react'
import { BASE_URL } from '../dataProvider'

const getSpeechRecognition = () => {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

const AVAILABLE_COMMANDS = [
  { icon: Route, label: 'Find an evacuation route', phrase: 'ROUTE' },
  { icon: Camera, label: 'Report an emergency', phrase: 'EMERGENCY, CAMERA' },
  { icon: Construction, label: 'Report a road hazard', phrase: 'HAZARD' },
]

export default function VoiceCommandButton({ currentLocation = null, onAction }) {
  const recognitionRef = useRef(null)
  const microphoneStreamRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState('Tap the microphone and speak a command.')
  const [error, setError] = useState('')
  const [microphones, setMicrophones] = useState([])
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('')
  const [microphoneError, setMicrophoneError] = useState('')
  const SpeechRecognition = getSpeechRecognition()

  useEffect(() => () => {
    recognitionRef.current?.abort()
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    if (!isOpen || !navigator.mediaDevices?.enumerateDevices) return undefined
    let active = true
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      if (!active) return
      const inputs = devices.filter((device) => device.kind === 'audioinput')
      setMicrophones(inputs)
      setSelectedMicrophoneId((current) => current || inputs[0]?.deviceId || '')
    }).catch(() => setMicrophoneError('Microphone inputs could not be listed.'))
    return () => { active = false }
  }, [isOpen])

  if (!SpeechRecognition) return null

  const closeModal = () => {
    recognitionRef.current?.abort()
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
    microphoneStreamRef.current = null
    setIsListening(false)
    setIsOpen(false)
    setError('')
  }

  const prepareMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return true
    try {
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
      const audio = selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : true
      microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio })
      return true
    } catch {
      setMicrophoneError('Microphone access was blocked or the selected input is unavailable.')
      return false
    }
  }

  const startListening = async () => {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }

    setIsOpen(true)
    setError('')
    setMicrophoneError('')
    if (!await prepareMicrophone()) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition
    setIsOpen(true)
    setError('')
    setStatus('Listening…')
    setIsListening(true)

    recognition.onresult = async (event) => {
      const transcript = Array.from(event.results || [])
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim()
      if (!transcript) return

      setStatus(`Heard: ${transcript}`)
      try {
        const response = await fetch(`${BASE_URL}/api/v1/voice-command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            latitude: Number.isFinite(Number(currentLocation?.latitude)) ? Number(currentLocation.latitude) : null,
            longitude: Number.isFinite(Number(currentLocation?.longitude)) ? Number(currentLocation.longitude) : null,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.detail || 'Voice command was not recognized.')
        setStatus(`Command recognized: ${data.detected_intent.replaceAll('_', ' ')}`)
        onAction?.(data.action, { ...data, transcript, currentLocation })
      } catch (requestError) {
        setError(requestError.message || 'Unable to process voice command.')
        setStatus('Try one of the commands below.')
      }
    }
    recognition.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'Microphone permission is blocked.' : 'Could not hear a command.')
      setStatus('Try one of the commands below.')
      setIsListening(false)
    }
    recognition.onend = () => setIsListening(false)
    recognition.start()
  }

  return (
    <div className="citizen-voice-command">
      <button
        type="button"
        className={`citizen-voice-command-button${isListening ? ' is-listening' : ''}`}
        onClick={() => {
          setIsOpen(true)
          startListening()
        }}
        aria-label={isListening ? 'Stop voice command' : 'Start voice command'}
        aria-pressed={isListening}
        title={isListening ? 'Stop voice command' : 'Voice command'}
      >
        {isListening ? <MicOff size={19} aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
        <span>{isListening ? 'Listening' : 'Voice command'}</span>
      </button>

      {isOpen && createPortal(
        <div className="citizen-voice-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal()
        }}>
          <section className="citizen-voice-modal" role="dialog" aria-modal="true" aria-labelledby="voice-command-title">
            <button type="button" className="citizen-voice-modal-close" onClick={closeModal} aria-label="Close voice commands">
              <X size={18} aria-hidden="true" />
            </button>
            <p className="citizen-voice-modal-eyebrow">Hands-free controls</p>
            <h2 id="voice-command-title">How can we help?</h2>
            <div className={`citizen-voice-mic-orb${isListening ? ' is-listening' : ''}`} aria-hidden="true">
              {isListening ? <Mic size={34} /> : <MicOff size={34} />}
            </div>
            <p className={`citizen-voice-modal-status${error || microphoneError ? ' is-error' : ''}`} role="status">
              {error || microphoneError || status}
            </p>
            <label className="citizen-voice-microphone-picker">
              <span>Microphone input</span>
              <select
                value={selectedMicrophoneId}
                onChange={(event) => setSelectedMicrophoneId(event.target.value)}
                disabled={isListening || microphones.length === 0}
              >
                {microphones.length === 0 && <option value="">Default microphone</option>}
                {microphones.map((microphone, index) => (
                  <option key={microphone.deviceId || `microphone-${index}`} value={microphone.deviceId}>
                    {microphone.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="citizen-voice-listen-button" onClick={startListening} disabled={isListening}>
              {isListening ? 'Listening…' : 'Tap to speak'}
            </button>
            <div className="citizen-voice-command-list">
              <p className="citizen-voice-command-list-title">Try saying</p>
              {AVAILABLE_COMMANDS.map(({ icon: Icon, label, phrase }) => (
                <div className="citizen-voice-command-item" key={label}>
                  <span className="citizen-voice-command-item-icon"><Icon size={17} aria-hidden="true" /></span>
                  <span><strong>{label}</strong><small>{phrase}</small></span>
                </div>
              ))}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}
