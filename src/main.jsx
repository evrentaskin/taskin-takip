import React from 'react'
import ReactDOM from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import App from './App'
import './styles.css'

const theme = createTheme({
  palette: {
    primary: { main: '#163f5f', dark: '#0d2c45', light: '#dceaf0' },
    secondary: { main: '#198764', dark: '#0f654a', light: '#dcefe8' },
    success: { main: '#198764' },
    background: { default: '#c9d9d3', paper: '#edf5f2' },
    text: { primary: '#102e27', secondary: '#405f56' }
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Segoe UI Variable", "Segoe UI", Arial, sans-serif',
    h4: { fontWeight: 850, letterSpacing: '-0.03em' },
    h5: { fontWeight: 850, letterSpacing: '-0.025em' },
    h6: { fontWeight: 820, letterSpacing: '-0.015em' },
    button: { textTransform: 'none', fontWeight: 800 }
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
)


if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
