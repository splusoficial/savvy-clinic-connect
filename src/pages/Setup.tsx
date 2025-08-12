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

// NOVA: Chave para marcar que já tentamos recuperar
const RECOVERY_ATTEMPT_KEY = 'install_code_recovery_attempted';

// IndexedDB para install_code
const IDB_DB = 'sp-install-db';
const IDB_STORE = 'kv';
const IDB_KEY = 'install_code';

// Debug helper
const debugLog = (msg: string, data?: any) => {
  console.log(`[Setup] ${msg}`, data || '');
};

function openInstallIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IDB open error'));
    } catch (e) {
      reject(e);
    }
  });
}

async function idbSetInstall(value: { code: string; ts: number }) {
  try {
    const db = await openInstallIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(value, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('IDB put error'));
    });
    db.close();
    debugLog('IDB: Código salvo', value.code);
  } catch (e) {
    debugLog('IDB: Erro ao salvar', e);
  }
}

async function idbGetInstall(): Promise<{ code: string; ts: number } | undefined> {
  try {
    const db = await openInstallIDB();
    const out = await new Promise<{ code: string; ts: number } | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result as any);
      req.onerror = () => reject(req.error || new Error('IDB get error'));
    });
    db.close();
    debugLog('IDB: Código lido', out?.code);
    return out;
  } catch (e) {
    debugLog('IDB: Erro ao ler', e);
    return undefined;
  }
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
function setCookie(name: string, value: string, days = 7) {
  try {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=None; Secure`;
    debugLog('Cookie: Salvo', value);
  } catch (e) {
    debugLog('Cookie: Erro ao salvar', e);
  }
}

function getCookie(name: string): string | null {
  try {
    const parts = (document.cookie || '').split('; ');
    for (const part of parts) {
      const [k, ...rest] = part.split('=');
      if (k === name) {
        const val = decodeURIComponent(rest.join('='));
        debugLog('Cookie: Lido', val);
        return val;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function deleteCookie(name: string) {
  try {
    document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Path=/; SameSite=None; Secure`;
  } catch {}
}

// Cache Storage
async function writeInstallCodeToCache(code: string) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const payload = { code, ts: Date.now() };
    await cache.put(CACHE_REQ, new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    }));
    debugLog('Cache: Salvo', code);
  } catch (e) {
    debugLog('Cache: Erro ao salvar', e);
  }
}

async function readAndConsumeInstallCodeFromCache(maxAgeMs = 90 * 24 * 60 * 60 * 1000): Promise<string | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(CACHE_REQ);
    if (!res) return null;
    const { code, ts } = await res.json();
    // NÃO deletar mais para permitir múltiplas tentativas
    // await cache.delete(CACHE_REQ); 
    if (!code) return null;
    if (typeof ts === 'number' && Date.now() - ts > maxAgeMs) return null;
    debugLog('Cache: Lido', code);
    return String(code);
  } catch (e) {
    debugLog('Cache: Erro ao ler', e);
    return null;
  }
}

// LocalStorage helpers
function setLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    debugLog('LS: Salvo', value);
  } catch (e) {
    debugLog('LS: Erro ao salvar', e);
  }
}

function getLocalStorage(key: string): string | null {
  try {
    const val = localStorage.getItem(key);
    if (val) debugLog('LS: Lido', val);
    return val;
  } catch {
    return null;
  }
}

// SessionStorage como fallback adicional
function setSessionStorage(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
    debugLog('Session: Salvo', value);
  } catch (e) {
    debugLog('Session: Erro ao salvar', e);
  }
}

function getSessionStorage(key: string): string | null {
  try {
    const val = sessionStorage.getItem(key);
    if (val) debugLog('Session: Lido', val);
    return val;
  } catch {
    return null;
  }
}

// Detectar PWA com valor inicial correto
function useIsInstalled() {
  const checkInstalled = () => {
    if (typeof window === 'undefined') return false;
    
    // iOS Safari standalone
    if ((navigator as any).standalone === true) return true;
    
    // Padrão PWA
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    
    // iOS 18 às vezes usa minimal-ui
    if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) {
      // Verifica se veio de uma instalação (não tem referrer do Safari)
      if (!document.referrer || !document.referrer.includes('safari')) {
        return true;
      }
    }
    
    return false;
  };

  const [installed, setInstalled] = useState(() => checkInstalled());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const isInstalled = checkInstalled();
    setInstalled(isInstalled);
    setInitialized(true);
    debugLog('PWA detectado?', isInstalled);

    const handler = () => {
      const newState = checkInstalled();
      if (newState !== installed) {
        debugLog('PWA estado mudou para', newState);
        setInstalled(newState);
      }
    };
    
    window.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    
    const timer = setTimeout(() => {
      setInstalled(checkInstalled());
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, [installed]);

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
  const processedRef = useRef(false);

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
    debugLog('Iniciando troca do código', theCode);
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
    debugLog('OTP recebido para', email);

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
    
    debugLog('Login concluído com sucesso');
  };

  // Função para salvar código em TODOS os storages
  const saveCodeEverywhere = async (codeToSave: string) => {
    debugLog('Salvando código em todos os storages', codeToSave);
    
    // Limpa códigos antigos primeiro (importante para reinstalações)
    try {
      const oldCode = await findCodeAnywhere();
      if (oldCode && oldCode !== codeToSave) {
        debugLog('Limpando código antigo', oldCode);
      }
    } catch {}
    
    // Salva em TODOS os lugares possíveis
    const promises = [
      writeInstallCodeToIDB(codeToSave),
      writeInstallCodeToCache(codeToSave),
    ];
    
    // Síncronos
    try { setCookie(COOKIE_KEY, codeToSave, 7); } catch {}
    try { setLocalStorage(STORAGE_KEY, codeToSave); } catch {}
    try { setSessionStorage(STORAGE_KEY, codeToSave); } catch {}
    
    // Aguarda assíncronos
    await Promise.allSettled(promises);
  };

  // Função para buscar código de QUALQUER storage
  const findCodeAnywhere = async (): Promise<string | null> => {
    debugLog('Buscando código em todos os storages...');
    
    // Tenta todos em paralelo
    const [fromIDB, fromCache] = await Promise.all([
      readInstallCodeFromIDB(),
      readAndConsumeInstallCodeFromCache(),
    ]);
    
    const fromCookie = getCookie(COOKIE_KEY);
    const fromLS = getLocalStorage(STORAGE_KEY);
    const fromSession = getSessionStorage(STORAGE_KEY);
    
    const candidate = fromIDB || fromCache || fromCookie || fromLS || fromSession;
    
    debugLog('Código encontrado?', candidate ? 'SIM' : 'NÃO');
    return candidate;
  };

  useEffect(() => {
    if (!initialized) return;
    if (processedRef.current) return;

    (async () => {
      processedRef.current = true;
      setError('');
      
      debugLog('Iniciando Setup', {
        installed,
        existingCode,
        userAgent: navigator.userAgent,
        isIOS,
      });

      // Verifica sessão existente primeiro
      try {
        const { data: { session } } = await (supabase.auth as any).getSession();
        if (session) {
          debugLog('Sessão existente encontrada');
          await persistAuthBackup(session);
          navigate('/');
          return;
        }
      } catch {}

      // CASO 1: PWA instalado com código na URL (sempre tenta usar)
      if (installed && existingCode && !exchangingRef.current) {
        try {
          exchangingRef.current = true;
          setStatus('Ativando seu acesso...');
          
          // Salva o código em TODOS os storages para futuras tentativas
          await saveCodeEverywhere(existingCode);
          
          await exchangeInstall(existingCode);
          
          // Limpa após sucesso
          try { localStorage.removeItem(STORAGE_KEY); } catch {}
          try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
          try { deleteCookie(COOKIE_KEY); } catch {}
          try { localStorage.setItem(RECOVERY_ATTEMPT_KEY, 'success'); } catch {}
          
          await extendUntilPushReady(10000);
          navigate('/');
          return;
        } catch (e: any) {
          console.error('exchange (installed + existingCode) error', e);
          
          // Mensagem de erro mais específica baseada no tipo de erro
          if (e?.message?.includes('excedeu limite') || e?.message?.includes('expirado')) {
            setError('Este código de ativação expirou ou já foi usado muitas vezes. Por favor, solicite um novo link de instalação.');
          } else {
            setError('Falha na ativação. Tente recarregar a página.');
          }
          setStatus('');
          return;
        }
      }

      // CASO 2: PWA instalado SEM código na URL - buscar no storage
      if (installed && !existingCode && !exchangingRef.current) {
        try {
          setStatus('Verificando dados de ativação…');
          
          const candidate = await findCodeAnywhere();

          if (candidate) {
            exchangingRef.current = true;
            setStatus('Ativando seu acesso...');
            
            // Re-salva em todos os storages (caso algum tenha falhado antes)
            await saveCodeEverywhere(candidate);
            
            await exchangeInstall(candidate);
            
            // Limpa após sucesso
            try { localStorage.removeItem(STORAGE_KEY); } catch {}
            try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
            try { deleteCookie(COOKIE_KEY); } catch {}
            try { localStorage.setItem(RECOVERY_ATTEMPT_KEY, 'success'); } catch {}
            
            await extendUntilPushReady(10000);
            navigate('/');
            return;
          }

          // Verifica se já tentamos e falhamos antes
          const previousAttempt = localStorage.getItem(RECOVERY_ATTEMPT_KEY);
          if (previousAttempt === 'failed') {
            setError('Não foi possível recuperar o código de ativação. Por favor, desinstale o app e use o link de configuração novamente.');
          } else {
            // Marca como tentativa falhada
            try { localStorage.setItem(RECOVERY_ATTEMPT_KEY, 'failed'); } catch {}
            setError('App instalado mas sem código de ativação. Por favor, copie o link completo com o código e abra novamente no Safari antes de abrir o app.');
          }
          
          setStatus('');
          return;
        } catch (e: any) {
          console.error('exchange (installed no code) error', e);
          
          // Mensagem de erro mais específica
          if (e?.message?.includes('excedeu limite') || e?.message?.includes('expirado')) {
            setError('Este código de ativação expirou ou já foi usado muitas vezes. Por favor, solicite um novo link de instalação.');
          } else {
            setError(e?.message || 'Não foi possível ativar seu acesso.');
          }
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
          const isReused = (data as any).reused === true;
          setCode(newCode);
          debugLog(isReused ? 'Código existente reutilizado' : 'Novo código gerado', newCode);
          
          // Limpa flag de tentativa anterior se existir
          try { localStorage.removeItem(RECOVERY_ATTEMPT_KEY); } catch {}

          // Salva em TODOS os storages
          await saveCodeEverywhere(newCode);

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

      // CASO 4: NÃO instalado MAS com código na URL
      if (!installed && existingCode) {
        // Salva o código preventivamente em todos os storages
        await saveCodeEverywhere(existingCode);
        setCode(existingCode);
        debugLog('Código salvo preventivamente', existingCode);
      }
    })();
  }, [initialized, installed, existingCode]);

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

  // Aguardando inicialização
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
                {error.includes('código de ativação') && (
                  <div className="mt-2 p-2 bg-muted rounded text-xs">
                    <p className="font-medium">Solução:</p>
                    <ol className="list-decimal list-inside mt-1 space-y-1">
                      <li>Feche completamente este app</li>
                      <li>Abra o Safari e cole o link completo com ?code=...</li>
                      <li>Aguarde carregar</li>
                      <li>Abra o app novamente pela tela inicial</li>
                    </ol>
                  </div>
                )}
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