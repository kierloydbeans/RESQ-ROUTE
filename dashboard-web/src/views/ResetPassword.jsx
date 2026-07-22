import React, { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const ResetPassword = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    if (!token) {
      setMessage({ type: 'error', text: 'Invalid or missing reset token.' })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Password reset failed.')
      }

      setMessage({ type: 'success', text: 'Password reset successful! Redirecting to login...' })
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', padding: '1.5rem' }}>
      <div style={{
        maxWidth: '900px',
        width: '100%',
        minHeight: '480px',
        display: 'flex',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        backgroundColor: '#ffffff'
      }}>
        {/* LEFT PANEL */}
        <div style={{
          flex: '1',
          background: 'linear-gradient(135deg, #c52222 0%, #a36b16 100%)',
          padding: '3rem 2.5rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          color: '#ffffff'
        }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: '800', lineHeight: 1.2, marginBottom: '1rem', color: '#ffffff' }}>
            Set New Password
          </h1>
          <p style={{ fontSize: '1rem', opacity: 0.9, lineHeight: 1.6, maxWidth: '300px', color: '#fef2f2' }}>
            Choose a strong password to ensure your account remains secure.
          </p>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ flex: '1', padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#ffffff' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <Logo size="large" />
          </div>

          {message.text && (
            <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '1.25rem', fontSize: '0.875rem' }}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="New password"
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

            <div style={{ marginBottom: '1.5rem' }}>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
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
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Updating Password...' : 'Reset Password'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.75rem' }}>
            <Link to="/login" style={{ color: '#c52222', fontSize: '0.875rem', fontWeight: '600', textDecoration: 'none' }}>
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResetPassword