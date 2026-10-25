import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Check,
  ChevronRight,
  Compass,
  HeartHandshake,
  MapPinned,
  Radio,
  ShieldCheck,
  Siren,
  UsersRound
} from 'lucide-react'
import Logo from '../components/Logo'
import './LandingPage.css'

const LandingPage = () => {
  const mapArtRef = useRef(null)
  const [markerPositions, setMarkerPositions] = useState({
    alert: { x: 15.8, y: 18.5 },
    shelter: { x: 71.3, y: 46.9 },
    you: { x: 87, y: 43.2 }
  })
  const [draggingMarker, setDraggingMarker] = useState(null)

  const handleMarkerPointerDown = (event, marker) => {
    if (!mapArtRef.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDraggingMarker(marker)
  }

  const handleMarkerPointerMove = (event) => {
    if (!draggingMarker || !mapArtRef.current) return
    const bounds = mapArtRef.current.getBoundingClientRect()
    const x = Math.min(94, Math.max(3, ((event.clientX - bounds.left) / bounds.width) * 100))
    const y = Math.min(88, Math.max(3, ((event.clientY - bounds.top) / bounds.height) * 100))
    setMarkerPositions((current) => ({ ...current, [draggingMarker]: { x, y } }))
  }

  const stopMarkerDrag = () => setDraggingMarker(null)

  const handleSectionNavigation = (event) => {
    const link = event.target.closest('a[href^="#"]')
    const targetId = link?.getAttribute('href')?.slice(1)
    const target = targetId ? document.getElementById(targetId) : null

    if (!link || !target) return

    event.preventDefault()
    window.history.pushState(null, '', `#${targetId}`)
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
  <main className="landing-page" onClick={handleSectionNavigation}>
    <section className="landing-hero" id="home">
      <div className="landing-hero-glow landing-hero-glow-one" />
      <div className="landing-hero-glow landing-hero-glow-two" />
      <header className="landing-header">
        <Link className="landing-brand" to="/" aria-label="RESQ-ROUTE home">
          <Logo size="small" />
          <span>RESQ<span>-</span>ROUTE</span>
        </Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#preparedness">Preparedness</a>
        </nav>
        <div className="landing-header-actions">
          <Link className="landing-sign-in" to="/login">Sign in</Link>
          <Link className="landing-button landing-button-yellow" to="/explore">
            Open RESQ-ROUTE <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>

      <div className="landing-hero-content">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span /> COMMUNITY SAFETY, CONNECTED</div>
          <h1>When it matters,<br />we <span>move together.</span></h1>
          <p className="landing-hero-lede">
            A clearer path from emergency alerts to safe shelter. RESQ-ROUTE helps communities
            and response teams stay informed, coordinated, and ready.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-button landing-button-blue" to="/explore">
              Find help near you <ArrowRight size={17} />
            </Link>
            <a className="landing-text-link" href="#how-it-works">
              Explore the platform <ChevronRight size={17} />
            </a>
          </div>
          <div className="landing-hero-note">
            <ShieldCheck size={16} />
            <span>One connected view for residents and response teams</span>
          </div>
        </div>

        <div className="landing-hero-visual" aria-label="Illustration of a coordinated emergency response map">
          <div className="landing-map-card">
            <div className="landing-map-topline">
              <span><span className="landing-live-dot" /> LIVE RESPONSE VIEW</span>
              <span className="landing-map-region">COMMUNITY MAP</span>
            </div>
            <div
              ref={mapArtRef}
              className={`landing-map-art${draggingMarker ? ' is-dragging-marker' : ''}`}
              onPointerMove={handleMarkerPointerMove}
              onPointerUp={stopMarkerDrag}
              onPointerCancel={stopMarkerDrag}
            >
              <div className="landing-map-grid" />
              <svg className="landing-map-roads" viewBox="0 0 520 390" preserveAspectRatio="none" aria-hidden="true">
                <path d="M-20 83 C80 114 112 58 207 94 S364 140 540 74" />
                <path d="M-16 258 C84 212 148 271 230 224 S380 188 542 242" />
                <path d="M94 -15 C126 81 149 126 122 207 S102 311 157 408" />
                <path d="M355 -20 C312 66 348 111 372 176 S419 273 380 414" />
                <path d="M-20 164 C98 179 186 144 275 167 S420 219 544 167" />
                <path d="M212 -15 C239 70 224 113 255 171 S303 292 282 405" />
              </svg>
              <div className="landing-map-area landing-map-area-a" />
              <div className="landing-map-area landing-map-area-b" />
              <svg className="landing-map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path
                  d={`M ${markerPositions.alert.x + 3} ${markerPositions.alert.y + 3} C ${markerPositions.alert.x + 18} ${markerPositions.alert.y + 12}, ${markerPositions.shelter.x - 18} ${markerPositions.shelter.y - 12}, ${markerPositions.shelter.x + 3} ${markerPositions.shelter.y + 3}`}
                />
              </svg>
              <div
                className={`landing-map-pin landing-map-pin-alert${draggingMarker === 'alert' ? ' is-dragging' : ''}`}
                style={{ left: `${markerPositions.alert.x}%`, top: `${markerPositions.alert.y}%`, right: 'auto' }}
                role="button"
                tabIndex={0}
                aria-label="Drag community alert marker"
                onPointerDown={(event) => handleMarkerPointerDown(event, 'alert')}
              ><Siren size={17} /></div>
              <div
                className={`landing-map-pin landing-map-pin-shelter${draggingMarker === 'shelter' ? ' is-dragging' : ''}`}
                style={{ left: `${markerPositions.shelter.x}%`, top: `${markerPositions.shelter.y}%`, right: 'auto' }}
                role="button"
                tabIndex={0}
                aria-label="Drag evacuation center marker"
                onPointerDown={(event) => handleMarkerPointerDown(event, 'shelter')}
              ><HeartHandshake size={17} /></div>
              <div
                className={`landing-map-pin landing-map-pin-you${draggingMarker === 'you' ? ' is-dragging' : ''}`}
                style={{ left: `${markerPositions.you.x}%`, top: `${markerPositions.you.y}%`, right: 'auto' }}
                role="button"
                tabIndex={0}
                aria-label="Drag your location marker"
                onPointerDown={(event) => handleMarkerPointerDown(event, 'you')}
              ><span /></div>
              <div
                className="landing-map-label landing-map-label-alert"
                style={{ left: `${Math.min(82, markerPositions.alert.x + 7)}%`, top: `${Math.max(2, markerPositions.alert.y - 7)}%`, right: 'auto' }}
              >Community alert</div>
              <div
                className="landing-map-label landing-map-label-shelter"
                style={{ left: `${Math.max(4, markerPositions.shelter.x - 10)}%`, top: `${Math.min(82, markerPositions.shelter.y + 7)}%`, right: 'auto' }}
              >Evacuation center</div>
              <div className="landing-map-legend">
                <span><i className="legend-alert" /> Alert</span>
                <span><i className="legend-shelter" /> Safe center</span>
                <span><i className="legend-route" /> Route</span>
              </div>
            </div>
            <div className="landing-map-footer">
              <div className="landing-map-footer-icon"><MapPinned size={18} /></div>
              <div><strong>Know where to go</strong><span>Find nearby centers and plan your route.</span></div>
              <ArrowUpRight size={17} />
            </div>
          </div>
          <div className="landing-response-chip">
            <span className="landing-response-chip-icon"><Radio size={16} /></span>
            <span><strong>Response teams connected</strong><small>Information in one place</small></span>
            <span className="landing-response-chip-check"><Check size={13} /></span>
          </div>
        </div>
      </div>

      <div className="landing-hero-bottom">
        <span>PREPAREDNESS STARTS WITH CONNECTION</span>
        <a href="#how-it-works">SCROLL TO EXPLORE <span>↓</span></a>
      </div>
    </section>

    <section className="landing-intro" id="how-it-works">
      <div className="landing-section-kicker">BUILT FOR THE MOMENTS THAT MATTER</div>
      <div className="landing-intro-grid">
        <div>
          <h2>Clarity in a crisis.<br /><span>Coordination in motion.</span></h2>
        </div>
        <div className="landing-intro-copy">
          <p>
            Emergencies move quickly. RESQ-ROUTE brings useful information closer together,
            helping residents find support while teams coordinate people, centers, and resources.
          </p>
          <a href="#capabilities">See what the platform can do <ArrowRight size={16} /></a>
        </div>
      </div>
      <div className="landing-principles">
        <article className="landing-principle">
          <span className="landing-principle-number">01</span>
          <span className="landing-principle-icon"><BellRing size={20} /></span>
          <h3>Stay informed</h3>
          <p>See emergency alerts and community updates in a clear, accessible view.</p>
        </article>
        <article className="landing-principle">
          <span className="landing-principle-number">02</span>
          <span className="landing-principle-icon"><MapPinned size={20} /></span>
          <h3>Find safe options</h3>
          <p>Explore evacuation centers and get directions to places offering support.</p>
        </article>
        <article className="landing-principle">
          <span className="landing-principle-number">03</span>
          <span className="landing-principle-icon"><UsersRound size={20} /></span>
          <h3>Coordinate response</h3>
          <p>Give response teams a shared workspace for people, centers, and supplies.</p>
        </article>
      </div>
    </section>

    <section className="landing-capabilities" id="capabilities">
      <div className="landing-capabilities-copy">
        <div className="landing-section-kicker">ONE PLATFORM, CONNECTED WORKFLOWS</div>
        <h2>From the first alert<br />to the next safe step.</h2>
        <p>
          Practical tools support each part of a coordinated response—without losing sight of
          the people and communities behind every update.
        </p>
        <Link className="landing-button landing-button-blue" to="/login">
          Explore your workspace <ArrowRight size={17} />
        </Link>
      </div>
      <div className="landing-capability-list">
        <article><span className="landing-capability-icon capability-blue"><BellRing size={19} /></span><div><h3>Emergency awareness</h3><p>Follow active alerts and important local updates.</p></div><ArrowUpRight size={17} /></article>
        <article><span className="landing-capability-icon capability-yellow"><Compass size={19} /></span><div><h3>Evacuation guidance</h3><p>Locate evacuation centers and make a plan to reach them.</p></div><ArrowUpRight size={17} /></article>
        <article><span className="landing-capability-icon capability-teal"><UsersRound size={19} /></span><div><h3>Team coordination</h3><p>Support shared operations across response roles.</p></div><ArrowUpRight size={17} /></article>
      </div>
    </section>

    <section className="landing-preparedness" id="preparedness">
      <div className="landing-preparedness-mark"><ShieldCheck size={24} /></div>
      <div className="landing-preparedness-copy">
        <span>READY IS A COMMUNITY EFFORT</span>
        <h2>Prepared people. Connected response.</h2>
        <p>Start with clear information, a plan for your household, and a place to turn when conditions change.</p>
      </div>
      <Link className="landing-button landing-button-yellow" to="/register">
        Get started <ArrowRight size={16} />
      </Link>
    </section>

    <footer className="landing-footer">
      <Link className="landing-brand" to="/" aria-label="RESQ-ROUTE home">
        <Logo size="small" />
        <span>RESQ<span>-</span>ROUTE</span>
      </Link>
      <p>Community safety, connected.</p>
      <div><Link to="/login">Sign in</Link><Link to="/register">Create an account</Link></div>
      <small>© {new Date().getFullYear()} RESQ-ROUTE. Built for safer communities.</small>
    </footer>
  </main>
  )
}

export default LandingPage
