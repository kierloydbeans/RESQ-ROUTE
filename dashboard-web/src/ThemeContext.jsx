import React, { createContext, useContext, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

const ThemeContext = createContext(null)

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('resq-theme') !== 'light')
  const [isShaderGradient, setIsShaderGradient] = useState(() => localStorage.getItem('resq-gradient-mode') === 'shader')

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    localStorage.setItem('resq-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    localStorage.setItem('resq-gradient-mode', isShaderGradient ? 'shader' : 'fixed')
  }, [isShaderGradient])

  const toggleTheme = () => {
    const nextIsDark = !isDark
    const updateTheme = () => {
      document.documentElement.dataset.theme = nextIsDark ? 'dark' : 'light'
      localStorage.setItem('resq-theme', nextIsDark ? 'dark' : 'light')
      flushSync(() => setIsDark(nextIsDark))
    }

    if (
      document.startViewTransition &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      document.startViewTransition(updateTheme)
    } else {
      updateTheme()
    }
  }
  const toggleShaderGradient = () => setIsShaderGradient((value) => !value)

  return <ThemeContext.Provider value={{ isDark, toggleTheme, isShaderGradient, toggleShaderGradient }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
