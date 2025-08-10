import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'

function isStandalone() {
  const iosStandalone = (window as any).navigator?.standalone === true
  const mqStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches
  return iosStandalone || mqStandalone
}

function isIOS() {
  const ua = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(ua)
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any | null>(null)
  const [installed, setInstalled] = useState<boolean>(false)
  const isMobile = useIsMobile()

  const alreadyInstalled = useMemo(() => isStandalone(), [])

  useEffect(() => {
    setInstalled(alreadyInstalled)

    const onBIP = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onBIP)

    const onInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [alreadyInstalled])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    try {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch {}
  }

  const showGate = isMobile && !installed
  const ios = isIOS()

  if (!showGate) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 max-w-md w-full rounded-xl border bg-card text-card-foreground shadow-lg">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5 text-destructive">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold">Instale o SecretáriaPlus para continuar</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Para receber notificações push e usar todos os recursos, adicione o app à Tela inicial. Sem instalar, o uso permanecerá bloqueado.
              </p>
              {ios ? (
                <ol className="mt-3 list-decimal pl-5 text-sm text-muted-foreground space-y-1">
                  <li>Toque em Compartilhar no Safari.</li>
                  <li>Escolha "Adicionar à Tela de Início".</li>
                  <li>Abra o app pelo atalho criado.</li>
                </ol>
              ) : (
                <div className="mt-3 space-y-2">
                  {deferredPrompt ? (
                    <Button size="sm" onClick={handleInstall}>Instalar agora</Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No Chrome, abra o menu ⋮ e toque em "Adicionar à tela inicial". Depois, abra pelo atalho.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
