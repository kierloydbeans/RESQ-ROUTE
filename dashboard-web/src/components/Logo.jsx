import React from 'react'

const Logo = ({ size = 'medium' }) => {
  const sizes = {
    small: { height: '32px' },
    medium: { height: '48px' },
    large: { height: '64px' }
  }

  const currentSize = sizes[size] || sizes.medium

  return (
    <img 
      src="/resq_logo_with_label.png" 
      alt="ResQ-Route Logo" 
      style={{ 
        height: currentSize.height,
        width: 'auto',
        objectFit: 'contain'
      }}
    />
  )
}

export default Logo
