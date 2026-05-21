import React, { useState, useEffect } from 'react'
import { Download, X, Wifi, WifiOff } from 'lucide-react'

// ── Offline indicator ─────────────────────────────────────────────────────────
export const OfflineIndicator: React.FC = () => {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (online) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 bg-amber-500 text-white text-xs font-black uppercase tracking-widest">
      <WifiOff className="w-3.5 h-3.5" />
      Sem conexão — modo offline
    </div>
  )
}

// ── PWA Install Prompt ────────────────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('pwa-install-dismissed') === '1'
  )

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!deferredPrompt || dismissed) return null

  const handleInstall = async () => {
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
    else handleDismiss()
  }

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', '1')
    setDeferredPrompt(null)
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-start gap-3 animate-slide-up">
      <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
        <Download className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-slate-900">Instalar OrçaCloud</p>
        <p className="text-xs text-slate-500 mt-0.5">Acesse diretamente da tela inicial, sem abrir o navegador.</p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleInstall}
            className="flex-1 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition-colors"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors"
          >
            Depois
          </button>
        </div>
      </div>
      <button onClick={handleDismiss} className="text-slate-300 hover:text-slate-500 shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
