import React, { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'

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
      const response = await fetch('http://localhost:8000/api/v1/auth/reset-password', {
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
    <div className="flex items-center justify-center" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #c52222 0%, #a36b16 100%)' }}>
      <div className="card" style={{ maxWidth: '420px', width: '100%', margin: '1rem', backgroundColor: '#fff', padding: '2rem', borderRadius: '8px' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <Logo size="large" />
          <h2 style={{ fontSize: '1.25rem', marginTop: '1rem', color: '#1f2937' }}>Set New Password</h2>
        </div>

        {message.text && (
          <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '1rem' }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="input"
              placeholder="Enter new password"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="input"
              placeholder="Confirm new password"
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>
            {loading ? 'Updating Password...' : 'Reset Password'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link to="/login" style={{ color: 'var(--color-primary, #c52222)', fontSize: '0.875rem', fontWeight: '600', textDecoration: 'none' }}>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ResetPassword