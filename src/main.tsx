import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { detectCrash } from './lib/aiPlan'

// Muss vor dem ersten Rendern laufen: erkennt, ob die Seite mitten in einem
// KI-Schritt gestorben ist, und stuft dann auf ein sparsameres Modell herunter.
detectCrash()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline-Fähigkeit nur im fertigen Build – im Entwicklungsmodus würde der
// Cache sonst ständig alte Dateien ausliefern.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* ohne Service Worker läuft die App trotzdem, nur nicht offline */
    })
  })
}
