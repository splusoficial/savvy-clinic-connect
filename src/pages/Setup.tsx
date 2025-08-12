import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useOneSignal } from '@/hooks/useOneSignal';
import { persistAuthBackup } from '@/lib/auth-persist';
import appleShareIcon from '@/assets/apple-share-icon.png';
import iphoneTutorial from '@/assets/iphone-tutorial.webp';
import logoBase from '@/assets/logo-base.png';
import loaderWebp from '@/assets/loader.webp';
import logoSvg from '@/assets/logo.svg';

const FUNCTION_NAME = 'generate-link';
const STORAGE_KEY = 'install_code';
const COOKIE_KEY = 'install_code';
const CACHE_NAME = 'install-bridge';
const CACHE_REQ = '/__install_code';

// IndexedDB para install_code
const IDB_DB = 'sp-install-db';
const IDB_STORE = 'kv';
const IDB_KEY = 'install_code';

function openInstallIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB open error'));
  });
}

async function idbSetInstall(value: { code: string; ts: number }) {
  const db = await openInstallIDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('IDB put error'));
  });
  db.close();
}

async function idbGetInstall(): Promise<{ code: string; ts: number } | undefined> {
  const db = await openInstallIDB();
  const out = await new Promise<{ code: string; ts: number } | undefined>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result as any);
    req.onerror = () => reject(req.error || new Error('IDB get error'));
  });
  db.close();
  return out;
}

async function writeInstallCodeToIDB(code: string) {
  await idbSetInstall({ code, ts: Date.now() });
}

async function readInstallCodeFromIDB(maxAgeMs = 90 * 24 * 60 * 60 * 1000): Promise<string | null> {
  try {
    const rec = await idbGetInstall();
    if (!rec?.code) return null;
    if (typeof rec.ts === 'number' && Date.now() - rec.ts > maxAgeMs) return null;
    return String(rec.code);
  } catch {
    return null;
  }
}

// Cookie helpers
function setCookie(name: string, value: string, minutes = 30) {
  const expires = new Date(Date.now() + minutes * 60_000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax`;
}
function getCookie(name: string): string | null {
  try {
    const parts = (document.cookie || '').split('; ');
    for (const part of parts) {
      const [k, ...rest] = part.split('=');
      if (k === name) return decodeURIComponent(rest.join('='));
    }
    return null;
  } catch {
    return null;
  }
}
function deleteCookie(name: string) {
  document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Path=/; SameSite=Lax`;
}

// Cache Storage
async function writeInstallCodeToCache(code: string) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const payload = { code, ts: Date.now() };
    await cache.put(CACHE_REQ, new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    }));
  } catch {}
}
async function readAndConsumeInstallCodeFromCache(maxAgeMs = 10 * 60 * 1000): Promise<string | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(CACHE_REQ);
    if (!res) return null;
    const { code, ts } = await res.json();
    await cache.delete(CACHE_REQ);
    if (!code) return null;
    if (typeof ts === 'number' && Date.now() - ts > maxAgeMs) return null;
    return String(code);
  } catch {
    return null;
  }
}

// CORREÇÃO PRINCIPAL: Detectar PWA com valor inicial correto
function useIsInstalled() {
  // Função de detecção que funciona síncronamente
  const checkInstalled = () => {
    if (typeof window === 'undefined') return false;
    
    // iOS Safari standalone
    if ((navigator as any).standalone === true) return true;
    
    // Padrão PWA (Android/Chrome/Edge)
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    
    // iOS PWA via URL (fallback adicional)
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    
    return false;
  };

  // IMPORTANTE: Inicializa com o valor correto já no primeiro render
  const [installed, setInstalled] = useState(() => checkInstalled());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Revalida após montagem para garantir
    const isInstalled = checkInstalled();
    setInstalled(isInstalled);
    setInitialized(true);

    // Listener para mudanças (raro mas possível)
    const handler = () => {
      setInstalled(checkInstalled());
    };
    
    window.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    
    // Recheck após um pequeno delay (iOS às vezes demora)
    const timer = setTimeout(() => {
      setInstalled(checkInstalled());
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, []);

  return { installed, initialized };
}

// Detectar iOS
function useIsIOS() {
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    const checkIOS = () => {
      const ua = navigator.userAgent;
      return /iPad|iPhone|iPod/.test(ua) || 
             ((navigator as any)?.platform === 'MacIntel' && (navigator as any)?.maxTouchPoints > 1);
    };
    setIsIOS(checkIOS());
  }, []);
  return isIOS;
}

// Detectar Android
function useIsAndroid() {
  const [isAndroid, setIsAndroid] = useState(false);
  useEffect(() => {
    const checkAndroid = () => {
      const ua = navigator.userAgent;
      return /Android/.test(ua);
    };
    setIsAndroid(checkAndroid());
  }, []);
  return isAndroid;
}

const Setup: React.FC = () => {
  const navigate = useNavigate();
  const { installed, initialized } = useIsInstalled();
  const isIOS = useIsIOS();
  const isAndroid = useIsAndroid();
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const exchangingRef = useRef(false);
  const processedRef = useRef(false); // Evita processamento duplo

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const existingCode = params.get('code');

  const { isReady } = useOneSignal();

  // Preload assets
  useEffect(() => {
    try {
      const assets = [loaderWebp, logoSvg, appleShareIcon, iphoneTutorial, logoBase];
      assets.forEach((src) => {
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = src;
      });
    } catch {}
  }, []);

  const extendUntilPushReady = async (timeoutMs = 10000) => {
    const phrases = [
      'Configurando seu Aplicativo.',
      'Puxando seus dados',
      'Só um minutinho...',
      'Quase lá'
    ];
    let i = 0;
    setStatus(phrases[0]);
    const interval = setInterval(() => {
      i = (i + 1) % phrases.length;
      setStatus(phrases[i]);
    }, 2000);
    const start = Date.now();
    const minMs = 4000;
    try {
      while (!isReady() && Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 300));
      }
      const elapsed = Date.now() - start;
      if (elapsed < minMs) {
        await new Promise((r) => setTimeout(r, minMs - elapsed));
      }
    } finally {
      clearInterval(interval);
    }
  };

  const exchangeInstall = async (theCode: string) => {
    const search = new URLSearchParams({
      flow: 'exchange-install',
      code: theCode,
    }).toString();

    const { data, error } = await supabase.functions.invoke(`${FUNCTION_NAME}?${search}`, { body: {} });
    if (error || !data?.ok || !(data as any)?.email || !(data as any)?.email_otp) {
      throw new Error((error as any)?.message || (data as any)?.error || 'Falha ao trocar code por OTP');
    }

    const email = (data as any).email as string;
    const token = (data as any).email_otp as string;

    const { error: vErr } = await (supabase.auth as any).verifyOtp({ email, token, type: 'email' });
    if (vErr) throw vErr;

    // Aguarda sessão persistir
    for (let i = 0; i < 40; i++) {
      const { data: { session } } = await (supabase.auth as any).getSession();
      if (session) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // Backup dos tokens
    try {
      const { data: { session } } = await (supabase.auth as any).getSession();
      if (session) await persistAuthBackup(session);
    } catch {}
  };

  useEffect(() => {
    // IMPORTANTE: Aguarda a detecção de PWA estar inicializada
    if (!initialized) return;
    
    // Evita processamento duplo
    if (processedRef.current) return;

    (async () => {
      processedRef.current = true;
      setError('');

      // Verifica sessão existente primeiro
      try {
        const { data: { session } } = await (supabase.auth as any).getSession();
        if (session) {
          await persistAuthBackup(session);
          navigate('/');
          return;
        }
      } catch {}

      // CASO 1: PWA instalado com código na URL
      if (installed && existingCode && !exchangingRef.current) {
        try {
          exchangingRef.current = true;
          setStatus('Ativando seu acesso...');
          await writeInstallCodeToIDB(existingCode);
          await exchangeInstall(existingCode);
          try { localStorage.removeItem(STORAGE_KEY); } catch {}
          try { deleteCookie(COOKIE_KEY); } catch {}
          await extendUntilPushReady(10000);
          navigate('/');
          return;
        } catch (e: any) {
          console.error('exchange (installed + existingCode) error', e);
          setError(e?.message || 'Não foi possível ativar seu acesso.');
          setStatus('');
          return;
        }
      }

      // CASO 2: PWA instalado SEM código na URL - buscar no storage
      if (installed && !existingCode && !exchangingRef.current) {
        try {
          setStatus('Verificando dados de ativação…');
          
          // Busca código em todos os storages
          const fromIDB = await readInstallCodeFromIDB();
          const fromCache = await readAndConsumeInstallCodeFromCache();
          const fromCookie = getCookie(COOKIE_KEY);
          const fromLS = localStorage.getItem(STORAGE_KEY);
          
          const candidate = fromIDB || fromCache || fromCookie || fromLS;

          if (candidate) {
            exchangingRef.current = true;
            setStatus('Ativando seu acesso...');
            await writeInstallCodeToIDB(candidate);
            await exchangeInstall(candidate);
            try { localStorage.removeItem(STORAGE_KEY); } catch {}
            try { deleteCookie(COOKIE_KEY); } catch {}
            await extendUntilPushReady(10000);
            navigate('/');
            return;
          }

          // Nenhum código encontrado
          setStatus('');
          setError('App instalado mas sem código de ativação. Por favor, abra novamente o link de configuração recebido.');
          return;
        } catch (e: any) {
          console.error('exchange (installed no code) error', e);
          setError(e?.message || 'Não foi possível ativar seu acesso.');
          setStatus('');
          return;
        }
      }

      // CASO 3: NÃO instalado e SEM código - criar novo código
      if (!installed && !existingCode) {
        const email = params.get('email');
        const name = params.get('name') || undefined;
        const wh_id = params.get('wh_id') || undefined;
        const inst = params.get('inst') || undefined;

        if (!email) {
          setError('Parâmetro "email" é obrigatório para preparar a instalação.');
          return;
        }

        try {
          setGenerating(true);
          setStatus('Preparando instalação...');
          const s = new URLSearchParams({ flow: 'create-install', email });
          if (name) s.set('name', name);
          if (wh_id) s.set('wh_id', String(wh_id));
          if (inst) s.set('inst', String(inst));
          s.set('redirect_to', `${window.location.origin}/`);

          const { data, error } = await supabase.functions.invoke(`${FUNCTION_NAME}?${s.toString()}`, { body: {} });
          if (error || !data?.ok || !(data as any)?.code) {
            throw new Error((error as any)?.message || (data as any)?.error || 'Falha ao gerar code');
          }

          const newCode = (data as any).code as string;
          setCode(newCode);

          // Salva em todos os storages
          await writeInstallCodeToIDB(newCode);
          await writeInstallCodeToCache(newCode);
          try { setCookie(COOKIE_KEY, newCode, 30); } catch {}
          try { localStorage.setItem(STORAGE_KEY, newCode); } catch {}

          // Fixa URL com código
          const newUrl = `${window.location.origin}/setup?code=${encodeURIComponent(newCode)}`;
          window.location.replace(newUrl);
          return;
        } catch (e: any) {
          console.error('create-install error', e);
          setError(e?.message || 'Não foi possível preparar a instalação.');
          setStatus('');
          setGenerating(false);
          return;
        }
      }

      // CASO 4: NÃO instalado MAS com código na URL (aguardando instalação)
      if (!installed && existingCode) {
        // Apenas mantém o código visível, esperando o usuário instalar
        setCode(existingCode);
      }
    })();
  }, [initialized, installed, existingCode]); // Dependências controladas

  // Loading screen para PWA
  if (installed && status && !error) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center overflow-hidden" style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#fff' }}>
        <img 
          src={loaderWebp} 
          alt="Carregando"
          loading="eager"
          fetchPriority="high"
          className="w-[100px] h-[100px] object-contain"
        />
      </div>
    );
  }

  // Loading screen para geração de código
  if (!installed && !error && !existingCode && generating) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center overflow-hidden" style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#fff' }}>
        <img 
          src={loaderWebp} 
          alt="Carregando"
          loading="eager"
          fetchPriority="high"
          className="w-[100px] h-[100px] object-contain"
        />
      </div>
    );
  }

  // Aguardando inicialização da detecção de PWA
  if (!initialized && !error) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center overflow-hidden" style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#fff' }}>
        <img 
          src={loaderWebp} 
          alt="Carregando"
          loading="eager"
          fetchPriority="high"
          className="w-[100px] h-[100px] object-contain"
        />
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col items-center justify-center p-4 space-y-3 overflow-hidden" style={{ height: '100vh', overflow: 'hidden' }}>
      <div className="flex justify-center mb-1">
        <img 
          src={logoBase} 
          alt="Logo" 
          className="h-14 w-auto object-contain"
        />
      </div>

      <div className="w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-sm p-5">
        {!error ? (
          <>
            <h1 className="text-lg font-semibold text-center mb-4">
              {installed ? 'Ativando acesso…' : 'Adicione o app à Tela de Início'}
            </h1>

            <div className="flex items-start gap-3">
              {installed ? (
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              )}
              <div className="flex-1">
                {!installed ? (
                  isIOS ? (
                    <div className="text-sm text-foreground space-y-2">
                      <p className="font-medium">
                        Importante: Para continuar, adicione esta página à tela de início do iPhone.
                      </p>
                      <div className="space-y-1">
                        <p className="flex items-center gap-1">
                          1. Toque em{' '}
                          <img 
                            src={appleShareIcon} 
                            alt="Ícone de compartilhar" 
                            className="inline-block w-4 h-4 object-contain mx-1"
                          />
                          {' '}na barra de menus.
                        </p>
                        <p>2. Role para baixo a lista de opções e toque em "Adicionar à Tela de Início".</p>
                        <p>3. Após adicionar, abra o app apenas pelo atalho criado na sua tela de início</p>
                      </div>
                    </div>
                  ) : isAndroid ? (
                    <div className="text-sm text-foreground space-y-2">
                      <p className="font-medium">
                        Para continuar, adicione esta página à tela de início do Android.
                      </p>
                      <div className="space-y-1">
                        <p>1. Toque no menu (três pontos) no canto superior direito do navegador.</p>
                        <p>2. Procure e toque em "Adicionar à tela inicial" ou "Instalar app".</p>
                        <p>3. Após adicionar, abra o app apenas pelo atalho criado na sua tela de início</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Adicione esta página à tela de início do seu dispositivo. Ao abrir pelo atalho, o acesso será ativado automaticamente.
                    </p>
                  )
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{status || 'Aguardando…'}</span>
                    </div>
                  </div>
                )}
                {code && !installed && (
                  <p className="mt-2 break-all text-xs">
                    Código de ativação preparado.
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="flex items-start gap-3 mb-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <h2 className="text-base font-semibold">Ops</h2>
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.history.back()}>Voltar</Button>
              <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
            </div>
          </div>
        )}
      </div>

      {!installed && isIOS && (
        <div className="w-full max-w-xs mt-2">
          <img 
            src={iphoneTutorial} 
            alt="Tutorial de instalação no iPhone" 
            className="w-full h-auto object-contain"
            style={{ transform: 'scale(1.08)' }}
          />
        </div>
      )}
    </div>
  );
};

export default Setup;