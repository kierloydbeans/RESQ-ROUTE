import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'

const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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
      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
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

      // Store auth data
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

  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #c52222 0%, #a36b16  100%)' }}>
      <div className="card" style={{ maxWidth: '420px', width: '100%', margin: '1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Logo size="large" />
          <p style={{ color: 'var(--color-gray-600)', fontSize: '0.875rem', marginTop: '1rem' }}>
            Disaster Response Management System
          </p>
        </div>
        
        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--color-gray-700)' }}>
              Username
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              className="input"
              placeholder="Enter your username"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--color-gray-700)' }}>
              Password
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="input"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {loading ? (
              <span className="spinner" style={{ marginRight: '0.5rem' }}></span>
            ) : null}
            {loading ? 'Logging in...' : 'Login to Dashboard'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-gray-200)' }}>
          <p style={{ color: 'var(--color-gray-600)', fontSize: '0.875rem' }}>
            Don't have an account?{' '}
            <a href="/register" style={{ color: 'var(--color-primary)', fontWeight: '600', textDecoration: 'none' }}>
              Register now
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
