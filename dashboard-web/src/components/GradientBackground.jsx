import React, { Component, useEffect, useState } from 'react'

class ShaderErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

const ShaderLayer = ({ animated }) => {
  const [shaderModule, setShaderModule] = useState(null)

  useEffect(() => {
    let active = true
    import('@shadergradient/react')
      .then((module) => {
        if (active) setShaderModule(module)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  if (!shaderModule) return null

  const { ShaderGradient, ShaderGradientCanvas } = shaderModule

  return (
    <ShaderErrorBoundary>
      <ShaderGradientCanvas
        className="gradient-shader-canvas"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        pointerEvents="none"
        pixelDensity={0.65}
        powerPreference="low-power"
      >
        <ShaderGradient
          type="plane"
          animate={animated ? 'on' : 'off'}
          uSpeed={0.18}
          uStrength={1.2}
          uDensity={1.2}
          uFrequency={2}
          uAmplitude={1.4}
          color1="#c52222"
          color2="#a36b16"
          color3="#f4b21b"
          brightness={1.1}
          grain="off"
          lightType="3d"
          envPreset="city"
          zoomOut={false}
          enableTransition
        />
      </ShaderGradientCanvas>
    </ShaderErrorBoundary>
  )
}

const GradientBackground = ({ animated = false, shader = false, className = '' }) => (
  <div className={`gradient-background ${animated ? 'gradient-background-shader' : shader ? 'gradient-background-static-shader' : 'gradient-background-fixed'} ${className}`.trim()} aria-hidden="true">
    {(animated || shader) && <ShaderLayer animated={animated} />}
  </div>
)

export default GradientBackground
