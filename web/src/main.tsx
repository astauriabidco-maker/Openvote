import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ========================================
// Service Worker Registration (PWA)
// ========================================
// On désactive le SW en dev : le bundle Vite change à chaque HMR et
// le SW cache l'ancien admin.css (cf. incident 2026-07-12 où les
// nouvelles classes .admin-shell-layout/.admin-sidebar/.kpi-band
// étaient invisibles tant que le SW servait l'ancien bundle). En
// dev on veut toujours la dernière version à chaque rechargement.
const isDev = import.meta.env.DEV;
if (!isDev && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('✅ SW registered:', registration.scope);

      // Check for updates every 30 minutes
      setInterval(() => {
        registration.update();
      }, 30 * 60 * 1000);

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              // New version available — notify user
              const banner = document.createElement('div');
              banner.id = 'sw-update-banner';
              banner.innerHTML = `
                <div style="
                  position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10000;
                  background:linear-gradient(135deg,#238636,#2ea043);color:#fff;
                  padding:12px 24px;border-radius:12px;font-size:0.85rem;font-weight:600;
                  box-shadow:0 8px 24px rgba(0,0,0,0.4);display:flex;align-items:center;gap:12px;
                  font-family:Inter,system-ui,sans-serif;cursor:pointer;
                " onclick="window.location.reload()">
                  🔄 Nouvelle version disponible — Cliquez pour mettre à jour
                </div>
              `;
              document.body.appendChild(banner);
            }
          });
        }
      });
    } catch (err) {
      console.warn('⚠️ SW registration failed:', err);
    }
  });
}

// ========================================
// Online/Offline Status Tracking
// ========================================
window.addEventListener('online', () => {
  localStorage.setItem('openvote_last_sync', new Date().toISOString());
  document.dispatchEvent(new CustomEvent('openvote:online'));
});

window.addEventListener('offline', () => {
  document.dispatchEvent(new CustomEvent('openvote:offline'));
});

// Store initial connection time
if (navigator.onLine) {
  localStorage.setItem('openvote_last_sync', new Date().toISOString());
}

// ========================================
// Install Prompt Capture (for "Add to Home Screen")
// ========================================
let deferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Expose globally for the app to use
  (window as any).__pwaInstallPrompt = deferredPrompt;
  document.dispatchEvent(new CustomEvent('openvote:installable'));
});

// ========================================
// Render App
// ========================================
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
