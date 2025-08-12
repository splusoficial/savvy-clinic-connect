// src/pages/Index.tsx  (ou onde fica sua rota "/")
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
// Se usa React Router, descomente a linha abaixo:
// import { useNavigate } from 'react-router-dom';

const FN_URL = 'https://PROJECT_REF.functions.supabase.co/generate-link'; // <-- TROCAR PROJECT_REF
const STORAGE_KEY = 'install_code';

type CreateInstallResp = { ok: true; code: string; email: string; reused: boolean };
type ExchangeResp = { ok: true; email: string; email_otp: string };

function isStandalonePWA() {
  // iOS + Padrão
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    // @ts-ignore
    window.navigator.standalone === true
  );
}

export default function Index() {
  // const navigate = useNavigate();
  const [status, setStatus] = useState<string>('Inicializando…');
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const qsEmail = params.get('email') || '';
  const qsName = params.get('name') || '';
  const qsWhId = params.get('wh_id') || '';
  const qsInst = params.get('inst') || '';

  useEffect(() => {
    (async () => {
      try {
        setError(null);

        // 1) Se vier com email pela URL, gera (ou reutiliza) um install code e salva.
        if (qsEmail) {
          setStatus('Gerando código de instalação…');
          const url = new URL(FN_URL);
          url.searchParams.set('flow', 'create-install');
          url.searchParams.set('email', qsEmail);
          if (qsName) url.searchParams.set('name', qsName);
          if (qsWhId) url.searchParams.set('wh_id', qsWhId);
          if (qsInst) url.searchParams.set('inst', qsInst);
          url.searchParams.set('redirect_to', window.location.origin); // opcional

          const r = await fetch(url.toString(), { method: 'GET' });
          if (!r.ok) {
            const body = await safeJson(r);
            throw new Error(body?.error || `Edge function (create-install) retornou ${r.status}`);
          }
          const data = (await r.json()) as CreateInstallResp;
          localStorage.setItem(STORAGE_KEY, data.code);

          // Limpa a URL (tira os params) pra não sujar o histórico
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 2) Se já tem sessão, sai.
        setStatus('Verificando sessão…');
        const { data: s } = await supabase.auth.getSession();
        if (s.session) {
          setStatus('Sessão ativa. Redirecionando…');
          // Se tiver router, use navigate('/crm'); senão:
          // navigate('/crm');
          return;
        }

        // 3) Se não tem sessão, tenta trocar code por OTP e logar
        const code = localStorage.getItem(STORAGE_KEY);
        if (!code) {
          setStatus('Nenhum código salvo. Acesse o link com seu e-mail para gerar um novo.');
          return;
        }

        setStatus('Trocando código por OTP…');
        const url2 = new URL(FN_URL);
        url2.searchParams.set('flow', 'exchange-install');
        url2.searchParams.set('code', code);
        url2.searchParams.set('redirect_to', window.location.origin); // opcional

        const r2 = await fetch(url2.toString(), { method: 'GET' });
        if (!r2.ok) {
          const body = await safeJson(r2);
          throw new Error(body?.error || `Edge function (exchange-install) retornou ${r2.status}`);
        }
        const ex = (await r2.json()) as ExchangeResp;

        setStatus('Validando OTP no Supabase…');
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          email: ex.email,
          token: ex.email_otp,
          type: 'email',
        });

        if (verifyErr) throw verifyErr;

        setStatus('Logado com sucesso. Redirecionando…');
        // navigate('/crm');
      } catch (e: any) {
        console.error(e);
        setError(e?.message || 'Falha inesperada');
        setStatus('Erro');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold mb-2">Conectando…</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {status} {isStandalonePWA() ? '(PWA)' : '(Web)'}
        </p>

        {error ? (
          <>
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 mb-4">
              <p className="text-sm font-medium">Erro</p>
              <p className="text-xs opacity-90">{error}</p>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                className="px-4 py-2 rounded-md border hover:bg-accent text-sm"
                onClick={() => window.location.reload()}
              >
                Tentar novamente
              </button>
              <button
                className="px-4 py-2 rounded-md border hover:bg-accent text-sm"
                onClick={() => localStorage.removeItem(STORAGE_KEY)}
                title="Remove o código salvo"
              >
                Limpar código salvo
              </button>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            Deixe esta tela trabalhar por alguns segundos. Se não avançar, use “Tentar novamente”.
          </div>
        )}
      </div>
    </div>
  );
}

async function safeJson(r: Response) {
  try {
    return await r.json();
  } catch {
    return null;
  }
}
