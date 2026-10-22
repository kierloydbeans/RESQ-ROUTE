import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Cross, HeartPulse, Radio, RotateCw, ShieldCheck, Waves } from 'lucide-react'
import './RescueErrorScreen.css'

const signals = [
  { icon: Radio, label: 'Radio', color: 'coral' },
  { icon: Waves, label: 'Water', color: 'blue' },
  { icon: ShieldCheck, label: 'Safety', color: 'green' },
  { icon: Cross, label: 'First aid', color: 'amber' },
]

const RescueErrorScreen = () => {
  const navigate = useNavigate()
  const [gameStatus, setGameStatus] = useState('ready')
  const [sequence, setSequence] = useState([])
  const [activeSignal, setActiveSignal] = useState(null)
  const [progress, setProgress] = useState(0)
  const [round, setRound] = useState(0)
  const [bestRound, setBestRound] = useState(0)
  const [gameMessage, setGameMessage] = useState('A quick signal check while we get things back on route.')

  useEffect(() => {
    if (gameStatus !== 'showing') return undefined

    const timers = []
    sequence.forEach((signal, index) => {
      const startAt = 350 + index * 760
      timers.push(window.setTimeout(() => setActiveSignal(signal), startAt))
      timers.push(window.setTimeout(() => setActiveSignal(null), startAt + 420))
    })
    timers.push(window.setTimeout(() => {
      setGameStatus('input')
      setGameMessage('Your turn — repeat the signals in order.')
    }, 350 + sequence.length * 760))

    return () => timers.forEach(window.clearTimeout)
  }, [gameStatus, sequence])

  const startGame = () => {
    setProgress(0)
    setRound(0)
    setSequence([Math.floor(Math.random() * signals.length)])
    setGameStatus('showing')
    setGameMessage('Watch the signal, then repeat it.')
  }

  const handleSignal = (signalIndex) => {
    if (gameStatus !== 'input') return

    setActiveSignal(signalIndex)
    window.setTimeout(() => setActiveSignal(null), 180)

    if (sequence[progress] !== signalIndex) {
      setGameStatus('over')
      setBestRound((best) => Math.max(best, round))
      setGameMessage(`Signal missed. You completed ${round} ${round === 1 ? 'round' : 'rounds'}.`)
      return
    }

    if (progress + 1 === sequence.length) {
      const completedRound = round + 1
      setRound(completedRound)
      setProgress(0)
      setSequence((current) => [...current, Math.floor(Math.random() * signals.length)])
      setGameStatus('showing')
      setGameMessage('Nice work. Watch the next signal.')
      return
    }

    setProgress((current) => current + 1)
    setGameMessage(`Good signal — ${progress + 1} of ${sequence.length}.`)
  }

  const handleGameKeyDown = (event) => {
    const signalIndex = Number(event.key) - 1
    if (signalIndex >= 0 && signalIndex < signals.length) {
      event.preventDefault()
      handleSignal(signalIndex)
    }
  }

  return (
    <main className="rescue-error-screen">
      <div className="rescue-error-orbit rescue-error-orbit-one" aria-hidden="true" />
      <div className="rescue-error-orbit rescue-error-orbit-two" aria-hidden="true" />

      <div className="rescue-error-content">
        <header className="rescue-error-header">
          <a className="rescue-error-brand" href="/" aria-label="ResQ-Route home">
            <img src="/resq_logo.png" alt="" />
            <span>RESQ<span className="rescue-error-brand-accent">·</span>ROUTE</span>
          </a>
          <span className="rescue-error-status"><i /> RECOVERY MODE</span>
        </header>

        <section className="rescue-error-main" aria-labelledby="rescue-error-title">
          <div className="rescue-error-copy">
            <div className="rescue-error-illustration" aria-hidden="true">
              <span className="rescue-error-beacon-ring" />
              <span className="rescue-error-beacon">
                <HeartPulse size={38} strokeWidth={1.7} />
              </span>
              <span className="rescue-error-spark rescue-error-spark-one">+</span>
              <span className="rescue-error-spark rescue-error-spark-two">+</span>
            </div>
            <p className="rescue-error-eyebrow">A SMALL DETOUR</p>
            <h1 id="rescue-error-title">We lost the signal.<br /><span>We’re finding the way back.</span></h1>
            <p className="rescue-error-description">
              Something interrupted this page. Your response plan is safe — give it another try or head back to the dashboard.
            </p>
            <div className="rescue-error-actions">
              <button className="rescue-error-button rescue-error-button-primary" onClick={() => window.location.reload()}>
                <RotateCw size={17} />
                Try again
              </button>
              <button className="rescue-error-button rescue-error-button-secondary" onClick={() => navigate(-1)}>
                <ArrowLeft size={17} />
                Go back
              </button>
            </div>
            <p className="rescue-error-footnote"><Check size={14} /> No response data has been changed.</p>
          </div>

          <section className="signal-game" aria-labelledby="signal-game-title" onKeyDown={handleGameKeyDown}>
            <div className="signal-game-heading">
              <div className="signal-game-icon"><Radio size={18} /></div>
              <div>
                <p className="signal-game-kicker">A MINUTE TO RESET</p>
                <h2 id="signal-game-title">Signal Match</h2>
              </div>
              <span className="signal-game-score" aria-label={`Completed rounds: ${round}`}>
                <strong>{round}</strong><small>ROUNDS</small>
              </span>
            </div>

            <p className="signal-game-instructions">
              {gameStatus === 'ready' ? 'Remember the signal sequence and repeat it.' : gameMessage}
            </p>

            <div className="signal-game-board" aria-label="Signal buttons, use keys 1 through 4 to play">
              {signals.map(({ icon: Icon, label, color }, index) => (
                <button
                  key={label}
                  className={`signal-game-pad signal-game-pad-${color}${activeSignal === index ? ' is-active' : ''}`}
                  type="button"
                  aria-label={`${label}, key ${index + 1}`}
                  aria-pressed={activeSignal === index}
                  disabled={gameStatus === 'ready' || gameStatus === 'showing' || gameStatus === 'over'}
                  onClick={() => handleSignal(index)}
                >
                  <Icon size={22} strokeWidth={1.8} />
                  <span>{index + 1}</span>
                </button>
              ))}
            </div>

            <div className="signal-game-footer">
              <span className="signal-game-best">BEST <strong>{bestRound}</strong></span>
              <button className="signal-game-start" type="button" onClick={startGame}>
                {gameStatus === 'ready' ? 'Play a quick round' : gameStatus === 'over' ? 'Play again' : gameStatus === 'showing' ? 'Watch closely…' : 'Repeat the signal'}
                {gameStatus === 'ready' || gameStatus === 'over' ? <ArrowRight size={15} /> : null}
              </button>
            </div>
            <p className="signal-game-live" aria-live="polite">{gameStatus === 'ready' ? gameMessage : gameMessage}</p>
          </section>
        </section>

        <footer className="rescue-error-footer">
          <span>RESQ-ROUTE RESPONSE NETWORK</span>
          <span>STAY READY. WE’LL BE RIGHT BACK.</span>
        </footer>
      </div>
    </main>
  )
}

export default RescueErrorScreen
