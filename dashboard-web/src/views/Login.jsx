import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import Logo from '../components/Logo'
import GradientBackground from '../components/GradientBackground'
import { useTheme } from '../ThemeContext'

const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase
const API_URL = `${API_BASE_URL}/api/v1`

const roles = [
  { value: 'citizen', label: 'Citizen' },
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'rescuer', label: 'Rescuer' },
  { value: 'coordinator', label: 'Coordinator' }
]

const BackgroundPin = ({ top, left, delay }) => (
  <svg
    className="pulsing-pin"
    style={{
      position: 'absolute',
      top,
      left,
      width: '32px',
      height: '32px',
      animationDelay: delay,
      zIndex: 0
    }}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 21.5C16.5 16 19 12.5 19 8.5C19 4.35786 15.866 1 12 1C8.13401 1 5 4.35786 5 8.5C5 12.5 7.5 16 12 21.5Z" fill="#ffffff" />
    <circle cx="12" cy="8.5" r="3.5" fill="#c52222" />
  </svg>
)

const Login = () => {
  const { role: routeRole } = useParams()
  const role = roles.some((item) => item.value === routeRole) ? routeRole : 'citizen'
  const { isShaderGradient } = useTheme()
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState({ type: '', text: '' })
  const [isPageLoading, setIsPageLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => setIsPageLoading(false), 1200)
    return () => clearTimeout(timer)
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/login-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          role
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Login failed')

      localStorage.setItem('auth', JSON.stringify({
        token: data.access_token,
        user: data.user
      }))

      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPasswordSubmit = async (event) => {
    event.preventDefault()
    setResetMessage({ type: '', text: '' })
    setResetLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Failed to send reset email')

      setResetMessage({
        type: 'success',
        text: 'If an account exists with this email, a password reset link has been sent.'
      })
      setResetEmail('')
    } catch (err) {
      setResetMessage({ type: 'error', text: err.message })
    } finally {
      setResetLoading(false)
    }
  }

  const closeForgotModal = () => {
    setShowForgotModal(false)
    setResetEmail('')
    setResetMessage({ type: '', text: '' })
  }

  const skeletonPulseStyle = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .35; }
    }
    .skeleton-box {
      animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      background-color: #e5e7eb;
    }
  `

  const pinPulseStyle = `
    @keyframes opacityPulse {
      0%, 100% { opacity: 0.1; }
      50% { opacity: 0.75; }
    }
    .pulsing-pin {
      animation: opacityPulse 4s ease-in-out infinite;
      pointer-events: none;
    }
  `

  if (isPageLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', padding: '1.5rem' }}>
        <style>{skeletonPulseStyle}</style>
        <div style={{
          maxWidth: '960px',
          width: '100%',
          minHeight: '560px',
          display: 'flex',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          backgroundColor: '#ffffff'
        }}>
          <div className="skeleton-box" style={{ flex: '1', backgroundColor: '#d1d5db' }}></div>
          <div style={{ flex: '1', padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#ffffff' }}>
            <div style={{ marginBottom: '2rem' }}>
              <div className="skeleton-box" style={{ height: '48px', width: '140px', borderRadius: '8px', marginBottom: '1rem' }}></div>
              <div className="skeleton-box" style={{ height: '32px', width: '100px', borderRadius: '8px' }}></div>
            </div>
            <div className="skeleton-box" style={{ height: '46px', width: '100%', borderRadius: '9999px', marginBottom: '1.25rem' }}></div>
            <div className="skeleton-box" style={{ height: '46px', width: '100%', borderRadius: '9999px', marginBottom: '1rem' }}></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.75rem' }}>
              <div className="skeleton-box" style={{ height: '14px', width: '110px', borderRadius: '4px' }}></div>
            </div>
            <div className="skeleton-box" style={{ height: '48px', width: '100%', borderRadius: '9999px' }}></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', padding: '1.5rem' }}>
      <style>{pinPulseStyle}</style>

      <div style={{
        maxWidth: '960px',
        width: '100%',
        minHeight: '560px',
        display: 'flex',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        backgroundColor: '#ffffff'
      }}>
        <div style={{
          flex: '1',
          background: `linear-gradient(135deg, rgba(197, 34, 34, 0.85) 0%, rgba(163, 107, 22, 0.85) 100%), url('https://preview.redd.it/was-there-any-urban-masterplan-for-caloocan-city-v0-rcfgre5qrpjc1.jpg?width=640&crop=smart&auto=webp&s=00978c251414bcb6fb0459978ca5eedcd113d39a')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          padding: '3rem 2.5rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <GradientBackground animated={isShaderGradient} />
          <svg className={isShaderGradient ? 'shader-decoration-hidden' : ''} style={{ position: 'absolute', top: 0, left: 0, opacity: 0.1, pointerEvents: 'none' }} width="100%" height="100%">
            <circle cx="10%" cy="20%" r="120" stroke="#fff" strokeWidth="2" fill="none" />
            <circle cx="80%" cy="80%" r="180" stroke="#fff" strokeWidth="2" fill="none" />
          </svg>
          <BackgroundPin top="15%" left="15%" delay="0s" />
          <BackgroundPin top="65%" left="10%" delay="1.5s" />
          <BackgroundPin top="25%" left="75%" delay="0.8s" />
          <BackgroundPin top="75%" left="80%" delay="2.2s" />
          <BackgroundPin top="85%" left="40%" delay="3s" />
          <BackgroundPin top="10%" left="50%" delay="1.2s" />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 0.75rem',
              marginBottom: '1.25rem',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: '9999px',
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              fontSize: '0.8rem',
              fontWeight: '700',
              letterSpacing: '0.08em',
              textTransform: 'uppercase'
            }}>
              <span style={{ width: '0.45rem', height: '0.45rem', borderRadius: '50%', backgroundColor: '#ffffff' }} />
              {roles.find((item) => item.value === role)?.label || 'Citizen'} login
            </div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: '800', lineHeight: 1.2, marginBottom: '1rem', color: '#ffffff' }}>
              Welcome back!
            </h1>
            <p style={{ fontSize: '1rem', opacity: 0.9, lineHeight: 1.6, maxWidth: '320px', color: '#fef2f2' }}>
              Sign in to access your dashboard and manage disaster response operations seamlessly.
            </p>
          </div>
        </div>

        <div className="login-form-panel" style={{ flex: '1', padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#ffffff' }}>
          <div style={{ marginBottom: '2rem' }}>
            <Logo size="large" />
            <h2 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#111827', marginTop: '1rem' }}>Sign In</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.25rem' }} aria-label="Choose login role">
              {roles.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => navigate(`/login/${item.value}`)}
                  aria-current={role === item.value ? 'page' : undefined}
                  style={{
                    padding: '0.45rem 0.7rem',
                    borderRadius: '9999px',
                    border: role === item.value ? '1px solid var(--ops-red)' : '1px solid var(--ops-border)',
                    backgroundColor: role === item.value ? 'var(--auth-role-active-bg)' : 'var(--ops-surface-2)',
                    color: role === item.value ? 'var(--ops-red)' : 'var(--ops-muted)',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                placeholder="Username"
                style={{
                  width: '100%',
                  padding: '0.875rem 1.25rem',
                  borderRadius: '9999px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  fontFamily: "'Rajdhani', 'Arial Narrow', sans-serif",
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Password"
                style={{
                  width: '100%',
                  padding: '0.875rem 3.25rem 0.875rem 1.25rem',
                  borderRadius: '9999px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  fontFamily: "'Rajdhani', 'Arial Narrow', sans-serif",
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: '1rem',
                  transform: 'translateY(-50%)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.25rem',
                  border: 'none',
                  background: 'none',
                  color: '#6b7280',
                  cursor: 'pointer'
                }}
              >
                {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.75rem' }}>
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.875rem',
                borderRadius: '9999px',
                border: 'none',
                background: 'linear-gradient(135deg, #c52222 0%, #a36b16 100%)',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '1rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(197, 34, 34, 0.25)',
                transition: 'opacity 0.2s'
              }}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              New here?{' '}
              <Link to="/register" style={{ color: '#c52222', fontWeight: '600', textDecoration: 'none' }}>
                Create an Account
              </Link>
            </p>
          </div>
        </div>
      </div>

      {showForgotModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="login-modal" style={{ maxWidth: '420px', width: '100%', backgroundColor: '#fff', borderRadius: '16px', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: '700', color: '#111827' }}>
              Reset Password
            </h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Enter your registered email address and we'll send you instructions to reset your password.
            </p>

            {resetMessage.text && (
              <div className={`alert ${resetMessage.type === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
                {resetMessage.text}
              </div>
            )}

            <form onSubmit={handleForgotPasswordSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  required
                  placeholder="name@example.com"
                  style={{
                    width: '100%',
                    padding: '0.875rem 1.25rem',
                    borderRadius: '9999px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
                    fontFamily: "'Rajdhani', 'Arial Narrow', sans-serif",
                    fontSize: '0.95rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={closeForgotModal}
                  style={{
                    padding: '0.625rem 1.25rem',
                    borderRadius: '9999px',
                    border: 'none',
                    backgroundColor: 'var(--ops-border)',
                    color: 'var(--ops-text)',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  style={{
                    padding: '0.625rem 1.25rem',
                    borderRadius: '9999px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #c52222 0%, #a36b16 100%)',
                    color: '#ffffff',
                    fontWeight: '600',
                    cursor: resetLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {resetLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Login
