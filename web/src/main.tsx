import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { DEMO } from './lib/supabase'
import { installFakeGeolocation } from './demo/store'
import ThemeSwitcher, { applyTheme, readTheme } from './demo/ThemeSwitcher'

if (DEMO) {
  installFakeGeolocation()
  applyTheme(readTheme())
  void import('@fontsource-variable/space-grotesk')
  void import('@fontsource-variable/plus-jakarta-sans')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {DEMO && <ThemeSwitcher />}
  </StrictMode>,
)
