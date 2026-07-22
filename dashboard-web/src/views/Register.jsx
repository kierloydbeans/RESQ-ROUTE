import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'

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

  // --- SEND OTP HANDLER ---
  const handleSendOtp = async () => {
    setError('')
    setSuccessMsg('')

    if (!formData.email) {
      setError('Please enter your email address first.')
      return
    }

    setSendingOtp(true)

    try {
      const response = await fetch('http://localhost:8000/api/v1/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send OTP code.')
      }

      setOtpSent(true)
      setSuccessMsg('Verification code sent to your email! Please check your inbox.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSendingOtp(false)
    }
  }

  // --- REGISTER SUBMIT HANDLER ---
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
      setError('Please enter the 6-digit verification code sent to your email.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('http://localhost:8000/api/v1/auth/register', {
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

  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #c52222 0%, #a36b16 100%)', padding: '1rem' }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <Logo size="large" />
          <p style={{ color: 'var(--color-gray-600)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Create your account
          </p>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        {successMsg && <div className="alert alert-success" style={{ marginBottom: '1rem', backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem' }}>{successMsg}</div>}

        <form onSubmit={handleSubmit}>
          {/* USERNAME */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--color-gray-700)' }}>
              Username *
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              className="input"
              placeholder="Choose a username"
            />
          </div>

          {/* EMAIL & OTP REQUEST */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--color-gray-700)' }}>
              Email *
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="input"
                style={{ flex: 1 }}
                placeholder="your@email.com"
              />
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sendingOtp || !formData.email}
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
              >
                {sendingOtp ? 'Sending...' : otpSent ? 'Resend Code' : 'Send Code'}
              </button>
            </div>
          </div>

          {/* OTP CODE INPUT */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--color-gray-700)' }}>
              Verification Code *
            </label>
            <input
              type="text"
              name="otp_code"
              maxLength={6}
              value={formData.otp_code}
              onChange={handleChange}
              required
              className="input"
              placeholder="6-digit code"
              style={{ letterSpacing: '2px', fontWeight: '600' }}
            />
          </div>

          {/* FULL NAME */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--color-gray-700)' }}>
              Full Name *
            </label>
            <input
              type="text"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              required
              className="input"
              placeholder="Juan Dela Cruz"
            />
          </div>

          {/* ROLE */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--color-gray-700)' }}>
              Role *
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
              className="input"
            >
              <option value="CITIZEN">Citizen</option>
              <option value="RESCUER">Rescuer</option>
              <option value="COORDINATOR">Coordinator</option>
            </select>
          </div>

          {/* PASSWORD */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--color-gray-700)' }}>
              Password *
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="input"
              placeholder="Min. 6 characters"
            />
          </div>

          {/* CONFIRM PASSWORD */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--color-gray-700)' }}>
              Confirm Password *
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              className="input"
              placeholder="Confirm your password"
            />
          </div>

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-gray-200)' }}>
          <p style={{ color: 'var(--color-gray-600)', fontSize: '0.875rem' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: '600', textDecoration: 'none' }}>
              Login here
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Register