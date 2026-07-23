import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'

<img src="/resq_logo_with_label.png" alt="ResQ Route Logo" />

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'CITIZEN',
    otp_code: ''
  })

  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [otpSent, setOtpSent] = useState(false)

  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSendOtp = async () => {
    setError('')
    setSuccessMsg('')

    if (!formData.email) {
      setError('Please enter your email address first.')
      return
    }

    setSendingOtp(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send OTP code.')
      }

      setOtpSent(true)
      setSuccessMsg('Verification code sent to your email!')
    } catch (err) {
      setError(err.message)
    } finally {
      setSendingOtp(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (!formData.otp_code) {
      setError('Please enter the 6-digit verification code.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role,
          otp_code: formData.otp_code
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed.')
      }

      navigate('/login', { state: { message: 'Registration successful! Please log in.' } })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box'
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', padding: '1.5rem' }}>
      <div style={{
        maxWidth: '1000px',
        width: '100%',
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
          color: '#ffffff',
          position: 'relative'
        }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', lineHeight: 1.2, marginBottom: '1rem', color: '#ffffff' }}>
            Join ResQ-Route
          </h1>
          <p style={{ fontSize: '1rem', opacity: 0.9, lineHeight: 1.6, maxWidth: '320px', color: '#fef2f2' }}>
            Register to request help, coordinate response efforts, or manage emergency routes in real time.
          </p>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ flex: '1.2', padding: '2.5rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#ffffff' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <Logo size="large" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', marginTop: '0.5rem' }}>Create an Account</h2>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}
          {successMsg && <div className="alert alert-success" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>{successMsg}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.85rem' }}>
            <div>
              <input type="text" name="username" value={formData.username} onChange={handleChange} required placeholder="Username *" style={inputStyle} />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="email" name="email" value={formData.email} onChange={handleChange} required placeholder="Email Address *" style={{ ...inputStyle, flex: 1 }} />
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sendingOtp || !formData.email}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: '#374151',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                  cursor: sendingOtp ? 'not-allowed' : 'pointer'
                }}
              >
                {sendingOtp ? 'Sending...' : otpSent ? 'Resend' : 'Send Code'}
              </button>
            </div>

            <div>
              <input type="text" name="otp_code" maxLength={6} value={formData.otp_code} onChange={handleChange} required placeholder="6-digit OTP code *" style={{ ...inputStyle, letterSpacing: '2px', fontWeight: '600' }} />
            </div>

            <div>
              <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} required placeholder="Full Name *" style={inputStyle} />
            </div>

            <div>
              <select name="role" value={formData.role} onChange={handleChange} required style={inputStyle}>
                <option value="CITIZEN">Citizen</option>
                <option value="RESCUER">Rescuer</option>
                <option value="COORDINATOR">Coordinator</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input type="password" name="password" value={formData.password} onChange={handleChange} required placeholder="Password *" style={inputStyle} />
              <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required placeholder="Confirm Password *" style={inputStyle} />
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
                marginTop: '0.5rem'
              }}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: '#c52222', fontWeight: '600', textDecoration: 'none' }}>
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register