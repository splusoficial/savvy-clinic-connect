// src/pages/Index.tsx (ou a rota "/")
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const FN_URL = 'https://PROJECT_REF.functions.supabase.co/generate-link'; // <-- TROQUE AQUI
const STORAGE_KEY = 'install_code';

type CreateInstallResp = { ok: true; code: string; email: string; reused: boolean };
type ExchangeResp = { ok: true; email: string; email_otp: string };

export default function Index() {
  const [status, setStatus] = useState('Inicializando…');
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const qsEmail = params.get('email') || '';
  const qsName  = params.get('name')  || '';
  const qsWhId  = params.get('wh_id') || '';
  const qsInst  = params.get('inst')  || '';

  useEffect(() => {
    (async () => {
      try {
        setError(null);

        // 1) Gera (ou reusa) um código se veio com email
        if (qsEmail) {
          setStatus('Gerando código de instalação…');
          const url = new URL(FN_URL);
          url.searchParams.set('flow', 'create-install');
          url.searchParams.set('email', qsEmail);
          if (qsName) url.searchParams.set('name', qsName);
          if (qsWhId) url.searchParams.set('wh_id', qsWhId);
          if (qsInst) url.searchParams.set('inst', qsInst);
          url.searchParams.set('redirect_to', window.location.origin);

          const r = await fetch(url.toString());
          const body = await safeJson(r);
          if (!r.ok || !body?.ok) throw new Error(body?.error || `create-install ${r.status}`);
          const data = body as CreateInstallResp;

          localStorage.setItem(STORAGE_KEY, data.code);
          // Limpa a URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 2) Já logado?
        setStatus('Verificando sessão…');
        const { data: s } = await supabase.auth.getSession();
        if (s.session) {
          setStatus('Sessão ativa. Redirecionando…');
          // TODO: redirecione se quiser
          return;
        }

        // 3) Troca code -> OTP e loga
        const code = localStorage.getItem(STORAGE_KEY);
        if (!code) {
          setStatus('Nenhum código salvo. Acesse o link com seu e-mail para gerar um novo.');
          return;
        }

        setStatus('Trocando código por OTP…');
        const url2 = new URL(FN_URL);
        url2.searchParams.set('flow', 'exchange-install');
        url2.searchParams.set('code', code);
        url2.searchParams.set('redirect_to', window.location.origin);

        const r2 = await fetch(url2.toString());
        const ex = await safeJson(r2);
        if (!r2.ok || !ex?.ok) throw new Error(ex?.error || `exchange-install ${r2.status}`);

        setStatus('Validando OTP no Supabase…');
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          email: (ex as ExchangeResp).email,
          token: (ex as ExchangeResp).email_otp,
          type: 'email',
        });
        if (verifyErr) throw verifyErr;

        setStatus('Logado com sucesso.');
        // TODO: redirecione para /crm etc.
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
        <p className="text-sm text-muted-foreground mb-6">{status}</p>

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
            Isso leva só alguns segundos. Se travar, clique “Tentar novamente”.
          </div>
        )}
      </div>
    </div>
  );
}

async function safeJson(r: Response) {
  try { return await r.json(); } catch { return null; }
}