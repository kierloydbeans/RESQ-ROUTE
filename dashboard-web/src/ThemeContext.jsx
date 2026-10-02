import React, { createContext, useContext, useEffect, useState } from 'react'

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

  const toggleTheme = () => setIsDark((value) => !value)
  const toggleShaderGradient = () => setIsShaderGradient((value) => !value)

  return <ThemeContext.Provider value={{ isDark, toggleTheme, isShaderGradient, toggleShaderGradient }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
