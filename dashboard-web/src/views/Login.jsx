import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot Password Modal States
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState({ type: '', text: '' })

  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username: formData.username,
          password: formData.password
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed')
      }

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

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault()
    setResetMessage({ type: '', text: '' })
    setResetLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resetEmail })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send reset email')
      }

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', padding: '1.5rem' }}>
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
        {/* LEFT PANEL - BRAND BANNER */}
        <div style={{
          flex: '1',
          background: 'linear-gradient(135deg, #c52222 0%, #a36b16 100%)',
          padding: '3rem 2.5rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Subtle Decorative Pattern SVG */}
          <svg style={{ position: 'absolute', top: 0, left: 0, opacity: 0.1, pointerEvents: 'none' }} width="100%" height="100%">
            <circle cx="10%" cy="20%" r="120" stroke="#fff" strokeWidth="2" fill="none" />
            <circle cx="80%" cy="80%" r="180" stroke="#fff" strokeWidth="2" fill="none" />
          </svg>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: '800', lineHeight: 1.2, marginBottom: '1rem', color: '#ffffff' }}>
              Welcome back!
            </h1>
            <p style={{ fontSize: '1rem', opacity: 0.9, lineHeight: 1.6, maxWidth: '320px', color: '#fef2f2' }}>
              Sign in to access your dashboard and manage disaster response operations seamlessly.
            </p>
          </div>
        </div>

        {/* RIGHT PANEL - FORM */}
        <div style={{ flex: '1', padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#ffffff' }}>
          <div style={{ marginBottom: '2rem' }}>
            <Logo size="large" />
            <h2 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#111827', marginTop: '1rem' }}>Sign In</h2>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.875rem' }}>
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
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Password"
                style={{
                  width: '100%',
                  padding: '0.875rem 1.25rem',
                  borderRadius: '9999px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
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

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{ maxWidth: '420px', width: '100%', backgroundColor: '#fff', borderRadius: '16px', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
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
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  placeholder="name@example.com"
                  style={{
                    width: '100%',
                    padding: '0.875rem 1.25rem',
                    borderRadius: '9999px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
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
                    backgroundColor: '#e5e7eb',
                    color: '#374151',
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