import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  ExternalLink, 
  ChevronRight 
} from 'lucide-react';

import { useEffect, useState, useRef } from 'react';
import { useOneSignal } from '@/hooks/useOneSignal';
import { toast } from '@/hooks/use-toast';

const PERSIST_KEY = 'push_last_known_enabled';

const Dashboard = () => {
  const { showNotificationBanner, dismissNotificationBanner } = useAuth();
  
  const { enablePush, isReady } = useOneSignal();

  const initialPersistedEnabled = (() => {
    try {
      const persisted = typeof localStorage !== 'undefined' && localStorage.getItem(PERSIST_KEY) === '1';
      const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
      return Boolean(persisted && perm !== 'denied');
    } catch {
      return false;
    }
  })();

  const [oneSignalReady, setOneSignalReady] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState<boolean>(initialPersistedEnabled);


  // Dialog para reativação quando o sistema bloqueia notificações
  const [reauthDialogOpen, setReauthDialogOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activating, setActivating] = useState(false);
  const [checking, setChecking] = useState(false);
  // Detecção básica de plataforma
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || ((navigator as any)?.platform === 'MacIntel' && (navigator as any)?.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);

  // Estados auxiliares estáveis
  const hasEverEnabled = useRef(initialPersistedEnabled);
  const unstableDisabledCount = useRef(0);

  const computeEnabled = async () => {
    try {
      const OS = (window as any).OneSignal;
      const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      const opted = !!OS?.User?.PushSubscription?.optedIn;
      const id = OS?.User?.PushSubscription?.id || (await OS?.User?.PushSubscription?.getIdAsync?.());
      return Boolean(granted && opted && id);
    } catch {
      return false;
    }
  };

  // Aguarda até que o push esteja realmente habilitado (ou timeout)
  const waitForEnabled = async (timeoutMs = 12000) => {
    const start = Date.now();
    let enabled = await computeEnabled();
    while (!enabled && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 300));
      enabled = await computeEnabled();
    }
    return enabled;
  };
  useEffect(() => {
    let t: any;
    const poll = () => {
      if (isReady()) {
        setOneSignalReady(true);
      } else {
        t = setTimeout(poll, 100);
      }
    };
    poll();
    return () => clearTimeout(t);
  }, [isReady]);

  const notifications = [
    {
      id: 1,
      type: 'emergency',
      title: 'Emergência Médica',
      message: 'URGENTE: Maik • (62) 93434-191 relatou uma emergência médica/complicação',
      time: '1h atrás',
      priority: 'high'
    }
  ];

  // Monitor push status and re-show banner if disabled
  useEffect(() => {
    let permissionStatus: any;
    let intervalId: any;

    const getOS = () => (window as any).OneSignal;

    const compute = async () => {
      try {
        const OS = getOS();
        const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
        if (!granted) {
          unstableDisabledCount.current = 0;
          hasEverEnabled.current = false;
          try { localStorage.setItem(PERSIST_KEY, '0'); } catch {}
          setIsPushEnabled(false);
          return;
        }
        if (!oneSignalReady) {
          // SDK ainda carregando: não altere o estado para evitar falso negativo
          return;
        }
        const opted = !!OS?.User?.PushSubscription?.optedIn;
        const id = OS?.User?.PushSubscription?.id || (await OS?.User?.PushSubscription?.getIdAsync?.());
        const enabled = Boolean(opted && id);
        if (enabled) {
          hasEverEnabled.current = true;
          unstableDisabledCount.current = 0;
          try { localStorage.setItem(PERSIST_KEY, '1'); } catch {}
          setIsPushEnabled(true);
          return;
        }
        // Não habilitado neste instante
        if (hasEverEnabled.current) {
          // Requer algumas leituras consecutivas para considerar realmente desligado
          unstableDisabledCount.current += 1;
          if (unstableDisabledCount.current >= 5) {
            try { localStorage.setItem(PERSIST_KEY, '0'); } catch {}
            setIsPushEnabled(false);
            hasEverEnabled.current = false;
          }
        } else {
          // Nunca habilitou ainda: mantenha como está (normalmente false)
          setIsPushEnabled(false);
        }
      } catch (e) {
        // Ignore erros transitórios
      }
    };

    const onSubChange = () => { void compute(); };

    // Setup listeners once OneSignal is ready
    if (oneSignalReady) {
      try {
        const OS = getOS();
        OS?.User?.PushSubscription?.addEventListener?.('change', onSubChange);
      } catch {}
      void compute();
    } else {
      // Even before ready, compute basic permission state
      void compute();
    }

    // Listen to browser permission changes (when supported)
    try {
      if ('permissions' in navigator && (navigator as any).permissions?.query) {
        (navigator as any).permissions
          .query({ name: 'notifications' as any })
          .then((status: any) => {
            permissionStatus = status;
            status.onchange = () => { void compute(); };
          })
          .catch(() => {});
      }
    } catch {}

    // Re-check on visibility/focus
    const onFocusOrVisibility = () => { void compute(); };
    window.addEventListener('focus', onFocusOrVisibility);
    document.addEventListener('visibilitychange', onFocusOrVisibility);

    // Low-frequency polling as a safety net
    intervalId = setInterval(() => { void compute(); }, 5000);

    return () => {
      try {
        const OS = getOS();
        OS?.User?.PushSubscription?.removeEventListener?.('change', onSubChange);
      } catch {}
      if (permissionStatus) permissionStatus.onchange = null;
      window.removeEventListener('focus', onFocusOrVisibility);
      document.removeEventListener('visibilitychange', onFocusOrVisibility);
      clearInterval(intervalId);
    };
  }, [oneSignalReady]);


const handleNotificationPermission = async () => {
  try {
    const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';

    // Se já está bloqueado pelo sistema, abre o modal instantaneamente
    if (perm === 'denied') {
      setReauthDialogOpen(true);
      return;
    }
    // Em iOS, às vezes o perm é "granted" mas o sistema está bloqueado; se OneSignal já estiver pronto
    // e não estiver optedIn, abrimos o modal imediatamente
    if (isIOS && oneSignalReady) {
      try {
        const opted = !!(window as any)?.OneSignal?.User?.PushSubscription?.optedIn;
        if (perm === 'granted' && !opted) {
          setReauthDialogOpen(true);
          return;
        }
      } catch {}
    }

    // Fluxo de ativação: mostrar "verificando" somente durante a ação do usuário
    setActivating(true);
    setChecking(true);

    const subscriptionId = await enablePush().catch(() => null);
    const enabled = await waitForEnabled();

    if (enabled && subscriptionId) {
      setIsPushEnabled(true);
      hasEverEnabled.current = true;
      unstableDisabledCount.current = 0;
      try { localStorage.setItem(PERSIST_KEY, '1'); } catch {}
      dismissNotificationBanner();
      setChecking(false);
      setActivating(false);
      return;
    }

    // Se chegou aqui e não habilitou, abre o modal
    setReauthDialogOpen(true);
  } catch (e) {
    console.error('[Dashboard] Falha ao ativar notificações:', e);
    const p = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    if (p === 'denied') {
      setReauthDialogOpen(true);
    }
  } finally {
    setChecking(false);
    setActivating(false);
  }
};

const verifyAfterSettings = async () => {
  setVerifying(true);
  setChecking(true);
  try {
    const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    if (perm !== 'denied') {
      try { await enablePush(); } catch {}
    }
    const enabled = await waitForEnabled();
    setIsPushEnabled(enabled);
    if (enabled) {
      hasEverEnabled.current = true;
      unstableDisabledCount.current = 0;
      try { localStorage.setItem(PERSIST_KEY, '1'); } catch {}
      dismissNotificationBanner();
      setReauthDialogOpen(false);
    } else {
      toast({
        title: 'Ainda não foi ativado',
        description: 'Confira os passos e tente novamente. Assim que ativar, atualizaremos a tela automaticamente.',
      });
    }
  } finally {
    setVerifying(false);
    setChecking(false);
  }
};

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="p-4 space-y-4">
        {/* Banner de Notificações */}
        {!isPushEnabled && !activating && !checking && (
          <Card className="bg-accent/10 border-accent">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-primary">🔔 Ative as Notificações</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Para que o sistema funcione corretamente, você precisa ativar as notificações. 
                    Sem elas, você pode perder emergências importantes!
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button 
                      onClick={handleNotificationPermission}
                      className="bg-accent hover:bg-accent/90 text-primary"
                      size="sm"
                      aria-busy={!oneSignalReady}
                    >
                      Ativar Agora
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Painel de Status de Notificações */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              {checking ? (
                <>
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                  <span className="text-sm font-medium">Verificando...</span>
                </>
              ) : (
                <>
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${isPushEnabled ? 'bg-success' : 'bg-destructive'}`} />
                  <span className="text-sm font-medium">
                    {isPushEnabled ? 'Notificações Ligadas' : 'Notificações Desligadas'}
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Central - texto informativo */}
        <Card>
          <CardContent className="p-6 space-y-3">
            <h1 className="text-lg font-semibold text-foreground">
              Esta é sua central de notificações SecretáriaPlus.
            </h1>
            <p className="text-sm text-muted-foreground">
              Com este app instalado, você recebe avisos da IA sobre as conversas automaticamente.
            </p>
            <p className="text-sm text-muted-foreground">
              Basta aceitar as notificações: quando a IA detectar que precisa da sua atenção, você será notificado pelo celular.
            </p>
            <p className="text-sm">
              💡 Dica: Clique na notificação para abrir a conversa diretamente no WhatsApp
            </p>
          </CardContent>
        </Card>


        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
              Acessar Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-4">
              Acesse o sistema completo para editar sua IA, procedimentos, pausar conversas e muito mais.
            </p>
            <Button variant="outline" className="w-full justify-between" onClick={() => window.open('https://web.secretariaplus.com.br', '_blank', 'noopener,noreferrer')}>
              Acessar Sistema
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Diálogo de reativação de notificações */}
      <Dialog open={reauthDialogOpen} onOpenChange={setReauthDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar notificações no sistema</DialogTitle>
            <DialogDescription>
              Detectamos que as notificações estão bloqueadas pelo sistema. Siga os passos abaixo e depois toque em "Verificar".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {isIOS ? (
              <ul className="list-disc pl-5 space-y-1">
                <li>Abra Ajustes do iPhone</li>
                <li>Notificações {'>'} encontre “SecretáriaPlus”</li>
                <li>Ative “Permitir Notificações”</li>
                <li>Se usar Safari: Ajustes {'>'} Safari {'>'} Notificações {'>'} Permitir</li>
              </ul>
            ) : (
              <ul className="list-disc pl-5 space-y-1">
                <li>No navegador, toque no ícone de cadeado na barra de endereço</li>
                <li>Permissões {'>'} Notificações {'>'} Permitir</li>
                <li>Se for app instalado (Android): Configurações {'>'} Apps {'>'} SecretáriaPlus {'>'} Notificações</li>
              </ul>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setReauthDialogOpen(false)}>Fechar</Button>
            <Button onClick={verifyAfterSettings} disabled={verifying}>
              {verifying ? 'Verificando...' : 'Já ativei, verificar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default Dashboard;