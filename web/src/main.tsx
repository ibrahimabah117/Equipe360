import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { DEMO } from './lib/supabase'
import { installFakeGeolocation } from './demo/store'

if (DEMO) installFakeGeolocation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
