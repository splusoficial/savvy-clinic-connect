import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    OneSignal: any;
    OneSignalDeferred: any[];
  }
}

// AppId do OneSignal (o seu está correto)
const ONESIGNAL_APP_ID = 'd8e46df0-d54d-459f-b79d-6e0a36bffdb8';

export function useOneSignal(externalUserId?: string) {
  const initializedRef = useRef(false);
  const readyPromiseRef = useRef<Promise<void> | null>(null);
  const subscriptionIdRef = useRef<string | null>(null);

  /** Carrega o SDK v16 (somente uma vez) */
  const loadSdk = useCallback(async () => {
    if (window.OneSignal || document.querySelector('script[data-onesignal]')) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      s.defer = true;
      s.async = true;
      s.setAttribute('data-onesignal', 'true');
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load OneSignal SDK'));
      document.head.appendChild(s);
    });
  }, []);

  /** Salva/Atualiza a subscription no Supabase */
  const saveSubscriptionToSupabase = useCallback(async (subscriptionId: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const user = session?.session?.user;
      if (!user) {
        console.warn('[OneSignal] Usuário não autenticado; não salvando subscription.');
        return;
      }

      const ua = navigator.userAgent;
      const platform = /Mobile|Android|iP(ad|hone|od)/i.test(ua) ? 'mobile' : 'desktop';
      const device_os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'Desktop';
      const browser =
        /Safari/.test(ua) && !/Chrome/.test(ua) ? 'Safari' :
        /Chrome/.test(ua) ? 'Chrome' : 'Other';

      const { data, error } = await supabase
        .from('user_push_subscriptions')
        .upsert(
          {
            onesignal_player_id: subscriptionId, // usamos o subscriptionId como chave
            user_id: user.id,
            platform,
            device_os,
            browser,
            subscribed: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'onesignal_player_id', ignoreDuplicates: false }
        )
        .select();

      if (error) throw error;
      console.log('[OneSignal] Subscription salva/atualizada:', data);
    } catch (e) {
      console.error('[OneSignal] Erro ao salvar no Supabase:', e);
    }
  }, []);

  /** Inicializa o OneSignal v16, faz login do usuário e configura listeners (uma vez) */
  const init = useCallback(async () => {
    if (initializedRef.current) return;
    await loadSdk();

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    readyPromiseRef.current = new Promise<void>((resolve) => {
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,        // útil em dev/local
            serviceWorkerPath: '/osw/OneSignalSDKWorker.js',
            serviceWorkerParam: { scope: '/osw/' },
            notifyButton: { enable: false },
          });

          // logs (dev)
          try { OneSignal.Debug.setLogLevel?.('trace'); } catch {}

          // === Vincular o usuário (external_id) ===
          // prioridade: externalUserId recebido no hook; fallback: user do Supabase
          try {
            let uid = externalUserId;
            if (!uid) {
              const { data: u } = await supabase.auth.getUser();
              uid = u?.user?.id;
            }
            if (uid) {
              await OneSignal.login(String(uid));
              console.log('[OneSignal] login(external_id):', uid);
            } else {
              console.warn('[OneSignal] Nenhum external_id disponível para login');
            }
          } catch (e) {
            console.warn('[OneSignal] login(external_id) falhou (opcional):', e);
          }

          // Listener: quando a subscription muda (nasce ID, muda optedIn, etc.)
          OneSignal.User.PushSubscription.addEventListener('change', async (evt: any) => {
            const id = evt?.current?.id || null;
            const opted = !!evt?.current?.optedIn;
            console.log('[OneSignal] PushSubscription change:', { id, opted });

            if (id && id !== subscriptionIdRef.current) {
              subscriptionIdRef.current = id;
              await saveSubscriptionToSupabase(id);
            }
          });

          initializedRef.current = true;
          resolve();
          console.log('[OneSignal] init ok');
        } catch (e) {
          console.error('[OneSignal] Erro no init:', e);
          resolve(); // evita travar caso o init falhe
        }
      });
    });
  }, [externalUserId, loadSdk, saveSubscriptionToSupabase]);

  /** Garante que o init terminou antes de seguir */
  const ensureReady = useCallback(async () => {
    if (!initializedRef.current) await init();
    if (readyPromiseRef.current) await readyPromiseRef.current;
  }, [init]);

  /** Pede permissão e conclui a inscrição (opt-in). Retorna o subscriptionId. */
  const enablePush = useCallback(async () => {
    await ensureReady();
    const OS = window.OneSignal;
    if (!OS) throw new Error('OneSignal SDK não carregado');

    // exige usuário autenticado (pra salvar no Supabase)
    const { data: sessRes } = await supabase.auth.getSession();
    if (!sessRes?.session?.user) throw new Error('Usuário não autenticado');

    // fluxo recomendado no v16 (melhor para iOS PWA)
    await OS.Notifications.requestPermission();
    if (!OS.User?.PushSubscription?.optedIn) {
      await OS.User.PushSubscription.optIn();
    }

    // captura o subscriptionId (com polling de 15s por segurança)
    let id: string | null =
      OS.User?.PushSubscription?.id ||
      (await OS.User?.PushSubscription?.getIdAsync?.()) ||
      OS.User?.onesignalId ||
      null;

    const start = Date.now();
    while (!id && Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 500));
      id =
        OS.User?.PushSubscription?.id ||
        (await OS.User?.PushSubscription?.getIdAsync?.()) ||
        OS.User?.onesignalId ||
        null;
    }

    if (!id) throw new Error('Não foi possível obter o ID de inscrição');

    if (id !== subscriptionIdRef.current) {
      subscriptionIdRef.current = id;
      await saveSubscriptionToSupabase(id);
    }
    return id;
  }, [ensureReady, saveSubscriptionToSupabase]);

  // dispara init automaticamente ao usar o hook
  useEffect(() => {
    init();
  }, [init]);

  return {
    /** chame no clique do botão "Ativar notificações" */
    enablePush,
    /** utilitários */
    isReady: () => initializedRef.current,
    getSubscriptionId: () => subscriptionIdRef.current,
  };
}