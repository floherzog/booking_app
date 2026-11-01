import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from './lib/theme'
import { initWindowChrome } from './lib/windowChrome'
import './lib/dateOrder' // applies the stored date order before anything renders
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'

initTheme()
initWindowChrome()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
